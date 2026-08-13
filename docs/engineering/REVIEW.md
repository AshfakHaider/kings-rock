# Kings Rock CRM Engineering Review

## 1. Review Metadata

- Repository: Kings Rock CRM
- Commit reviewed: `c1d6fb625cfc11851073c3a57cdea6660e286151`
- Branch: `review`
- Review date: August 14, 2026
- Review methodology: Static code review, architecture review, business workflow tracing, Supabase schema/RLS review, API/server-action inspection, dependency audit review, local verification command review, threat modeling, and consolidated adversarial review.
- Scope: Next.js application code, server actions, API routes, Telegram webhook integration, Supabase schema and migrations, configuration usage, dependencies, testing/tooling, performance-sensitive paths, and production readiness. Live database state and production Supabase settings were not modified.

## 2. Executive Summary

Kings Rock CRM is a functional business management system with stock, sales, employee, expense, losses, daily task, dashboard, and Telegram import workflows. The application has a clear product direction and many complete operational features.

The review found several confirmed risks that must be addressed before the system should be considered ready for serious production usage. The highest-risk issues are authorization weaknesses, sensitive data exposure, non-transactional financial workflows, missing automated tests, and high-severity dependency vulnerabilities.

No remediation was performed as part of this review document. This file records the review baseline and remediation backlog.

## 3. Architecture Summary

CONFIRMED:

- The app uses Next.js App Router with TypeScript.
- Server-side mutations are primarily implemented in `app/actions.ts`.
- Data reads are primarily implemented in `lib/data.ts`.
- Supabase Auth is used for authentication.
- Supabase PostgreSQL and Row Level Security are used for database authorization.
- Supabase Storage is used for stock images and task screenshots.
- A Telegram bot webhook is implemented in `app/api/telegram/webhook/route.ts`.
- Dashboard/reporting logic combines Supabase reads, SQL views/functions, and application-side aggregation.

Key architectural risks:

- Large modules mix validation, authorization, business logic, storage, and logging.
- Some critical business rules are enforced only in application code.
- Some multi-step financial and file workflows are not transactional.
- The Telegram integration stores runtime state inside settings JSON.

## 4. Production Readiness

State: NOT READY

Kings Rock CRM is not ready for serious production usage until the P0 issues are remediated and regression-tested.

Reasons:

- Managers can create or promote admin users.
- Sensitive stock images are stored in a public bucket.
- Raw settings can expose Telegram/private runtime state.
- Production dependencies have high-severity vulnerabilities.
- Critical inventory, payment, authorization, and financial workflows do not have meaningful automated tests.

The application can continue to be used carefully as an internal tool, but the current risk level is too high for a hardened production release.

## 5. Risk Summary

- Critical: 0
- High: 7
- Medium: 12
- Low: 1
- Informational: 0

## 6. Findings

### KR-FIND-001

- Category: Authorization / Sensitive Data Exposure
- Severity: High
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `app/(dashboard)/settings/page.tsx`, `components/navigation/nav-links.tsx`, `app/api/telegram/webhook/route.ts`
- Evidence: The settings page renders raw `employee_permissions` JSON. Navigation exposes Settings to authenticated users. Telegram draft/queue/private runtime state is stored in settings JSON.
- Impact: Authenticated users may see private Telegram import state, draft data, or operational details that should not be exposed.
- Failure/attack scenario: An employee opens Settings and views raw settings JSON containing Telegram-related draft or queue state.
- Root cause: Sensitive runtime state is stored in a broadly readable settings field and rendered directly in the UI.
- Recommended remediation: Do not render raw settings JSON. Move Telegram runtime state into dedicated tables with strict admin-only access and narrow server-side APIs.
- Required regression test: Authenticated non-admin users must not be able to view raw settings JSON or Telegram private/runtime state.

### KR-FIND-002

- Category: Privilege Escalation
- Severity: High
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `app/actions.ts`, `components/employees/employee-modal.tsx`, `supabase/schema.sql`
- Evidence: `saveEmployee` blocks employees but allows managers to create/update employee records. The employee modal exposes `admin` as a role option. RLS allows admin/manager profile insert/update.
- Impact: A manager can create or promote an admin account and gain full system privileges.
- Failure/attack scenario: A manager opens the employee modal, selects `admin`, and creates a new admin user.
- Root cause: Manager-level employee management is not separated from admin role assignment.
- Recommended remediation: Only admins should be able to create or assign admin role. Enforce this server-side and in RLS/RPC.
- Required regression test: Manager attempts to create or promote an admin must fail server-side.

