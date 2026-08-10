create table if not exists public.stock_account_assignments (
  id uuid primary key default gen_random_uuid(),
  stock_account_id uuid not null references public.stock_accounts(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(stock_account_id, employee_id)
);

create index if not exists stock_account_assignments_stock_account_id_idx
on public.stock_account_assignments(stock_account_id);

create index if not exists stock_account_assignments_employee_id_idx
on public.stock_account_assignments(employee_id);

alter table public.stock_account_assignments enable row level security;

drop policy if exists "stock assignments read authenticated" on public.stock_account_assignments;
create policy "stock assignments read authenticated"
on public.stock_account_assignments for select
to authenticated
using (true);

drop policy if exists "stock assignments insert self or manager" on public.stock_account_assignments;
create policy "stock assignments insert self or manager"
on public.stock_account_assignments for insert
to authenticated
with check (
  (
    public.is_manager_or_admin()
    or employee_id = public.current_profile_id()
  )
  and exists (
    select 1
    from public.profiles p
    where p.id = employee_id
      and p.status = 'active'
      and p.role <> 'admin'
  )
);

drop policy if exists "stock assignments delete self or manager" on public.stock_account_assignments;
create policy "stock assignments delete self or manager"
on public.stock_account_assignments for delete
to authenticated
using (
  public.is_manager_or_admin()
  or employee_id = public.current_profile_id()
);

grant select, insert, delete on public.stock_account_assignments to authenticated;

create or replace function public.account_has_stock_assignment(
  p_stock_account_id uuid,
  p_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.stock_accounts sa
    where sa.id = p_stock_account_id
      and sa.assigned_employee_id = p_profile_id
      and sa.assigned_employee_id is not null
  )
  or exists (
    select 1
    from public.stock_account_assignments saa
    where saa.stock_account_id = p_stock_account_id
      and saa.employee_id = p_profile_id
  )
$$;

revoke all on function public.account_has_stock_assignment(uuid, uuid) from public;
grant execute on function public.account_has_stock_assignment(uuid, uuid) to authenticated;

create or replace function public.add_stock_account_assignment(
  p_stock_account_id uuid,
  p_employee_id uuid
)
returns public.stock_account_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  requester public.profiles;
  target_employee public.profiles;
  target_account public.stock_accounts;
  saved_assignment public.stock_account_assignments;
begin
  select * into requester
  from public.profiles
  where auth_user_id = auth.uid()
    and status = 'active';

  if requester.id is null then
    raise exception 'Not authenticated';
  end if;

  if requester.role = 'employee' and p_employee_id is distinct from requester.id then
    raise exception 'Employees can only assign accounts to themselves';
  end if;

  select * into target_employee
  from public.profiles
  where id = p_employee_id
    and status = 'active'
    and role <> 'admin';

  if target_employee.id is null then
    raise exception 'Employee is not available for assignment';
  end if;

  select * into target_account
  from public.stock_accounts
  where id = p_stock_account_id;

  if target_account.id is null or target_account.status = 'sold' then
    raise exception 'Stock account not found or already sold';
  end if;

  insert into public.stock_account_assignments(stock_account_id, employee_id, assigned_by)
  values (p_stock_account_id, p_employee_id, requester.id)
  on conflict (stock_account_id, employee_id) do update
    set assigned_by = coalesce(public.stock_account_assignments.assigned_by, excluded.assigned_by)
  returning * into saved_assignment;

  update public.stock_accounts
  set status = 'assigned'
  where id = p_stock_account_id
    and status = 'available';

  insert into public.activity_logs(user_id, action, table_name, record_id, new_data)
  values (requester.id, 'stock_assignment_added', 'stock_account_assignments', saved_assignment.id, to_jsonb(saved_assignment));

  return saved_assignment;
end;
$$;

revoke all on function public.add_stock_account_assignment(uuid, uuid) from public;
grant execute on function public.add_stock_account_assignment(uuid, uuid) to authenticated;

create or replace function public.remove_stock_account_assignment(
  p_stock_account_id uuid,
  p_employee_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  requester public.profiles;
  old_assignment public.stock_account_assignments;
begin
  select * into requester
  from public.profiles
  where auth_user_id = auth.uid()
    and status = 'active';

  if requester.id is null then
    raise exception 'Not authenticated';
  end if;

  if requester.role = 'employee' and p_employee_id is distinct from requester.id then
    raise exception 'Employees can only remove themselves';
  end if;

  if p_employee_id is not null and not exists (
    select 1
    from public.profiles
    where id = p_employee_id
      and role <> 'admin'
  ) then
    raise exception 'Employee not found';
  end if;

  delete from public.stock_account_assignments
  where stock_account_id = p_stock_account_id
    and employee_id = p_employee_id
  returning * into old_assignment;

  update public.stock_accounts
  set assigned_employee_id = null
  where id = p_stock_account_id
    and assigned_employee_id = p_employee_id
    and status <> 'sold';

  update public.stock_accounts sa
  set status = case
    when exists (
      select 1
      from public.stock_account_assignments saa
      where saa.stock_account_id = p_stock_account_id
    )
    or sa.assigned_employee_id is not null then 'assigned'::account_status
    else 'available'::account_status
  end
  where sa.id = p_stock_account_id
    and sa.status = 'assigned';

  insert into public.activity_logs(user_id, action, table_name, record_id, old_data)
  values (requester.id, 'stock_assignment_removed', 'stock_account_assignments', coalesce(old_assignment.id, p_stock_account_id), to_jsonb(old_assignment));
end;
$$;

revoke all on function public.remove_stock_account_assignment(uuid, uuid) from public;
grant execute on function public.remove_stock_account_assignment(uuid, uuid) to authenticated;

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
  where auth_user_id = auth.uid()
    and status = 'active';

  if requester.id is null then
    raise exception 'Not authenticated';
  end if;

  if p_employee_id is null then
    if requester.role = 'employee' then
      perform public.remove_stock_account_assignment(p_stock_account_id, requester.id);
    else
      raise exception 'Choose an employee to assign';
    end if;
  else
    perform public.add_stock_account_assignment(p_stock_account_id, p_employee_id);
  end if;

  select * into updated_account
  from public.stock_accounts
  where id = p_stock_account_id;

  return updated_account;
end;
$$;

revoke all on function public.assign_stock_account(uuid, uuid) from public;
grant execute on function public.assign_stock_account(uuid, uuid) to authenticated;

drop policy if exists "stock credentials read assigned" on public.stock_account_credentials;
create policy "stock credentials read assigned"
on public.stock_account_credentials for select
to authenticated
using (
  public.is_manager_or_admin()
  or public.account_has_stock_assignment(stock_account_id, public.current_profile_id())
);

drop policy if exists "stock credentials update owner" on public.stock_account_credentials;
create policy "stock credentials update owner"
on public.stock_account_credentials for update
to authenticated
using (
  public.is_manager_or_admin()
  or exists (
    select 1 from public.stock_accounts sa
    where sa.id = stock_account_id
      and (
        sa.created_by = public.current_profile_id()
        or public.account_has_stock_assignment(sa.id, public.current_profile_id())
      )
  )
)
with check (
  public.is_manager_or_admin()
  or exists (
    select 1 from public.stock_accounts sa
    where sa.id = stock_account_id
      and (
        sa.created_by = public.current_profile_id()
        or public.account_has_stock_assignment(sa.id, public.current_profile_id())
      )
  )
);

drop policy if exists "sales employee insert own assigned" on public.sold_accounts;
create policy "sales employee insert own assigned"
on public.sold_accounts for insert
to authenticated
with check (
  public.is_manager_or_admin()
  or (
    employee_id = public.current_profile_id()
    and exists (
      select 1 from public.stock_accounts sa
      where sa.id = stock_account_id
        and sa.status in ('assigned', 'available')
        and public.account_has_stock_assignment(sa.id, public.current_profile_id())
    )
  )
);
