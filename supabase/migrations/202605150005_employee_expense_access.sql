drop policy if exists "expenses admin manager" on public.expenses;
drop policy if exists "expenses read by role" on public.expenses;
drop policy if exists "expenses insert by role" on public.expenses;
drop policy if exists "expenses admin manager update" on public.expenses;
drop policy if exists "expenses admin manager delete" on public.expenses;

create policy "expenses read by role"
on public.expenses for select
using (
  public.is_manager_or_admin()
  or paid_by = public.current_profile_id()
);

create policy "expenses insert by role"
on public.expenses for insert
with check (
  public.is_manager_or_admin()
  or paid_by = public.current_profile_id()
);

create policy "expenses admin manager update"
on public.expenses for update
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

create policy "expenses admin manager delete"
on public.expenses for delete
using (public.is_manager_or_admin());
