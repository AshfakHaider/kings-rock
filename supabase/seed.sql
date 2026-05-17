insert into public.settings (business_name, currency, game_categories)
values ('Kings Rock', 'BDT', array['Mobile Legends', 'Clash of Clans'])
on conflict do nothing;

-- Replace auth_user_id values after creating Supabase Auth users.
insert into public.profiles (id, auth_user_id, name, phone, email, role, status, join_date, notes)
values
  ('00000000-0000-0000-0000-000000000001', null, 'Admin Owner', '+8801700000001', 'admin@example.com', 'admin', 'active', '2026-01-01', 'Demo owner'),
  ('00000000-0000-0000-0000-000000000002', null, 'Mina Manager', '+8801700000002', 'manager@example.com', 'manager', 'active', '2026-01-10', 'Demo manager'),
  ('00000000-0000-0000-0000-000000000003', null, 'Rafi Seller', '+8801700000003', 'employee@example.com', 'employee', 'active', '2026-02-01', 'Demo seller')
on conflict (id) do nothing;

insert into public.gmail_inventory (id, email, encrypted_password, recovery_info, status, date_added, notes)
values
  ('10000000-0000-0000-0000-000000000001', 'fresh.one@example.com', 'encrypted-demo-value', 'Recovery phone ending 001', 'fresh', '2026-05-01', 'Fresh Gmail'),
  ('10000000-0000-0000-0000-000000000002', 'used.pubg@example.com', 'encrypted-demo-value', 'Recovery phone ending 002', 'used', '2026-05-02', 'Used for PUBG account'),
  ('10000000-0000-0000-0000-000000000003', 'problem.mail@example.com', 'encrypted-demo-value', 'Recovery phone ending 003', 'problem', '2026-05-03', 'Recovery issue')
on conflict (id) do nothing;

insert into public.stock_accounts (id, game_name, account_title, account_details, purchase_source, buying_price, selling_price, image_url, secret_code, purchase_date, status, assigned_employee_id, gmail_id, notes, created_by)
values
  ('20000000-0000-0000-0000-000000000001', 'PUBG', 'PUBG Conqueror S18', 'High tier account with rare skins', 'Agent Karim', 18500, 24500, 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop', 'pubg1801', '2026-05-01', 'assigned', '00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Ready to sell', '00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'Free Fire', 'FF Elite Pass Bundle', 'Multiple elite passes and weapons', 'Facebook seller', 7200, 9800, 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop', 'ff7206', '2026-05-06', 'available', null, null, 'Fresh stock', '00000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000003', 'Clash of Clans', 'TH15 Semi Max', 'Strong village, good heroes', 'Employee purchase', 12000, 16800, 'https://images.unsplash.com/photo-1511882150382-421056c89033?q=80&w=1200&auto=format&fit=crop', 'coc1202', '2026-04-22', 'sold', '00000000-0000-0000-0000-000000000003', null, 'Sold on G2G', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.sold_accounts (id, stock_account_id, employee_id, sold_amount, sold_source_website, buyer_contact, payment_status, payment_method, sold_date, notes)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 16800, 'G2G', 'buyer@example.com', 'paid', 'Bkash', '2026-05-10', 'Smooth sale')
on conflict (id) do nothing;

insert into public.employee_advances (id, employee_id, amount_given, date_given, purpose, payment_method, status, notes, created_by)
values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 30000, '2026-05-01', 'Buying accounts', 'Cash', 'partial', 'May buying fund', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.advance_transactions (advance_id, employee_id, type, amount, stock_account_id, transaction_date, notes, created_by)
values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'money_given', 30000, null, '2026-05-01', 'Opening fund', '00000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'account_purchase', 12000, '20000000-0000-0000-0000-000000000003', '2026-05-03', 'COC purchase', '00000000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into public.expenses (title, category, amount, expense_date, paid_by, notes)
values
  ('Gmail batch purchase', 'gmail_purchase', 1200, '2026-05-02', '00000000-0000-0000-0000-000000000001', '20 fresh gmails'),
  ('Facebook ads', 'ads', 3500, '2026-05-08', '00000000-0000-0000-0000-000000000002', 'Sales promotion')
on conflict do nothing;
