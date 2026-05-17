alter table public.daily_task_completions
add column if not exists screenshot_urls text[] not null default '{}';

update public.daily_task_completions
set screenshot_urls = array[screenshot_url]
where screenshot_url is not null
  and screenshot_url <> ''
  and coalesce(array_length(screenshot_urls, 1), 0) = 0;
