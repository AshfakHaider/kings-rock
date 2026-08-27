alter table public.stock_accounts
  add column if not exists image_path text,
  add column if not exists image_paths text[] not null default '{}';

with parsed_images as (
  select
    stock_accounts.id,
    array_remove(
      array_agg(
        case
          when source.url like '%/storage/v1/object/public/stock-images/%'
            then split_part(split_part(source.url, '/storage/v1/object/public/stock-images/', 2), '?', 1)
          when source.url like '%/storage/v1/object/sign/stock-images/%'
            then split_part(split_part(source.url, '/storage/v1/object/sign/stock-images/', 2), '?', 1)
          when source.url !~* '^https?://'
            then ltrim(source.url, '/')
          else null
        end
        order by source.ordinality
      ),
      null
    ) as paths
  from public.stock_accounts
  cross join lateral unnest(
    case
      when coalesce(array_length(stock_accounts.image_urls, 1), 0) > 0
        then stock_accounts.image_urls
      when stock_accounts.image_url is not null and stock_accounts.image_url <> ''
        then array[stock_accounts.image_url]
      else array[]::text[]
    end
  ) with ordinality as source(url, ordinality)
  where coalesce(array_length(stock_accounts.image_paths, 1), 0) = 0
    and stock_accounts.image_path is null
  group by stock_accounts.id
)
update public.stock_accounts
set
  image_paths = parsed_images.paths,
  image_path = parsed_images.paths[1]
from parsed_images
where stock_accounts.id = parsed_images.id
  and coalesce(array_length(parsed_images.paths, 1), 0) > 0;

insert into storage.buckets (id, name, public)
values ('stock-images', 'stock-images', false)
on conflict (id) do update set public = false;

drop policy if exists "stock images authenticated read" on storage.objects;
drop policy if exists "stock images authenticated upload" on storage.objects;

create policy "stock images authenticated upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'stock-images');
