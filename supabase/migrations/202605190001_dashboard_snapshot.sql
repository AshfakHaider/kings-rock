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
  sales_with_cost as (
    select
      so.*,
      coalesce(sa.buying_price, 0) as buying_price,
      coalesce(p.name, 'Unknown') as employee_name
    from visible_sales so
    left join public.stock_accounts sa on sa.id = so.stock_account_id
    left join public.profiles p on p.id = so.employee_id
  ),
  base_numbers as (
    select
      (select count(*) from visible_stock) as total_stock_accounts,
      coalesce((select sum(buying_price) from visible_stock), 0) as total_stock_buying_value,
      (select count(*) from visible_sales) as total_sold_accounts,
      coalesce((select sum(sold_amount) from visible_sales), 0) as total_sales_amount,
      coalesce((select sum(buying_price) from sales_with_cost), 0) as total_buying_cost,
      coalesce((select sum(amount) from visible_expenses), 0) as total_expenses,
      coalesce((
        select sum(sold_amount - buying_price)
        from sales_with_cost
        where extract(month from sold_date) = extract(month from current_date)
          and extract(year from sold_date) = extract(year from current_date)
      ), 0) as monthly_profit,
      coalesce((
        select sum(sold_amount - buying_price)
        from sales_with_cost
        where extract(year from sold_date) = extract(year from current_date)
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
        date_trunc('month', sold_date) as sort_month,
        jsonb_build_object(
          'month', to_char(date_trunc('month', sold_date), 'Mon'),
          'sales', coalesce(sum(sold_amount), 0),
          'profit', coalesce(sum(sold_amount - buying_price), 0)
        ) as item
      from sales_with_cost
      group by date_trunc('month', sold_date)
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
