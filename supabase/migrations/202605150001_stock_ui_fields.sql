alter table public.stock_accounts
  add column if not exists selling_price numeric(12, 2) check (selling_price is null or selling_price >= 0),
  add column if not exists image_url text,
  add column if not exists image_urls text[] not null default '{}',
  add column if not exists secret_code text;

update public.stock_accounts
set image_urls = array[image_url]
where image_url is not null
  and coalesce(array_length(image_urls, 1), 0) = 0;

create unique index if not exists stock_accounts_secret_code_unique_idx
on public.stock_accounts(secret_code)
where secret_code is not null;

create index if not exists stock_accounts_secret_code_idx
on public.stock_accounts(secret_code);

update public.settings
set game_categories = array['Mobile Legends', 'Clash of Clans', 'PUBG', 'Free Fire', 'Valorant', 'COD Mobile']
where game_categories is null
   or not ('Mobile Legends' = any(game_categories));

insert into storage.buckets (id, name, public)
values ('stock-images', 'stock-images', true)
on conflict (id) do update set public = true;

drop policy if exists "stock images authenticated upload" on storage.objects;
create policy "stock images authenticated upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'stock-images' and public.is_manager_or_admin());

drop policy if exists "stock images authenticated read" on storage.objects;
create policy "stock images authenticated read"
on storage.objects for select
to authenticated
using (bucket_id = 'stock-images');
