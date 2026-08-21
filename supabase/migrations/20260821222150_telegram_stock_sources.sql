create table if not exists public.telegram_stock_sources (
  id uuid primary key default gen_random_uuid(),
  stock_account_id uuid not null references public.stock_accounts(id) on delete cascade,
  chat_id text not null,
  message_id bigint not null,
  message_kind text not null check (message_kind in ('title', 'selling_price', 'private_note', 'image', 'other')),
  source_chat_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(chat_id, message_id)
);

create index if not exists telegram_stock_sources_chat_message_idx
on public.telegram_stock_sources(chat_id, message_id);

create index if not exists telegram_stock_sources_stock_account_id_idx
on public.telegram_stock_sources(stock_account_id);

alter table public.telegram_stock_sources enable row level security;

drop policy if exists "telegram stock sources admin manager select" on public.telegram_stock_sources;
drop policy if exists "telegram stock sources admin manager insert" on public.telegram_stock_sources;
drop policy if exists "telegram stock sources admin manager update" on public.telegram_stock_sources;
drop policy if exists "telegram stock sources admin manager delete" on public.telegram_stock_sources;

create policy "telegram stock sources admin manager select"
on public.telegram_stock_sources for select
using (public.is_manager_or_admin());

create policy "telegram stock sources admin manager insert"
on public.telegram_stock_sources for insert
with check (public.is_manager_or_admin());

create policy "telegram stock sources admin manager update"
on public.telegram_stock_sources for update
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

create policy "telegram stock sources admin manager delete"
on public.telegram_stock_sources for delete
using (public.is_manager_or_admin());


grant select, insert, update, delete on public.telegram_stock_sources to authenticated;
