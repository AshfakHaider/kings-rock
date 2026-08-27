drop policy if exists "advances admin manager write" on public.employee_advances;
drop policy if exists "advance tx admin manager write" on public.advance_transactions;

create or replace function public.ensure_advance_transaction_employee_matches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
begin
  select employee_id into v_employee_id
  from public.employee_advances
  where id = new.advance_id;

  if v_employee_id is null then
    raise exception 'Advance was not found';
  end if;

  if new.employee_id <> v_employee_id then
    raise exception 'Advance transaction employee must match advance employee';
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_advance_transaction_employee_matches_trigger on public.advance_transactions;
create trigger ensure_advance_transaction_employee_matches_trigger
before insert or update of advance_id, employee_id
on public.advance_transactions
for each row
execute function public.ensure_advance_transaction_employee_matches();

create or replace function public.prevent_opening_advance_transaction_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.deleting_advance', true) = 'true' then
    return old;
  end if;

  if old.type = 'money_given'
    and old.notes = 'Opening advance'
    and exists (select 1 from public.employee_advances where id = old.advance_id)
  then
    raise exception 'Opening advance transactions cannot be deleted separately';
  end if;

  return old;
end;
$$;

drop trigger if exists prevent_opening_advance_transaction_delete_trigger on public.advance_transactions;
create trigger prevent_opening_advance_transaction_delete_trigger
before delete
on public.advance_transactions
for each row
execute function public.prevent_opening_advance_transaction_delete();

create or replace function public.assert_advance_opening_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.advance_transactions at
    where at.advance_id = new.id
      and at.employee_id = new.employee_id
      and at.type = 'money_given'
      and at.amount = new.amount_given
      and at.transaction_date = new.date_given
      and at.notes = 'Opening advance'
  ) then
    raise exception 'Advance must have a matching opening transaction';
  end if;

  return new;
end;
$$;

drop trigger if exists assert_advance_opening_transaction_trigger on public.employee_advances;
create constraint trigger assert_advance_opening_transaction_trigger
after insert or update of employee_id, amount_given, date_given
on public.employee_advances
deferrable initially deferred
for each row
execute function public.assert_advance_opening_transaction();

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

  if p_request_id is null or btrim(p_request_id) = '' then
    raise exception 'Advance request id is required';
  end if;

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

create or replace function public.update_employee_advance(
  p_advance_id uuid,
  p_employee_id uuid,
  p_amount_given numeric,
  p_date_given date,
  p_purpose text,
  p_payment_method text,
  p_status public.advance_status,
  p_notes text
)
returns public.employee_advances
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester public.profiles%rowtype;
  v_employee public.profiles%rowtype;
  v_old_advance public.employee_advances%rowtype;
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

  select * into v_old_advance
  from public.employee_advances
  where id = p_advance_id
  for update;

  if v_old_advance.id is null then
    raise exception 'Advance was not found';
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

  select * into v_opening_transaction
  from public.advance_transactions
  where advance_id = p_advance_id
    and type = 'money_given'
    and notes = 'Opening advance'
  order by created_at asc
  limit 1
  for update;

  update public.employee_advances
  set
    employee_id = p_employee_id,
    amount_given = p_amount_given,
    date_given = p_date_given,
    purpose = p_purpose,
    payment_method = p_payment_method,
    status = coalesce(p_status, 'open'::public.advance_status),
    notes = p_notes,
    created_by = v_requester.id
  where id = p_advance_id
  returning * into v_advance;

  update public.advance_transactions
  set employee_id = v_advance.employee_id
  where advance_id = v_advance.id;

  if v_opening_transaction.id is null then
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
  else
    update public.advance_transactions
    set
      amount = v_advance.amount_given,
      transaction_date = v_advance.date_given,
      created_by = v_requester.id
    where id = v_opening_transaction.id
    returning * into v_opening_transaction;
  end if;

  insert into public.activity_logs(user_id, action, table_name, record_id, old_data, new_data)
  values (v_requester.id, 'advance_edited', 'employee_advances', v_advance.id, to_jsonb(v_old_advance), to_jsonb(v_advance));

  return v_advance;
end;
$$;

revoke all on function public.update_employee_advance(uuid, uuid, numeric, date, text, text, public.advance_status, text) from public;
grant execute on function public.update_employee_advance(uuid, uuid, numeric, date, text, text, public.advance_status, text) to authenticated;

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

  perform set_config('app.deleting_advance', 'true', true);

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

create or replace function public.delete_advance_transaction(
  p_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester public.profiles%rowtype;
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
    raise exception 'Employees cannot delete fund transactions' using errcode = '42501';
  end if;

  select * into v_transaction
  from public.advance_transactions
  where id = p_transaction_id
  for update;

  if v_transaction.id is null then
    raise exception 'Fund transaction was not found';
  end if;

  if v_transaction.type = 'money_given' and v_transaction.notes = 'Opening advance' then
    raise exception 'Opening advance transactions cannot be deleted separately';
  end if;

  delete from public.advance_transactions
  where id = p_transaction_id;

  insert into public.activity_logs(user_id, action, table_name, record_id, old_data)
  values (v_requester.id, 'advance_transaction_deleted', 'advance_transactions', p_transaction_id, to_jsonb(v_transaction));

  return p_transaction_id;
end;
$$;

revoke all on function public.delete_advance_transaction(uuid) from public;
grant execute on function public.delete_advance_transaction(uuid) to authenticated;

revoke insert, update, delete on public.employee_advances from anon, authenticated;
revoke insert, update, delete on public.advance_transactions from anon, authenticated;
