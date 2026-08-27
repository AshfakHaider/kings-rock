create table if not exists public.telegram_runtime_state (
  key text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.telegram_runtime_state enable row level security;

drop policy if exists "telegram runtime admin select" on public.telegram_runtime_state;
drop policy if exists "telegram runtime admin insert" on public.telegram_runtime_state;
drop policy if exists "telegram runtime admin update" on public.telegram_runtime_state;
drop policy if exists "telegram runtime admin delete" on public.telegram_runtime_state;

create policy "telegram runtime admin select"
on public.telegram_runtime_state for select
using (public.is_admin());

create policy "telegram runtime admin insert"
on public.telegram_runtime_state for insert
with check (public.is_admin());

create policy "telegram runtime admin update"
on public.telegram_runtime_state for update
using (public.is_admin())
with check (public.is_admin());

create policy "telegram runtime admin delete"
on public.telegram_runtime_state for delete
using (public.is_admin());

insert into public.telegram_runtime_state (key, data)
select runtime.key, settings.employee_permissions -> runtime.key
from public.settings
cross join (
  values
    ('telegram_stock_drafts'),
    ('telegram_group_stock_queue'),
    ('telegram_group_queue_edits'),
    ('telegram_group_stock_blocks')
) as runtime(key)
where settings.employee_permissions ? runtime.key
on conflict (key) do update
set
  data = excluded.data,
  updated_at = now();

update public.settings
set
  employee_permissions = employee_permissions
    - 'telegram_stock_drafts'
    - 'telegram_group_stock_queue'
    - 'telegram_group_queue_edits'
    - 'telegram_group_stock_blocks',
  updated_at = now()
where employee_permissions ?| array[
  'telegram_stock_drafts',
  'telegram_group_stock_queue',
  'telegram_group_queue_edits',
  'telegram_group_stock_blocks'
];
