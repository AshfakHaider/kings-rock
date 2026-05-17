create table if not exists public.daily_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  task_date date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.daily_tasks(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique(task_id, employee_id)
);

create index if not exists daily_tasks_task_date_idx on public.daily_tasks(task_date);
create index if not exists daily_task_completions_task_id_idx on public.daily_task_completions(task_id);
create index if not exists daily_task_completions_employee_id_idx on public.daily_task_completions(employee_id);

alter table public.daily_tasks enable row level security;
alter table public.daily_task_completions enable row level security;

drop policy if exists "daily tasks read authenticated" on public.daily_tasks;
drop policy if exists "daily tasks admin manager insert" on public.daily_tasks;
drop policy if exists "daily tasks admin manager update" on public.daily_tasks;
drop policy if exists "daily tasks admin manager delete" on public.daily_tasks;
drop policy if exists "daily task completions read by role" on public.daily_task_completions;
drop policy if exists "daily task completions employee insert" on public.daily_task_completions;

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
