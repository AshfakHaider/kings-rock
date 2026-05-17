# System Plan

## Product Scope

This app manages a gaming account buying and selling business from purchase to resale. It tracks stock, assignments, sales, Gmail inventory, advances/funds, expenses, profit/loss, reports, and auditable staff activity.

## System Plan

1. **Authentication and roles**
   - Supabase Auth is the identity provider.
   - A `profiles` row stores business role metadata for each auth user.
   - Middleware protects dashboard routes and sends unauthenticated users to `/login`.
   - UI and database policies enforce Admin, Manager, and Employee access.

2. **Data modules**
   - Stock accounts are the inventory source of truth.
   - Sold accounts link to stock accounts and compute profit from the stock buying price.
   - Gmail inventory stores encrypted passwords and never exposes them to non-admin users.
   - Employee advances use an opening advance record plus immutable transactions for money movement.
   - Expenses reduce net profit.
   - Activity logs track sensitive and business-critical actions.

3. **App architecture**
   - Next.js App Router with server components for data fetching.
   - Server actions perform mutations and write activity logs.
   - Supabase RLS protects data even if UI checks are bypassed.
   - Mobile-first layout uses bottom navigation; desktop uses a sidebar.
   - Pages share list, stat, card, badge, and form primitives styled with shadcn/ui conventions.

4. **Reporting**
   - Dashboard calculates stock value, sales, buying cost, gross profit, expenses, net profit, monthly/yearly profit, Gmail count, and advance balance.
   - Report pages support filters by date, month, year, employee, game, source, and account status.
   - CSV export is available from report tables; Excel can be added later with the same data providers.

## Database Design

Core tables:

- `profiles`: app users and employees, linked to `auth.users`.
- `stock_accounts`: account inventory with assignment, linked Gmail, purchase source, and status.
- `sold_accounts`: sale records linked one-to-one to stock accounts.
- `gmail_inventory`: encrypted Gmail credentials with usage status.
- `employee_advances`: fund envelopes given to employees.
- `advance_transactions`: ledger entries that calculate remaining advance balance.
- `expenses`: non-stock costs.
- `activity_logs`: audit trail with old and new JSON payloads.
- `settings`: business config, categories, source websites, and role permissions.

Important constraints:

- One `sold_accounts.stock_account_id` per stock account.
- One `gmail_inventory.used_for_stock_account_id` per stock account.
- Foreign keys preserve employee, creator, sale, stock, and Gmail relationships.
- Indexes support dashboard filters and report aggregation.
- Triggers keep `updated_at` current and set stock/Gmail status when linked records change.

## User Flow

1. User logs in with Supabase Auth.
2. Middleware validates the session and loads role data from `profiles`.
3. Dashboard opens with role-appropriate summaries.
4. Admin/Manager creates stock accounts and assigns them to employees.
5. Employee sees only assigned accounts and marks a sold account as sold.
6. Sale creation updates stock status to `sold` and writes an activity log.
7. Gmail credentials can be added by Admin/Manager, but only Admin can reveal/copy passwords.
8. Advances are created by Admin/Manager and reduced by account purchases or returned money.
9. Reports filter and export operational data.

## Role Permission Plan

| Module | Admin | Manager | Employee |
| --- | --- | --- | --- |
| Dashboard | All metrics | All operational metrics | Own sales/assigned summaries |
| Stock | CRUD all | CRUD all | Read assigned only |
| Sales | CRUD all | Create/edit operational sales | Create own assigned sales, read own |
| Gmail | Full including password reveal | Add/edit non-secret fields | No password access |
| Employees | CRUD | CRUD except admin-only permission settings | Own profile read |
| Advances | CRUD and settle | CRUD operational advances | Read own history |
| Expenses | CRUD | CRUD | No access |
| Reports | All | All business reports | Own performance only |
| Activity Logs | All | Operational logs | Own logs only |
| Settings | All | Limited category/source settings | No access |

RLS mirrors this plan. The UI also hides actions the user cannot take.
