drop policy if exists "profiles admin manager insert" on public.profiles;
drop policy if exists "profiles admin manager update" on public.profiles;

create policy "profiles admin manager insert"
on public.profiles for insert
with check (
  public.is_admin()
  or (public.current_app_role() = 'manager' and role = 'employee')
);

create policy "profiles admin manager update"
on public.profiles for update
using (
  public.is_admin()
  or (public.current_app_role() = 'manager' and role = 'employee')
  or (id = public.current_profile_id() and role = public.current_app_role())
)
with check (
  public.is_admin()
  or (public.current_app_role() = 'manager' and role = 'employee')
  or (id = public.current_profile_id() and role = public.current_app_role())
);