### KR-FIND-003

- Category: Authorization / Business Logic
- Severity: High
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `supabase/migrations/20260810102909_multiple_stock_assignments.sql`, `components/stock/assignment-select.tsx`, `app/(dashboard)/stock-accounts/[id]/page.tsx`
- Evidence: Employees can self-assign stock. Stock detail grants private-note visibility to assigned users.
- Impact: Employees can gain access to private stock notes/credentials by assigning themselves to accounts.
- Failure/attack scenario: An employee self-assigns a high-value account and opens its detail page to view private notes.
- Root cause: Assignment is treated as both a work-tracking action and a permission grant.
- Recommended remediation: Separate "interest/work assignment" from "private note access", or require admin/manager approval before private data becomes visible.
- Required regression test: Employee self-assignment must not expose private notes unless the access rule explicitly permits it.

### KR-FIND-004

- Category: Integration Abuse
- Severity: Medium
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `app/api/telegram/webhook/route.ts`
- Evidence: Telegram group message processing occurs before strict allowed-user filtering.
- Impact: The bot may process group content from a broader set of users/groups than intended.
- Failure/attack scenario: A message in an allowed or accidentally connected group is parsed into draft/import state before the sender is fully authorized.
- Root cause: Authorization checks are not applied at the earliest integration boundary for all Telegram paths.
- Recommended remediation: Validate allowed group IDs and allowed sender IDs before any parsing, queueing, image processing, or database/storage work.
- Required regression test: Telegram webhook must ignore unauthorized group/sender messages before creating or updating any draft/queue state.

### KR-FIND-005

- Category: Sensitive Data Exposure
- Severity: High
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `supabase/schema.sql`, `app/actions.ts`
- Evidence: The `stock-images` storage bucket is defined as public. Public image URLs are stored and used.
- Impact: Stock account screenshots can be accessed by anyone with the URL.
- Failure/attack scenario: A copied stock image URL is shared outside the company and remains publicly accessible.
- Root cause: Sensitive business images are stored in a public bucket.
- Recommended remediation: Make stock images private and serve them through short-lived signed URLs after authorization checks.
- Required regression test: Unauthenticated requests must not be able to access stock images directly.

### KR-FIND-006

- Category: Audit Integrity
- Severity: Medium
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `supabase/schema.sql`, `app/actions.ts`
- Evidence: Activity logs allow insert by authenticated users and logging RPC accepts caller-supplied log details.
- Impact: Audit records can be forged or polluted by authenticated users.
- Failure/attack scenario: A user inserts misleading activity log entries to obscure their actions.
- Root cause: Audit logging trusts caller-supplied metadata too much.
- Recommended remediation: Restrict direct activity log insert. Use server-controlled logging functions that derive user/action metadata where possible.
- Required regression test: Authenticated non-admin users cannot directly forge arbitrary activity log entries.

### KR-FIND-007

- Category: Data Integrity / Race Condition
- Severity: Medium
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `app/actions.ts`, `app/api/telegram/webhook/route.ts`, `supabase/schema.sql`
- Evidence: Duplicate stock title prevention is application-side. The database has unique protection for `secret_code`, but not an equivalent normalized title constraint.
- Impact: Concurrent requests can create duplicate stock accounts with the same title.
- Failure/attack scenario: Two stock create requests with the same title pass the application duplicate check at the same time and both insert.
- Root cause: Duplicate rule is not fully enforced atomically in the database.
- Recommended remediation: Add a normalized title uniqueness strategy or transactional stock creation RPC.
- Required regression test: Concurrent creation of duplicate titles must result in one success and one rejection.

### KR-FIND-008

