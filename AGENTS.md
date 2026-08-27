# Kings Rock CRM Engineering Rules

## General

- Make the smallest safe change.
- Do not refactor unrelated code.
- Do not change unrelated behavior.
- Prefer explicit, maintainable code over clever abstractions.
- Do not introduce dependencies without justification.

## Security

- Authentication is not authorization.
- All sensitive operations must enforce authorization server-side.
- Never rely on hidden UI controls for security.
- Never trust client-side validation.
- Never expose secrets to client-side code.
- Never weaken RLS/security controls to make functionality work.
- Validate untrusted input at trust boundaries.

## Database

- Preserve referential integrity.
- Use transactions for operations requiring atomicity.
- Consider concurrent requests for state-changing operations.
- Do not bypass database security policies without explicit justification.

## Testing

- Every security fix requires regression tests.
- Every business-logic fix requires regression tests.
- Never delete or weaken tests to make them pass.
- Test both authorized and unauthorized behavior.
- Test failure paths as well as success paths.

## Changes

Before significant changes:

1. Explain the root cause.
2. Explain the proposed solution.
3. Identify affected files.
4. Identify risks.
5. Identify required tests.

After changes:

1. Run relevant tests.
2. Run type checking.
3. Run lint.
4. Run build when practical.
5. Report all changed files.
6. Report all verification commands and results.

## Review Discipline

- Do not claim something is secure without evidence.
- Distinguish confirmed findings from assumptions.
- Do not silently change business rules.
- Ask for clarification when product behavior is ambiguous.
- Never fix unrelated issues during a targeted remediation.

