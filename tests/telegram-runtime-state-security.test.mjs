import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const runtimeKeys = [
  "telegram_stock_drafts",
  "telegram_group_stock_queue",
  "telegram_group_queue_edits",
  "telegram_group_stock_blocks"
];

test("public settings data fetch does not select raw employee permissions", async () => {
  const source = await readFile("lib/data.ts", "utf8");
  assert.match(source, /const SETTINGS_SELECT = "id,business_name,currency,game_categories,sale_source_websites,expense_categories";/);
  assert.doesNotMatch(source, /const SETTINGS_SELECT = .*employee_permissions/);
});

test("settings page renders only explicit safe permission flags", async () => {
  const source = await readFile("app/(dashboard)/settings/page.tsx", "utf8");
  assert.doesNotMatch(source, /JSON\.stringify\(settings\.employee_permissions/);
  assert.match(source, /settings\.employee_permissions\.can_view_profit/);
  assert.match(source, /settings\.employee_permissions\.can_view_buying_price/);
});

test("telegram webhook persists runtime data in telegram_runtime_state", async () => {
  const source = await readFile("app/api/telegram/webhook/route.ts", "utf8");
  assert.match(source, /\.from\("telegram_runtime_state"\)/);
  assert.match(source, /async function saveTelegramRuntimeMap/);
  assert.match(source, /\.upsert\(/);
  assert.doesNotMatch(source, /\.from\("settings"\)\s*\n\s*\.update\(\{\s*employee_permissions/s);
});

test("telegram runtime migration creates protected state table and backfills data", async () => {
  const migration = await readFile("supabase/migrations/20260813204731_telegram_runtime_state.sql", "utf8");

  assert.match(migration, /create table if not exists public\.telegram_runtime_state/);
  assert.match(migration, /alter table public\.telegram_runtime_state enable row level security/);
  assert.match(migration, /insert into public\.telegram_runtime_state \(key, data\)/);
  assert.match(migration, /update public\.settings\s+set\s+employee_permissions = employee_permissions/s);

  for (const key of runtimeKeys) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
});

test("telegram runtime table has no broad authenticated RLS policy", async () => {
  const schema = await readFile("supabase/schema.sql", "utf8");
  const migration = await readFile("supabase/migrations/20260813204731_telegram_runtime_state.sql", "utf8");

  for (const sql of [schema, migration]) {
    assert.match(sql, /create policy "telegram runtime admin select"\s+on public\.telegram_runtime_state for select\s+using \(public\.is_admin\(\)\)/s);
    assert.match(sql, /create policy "telegram runtime admin insert"\s+on public\.telegram_runtime_state for insert\s+with check \(public\.is_admin\(\)\)/s);
    assert.doesNotMatch(sql, /telegram runtime[^;]+to authenticated[^;]+using \(auth\.uid\(\) is not null\)/is);
  }
});

test("telegram runtime tables grant server worker access without broad user access", async () => {
  const schema = await readFile("supabase/schema.sql", "utf8");
  const migration = await readFile("supabase/migrations/20260903190000_telegram_runtime_service_role_grants.sql", "utf8");

  for (const sql of [schema, migration]) {
    assert.match(sql, /grant select, insert, update, delete on public\.telegram_runtime_state to service_role/);
    assert.match(sql, /grant select, insert, update, delete on public\.telegram_stock_sources to service_role/);
  }

  assert.doesNotMatch(
    migration,
    /grant select, insert, update, delete on public\.telegram_runtime_state to authenticated/i
  );
});

test("telegram webhook reports import failures instead of silently crashing", async () => {
  const source = await readFile("app/api/telegram/webhook/route.ts", "utf8");

  assert.match(source, /async function notifyAllowedUsersImportError/);
  assert.match(source, /Telegram group stock import failed/);
  assert.match(source, /Telegram stock import failed/);
});

test("telegram stock imports default buying price to zero and do not require approval", async () => {
  const source = await readFile("app/api/telegram/webhook/route.ts", "utf8");

  assert.doesNotMatch(source, /missing\.push\("buying price"\)/);
  assert.doesNotMatch(source, /Next: send buying price/);
  assert.match(source, /buying_price: buyingPrice/);
  assert.match(source, /createStockAccountFromDraft\(draft: TelegramStockDraft, buyingPrice = 0\)/);
  assert.match(source, /buyingPrice: 0/);
  assert.match(source, /Ready\. I will add this account automatically\./);
  assert.match(source, /async function saveOrAutoAddDraft/);
  assert.match(source, /await createStockAccountFromGroupQueueItem\(item, String\(block\.sourceChatId\), "group-auto"\)/);
  assert.doesNotMatch(source, /Tap Approve to add this account to stock/);
});
