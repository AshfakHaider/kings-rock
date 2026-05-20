-- Game Account Business Manager schema
-- Run in the Supabase SQL editor or via `supabase db push`.

create extension if not exists pgcrypto;

create type app_role as enum ('admin', 'manager', 'employee');
create type employee_status as enum ('active', 'inactive');
create type account_status as enum ('available', 'assigned', 'sold', 'hold', 'problem');
create type payment_status as enum ('paid', 'pending', 'partial');
create type gmail_status as enum ('fresh', 'used', 'problem');
create type advance_status as enum ('open', 'partial', 'settled');
create type advance_transaction_type as enum ('money_given', 'account_purchase', 'money_returned', 'adjustment');
create type expense_category as enum ('gmail_purchase', 'ads', 'website_fee', 'employee_payment', 'scam_account', 'refund_account', 'other');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  email text not null unique,
  role app_role not null default 'employee',
  status employee_status not null default 'active',
  join_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create table public.gmail_inventory (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  encrypted_password text not null,
  recovery_info text,
  status gmail_status not null default 'fresh',
  used_for_stock_account_id uuid unique,
  date_added date not null default current_date,
  date_used date,
  notes text,
  created_at timestamptz not null default now()
);

create table public.stock_accounts (
  id uuid primary key default gen_random_uuid(),
  game_name text not null,
  account_title text not null,
  account_details text,
  purchase_source text,
  buying_price numeric(12, 2) not null check (buying_price >= 0),
  selling_price numeric(12, 2) check (selling_price is null or selling_price >= 0),
  image_url text,
  image_urls text[] not null default '{}',
  secret_code text unique,
  purchase_date date not null default current_date,
  status account_status not null default 'available',
  assigned_employee_id uuid references public.profiles(id) on delete set null,
  gmail_id uuid unique references public.gmail_inventory(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gmail_inventory
  add constraint gmail_inventory_stock_account_fk
  foreign key (used_for_stock_account_id) references public.stock_accounts(id) on delete set null;

create table public.sold_accounts (
  id uuid primary key default gen_random_uuid(),
  stock_account_id uuid not null unique references public.stock_accounts(id) on delete restrict,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  sold_amount numeric(12, 2) not null check (sold_amount >= 0),
  sold_source_website text,
  buyer_contact text,
  payment_status payment_status not null default 'paid',
  payment_method text,
  sold_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create table public.employee_advances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  amount_given numeric(12, 2) not null check (amount_given >= 0),
  date_given date not null default current_date,
  purpose text,
  payment_method text,
  status advance_status not null default 'open',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.advance_transactions (
  id uuid primary key default gen_random_uuid(),
  advance_id uuid not null references public.employee_advances(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  type advance_transaction_type not null,
  amount numeric(12, 2) not null check (amount >= 0),
  stock_account_id uuid references public.stock_accounts(id) on delete set null,
  transaction_date date not null default current_date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category expense_category not null default 'other',
  amount numeric(12, 2) not null check (amount >= 0),
  expense_date date not null default current_date,
  paid_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.daily_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  task_date date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.daily_task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.daily_tasks(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  screenshot_url text not null,
  screenshot_urls text[] not null default '{}',
  completed_at timestamptz not null default now(),
  unique(task_id, employee_id)
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  business_name text not null default 'Game Account Manager',
  currency text not null default 'USD',
  game_categories text[] not null default array['Mobile Legends', 'Clash of Clans'],
  sale_source_websites text[] not null default array['Facebook', 'PlayerAuctions', 'G2G', 'Discord'],
  expense_categories text[] not null default array['gmail_purchase', 'ads', 'website_fee', 'employee_payment', 'scam_account', 'refund_account', 'other'],
  employee_permissions jsonb not null default '{"can_view_profit": false, "can_view_buying_price": false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace view public.employee_advance_balances as
select
  ea.employee_id,
  sum(
    case
      when at.type = 'money_given' then at.amount
      when at.type = 'account_purchase' then -at.amount
      when at.type = 'money_returned' then -at.amount
      when at.type = 'adjustment' then at.amount
      else 0
    end
  ) as balance
from public.employee_advances ea
left join public.advance_transactions at on at.advance_id = ea.id
group by ea.employee_id;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where auth_user_id = auth.uid() and status = 'active'
$$;

create or replace function public.current_app_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where auth_user_id = auth.uid() and status = 'active'
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'admin'
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('admin', 'manager')
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_stock_accounts_updated_at
before update on public.stock_accounts
for each row execute function public.touch_updated_at();

create trigger touch_settings_updated_at
before update on public.settings
for each row execute function public.touch_updated_at();

create or replace function public.after_sale_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.stock_accounts
  set status = 'sold'
  where id = new.stock_account_id;

  insert into public.activity_logs(user_id, action, table_name, record_id, new_data)
  values (public.current_profile_id(), 'account_sold', 'sold_accounts', new.id, to_jsonb(new));

  return new;
end;
$$;

create trigger sold_accounts_after_insert
after insert on public.sold_accounts
for each row execute function public.after_sale_insert();

create or replace function public.after_gmail_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.gmail_id is not null then
    update public.gmail_inventory
    set status = 'used',
        used_for_stock_account_id = new.id,
        date_used = coalesce(date_used, current_date)
    where id = new.gmail_id;
  end if;
  return new;
end;
$$;

create trigger stock_accounts_after_gmail_link
after insert or update of gmail_id on public.stock_accounts
for each row execute function public.after_gmail_link();

create index profiles_auth_user_id_idx on public.profiles(auth_user_id);
create index profiles_role_idx on public.profiles(role);
create unique index profiles_phone_unique_idx on public.profiles(phone) where phone is not null and phone <> '';
create index stock_accounts_status_idx on public.stock_accounts(status);
create index stock_accounts_assigned_employee_id_idx on public.stock_accounts(assigned_employee_id);
create index stock_accounts_game_name_idx on public.stock_accounts(game_name);
create index stock_accounts_secret_code_idx on public.stock_accounts(secret_code);
create index stock_accounts_purchase_date_idx on public.stock_accounts(purchase_date);
create index sold_accounts_employee_id_idx on public.sold_accounts(employee_id);
create index sold_accounts_sold_date_idx on public.sold_accounts(sold_date);
create index gmail_inventory_status_idx on public.gmail_inventory(status);
create index advance_transactions_employee_id_idx on public.advance_transactions(employee_id);
create index expenses_expense_date_idx on public.expenses(expense_date);
create index daily_tasks_task_date_idx on public.daily_tasks(task_date);
create index daily_task_completions_task_id_idx on public.daily_task_completions(task_id);
create index daily_task_completions_employee_id_idx on public.daily_task_completions(employee_id);
create index activity_logs_created_at_idx on public.activity_logs(created_at desc);

alter table public.profiles enable row level security;
alter table public.stock_accounts enable row level security;
alter table public.sold_accounts enable row level security;
alter table public.gmail_inventory enable row level security;
alter table public.employee_advances enable row level security;
alter table public.advance_transactions enable row level security;
alter table public.expenses enable row level security;
alter table public.daily_tasks enable row level security;
alter table public.daily_task_completions enable row level security;
alter table public.activity_logs enable row level security;
alter table public.settings enable row level security;

create policy "profiles read by role"
on public.profiles for select
using (auth.uid() is not null);

create policy "profiles admin manager insert"
on public.profiles for insert
with check (public.is_manager_or_admin());

create policy "profiles admin manager update"
on public.profiles for update
using (public.is_manager_or_admin() or id = public.current_profile_id())
with check (public.is_manager_or_admin() or id = public.current_profile_id());

create policy "stock read authenticated"
on public.stock_accounts for select
using (auth.uid() is not null);

create policy "stock insert authenticated"
on public.stock_accounts for insert
with check (auth.uid() is not null);

create policy "stock admin manager update"
on public.stock_accounts for update
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

create policy "stock admin manager delete"
on public.stock_accounts for delete
using (public.is_manager_or_admin());

create policy "sales read by role"
on public.sold_accounts for select
using (
  public.is_manager_or_admin()
  or employee_id = public.current_profile_id()
);

create policy "sales employee insert own assigned"
on public.sold_accounts for insert
with check (
  public.is_manager_or_admin()
  or (
    employee_id = public.current_profile_id()
    and exists (
      select 1 from public.stock_accounts sa
      where sa.id = stock_account_id
        and sa.assigned_employee_id = public.current_profile_id()
        and sa.status in ('assigned', 'available')
    )
  )
);

create policy "sales admin manager update delete"
on public.sold_accounts for all
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

create policy "gmail read metadata by role"
on public.gmail_inventory for select
using (public.is_manager_or_admin());

create policy "gmail admin manager insert update"
on public.gmail_inventory for insert
with check (public.is_manager_or_admin());

create policy "gmail admin manager update"
on public.gmail_inventory for update
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

create policy "gmail admin delete"
on public.gmail_inventory for delete
using (public.is_admin());

create policy "advances read by role"
on public.employee_advances for select
using (
  public.is_manager_or_admin()
  or employee_id = public.current_profile_id()
);

create policy "advances admin manager write"
on public.employee_advances for all
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

create policy "advance tx read by role"
on public.advance_transactions for select
using (
  public.is_manager_or_admin()
  or employee_id = public.current_profile_id()
);

create policy "advance tx admin manager write"
on public.advance_transactions for all
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

create policy "expenses read by role"
on public.expenses for select
using (
  public.is_manager_or_admin()
  or paid_by = public.current_profile_id()
);

create policy "expenses insert by role"
on public.expenses for insert
with check (
  public.is_manager_or_admin()
  or paid_by = public.current_profile_id()
);

create policy "expenses admin manager update"
on public.expenses for update
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

create policy "expenses admin manager delete"
on public.expenses for delete
using (public.is_manager_or_admin());

create policy "daily tasks read authenticated"
on public.daily_tasks for select
using (auth.uid() is not null);

create policy "daily tasks admin manager insert"
on public.daily_tasks for insert
with check (public.is_manager_or_admin());

create policy "daily tasks admin manager update"
on public.daily_tasks for update
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

create policy "daily tasks admin manager delete"
on public.daily_tasks for delete
using (public.is_manager_or_admin());

create policy "daily task completions read by role"
on public.daily_task_completions for select
using (
  public.is_manager_or_admin()
  or employee_id = public.current_profile_id()
);

create policy "daily task completions employee insert"
on public.daily_task_completions for insert
with check (
  auth.uid() is not null
  and employee_id = public.current_profile_id()
);

create policy "activity read by role"
on public.activity_logs for select
using (
  public.is_admin()
  or (public.current_app_role() = 'manager' and table_name <> 'gmail_password')
  or user_id = public.current_profile_id()
);

create policy "activity insert authenticated"
on public.activity_logs for insert
with check (auth.uid() is not null);

create policy "settings read authenticated"
on public.settings for select
using (auth.uid() is not null);

create policy "settings admin update"
on public.settings for all
using (public.is_admin())
with check (public.is_admin());

revoke all on public.gmail_inventory from authenticated;
grant select(id, email, recovery_info, status, used_for_stock_account_id, date_added, date_used, notes, created_at), insert, update on public.gmail_inventory to authenticated;
grant select(encrypted_password) on public.gmail_inventory to service_role;

insert into storage.buckets (id, name, public)
values ('stock-images', 'stock-images', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('task-screenshots', 'task-screenshots', true)
on conflict (id) do update set public = true;

create policy "stock images authenticated upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'stock-images');

create policy "stock images authenticated read"
on storage.objects for select
to authenticated
using (bucket_id = 'stock-images');

create policy "task screenshots authenticated upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'task-screenshots');

create policy "task screenshots authenticated read"
on storage.objects for select
to authenticated
using (bucket_id = 'task-screenshots');

create or replace function public.log_activity(
  p_action text,
  p_table_name text,
  p_record_id uuid,
  p_old_data jsonb default null,
  p_new_data jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_logs(user_id, action, table_name, record_id, old_data, new_data)
  values (public.current_profile_id(), p_action, p_table_name, p_record_id, p_old_data, p_new_data);
end;
$$;

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
      max(sa.sold_date) as last_sale
    from public.sold_accounts sa
    where extract(year from sa.sold_date)::int = p_year
      and extract(month from sa.sold_date)::int = p_month
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

create or replace function public.assign_stock_account(
  p_stock_account_id uuid,
  p_employee_id uuid default null
)
returns public.stock_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  requester public.profiles;
  updated_account public.stock_accounts;
begin
  select * into requester
  from public.profiles
  where auth_user_id = auth.uid();

  if requester.id is null then
    raise exception 'Not authenticated';
  end if;

  if p_employee_id is not null and not exists (
    select 1 from public.profiles
    where id = p_employee_id
      and status = 'active'
      and role <> 'admin'
  ) then
    raise exception 'Employee is not available for assignment';
  end if;

  update public.stock_accounts
  set assigned_employee_id = p_employee_id,
      status = case when p_employee_id is null then 'available'::account_status else 'assigned'::account_status end
  where id = p_stock_account_id
    and status <> 'sold'
  returning * into updated_account;

  if updated_account.id is null then
    raise exception 'Stock account not found or already sold';
  end if;

  insert into public.activity_logs(user_id, action, table_name, record_id, new_data)
  values (requester.id, 'stock_assignment_changed', 'stock_accounts', updated_account.id, to_jsonb(updated_account));

  return updated_account;
end;
$$;
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
