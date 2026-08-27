alter table public.stock_accounts
  add column if not exists zeusx_enabled boolean not null default false,
  add column if not exists zeusx_status text not null default 'pending'
    check (zeusx_status in ('pending', 'posting', 'posted', 'failed')),
  add column if not exists zeusx_category text,
  add column if not exists zeusx_game text,
  add column if not exists zeusx_server text,
  add column if not exists zeusx_delivery_method text,
  add column if not exists zeusx_delivery_days integer not null default 0
    check (zeusx_delivery_days >= 0),
  add column if not exists zeusx_delivery_hours integer not null default 1
    check (zeusx_delivery_hours >= 0),
  add column if not exists zeusx_description text,
  add column if not exists zeusx_tags text[] not null default '{}',
  add column if not exists zeusx_listing_url text,
  add column if not exists zeusx_posted_at timestamptz,
  add column if not exists zeusx_error text;

create index if not exists stock_accounts_zeusx_pending_idx
on public.stock_accounts (zeusx_status, updated_at)
where zeusx_enabled is true and status <> 'sold';

create or replace function public.guard_stock_accounts_zeusx_admin_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not public.is_admin()
    and (
      old.zeusx_enabled is distinct from new.zeusx_enabled
      or old.zeusx_status is distinct from new.zeusx_status
      or old.zeusx_category is distinct from new.zeusx_category
      or old.zeusx_game is distinct from new.zeusx_game
      or old.zeusx_server is distinct from new.zeusx_server
      or old.zeusx_delivery_method is distinct from new.zeusx_delivery_method
      or old.zeusx_delivery_days is distinct from new.zeusx_delivery_days
      or old.zeusx_delivery_hours is distinct from new.zeusx_delivery_hours
      or old.zeusx_description is distinct from new.zeusx_description
      or old.zeusx_tags is distinct from new.zeusx_tags
      or old.zeusx_listing_url is distinct from new.zeusx_listing_url
      or old.zeusx_posted_at is distinct from new.zeusx_posted_at
      or old.zeusx_error is distinct from new.zeusx_error
    )
  then
    raise exception 'Only admins can change ZeusX posting fields.';
  end if;

  return new;
end;
$$;

drop trigger if exists stock_accounts_zeusx_admin_guard on public.stock_accounts;
create trigger stock_accounts_zeusx_admin_guard
before update on public.stock_accounts
for each row
execute function public.guard_stock_accounts_zeusx_admin_update();
