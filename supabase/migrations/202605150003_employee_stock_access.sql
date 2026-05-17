drop policy if exists "profiles read by role" on public.profiles;
create policy "profiles read by role"
on public.profiles for select
using (auth.uid() is not null);

drop policy if exists "stock read by role" on public.stock_accounts;
drop policy if exists "stock read authenticated" on public.stock_accounts;
create policy "stock read authenticated"
on public.stock_accounts for select
using (auth.uid() is not null);

drop policy if exists "stock admin manager write" on public.stock_accounts;
drop policy if exists "stock insert authenticated" on public.stock_accounts;
drop policy if exists "stock admin manager update" on public.stock_accounts;
drop policy if exists "stock admin manager delete" on public.stock_accounts;

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

drop policy if exists "stock images authenticated upload" on storage.objects;
create policy "stock images authenticated upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'stock-images');

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
