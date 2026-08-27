alter table public.employee_advances
  add column if not exists request_id text;

create index if not exists advance_transactions_advance_id_idx
on public.advance_transactions(advance_id);

create unique index if not exists employee_advances_request_id_idx
on public.employee_advances(request_id)
where request_id is not null;

create or replace function public.create_employee_advance(
  p_employee_id uuid,
  p_amount_given numeric,
  p_date_given date,
  p_purpose text,
  p_payment_method text,
  p_status public.advance_status,
  p_notes text,
  p_request_id text default null
)
returns table (
  advance_id uuid,
  opening_transaction_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester public.profiles%rowtype;
  v_employee public.profiles%rowtype;
  v_advance public.employee_advances%rowtype;
  v_opening_transaction public.advance_transactions%rowtype;
begin
  select * into v_requester
  from public.profiles
  where auth_user_id = auth.uid()
    and status = 'active';

  if v_requester.id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if v_requester.role not in ('admin', 'manager') then
    raise exception 'Employees cannot manage funds' using errcode = '42501';
  end if;

  select * into v_employee
  from public.profiles
  where id = p_employee_id
    and status = 'active'
    and role <> 'admin';

  if v_employee.id is null then
    raise exception 'Employee is not available for funds';
  end if;

  if p_amount_given is null or p_amount_given < 0 then
    raise exception 'Amount given must be zero or greater';
  end if;

  if p_date_given is null then
    raise exception 'Date given is required';
  end if;

  if p_request_id is not null then
    perform pg_advisory_xact_lock(hashtext(p_request_id));

    select * into v_advance
    from public.employee_advances
    where request_id = p_request_id
    for update;

    if v_advance.id is not null then
      select * into v_opening_transaction
      from public.advance_transactions
      where advance_id = v_advance.id
        and type = 'money_given'
        and notes = 'Opening advance'
      order by created_at asc
      limit 1;

      if v_opening_transaction.id is null then
        raise exception 'Opening advance transaction not found for idempotent request';
      end if;

      advance_id := v_advance.id;
      opening_transaction_id := v_opening_transaction.id;
      return next;
      return;
    end if;
  end if;

  insert into public.employee_advances (
    employee_id,
    amount_given,
    date_given,
    purpose,
    payment_method,
    status,
    notes,
    request_id,
    created_by
  )
  values (
    p_employee_id,
    p_amount_given,
    p_date_given,
    p_purpose,
    p_payment_method,
    coalesce(p_status, 'open'::public.advance_status),
    p_notes,
    p_request_id,
    v_requester.id
  )
  returning * into v_advance;

  insert into public.advance_transactions (
    advance_id,
    employee_id,
    type,
    amount,
    transaction_date,
    notes,
    created_by
  )
  values (
    v_advance.id,
    v_advance.employee_id,
    'money_given',
    v_advance.amount_given,
    v_advance.date_given,
    'Opening advance',
    v_requester.id
  )
  returning * into v_opening_transaction;

  insert into public.activity_logs(user_id, action, table_name, record_id, new_data)
  values (
    v_requester.id,
    'advance_added',
    'employee_advances',
    v_advance.id,
    jsonb_build_object(
      'advance', to_jsonb(v_advance),
      'opening_transaction', to_jsonb(v_opening_transaction)
    )
  );

  advance_id := v_advance.id;
  opening_transaction_id := v_opening_transaction.id;
  return next;
end;
$$;

revoke all on function public.create_employee_advance(uuid, numeric, date, text, text, public.advance_status, text, text) from public;
grant execute on function public.create_employee_advance(uuid, numeric, date, text, text, public.advance_status, text, text) to authenticated;

create or replace function public.delete_employee_advance(
  p_advance_id uuid
)
returns table (
  deleted_advance_id uuid,
  deleted_transaction_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester public.profiles%rowtype;
  v_advance public.employee_advances%rowtype;
  v_transaction_count integer := 0;
  v_old_transactions jsonb := '[]'::jsonb;
begin
  select * into v_requester
  from public.profiles
  where auth_user_id = auth.uid()
    and status = 'active';

  if v_requester.id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if v_requester.role not in ('admin', 'manager') then
    raise exception 'Employees cannot delete funds' using errcode = '42501';
  end if;

  select * into v_advance
  from public.employee_advances
  where id = p_advance_id
  for update;

  if v_advance.id is null then
    raise exception 'Advance was not found';
  end if;

  select
    count(*)::integer,
    coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
  into v_transaction_count, v_old_transactions
  from public.advance_transactions t
  where t.advance_id = p_advance_id;

  delete from public.advance_transactions
  where advance_id = p_advance_id;

  delete from public.employee_advances
  where id = p_advance_id;

  insert into public.activity_logs(user_id, action, table_name, record_id, old_data)
  values (v_requester.id, 'advance_deleted', 'employee_advances', p_advance_id, to_jsonb(v_advance));

  if v_transaction_count > 0 then
    insert into public.activity_logs(user_id, action, table_name, record_id, old_data)
    values (v_requester.id, 'advance_transactions_deleted', 'advance_transactions', p_advance_id, v_old_transactions);
  end if;

  deleted_advance_id := p_advance_id;
  deleted_transaction_count := v_transaction_count;
  return next;
end;
$$;

revoke all on function public.delete_employee_advance(uuid) from public;
grant execute on function public.delete_employee_advance(uuid) to authenticated;

create or replace function public.add_advance_transaction(
  p_advance_id uuid,
  p_type public.advance_transaction_type,
  p_amount numeric,
  p_stock_account_id uuid,
  p_transaction_date date,
  p_notes text
)
returns public.advance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester public.profiles%rowtype;
  v_advance public.employee_advances%rowtype;
  v_transaction public.advance_transactions%rowtype;
begin
  select * into v_requester
  from public.profiles
  where auth_user_id = auth.uid()
    and status = 'active';

  if v_requester.id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if v_requester.role not in ('admin', 'manager') then
    raise exception 'Employees cannot manage fund transactions' using errcode = '42501';
  end if;

  select * into v_advance
  from public.employee_advances
  where id = p_advance_id
  for update;

  if v_advance.id is null then
    raise exception 'Advance was not found';
  end if;

  if p_type is null then
    raise exception 'Transaction type is required';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'Amount must be zero or greater';
  end if;

  if p_transaction_date is null then
    raise exception 'Transaction date is required';
  end if;

  if p_type = 'money_given' and coalesce(p_notes, '') = 'Opening advance' then
    raise exception 'Opening advance transactions are created with advances';
  end if;

  if p_stock_account_id is not null and not exists (
    select 1 from public.stock_accounts where id = p_stock_account_id
  ) then
    raise exception 'Stock account was not found';
  end if;

  insert into public.advance_transactions (
    advance_id,
    employee_id,
    type,
    amount,
    stock_account_id,
    transaction_date,
    notes,
    created_by
  )
  values (
    v_advance.id,
    v_advance.employee_id,
    p_type,
    p_amount,
    p_stock_account_id,
    p_transaction_date,
    p_notes,
    v_requester.id
  )
  returning * into v_transaction;

  insert into public.activity_logs(user_id, action, table_name, record_id, new_data)
  values (v_requester.id, 'advance_transaction_added', 'advance_transactions', v_transaction.id, to_jsonb(v_transaction));

  return v_transaction;
end;
$$;

revoke all on function public.add_advance_transaction(uuid, public.advance_transaction_type, numeric, uuid, date, text) from public;
grant execute on function public.add_advance_transaction(uuid, public.advance_transaction_type, numeric, uuid, date, text) to authenticated;