- Category: Storage / Partial Failure
- Severity: Medium
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `app/actions.ts`
- Evidence: Stock images are uploaded before duplicate validation and stock row insertion can fail after uploads complete.
- Impact: Failed stock creation can leave orphaned storage files.
- Failure/attack scenario: User uploads images for a duplicate account. Images upload successfully, then stock insert fails.
- Root cause: File upload and database insert are not coordinated with cleanup or prevalidation.
- Recommended remediation: Validate duplicate constraints before upload where possible, or clean up uploaded files if database insertion fails.
- Required regression test: Failed stock creation must not leave new storage objects behind.

### KR-FIND-009

- Category: Storage / Partial Failure
- Severity: Medium
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `app/actions.ts`, `supabase/schema.sql`
- Evidence: Daily task screenshots are uploaded before completion insert. Duplicate completion conflicts can be ignored after upload.
- Impact: Duplicate task completion attempts can leave orphan screenshots.
- Failure/attack scenario: Employee submits the same task twice with screenshots; second insert fails or is ignored, but images remain.
- Root cause: Screenshot upload happens before atomic completion validation.
- Recommended remediation: Check existing completion before upload, or perform completion/update through a transactional workflow with cleanup.
- Required regression test: Duplicate task completion with screenshots must not leave orphan files.

### KR-FIND-010

- Category: Data Integrity / Transactions
- Severity: High
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `app/actions.ts`
- Evidence: Advance creation/deletion performs multiple related writes without a database transaction.
- Impact: Employee fund balances and transaction history can become inconsistent.
- Failure/attack scenario: Advance row is created but opening transaction insert fails, or transactions are deleted but advance delete fails.
- Root cause: Financial workflows rely on multiple independent application-level database calls.
- Recommended remediation: Move advance create/delete/settle flows into transactional SQL RPC functions.
- Required regression test: Simulated failure during advance create/delete must roll back the full operation.

### KR-FIND-011

- Category: Authorization / Server Action Hardening
- Severity: Medium
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `app/actions.ts`
- Evidence: `saveSettings` relies on downstream database policy and does not explicitly enforce admin role before attempting update. Update errors are not handled strongly.
- Impact: Settings changes can fail silently or rely too heavily on RLS behavior.
- Failure/attack scenario: Non-admin attempts settings update; UI/server behavior may not clearly reject and report failure.
- Root cause: Missing explicit server-side role guard and incomplete error handling.
- Recommended remediation: Add explicit admin check in the server action and fail loudly on update errors.
- Required regression test: Non-admin settings update must fail with a controlled error and no data change.

### KR-FIND-012

- Category: Input Validation
- Severity: Medium
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `app/actions.ts`
- Evidence: Numeric parsing uses raw `Number()` helper behavior instead of strict schema validation for important money values.
- Impact: Invalid, negative, NaN-like, or unexpected numeric input can produce incorrect business records if not otherwise constrained.
- Failure/attack scenario: A malformed amount is submitted and accepted in a money-related workflow.
- Root cause: Server-side validation is inconsistent and too permissive.
- Recommended remediation: Use strict Zod/server schemas for money, dates, IDs, statuses, and bounded text fields.
- Required regression test: Invalid money values must be rejected consistently across stock, sales, expenses, losses, and funds.

### KR-FIND-013

- Category: File Upload Security
- Severity: Medium
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `app/actions.ts`
- Evidence: Stock image uploads check count/size but do not perform the same strict MIME validation used for task screenshots.
- Impact: Non-image files may be uploaded into an image bucket.
- Failure/attack scenario: User uploads a disguised or unsupported file as a stock image.
- Root cause: File validation is duplicated and inconsistent between upload flows.
- Recommended remediation: Use a shared server-side image validator for count, size, MIME type, and extension/storage path expectations.
- Required regression test: Non-image stock upload must be rejected server-side.

### KR-FIND-014

- Category: Authentication / Account Enumeration
- Severity: Low
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `app/(auth)/login/page.tsx`, `app/(auth)/create-account/page.tsx`
- Evidence: Login and signup flows return distinct messages for different account states.
- Impact: Attackers may infer whether an account exists or has a pending approval state.
- Failure/attack scenario: Repeated login/signup attempts reveal valid employee emails or phone numbers.
- Root cause: Public authentication flows return overly specific state messages.
- Recommended remediation: Use generic public-facing authentication errors and keep detailed state server-side.
- Required regression test: Login/signup responses should not reveal whether a specific account exists.

### KR-FIND-015

