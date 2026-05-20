alter table public.settings
  alter column currency set default 'USD';

update public.settings
set currency = 'USD',
    updated_at = now()
where upper(currency) = 'BDT';

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
  metrics as (
    select
      (select count(*) from visible_stock)::numeric as total_stock_accounts,
      coalesce((select sum(buying_price) from visible_stock), 0)::numeric as total_stock_buying_value,
      (select count(*) from visible_sales)::numeric as total_sold_accounts,
      coalesce((select sum(sold_amount) from visible_sales), 0)::numeric as total_sales_amount,
      coalesce((select sum(sa.buying_price) from visible_sales so join public.stock_accounts sa on sa.id = so.stock_account_id), 0)::numeric as total_buying_cost,
      coalesce((select sum(so.sold_amount - sa.buying_price) from visible_sales so join public.stock_accounts sa on sa.id = so.stock_account_id), 0)::numeric as total_gross_profit,
      coalesce((select sum(amount) from visible_expenses), 0)::numeric as total_expenses,
      coalesce((select sum(so.sold_amount - sa.buying_price) from visible_sales so join public.stock_accounts sa on sa.id = so.stock_account_id), 0)
        - coalesce((select sum(amount) from visible_expenses), 0)::numeric as net_profit,
      coalesce((select sum(so.sold_amount - sa.buying_price) from visible_sales so join public.stock_accounts sa on sa.id = so.stock_account_id where date_trunc('month', so.sold_date) = date_trunc('month', current_date)), 0)::numeric as monthly_profit,
      coalesce((select sum(so.sold_amount - sa.buying_price) from visible_sales so join public.stock_accounts sa on sa.id = so.stock_account_id where date_trunc('year', so.sold_date) = date_trunc('year', current_date)), 0)::numeric as yearly_profit,
      (select count(*) from public.gmail_inventory where status = 'fresh')::numeric as available_gmail_count,
      (select count(*) from public.gmail_inventory where status = 'used')::numeric as used_gmail_count,
      coalesce((
        select sum(
          case
            when type = 'money_given' then amount
            when type in ('account_purchase', 'money_returned') then -amount
            when type = 'adjustment' then amount
            else 0
          end
        )
        from visible_advance_transactions
      ), 0)::numeric as employee_advance_balance
  ),
  monthly_series as (
    select coalesce(jsonb_agg(jsonb_build_object('month', month_label, 'sales', sales, 'profit', profit) order by month_start), '[]'::jsonb) as data
    from (
      select
        date_trunc('month', so.sold_date)::date as month_start,
        to_char(date_trunc('month', so.sold_date), 'Mon') as month_label,
        sum(so.sold_amount)::numeric as sales,
        sum(so.sold_amount - sa.buying_price)::numeric as profit
      from visible_sales so
      join public.stock_accounts sa on sa.id = so.stock_account_id
      group by 1, 2
      order by 1
    ) monthly
  ),
  employee_series as (
    select coalesce(jsonb_agg(jsonb_build_object('name', name, 'profit', profit, 'sales', sales) order by profit desc), '[]'::jsonb) as data
    from (
      select
        coalesce(p.name, 'Unknown') as name,
        sum(so.sold_amount - sa.buying_price)::numeric as profit,
        sum(so.sold_amount)::numeric as sales
      from visible_sales so
      join public.stock_accounts sa on sa.id = so.stock_account_id
      left join public.profiles p on p.id = so.employee_id
      group by p.name
    ) employees
  ),
  stock_by_game as (
    select coalesce(jsonb_agg(jsonb_build_object('game', game_name, 'value', value) order by value desc), '[]'::jsonb) as data
    from (
      select game_name, sum(buying_price)::numeric as value
      from visible_stock
      group by game_name
    ) stock
  )
  select jsonb_build_object(
    'currency', settings_row.currency,
    'role', (select role from ctx),
    'metrics', jsonb_build_object(
      'totalStockAccounts', metrics.total_stock_accounts,
      'totalStockBuyingValue', metrics.total_stock_buying_value,
      'totalSoldAccounts', metrics.total_sold_accounts,
      'totalSalesAmount', metrics.total_sales_amount,
      'totalBuyingCost', metrics.total_buying_cost,
      'totalGrossProfit', metrics.total_gross_profit,
      'totalExpenses', metrics.total_expenses,
      'netProfit', metrics.net_profit,
      'monthlyProfit', metrics.monthly_profit,
      'yearlyProfit', metrics.yearly_profit,
      'availableGmailCount', metrics.available_gmail_count,
      'usedGmailCount', metrics.used_gmail_count,
      'employeeAdvanceBalance', metrics.employee_advance_balance
    ),
    'monthlySeries', monthly_series.data,
    'employeeProfitSeries', employee_series.data,
    'stockValueByGame', stock_by_game.data
  )
  from settings_row, metrics, monthly_series, employee_series, stock_by_game;
$$;
