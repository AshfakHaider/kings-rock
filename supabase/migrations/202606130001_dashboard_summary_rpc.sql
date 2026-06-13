alter table public.sold_accounts
  add column if not exists payment_received_date date;

create or replace function public.dashboard_summary(
  p_year int,
  p_month int default null
)
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
  selected_period as (
    select
      p_year as selected_year,
      case when p_month between 1 and 12 then p_month else null end as selected_month
  ),
  settings_row as (
    select coalesce((select currency from public.settings limit 1), 'USD') as currency
  ),
  visible_stock as (
    select
      sa.id,
      sa.game_name,
      sa.buying_price,
      sa.selling_price,
      sa.status,
      sa.assigned_employee_id
    from public.stock_accounts sa, ctx
    where sa.status <> 'sold'
      and (
        ctx.role in ('admin', 'manager')
        or sa.assigned_employee_id = ctx.profile_id
      )
  ),
  visible_sales as (
    select
      so.id,
      so.employee_id,
      so.stock_account_id,
      so.sold_amount,
      so.sold_source_website,
      so.payment_status,
      so.payment_received_date,
      so.sold_date,
      coalesce(sa.buying_price, 0) as buying_price,
      coalesce(p.name, 'Unknown') as employee_name
    from public.sold_accounts so
    cross join ctx
    left join public.stock_accounts sa on sa.id = so.stock_account_id
    left join public.profiles p on p.id = so.employee_id
    where ctx.role in ('admin', 'manager')
       or so.employee_id = ctx.profile_id
  ),
  visible_expenses as (
    select
      e.id,
      e.amount,
      e.expense_date,
      e.paid_by
    from public.expenses e, ctx
    where ctx.role in ('admin', 'manager')
       or e.paid_by = ctx.profile_id
  ),
  visible_advance_transactions as (
    select
      at.type,
      at.amount,
      at.employee_id
    from public.advance_transactions at, ctx
    where ctx.role in ('admin', 'manager')
       or at.employee_id = ctx.profile_id
  ),
  period_paid_sales as (
    select vs.*
    from visible_sales vs, selected_period sp
    where vs.payment_status = 'paid'
      and extract(year from coalesce(vs.payment_received_date, vs.sold_date))::int = sp.selected_year
      and (
        sp.selected_month is null
        or extract(month from coalesce(vs.payment_received_date, vs.sold_date))::int = sp.selected_month
      )
  ),
  year_paid_sales as (
    select vs.*
    from visible_sales vs, selected_period sp
    where vs.payment_status = 'paid'
      and extract(year from coalesce(vs.payment_received_date, vs.sold_date))::int = sp.selected_year
  ),
  period_waiting_sales as (
    select vs.*
    from visible_sales vs, selected_period sp
    where vs.payment_status <> 'paid'
      and extract(year from vs.sold_date)::int = sp.selected_year
      and (
        sp.selected_month is null
        or extract(month from vs.sold_date)::int = sp.selected_month
      )
  ),
  period_expenses as (
    select e.*
    from visible_expenses e, selected_period sp
    where extract(year from e.expense_date)::int = sp.selected_year
      and (
        sp.selected_month is null
        or extract(month from e.expense_date)::int = sp.selected_month
      )
  ),
  monthly_series as (
    select coalesce(jsonb_agg(item order by month_number), '[]'::jsonb) as data
    from (
      select
        months.month_number,
        jsonb_build_object(
          'month', to_char(make_date((select selected_year from selected_period), months.month_number, 1), 'Mon'),
          'sales', coalesce(sum(yps.sold_amount), 0),
          'profit', coalesce(sum(yps.sold_amount - yps.buying_price), 0)
        ) as item
      from generate_series(1, 12) as months(month_number)
      left join year_paid_sales yps
        on extract(month from coalesce(yps.payment_received_date, yps.sold_date))::int = months.month_number
      group by months.month_number
    ) monthly_items
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
      from period_paid_sales
      group by employee_name
    ) employees
  ),
  stock_value_by_game as (
    select coalesce(jsonb_agg(item order by value desc), '[]'::jsonb) as data
    from (
      select
        game_name,
        coalesce(sum(buying_price), 0) as value,
        jsonb_build_object(
          'game', game_name,
          'value', coalesce(sum(buying_price), 0)
        ) as item
      from visible_stock
      group by game_name
      order by value desc
      limit 12
    ) games
  ),
  sales_by_source as (
    select coalesce(jsonb_agg(item order by sold_count desc, total_sales desc), '[]'::jsonb) as data
    from (
      select
        coalesce(nullif(trim(sold_source_website), ''), 'Unknown') as source,
        count(*) as sold_count,
        coalesce(sum(case when payment_status = 'paid' then sold_amount else 0 end), 0) as total_sales,
        coalesce(sum(case when payment_status = 'paid' then sold_amount - buying_price else 0 end), 0) as profit,
        jsonb_build_object(
          'source', coalesce(nullif(trim(sold_source_website), ''), 'Unknown'),
          'soldCount', count(*),
          'totalSales', coalesce(sum(case when payment_status = 'paid' then sold_amount else 0 end), 0),
          'profit', coalesce(sum(case when payment_status = 'paid' then sold_amount - buying_price else 0 end), 0)
        ) as item
      from visible_sales
      group by coalesce(nullif(trim(sold_source_website), ''), 'Unknown')
      order by sold_count desc, total_sales desc
      limit 5
    ) sources
  ),
  base_numbers as (
    select
      (select count(*) from visible_stock) as total_stock_accounts,
      coalesce((select sum(buying_price) from visible_stock), 0) as total_stock_buying_value,
      coalesce((select sum(selling_price) from visible_stock), 0) as total_stock_selling_value,
      (select count(*) from period_paid_sales) as period_paid_count,
      coalesce((select sum(sold_amount) from period_paid_sales), 0) as period_paid_amount,
      coalesce((select sum(buying_price) from period_paid_sales), 0) as period_buying_cost,
      (select count(*) from period_waiting_sales) as waiting_payment_count,
      coalesce((select sum(sold_amount) from period_waiting_sales), 0) as waiting_payment_amount,
      coalesce((select sum(amount) from period_expenses), 0) as period_expenses_amount,
      coalesce((select sum(sold_amount - buying_price) from period_paid_sales), 0) as period_gross_profit,
      coalesce((select sum(sold_amount - buying_price) from year_paid_sales), 0) as yearly_profit,
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
  )
  select jsonb_build_object(
    'currency', settings_row.currency,
    'role', coalesce((select role from ctx), 'employee'::app_role),
    'metrics', jsonb_build_object(
      'totalStockAccounts', base_numbers.total_stock_accounts,
      'totalStockBuyingValue', base_numbers.total_stock_buying_value,
      'totalStockSellingValue', base_numbers.total_stock_selling_value,
      'totalSoldAccounts', base_numbers.period_paid_count,
      'totalSalesAmount', base_numbers.period_paid_amount,
      'waitingPaymentCount', base_numbers.waiting_payment_count,
      'waitingPaymentAmount', base_numbers.waiting_payment_amount,
      'totalBuyingCost', base_numbers.period_buying_cost,
      'totalGrossProfit', base_numbers.period_gross_profit,
      'totalExpenses', base_numbers.period_expenses_amount,
      'netProfit', base_numbers.period_gross_profit - base_numbers.period_expenses_amount,
      'monthlyProfit', base_numbers.period_gross_profit,
      'yearlyProfit', base_numbers.yearly_profit,
      'availableGmailCount', 0,
      'usedGmailCount', 0,
      'employeeAdvanceBalance', base_numbers.employee_advance_balance
    ),
    'monthlySeries', monthly_series.data,
    'employeeProfitSeries', employee_profit_series.data,
    'stockValueByGame', stock_value_by_game.data,
    'salesBySource', sales_by_source.data
  )
  from settings_row, base_numbers, monthly_series, employee_profit_series, stock_value_by_game, sales_by_source;
$$;

grant execute on function public.dashboard_summary(int, int) to authenticated;

create index if not exists sold_accounts_payment_cash_date_idx
on public.sold_accounts(coalesce(payment_received_date, sold_date));

create index if not exists advance_transactions_employee_id_idx
on public.advance_transactions(employee_id);

create index if not exists stock_accounts_game_name_idx
on public.stock_accounts(game_name);
