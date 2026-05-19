# Game Account Business Manager

Mobile-first full-stack business management system for buying and reselling gaming accounts.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-style components
- Supabase Auth
- Supabase PostgreSQL
- Row Level Security
- Server actions for CRUD and audit logging

## Features

- Role-based app shell for Admin, Manager, and Employee
- Dashboard with stock, sales, buying cost, gross profit, expenses, net profit, Gmail counts, and advance balance
- Charts for monthly sales/profit, employee profit comparison, and stock value by game
- Stock account CRUD with assignment and Gmail linking
- Stock account popup form with game category dropdown, selling price, up to 15 image uploads, and secret code
- Clickable stock rows that open a detail page with the account image and private details
- Sold account workflow with duplicate-sale prevention through a unique database constraint
- Sales tab shows available accounts only; Sold Accounts tab shows sale history
- Gmail inventory with encrypted passwords and admin-only reveal/copy logging
- Employee profiles with performance, sales, profit, and advance balance
- Employee advance/fund ledger with money given, purchases, returns, and adjustments
- Expenses module
- Reports with date, month, year, employee, game, source, status filters and CSV export
- Activity logs for sensitive and operational actions
- Settings for business name, currency, categories, sources, and permissions

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env.local
```

3. Create a Supabase project and fill:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GMAIL_PASSWORD_ENCRYPTION_KEY=
NEXT_PUBLIC_ALLOW_DEMO_MODE=false
```

Use a strong random value for `GMAIL_PASSWORD_ENCRYPTION_KEY`. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
Keep `NEXT_PUBLIC_ALLOW_DEMO_MODE=false` on Vercel/live hosting so the app never saves production records into local demo files.

4. Run SQL in Supabase:

- First run [supabase/schema.sql](/Users/syednawazishhaider/Documents/Codex/2026-05-15/build-a-full-stack-mobile-friendly/supabase/schema.sql)
- Then run [supabase/seed.sql](/Users/syednawazishhaider/Documents/Codex/2026-05-15/build-a-full-stack-mobile-friendly/supabase/seed.sql)

For an existing database, run the SQL files in [supabase/migrations](/Users/syednawazishhaider/Documents/Codex/2026-05-15/build-a-full-stack-mobile-friendly/supabase/migrations) in filename order.

5. Create the first Supabase Auth admin user manually or run:

```bash
ADMIN_EMAIL=admin@kingsrock.com ADMIN_PASSWORD='change-this-password' npm run live:create-admin
```

6. Link the first auth user to the seeded admin profile:

```sql
update public.profiles
set auth_user_id = '<auth-user-uuid>'
where email = 'admin@example.com';
```

Skip this manual SQL step if you used `npm run live:create-admin`. After that, use the Employees page to create managers and employees. The app creates their Supabase Auth login automatically with the email, phone number, and login password you enter. Employees can sign in with either their email or phone number plus that password.

7. Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo Mode

If Supabase env vars are missing, the app renders with demo data so you can inspect the UI immediately. Demo stock, Gmail, sales, and employee changes are stored in local `.demo-*.json` files.

Demo mode is for local development only. In production, missing Supabase keys show `/setup-required` unless you explicitly set `NEXT_PUBLIC_ALLOW_DEMO_MODE=true`.

## Going Live On Render + Supabase

Recommended Render setup:

1. Push this project to GitHub.
2. Create a Supabase project.
3. Run [supabase/schema.sql](/Users/syednawazishhaider/Documents/Codex/2026-05-15/build-a-full-stack-mobile-friendly/supabase/schema.sql) in the Supabase SQL editor.
4. Confirm these Supabase Storage buckets exist: `stock-images`, `task-screenshots`.
5. Open Render and choose **New +** → **Web Service**.
6. Connect GitHub and select `AshfakHaider/kings-rock`.
7. Use these settings if Render does not read `render.yaml` automatically:

```text
Runtime: Node
Build Command: npm ci && npm run build
Start Command: npm run start:render
Plan: Free
```

8. Add environment variables in Render → service → **Environment**:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GMAIL_PASSWORD_ENCRYPTION_KEY=
NEXT_PUBLIC_ALLOW_DEMO_MODE=false
```

9. Click **Deploy Web Service**.
10. Create the first admin in Supabase Auth and link it to `profiles`, or run `npm run live:create-admin` locally with live Supabase env values.

Render's free web services can sleep after inactivity, so the first visit after a break may take longer. For a business app you use all day, upgrade to a paid Render plan later to avoid sleeping.

## Going Live On Vercel + Supabase

Recommended low-cost launch setup:

1. Push this project to GitHub.
2. Create a Supabase project.
3. Run [supabase/schema.sql](/Users/syednawazishhaider/Documents/Codex/2026-05-15/build-a-full-stack-mobile-friendly/supabase/schema.sql) in the Supabase SQL editor.
4. Run all migration files in [supabase/migrations](/Users/syednawazishhaider/Documents/Codex/2026-05-15/build-a-full-stack-mobile-friendly/supabase/migrations) only if you are updating an existing database.
5. Confirm these Supabase Storage buckets exist: `stock-images`, `task-screenshots`.
6. Import the GitHub repo into Vercel.
7. Add the environment variables from `.env.example` in Vercel Project Settings.
8. Redeploy the Vercel project.
9. Run `npm run live:create-admin` locally with live Supabase env values, or create the admin manually in Supabase Auth and link it to `profiles`.
10. Login, change the admin password, and create employee accounts from the Employees page.

For the cheapest image usage, the app compresses stock images and task screenshots in the browser before upload. Keep original images off the database; only image URLs should be stored in Postgres.

If image storage grows beyond the free Supabase Storage limit, move image storage to Cloudflare R2 while keeping Supabase for Auth, Postgres, and RLS.

## Security Notes

- Supabase RLS is enabled for every business table.
- Employees can only read assigned stock, own sales, own advances, and own logs.
- Managers can manage operational data but cannot reveal Gmail passwords.
- Gmail passwords are encrypted before storage.
- Password reveal/copy goes through `POST /api/gmail/[id]/reveal`, requires admin role, uses the service role key server-side, and writes an activity log.
- The database revokes direct authenticated access to the `encrypted_password` column.

## Verification

```bash
npm run typecheck
npm run build
```

Both commands pass in this workspace.

## Project Files

- [docs/system-plan.md](/Users/syednawazishhaider/Documents/Codex/2026-05-15/build-a-full-stack-mobile-friendly/docs/system-plan.md)
- [supabase/schema.sql](/Users/syednawazishhaider/Documents/Codex/2026-05-15/build-a-full-stack-mobile-friendly/supabase/schema.sql)
- [supabase/seed.sql](/Users/syednawazishhaider/Documents/Codex/2026-05-15/build-a-full-stack-mobile-friendly/supabase/seed.sql)
- [supabase/migrations/202605150001_stock_ui_fields.sql](/Users/syednawazishhaider/Documents/Codex/2026-05-15/build-a-full-stack-mobile-friendly/supabase/migrations/202605150001_stock_ui_fields.sql)
- [app](/Users/syednawazishhaider/Documents/Codex/2026-05-15/build-a-full-stack-mobile-friendly/app)
- [components](/Users/syednawazishhaider/Documents/Codex/2026-05-15/build-a-full-stack-mobile-friendly/components)
- [lib](/Users/syednawazishhaider/Documents/Codex/2026-05-15/build-a-full-stack-mobile-friendly/lib)