- Category: Password Reset Security
- Severity: Medium
- Confidence: Likely
- Status: UNVERIFIED
- Location: `app/(auth)/forgot-password/page.tsx`
- Evidence: Password reset redirect uses the incoming request origin.
- Impact: If Supabase redirect allowlist is permissive, reset links could be sent to an unintended origin.
- Failure/attack scenario: A crafted request origin influences password reset redirect behavior.
- Root cause: Trusted application URL is not hardcoded through server-side configuration.
- Recommended remediation: Use a fixed trusted `NEXT_PUBLIC_SITE_URL` or server-only app URL for password reset redirects and verify Supabase redirect allowlist.
- Required regression test: Password reset always uses the configured production URL, regardless of request origin.

### KR-FIND-016

- Category: Dependency Security
- Severity: High
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `package.json`, `package-lock.json`
- Evidence: Dependency audit found high-severity vulnerabilities in production dependency paths including `next`, `sharp`, `postcss`, and `nanoid`.
- Impact: Known vulnerable dependencies can expose the app to publicly documented attacks or stability issues.
- Failure/attack scenario: A vulnerability in a deployed dependency is exploited through a crafted request or asset path.
- Root cause: Dependencies are outdated relative to known advisories.
- Recommended remediation: Upgrade affected dependencies, review breaking changes, run build/typecheck/audit, and perform regression testing.
- Required regression test: `npm audit --omit=dev`, build, typecheck, and core workflow tests must pass after dependency upgrades.

### KR-FIND-017

- Category: Testing
- Severity: High
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `package.json`, repository test inventory
- Evidence: No meaningful automated test script or test suite was found for critical business workflows.
- Impact: Security, payment, inventory, and assignment regressions can ship unnoticed.
- Failure/attack scenario: A future fix breaks paid/waiting-payment calculations or employee authorization without detection.
- Root cause: The project lacks automated regression coverage for core workflows.
- Recommended remediation: Add focused unit/integration tests for authorization, stock, sales, payments, funds, Telegram import, and validation.
- Required regression test: Add test coverage for every P0/P1 remediation before release.

### KR-FIND-018

- Category: Verification / Tooling
- Severity: Medium
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `package.json`
- Evidence: `npm run lint` uses `next lint`, which fails in modern Next.js environments with an interactive/deprecated lint setup flow.
- Impact: CI cannot reliably enforce lint/static checks.
- Failure/attack scenario: Broken lint command gives false confidence or blocks CI without useful results.
- Root cause: Lint tooling was not updated after Next.js lint command changes.
- Recommended remediation: Configure ESLint directly and update the lint script to a non-interactive command.
- Required regression test: `npm run lint` must complete non-interactively in CI.

### KR-FIND-019

- Category: Performance / Scalability
- Severity: Medium
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `lib/data.ts`
- Evidence: Some search/report paths batch-load thousands of rows and perform aggregation in application code.
- Impact: Production performance can degrade as stock, sales, image, and report data grows.
- Failure/attack scenario: Dashboard/report/list pages slow down as account count and image volume increase.
- Root cause: Some queries are still application-aggregated rather than summarized with indexed SQL/RPC.
- Recommended remediation: Move heavy reporting/search aggregation into indexed SQL views/RPCs and keep list payloads paginated.
- Required regression test: Seeded large-data performance test should verify dashboard and stock/sold lists stay within target response times.

### KR-FIND-020

- Category: Architecture / Maintainability
- Severity: Medium
- Confidence: Confirmed
- Status: CONFIRMED
- Location: `app/actions.ts`, `lib/data.ts`, `app/api/telegram/webhook/route.ts`
- Evidence: Large modules contain many unrelated responsibilities and critical workflows.
- Impact: Changes are harder to review, test, and safely extend.
- Failure/attack scenario: A fix to one workflow accidentally changes behavior in another because logic is tightly coupled.
- Root cause: Business logic, validation, authorization, storage, and integration code are not sufficiently modularized.
- Recommended remediation: After regression tests exist, split large files by domain and centralize shared validation/authorization helpers.
- Required regression test: Existing workflow tests must pass before and after modularization.

## 7. Prioritized Remediation Backlog

### P0

