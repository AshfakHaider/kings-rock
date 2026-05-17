create or replace function public.monthly_leaderboard(
  p_year int,
  p_month int
)
returns table (
  employee_id uuid,
  name text,
  email text,
  role app_role,
  status employee_status,
  sold_count bigint,
  total_sales numeric,
  last_sale date
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    p.id as employee_id,
    p.name,
    p.email,
    p.role,
    p.status,
    count(sa.id) as sold_count,
    coalesce(sum(sa.sold_amount), 0) as total_sales,
    max(sa.sold_date) as last_sale
  from public.profiles p
  left join public.sold_accounts sa
    on sa.employee_id = p.id
    and extract(year from sa.sold_date)::int = p_year
    and extract(month from sa.sold_date)::int = p_month
  where p.role <> 'admin'
    and p.status = 'active'
  group by p.id, p.name, p.email, p.role, p.status
  order by sold_count desc, total_sales desc, p.name asc;
end;
$$;

grant execute on function public.monthly_leaderboard(int, int) to authenticated;
