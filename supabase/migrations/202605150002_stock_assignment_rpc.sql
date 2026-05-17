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

  if requester.role = 'employee' and p_employee_id is distinct from requester.id then
    raise exception 'Employees can only assign accounts to themselves';
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
