alter table public.sold_accounts
  alter column payment_status set default 'pending';

alter table public.sold_accounts
  add column if not exists payment_received_date date;

create or replace function public.monthly_leaderboard(
  p_year int,
  p_month int
)
returns table (
  employee_id uuid,
  name text,
  email text,
  role app_role,
  status employee_status,
  sold_count bigint,
  total_sales numeric,
  task_completed_count bigint,
  task_total_count bigint,
  task_completion_rate numeric,
  last_sale date
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  with monthly_sales as (
    select
      sa.employee_id,
      count(sa.id) as sold_count,
      coalesce(sum(sa.sold_amount), 0) as total_sales,
      max(coalesce(sa.payment_received_date, sa.sold_date)) as last_sale
    from public.sold_accounts sa
    where extract(year from coalesce(sa.payment_received_date, sa.sold_date))::int = p_year
      and extract(month from coalesce(sa.payment_received_date, sa.sold_date))::int = p_month
      and sa.payment_status = 'paid'
    group by sa.employee_id
  ),
  monthly_tasks as (
    select id
    from public.daily_tasks
    where extract(year from task_date)::int = p_year
      and extract(month from task_date)::int = p_month
  ),
  task_totals as (
    select count(*)::bigint as total_count
    from monthly_tasks
  ),
  monthly_task_completions as (
    select
      dtc.employee_id,
      count(dtc.id) as completed_count
    from public.daily_task_completions dtc
    where dtc.task_id in (select id from monthly_tasks)
    group by dtc.employee_id
  )
  select
    p.id as employee_id,
    p.name,
    p.email,
    p.role,
    p.status,
    coalesce(ms.sold_count, 0) as sold_count,
    coalesce(ms.total_sales, 0) as total_sales,
    coalesce(mtc.completed_count, 0) as task_completed_count,
    tt.total_count as task_total_count,
    case
      when tt.total_count = 0 then 0
      else round((coalesce(mtc.completed_count, 0)::numeric / tt.total_count::numeric) * 100)
    end as task_completion_rate,
    ms.last_sale
  from public.profiles p
  cross join task_totals tt
  left join monthly_sales ms on ms.employee_id = p.id
  left join monthly_task_completions mtc on mtc.employee_id = p.id
  where p.role <> 'admin'
    and p.status = 'active'
  order by sold_count desc, total_sales desc, p.name asc;
end;
$$;

grant execute on function public.monthly_leaderboard(int, int) to authenticated;

create or replace function public.dashboard_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ctx as (
    select
      p.id as profile_id,
      p.role
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.status = 'active'
    limit 1
  ),
  settings_row as (
    select coalesce((select currency from public.settings limit 1), 'USD') as currency
  ),
  visible_stock as (
    select sa.*
    from public.stock_accounts sa, ctx
    where sa.status <> 'sold'
      and (
        ctx.role in ('admin', 'manager')
        or sa.assigned_employee_id = ctx.profile_id
      )
  ),
  visible_sales as (
    select so.*
    from public.sold_accounts so, ctx
    where ctx.role in ('admin', 'manager')
       or so.employee_id = ctx.profile_id
  ),
  paid_sales as (
    select *
    from visible_sales
    where payment_status = 'paid'
  ),
  waiting_sales as (
    select *
    from visible_sales
    where payment_status <> 'paid'
  ),
  visible_expenses as (
    select e.*
    from public.expenses e, ctx
    where ctx.role in ('admin', 'manager')
       or e.paid_by = ctx.profile_id
  ),
  visible_advance_transactions as (
    select at.*
    from public.advance_transactions at, ctx
    where ctx.role in ('admin', 'manager')
       or at.employee_id = ctx.profile_id
  ),
  sales_with_cost as (
    select
      so.*,
      coalesce(sa.buying_price, 0) as buying_price,
      coalesce(p.name, 'Unknown') as employee_name
    from paid_sales so
    left join public.stock_accounts sa on sa.id = so.stock_account_id
    left join public.profiles p on p.id = so.employee_id
  ),
  base_numbers as (
    select
      (select count(*) from visible_stock) as total_stock_accounts,
      coalesce((select sum(buying_price) from visible_stock), 0) as total_stock_buying_value,
      (select count(*) from paid_sales) as total_sold_accounts,
      coalesce((select sum(sold_amount) from paid_sales), 0) as total_sales_amount,
      (select count(*) from waiting_sales) as waiting_payment_count,
      coalesce((select sum(sold_amount) from waiting_sales), 0) as waiting_payment_amount,
      coalesce((select sum(buying_price) from sales_with_cost), 0) as total_buying_cost,
      coalesce((select sum(amount) from visible_expenses), 0) as total_expenses,
      coalesce((
        select sum(sold_amount - buying_price)
        from sales_with_cost
        where extract(month from coalesce(payment_received_date, sold_date)) = extract(month from current_date)
          and extract(year from coalesce(payment_received_date, sold_date)) = extract(year from current_date)
      ), 0) as monthly_profit,
      coalesce((
        select sum(sold_amount - buying_price)
        from sales_with_cost
        where extract(year from coalesce(payment_received_date, sold_date)) = extract(year from current_date)
      ), 0) as yearly_profit,
      (select count(*) from public.gmail_inventory where status = 'fresh') as available_gmail_count,
      (select count(*) from public.gmail_inventory where status = 'used') as used_gmail_count,
      coalesce((
        select sum(
          case
            when type = 'money_given' then amount
            when type in ('account_purchase', 'money_returned') then -amount
            else amount
          end
        )
        from visible_advance_transactions
      ), 0) as employee_advance_balance
  ),
  monthly_series as (
    select coalesce(jsonb_agg(item order by sort_month), '[]'::jsonb) as data
    from (
      select
        date_trunc('month', coalesce(payment_received_date, sold_date)) as sort_month,
        jsonb_build_object(
          'month', to_char(date_trunc('month', coalesce(payment_received_date, sold_date)), 'Mon'),
          'sales', coalesce(sum(sold_amount), 0),
          'profit', coalesce(sum(sold_amount - buying_price), 0)
        ) as item
      from sales_with_cost
      group by date_trunc('month', coalesce(payment_received_date, sold_date))
    ) months
  ),
  employee_profit_series as (
    select coalesce(jsonb_agg(item order by employee_name), '[]'::jsonb) as data
    from (
      select
        employee_name,
        jsonb_build_object(
          'name', employee_name,
          'profit', coalesce(sum(sold_amount - buying_price), 0),
          'sales', coalesce(sum(sold_amount), 0)
        ) as item
      from sales_with_cost
      group by employee_name
    ) employees
  ),
  stock_value_by_game as (
    select coalesce(jsonb_agg(item order by game_name), '[]'::jsonb) as data
    from (
      select
        game_name,
        jsonb_build_object(
          'game', game_name,
          'value', coalesce(sum(buying_price), 0)
        ) as item
      from visible_stock
      group by game_name
    ) games
  )
  select jsonb_build_object(
    'currency', settings_row.currency,
    'role', coalesce((select role from ctx), 'employee'::app_role),
    'metrics', jsonb_build_object(
      'totalStockAccounts', base_numbers.total_stock_accounts,
      'totalStockBuyingValue', base_numbers.total_stock_buying_value,
      'totalSoldAccounts', base_numbers.total_sold_accounts,
      'totalSalesAmount', base_numbers.total_sales_amount,
      'waitingPaymentCount', base_numbers.waiting_payment_count,
      'waitingPaymentAmount', base_numbers.waiting_payment_amount,
      'totalBuyingCost', base_numbers.total_buying_cost,
      'totalGrossProfit', base_numbers.total_sales_amount - base_numbers.total_buying_cost,
      'totalExpenses', base_numbers.total_expenses,
      'netProfit', base_numbers.total_sales_amount - base_numbers.total_buying_cost - base_numbers.total_expenses,
      'monthlyProfit', base_numbers.monthly_profit,
      'yearlyProfit', base_numbers.yearly_profit,
      'availableGmailCount', base_numbers.available_gmail_count,
      'usedGmailCount', base_numbers.used_gmail_count,
      'employeeAdvanceBalance', base_numbers.employee_advance_balance
    ),
    'monthlySeries', monthly_series.data,
    'employeeProfitSeries', employee_profit_series.data,
    'stockValueByGame', stock_value_by_game.data
  )
  from settings_row, base_numbers, monthly_series, employee_profit_series, stock_value_by_game;
$$;
