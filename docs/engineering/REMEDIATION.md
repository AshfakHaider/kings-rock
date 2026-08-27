# Kings Rock CRM Remediation Tracker

This tracker is based on the findings documented in `docs/engineering/REVIEW.md`.

Allowed statuses:

- OPEN
- VERIFYING
- APPROVED
- IN PROGRESS
- FIXED
- VERIFIED
- WONT FIX
- FALSE POSITIVE
- BLOCKED

## P0 — Production Blockers

| ID | Severity | Priority | Description | Status | Owner | Fix PR/Commit | Regression Test | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| KR-FIND-001 | High | P0 | Settings exposes raw `employee_permissions`, including Telegram runtime/private state. | OPEN | TBD | TBD | Non-admin users cannot view raw settings JSON or Telegram private/runtime state. | Pending |
| KR-FIND-002 | High | P0 | Managers can create or promote admin users. | VERIFIED | TBD | `ba8afe0` | Manager attempts to create/promote admin must fail server-side. | `npm test` passed; independent post-remediation verification PASS. |
| KR-FIND-005 | High | P0 | Stock images are stored in a public bucket and exposed by public URLs. | OPEN | TBD | TBD | Unauthenticated requests cannot access stock images directly. | Pending |
| KR-FIND-016 | High | P0 | Production dependency audit reports high-severity vulnerabilities. | OPEN | TBD | TBD | `npm audit --omit=dev`, build, typecheck, and core workflow tests pass after upgrades. | Pending |
| KR-FIND-017 | High | P0 | Critical business workflows lack meaningful automated regression tests. | VERIFIED | TBD | TBD | Vitest foundation and deterministic CRM workflow tests cover manager role escalation, private data access, stock creation, duplicate stock rejection, assignment authorization, duplicate sale prevention, payment-state behavior, and employee fund balances. | `npm test`, `npm run typecheck`, `CI=true npm run lint`, and `npm run build` passed. |

### KR-FIND-017 Verification Notes

- Testing foundation implemented with Vitest, preserving the existing `node:test` security/static tests.
- Test coverage added for the initial highest-priority authorization, private-data, inventory, sales/payment, and employee fund workflows.
- Verification commands passed:
  - `npm test`: 18 legacy tests passed; 12 Vitest tests passed.
  - `npm run typecheck`: passed.
  - `CI=true npm run lint`: passed with existing warnings only.
  - `npm run build`: passed.
- Remaining testing gaps: live/local Supabase integration tests, executable RLS tests against a test database, direct server-action tests with mocked Supabase auth/session context, Telegram webhook/parser integration tests, storage signed-URL tests against a test bucket, and Playwright end-to-end workflow coverage.

## P1 — High Priority

| ID | Severity | Priority | Description | Status | Owner | Fix PR/Commit | Regression Test | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| KR-FIND-003 | High | P1 | Employees can self-assign stock and gain private note/credential access. | OPEN | TBD | TBD | Employee self-assignment must not expose private notes, Gmail/password credentials, or stock account credentials through UI, server actions, API routes, or RLS/database access. | FAILED: `npm test` passed, but independent post-remediation security verification failed because RLS still grants credential access based on stock assignment. |
| KR-FIND-010 | High | P1 | Employee advance/fund create and delete workflows are non-transactional. | OPEN | TBD | TBD | Simulated failure during advance create/delete rolls back the full operation. | Pending |
| KR-FIND-007 | Medium | P1 | Duplicate stock title prevention is application-side and race-prone. | OPEN | TBD | TBD | Concurrent duplicate title creation results in one success and one rejection. | Pending |
| KR-FIND-008 | Medium | P1 | Failed stock creation can leave orphaned uploaded stock images. | OPEN | TBD | TBD | Failed stock creation leaves no new storage objects behind. | Pending |
| KR-FIND-009 | Medium | P1 | Duplicate daily task completion can leave orphaned screenshots. | OPEN | TBD | TBD | Duplicate task completion with screenshots leaves no orphan files. | Pending |
| KR-FIND-011 | Medium | P1 | `saveSettings` lacks explicit admin guard and strong update-error handling. | OPEN | TBD | TBD | Non-admin settings update fails with a controlled error and no data change. | Pending |

### KR-FIND-003 Verification Notes

- Status decision: Not marked `VERIFIED`. The requested verified state is blocked because independent security verification failed.
- Root cause: Assignment/work ownership is still coupled to private-data authorization at the database layer. Employees can self-assign stock accounts, and RLS still treats assignment as sufficient permission to read/update `stock_account_credentials`.
- Remediation summary observed: The normal stock account detail path now avoids selecting `stock_accounts.notes` in the main detail/list selects, and `canViewStockPrivateData` restricts private-note hydration and credential helper access to active admins/managers. The UI no longer renders the private notes card for employees.
- Regression tests: `npm test` passed, but the current tests are insufficient for this finding. `tests/unit/sensitive-data-access.test.ts` still contains a legacy expectation that an assigned employee can read private notes, so the suite would not catch this vulnerability.
- Verification result: FAIL. App-layer hiding is partial, but direct Supabase/database access remains a bypass.
- Commit reference: TBD. No verified fix commit is available for KR-FIND-003.
- Remaining risk: A logged-in employee can self-assign to a non-sold stock account and then satisfy the `account_has_stock_assignment(...)` predicate used by `stock_account_credentials` RLS. The remediation migration `supabase/migrations/20260814073031_restrict_stock_private_data_assignment.sql` is empty, so there is no database-level separation between assignment and private credential access yet.

## P2 — Medium Priority

| ID | Severity | Priority | Description | Status | Owner | Fix PR/Commit | Regression Test | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| KR-FIND-004 | Medium | P2 | Telegram group messages are processed before strict allowed-user filtering. | OPEN | TBD | TBD | Unauthorized Telegram group/sender messages create no draft or queue state. | Pending |
| KR-FIND-006 | Medium | P2 | Activity logs can be forged or polluted by authenticated users. | OPEN | TBD | TBD | Authenticated non-admin users cannot directly forge arbitrary activity logs. | Pending |
| KR-FIND-012 | Medium | P2 | Money/number validation is weak and inconsistent. | OPEN | TBD | TBD | Invalid money values are rejected across stock, sales, expenses, losses, and funds. | Pending |
| KR-FIND-013 | Medium | P2 | Stock image upload validation does not enforce MIME type server-side. | OPEN | TBD | TBD | Non-image stock upload is rejected server-side. | Pending |
| KR-FIND-019 | Medium | P2 | Some reporting/search paths over-fetch and aggregate large datasets in app code. | OPEN | TBD | TBD | Large-data performance test verifies dashboard and stock/sold lists meet target response times. | Pending |

## P3 — Low Priority / Technical Debt

| ID | Severity | Priority | Description | Status | Owner | Fix PR/Commit | Regression Test | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| KR-FIND-014 | Low | P3 | Login/signup messages can reveal account state. | OPEN | TBD | TBD | Login/signup responses do not reveal whether a specific account exists. | Pending |
| KR-FIND-015 | Medium | P3 | Password reset redirect uses request origin; safety depends on Supabase allowlist. | OPEN | TBD | TBD | Password reset always uses the configured production URL regardless of request origin. | Pending |
| KR-FIND-018 | Medium | P3 | Lint command uses deprecated/interactively failing `next lint`. | OPEN | TBD | TBD | `npm run lint` completes non-interactively in CI. | Pending |
| KR-FIND-020 | Medium | P3 | Large modules increase maintenance and regression risk. | OPEN | TBD | TBD | Existing workflow tests pass before and after modularization. | Pending |
