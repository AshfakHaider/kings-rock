import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationPath = "supabase/migrations/20260814193149_atomic_advance_transactions.sql";
const writeBoundaryMigrationPath = "supabase/migrations/20260814195247_restrict_advance_writes_to_rpcs.sql";

async function readSqlSources() {
  return [
    await readFile("supabase/schema.sql", "utf8"),
    await readFile(migrationPath, "utf8")
  ];
}

async function readWriteBoundarySources() {
  return [
    await readFile("supabase/schema.sql", "utf8"),
    await readFile(writeBoundaryMigrationPath, "utf8")
  ];
}

test("advance RPC migration defines atomic fund functions and idempotency state", async () => {
  const migration = await readFile(migrationPath, "utf8");
  const writeBoundaryMigration = await readFile(writeBoundaryMigrationPath, "utf8");

  assert.match(migration, /add column if not exists request_id text/);
  assert.match(migration, /employee_advances_request_id_idx/);
  assert.match(migration, /advance_transactions_advance_id_idx/);
  assert.match(migration, /create or replace function public\.create_employee_advance/);
  assert.match(migration, /create or replace function public\.delete_employee_advance/);
  assert.match(migration, /create or replace function public\.add_advance_transaction/);
  assert.match(writeBoundaryMigration, /create or replace function public\.update_employee_advance/);
  assert.match(writeBoundaryMigration, /create or replace function public\.delete_advance_transaction/);
});

test("advance RPCs enforce database-side authorization", async () => {
  for (const sql of await readSqlSources()) {
    assert.match(sql, /where auth_user_id = auth\.uid\(\)\s+and status = 'active'/);
    assert.match(sql, /if v_requester\.role not in \('admin', 'manager'\) then\s+raise exception 'Employees cannot manage funds'/s);
    assert.match(sql, /if v_requester\.role not in \('admin', 'manager'\) then\s+raise exception 'Employees cannot delete funds'/s);
    assert.match(sql, /if v_requester\.role not in \('admin', 'manager'\) then\s+raise exception 'Employees cannot manage fund transactions'/s);
    assert.match(sql, /revoke all on function public\.create_employee_advance/);
    assert.match(sql, /grant execute on function public\.create_employee_advance[^;]+ to authenticated/);
  }
});

test("advance creation and deletion happen inside single PostgreSQL functions", async () => {
  for (const sql of await readSqlSources()) {
    assert.match(sql, /insert into public\.employee_advances[\s\S]+returning \* into v_advance/);
    assert.match(sql, /insert into public\.advance_transactions[\s\S]+returning \* into v_opening_transaction/);
    assert.match(sql, /delete from public\.advance_transactions\s+where advance_id = p_advance_id;[\s\S]+delete from public\.employee_advances\s+where id = p_advance_id;/);
    assert.doesNotMatch(sql, /exception\s+when/i);
  }
});

test("advance tables reject direct writes and keep RPCs as the write boundary", async () => {
  const schema = await readFile("supabase/schema.sql", "utf8");
  const writeBoundaryMigration = await readFile(writeBoundaryMigrationPath, "utf8");

  assert.doesNotMatch(schema, /create policy "advances admin manager write"/);
  assert.doesNotMatch(schema, /create policy "advance tx admin manager write"/);
  assert.match(writeBoundaryMigration, /drop policy if exists "advances admin manager write"/);
  assert.match(writeBoundaryMigration, /drop policy if exists "advance tx admin manager write"/);

  for (const sql of await readWriteBoundarySources()) {
    assert.match(sql, /revoke insert, update, delete on public\.employee_advances from anon, authenticated/);
    assert.match(sql, /revoke insert, update, delete on public\.advance_transactions from anon, authenticated/);
  }
});

test("advance database guardrails prevent ledger corruption", async () => {
  for (const sql of await readWriteBoundarySources()) {
    assert.match(sql, /create or replace function public\.ensure_advance_transaction_employee_matches/);
    assert.match(sql, /Advance transaction employee must match advance employee/);
    assert.match(sql, /create or replace function public\.prevent_opening_advance_transaction_delete/);
    assert.match(sql, /Opening advance transactions cannot be deleted separately/);
    assert.match(sql, /create constraint trigger assert_advance_opening_transaction_trigger/);
    assert.match(sql, /Advance must have a matching opening transaction/);
  }
});

test("advance RPCs protect duplicate submissions and concurrent parent mutation", async () => {
  for (const sql of await readSqlSources()) {
    assert.match(sql, /pg_advisory_xact_lock\(hashtext\(p_request_id\)\)/);
    assert.match(sql, /where request_id = p_request_id\s+for update/);
    assert.match(sql, /where id = p_advance_id\s+for update/);
    assert.match(sql, /where id = p_advance_id\s+for update/);
  }
});

test("fund server actions use RPC transaction boundaries", async () => {
  const actions = await readFile("app/actions.ts", "utf8");
  const forms = await readFile("components/modules/forms.tsx", "utf8");

  assert.match(actions, /supabase\.rpc\("create_employee_advance"/);
  assert.match(actions, /supabase\.rpc\("update_employee_advance"/);
  assert.match(actions, /supabase\.rpc\("delete_employee_advance"/);
  assert.match(actions, /supabase\.rpc\("add_advance_transaction"/);
  assert.match(actions, /supabase\.rpc\("delete_advance_transaction"/);
  assert.doesNotMatch(actions, /advance_transactions"\)\.insert\(\{\s*advance_id: result\.data\.id/s);
  assert.doesNotMatch(actions, /from\("employee_advances"\)\.update/);
  assert.doesNotMatch(actions, /from\("employee_advances"\)\.delete/);
  assert.doesNotMatch(actions, /from\("advance_transactions"\)\.delete/);
  assert.match(forms, /name="request_id"/);
});
