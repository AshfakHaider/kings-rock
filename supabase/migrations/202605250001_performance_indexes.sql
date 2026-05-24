create index if not exists stock_accounts_status_idx
on public.stock_accounts(status);

create index if not exists stock_accounts_created_at_idx
on public.stock_accounts(created_at desc);

create index if not exists stock_accounts_assigned_employee_id_idx
on public.stock_accounts(assigned_employee_id);

create index if not exists stock_accounts_secret_code_idx
on public.stock_accounts(secret_code);

create index if not exists stock_accounts_account_title_idx
on public.stock_accounts(account_title);

create index if not exists sold_accounts_employee_id_idx
on public.sold_accounts(employee_id);

create index if not exists sold_accounts_payment_status_idx
on public.sold_accounts(payment_status);

create index if not exists sold_accounts_sold_date_idx
on public.sold_accounts(sold_date desc);

create index if not exists sold_accounts_source_idx
on public.sold_accounts(sold_source_website);

create index if not exists expenses_category_idx
on public.expenses(category);

create index if not exists expenses_expense_date_idx
on public.expenses(expense_date desc);

create index if not exists expenses_paid_by_idx
on public.expenses(paid_by);
