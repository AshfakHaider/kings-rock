create unique index if not exists profiles_phone_unique_idx
on public.profiles(phone)
where phone is not null and phone <> '';
