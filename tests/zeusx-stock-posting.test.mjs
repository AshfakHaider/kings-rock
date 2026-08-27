import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("supabase/schema.sql", "utf8");
const migration = readFileSync("supabase/migrations/20260824085241_zeusx_stock_posting.sql", "utf8");
const listingsRoute = readFileSync("app/api/zeusx/listings/route.ts", "utf8");
const statusRoute = readFileSync("app/api/zeusx/listings/[id]/route.ts", "utf8");

test("ZeusX stock posting schema is additive and indexed", () => {
  for (const sql of [schema, migration]) {
    assert.match(sql, /zeusx_enabled boolean not null default false/);
    assert.match(sql, /zeusx_status text not null default 'pending'/);
    assert.match(sql, /zeusx_listing_url text/);
    assert.match(sql, /zeusx_posted_at timestamptz/);
    assert.match(sql, /stock_accounts_zeusx_pending_idx/);
  }
});

test("ZeusX stock fields are protected from non-admin direct updates", () => {
  assert.match(migration, /guard_stock_accounts_zeusx_admin_update/);
  assert.match(migration, /not public\.is_admin\(\)/);
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
  assert.match(migration, /Only admins can change ZeusX posting fields/);
});

test("ZeusX worker API requires token verification and service role configuration", () => {
  for (const source of [listingsRoute, statusRoute]) {
    assert.match(source, /verifyZeusxWorkerRequest\(request\)/);
    assert.match(source, /hasSupabaseAdminEnv\(\)/);
    assert.match(source, /createAdminClient\(\)/);
  }
});
