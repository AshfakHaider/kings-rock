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
| KR-FIND-002 | High | P0 | Managers can create or promote admin users. | OPEN | TBD | TBD | Manager attempts to create/promote admin must fail server-side. | Pending |
| KR-FIND-005 | High | P0 | Stock images are stored in a public bucket and exposed by public URLs. | OPEN | TBD | TBD | Unauthenticated requests cannot access stock images directly. | Pending |
| KR-FIND-016 | High | P0 | Production dependency audit reports high-severity vulnerabilities. | OPEN | TBD | TBD | `npm audit --omit=dev`, build, typecheck, and core workflow tests pass after upgrades. | Pending |
| KR-FIND-017 | High | P0 | Critical business workflows lack meaningful automated regression tests. | OPEN | TBD | TBD | Tests cover P0/P1 authorization, inventory, payment, funds, Telegram, and file workflows. | Pending |

## P1 — High Priority

| ID | Severity | Priority | Description | Status | Owner | Fix PR/Commit | Regression Test | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| KR-FIND-003 | High | P1 | Employees can self-assign stock and gain private note access. | OPEN | TBD | TBD | Employee self-assignment does not expose private notes unless explicitly permitted. | Pending |
| KR-FIND-010 | High | P1 | Employee advance/fund create and delete workflows are non-transactional. | OPEN | TBD | TBD | Simulated failure during advance create/delete rolls back the full operation. | Pending |
| KR-FIND-007 | Medium | P1 | Duplicate stock title prevention is application-side and race-prone. | OPEN | TBD | TBD | Concurrent duplicate title creation results in one success and one rejection. | Pending |
| KR-FIND-008 | Medium | P1 | Failed stock creation can leave orphaned uploaded stock images. | OPEN | TBD | TBD | Failed stock creation leaves no new storage objects behind. | Pending |
| KR-FIND-009 | Medium | P1 | Duplicate daily task completion can leave orphaned screenshots. | OPEN | TBD | TBD | Duplicate task completion with screenshots leaves no orphan files. | Pending |
| KR-FIND-011 | Medium | P1 | `saveSettings` lacks explicit admin guard and strong update-error handling. | OPEN | TBD | TBD | Non-admin settings update fails with a controlled error and no data change. | Pending |

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

