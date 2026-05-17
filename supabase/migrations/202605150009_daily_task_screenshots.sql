alter table public.daily_task_completions
add column if not exists screenshot_url text;

update public.daily_task_completions
set screenshot_url = ''
where screenshot_url is null;

alter table public.daily_task_completions
alter column screenshot_url set not null;

insert into storage.buckets (id, name, public)
values ('task-screenshots', 'task-screenshots', true)
on conflict (id) do update set public = true;

drop policy if exists "task screenshots authenticated upload" on storage.objects;
drop policy if exists "task screenshots authenticated read" on storage.objects;

create policy "task screenshots authenticated upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'task-screenshots');

create policy "task screenshots authenticated read"
on storage.objects for select
to authenticated
using (bucket_id = 'task-screenshots');
