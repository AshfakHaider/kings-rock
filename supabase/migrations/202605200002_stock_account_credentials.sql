create table if not exists public.stock_account_credentials (
  stock_account_id uuid primary key references public.stock_accounts(id) on delete cascade,
  gmail_email text not null,
  encrypted_password text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists touch_stock_account_credentials_updated_at on public.stock_account_credentials;
create trigger touch_stock_account_credentials_updated_at
before update on public.stock_account_credentials
for each row execute function public.touch_updated_at();

create index if not exists stock_account_credentials_gmail_email_idx
on public.stock_account_credentials(gmail_email);

alter table public.stock_account_credentials enable row level security;

drop policy if exists "stock credentials read assigned" on public.stock_account_credentials;
create policy "stock credentials read assigned"
on public.stock_account_credentials for select
using (
  public.is_manager_or_admin()
  or exists (
    select 1 from public.stock_accounts sa
    where sa.id = stock_account_id
      and sa.assigned_employee_id = public.current_profile_id()
      and sa.assigned_employee_id is not null
  )
);

drop policy if exists "stock credentials insert owner" on public.stock_account_credentials;
create policy "stock credentials insert owner"
on public.stock_account_credentials for insert
with check (
  public.is_manager_or_admin()
  or exists (
    select 1 from public.stock_accounts sa
    where sa.id = stock_account_id
      and sa.created_by = public.current_profile_id()
  )
);

drop policy if exists "stock credentials update owner" on public.stock_account_credentials;
create policy "stock credentials update owner"
on public.stock_account_credentials for update
using (
  public.is_manager_or_admin()
  or exists (
    select 1 from public.stock_accounts sa
    where sa.id = stock_account_id
      and (sa.created_by = public.current_profile_id() or sa.assigned_employee_id = public.current_profile_id())
  )
)
with check (
  public.is_manager_or_admin()
  or exists (
    select 1 from public.stock_accounts sa
    where sa.id = stock_account_id
      and (sa.created_by = public.current_profile_id() or sa.assigned_employee_id = public.current_profile_id())
  )
);

grant select, insert, update on public.stock_account_credentials to authenticated;