- KR-FIND-001: Stop exposing raw settings/Telegram runtime state.
- KR-FIND-002: Restrict admin role creation and promotion to admins.
- KR-FIND-005: Make stock images private or signed-only.
- KR-FIND-016: Upgrade vulnerable production dependencies.
- KR-FIND-017: Add automated regression tests for critical workflows.

### P1

- KR-FIND-003: Redesign self-assignment/private-note access.
- KR-FIND-010: Make employee fund/advance operations transactional.
- KR-FIND-007: Enforce duplicate stock rules atomically.
- KR-FIND-008: Prevent orphan stock image uploads.
- KR-FIND-009: Prevent orphan daily-task screenshot uploads.
- KR-FIND-011: Harden settings server action authorization/error handling.

### P2

- KR-FIND-004: Apply Telegram authorization before processing group messages.
- KR-FIND-006: Protect audit-log integrity.
- KR-FIND-012: Add strict server-side validation for numeric/business inputs.
- KR-FIND-013: Add strict stock image MIME validation.
- KR-FIND-019: Optimize remaining over-fetching/report aggregation paths.

### P3

- KR-FIND-014: Reduce authentication account-enumeration signals.
- KR-FIND-015: Verify and harden password reset redirect origin.
- KR-FIND-018: Replace deprecated/interactively failing lint command.
- KR-FIND-020: Split large modules after tests are in place.

## 8. Security Assessment

CONFIRMED issues exist in authorization, sensitive data exposure, dependency security, file upload validation, and audit integrity.

No confirmed SQL injection or React XSS issue was found in traced paths, but this does not mean those classes are impossible. Validation is inconsistent and should be strengthened before relying on the absence of known injection findings.

Security release blockers:

- KR-FIND-001
- KR-FIND-002
- KR-FIND-005
- KR-FIND-016

## 9. Data Integrity Assessment

CONFIRMED data-integrity risks exist around:

- Duplicate stock creation
- Orphan stock images
- Orphan task screenshots
- Non-transactional employee advances/funds

The most important data-integrity remediation is moving financial multi-write workflows into database transactions/RPCs and adding automated regression tests.

## 10. Testing Assessment

CONFIRMED: The repository does not currently have meaningful automated test coverage for the highest-risk business workflows.

Minimum required test areas:

- Role authorization
- Employee creation/promotion
- Stock create/edit/delete
- Duplicate prevention
- Multiple assignment
- Private note access
- Sales waiting/paid transitions
- Profit calculations
- Fund/advance transactions
- Telegram import
- File upload failure paths

## 11. Performance Assessment

CONFIRMED: Some performance-sensitive read paths still batch-load large row sets and aggregate in application code.

The system has already moved toward pagination and summary queries, but further work is needed for large production datasets. Dashboard/report paths should prefer indexed SQL summaries/RPCs over loading large tables into application memory.

## 12. Architecture/Maintainability Assessment

CONFIRMED: The architecture is workable but has maintainability risks.

Primary concerns:

- `app/actions.ts` is too broad.
- `lib/data.ts` mixes many unrelated read models.
- `app/api/telegram/webhook/route.ts` combines parsing, state management, authorization, database writes, and storage.

Recommended approach:

1. Fix P0 security/data risks.
2. Add regression tests.
3. Refactor by domain only after tests exist.

## 13. Remaining Unknowns

UNVERIFIED:

- Live Supabase migration/application state.
- Supabase Auth production settings, including email confirmation, JWT expiry, and redirect allowlist.
- Whether production storage buckets differ from local schema.
- Whether Telegram token has been rotated after exposure in conversation.
- Production environment variable scoping in Vercel/Render.
- External monitoring/alerting outside the repository.
- Production performance under real user traffic and image volume.

## 14. Production Release Gates

Required before declaring production readiness:

- P0 findings remediated.
- Regression tests added for P0/P1 workflows.
- Dependency audit reviewed and high-severity production advisories resolved or explicitly risk-accepted.
- Stock image access changed to private/signed or formally accepted as public.
- Admin role assignment restricted server-side and database-side.
- Settings/Telegram runtime state no longer exposed to non-admins.
- Build, typecheck, lint, audit, and test commands pass in CI.
- Live Supabase migrations verified against repository migrations.
- Backup and restore process verified for database and storage.

