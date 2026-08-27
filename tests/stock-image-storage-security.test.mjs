import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("stock image schema keeps object paths and private bucket configuration", async () => {
  const schema = await readFile("supabase/schema.sql", "utf8");
  const migration = await readFile("supabase/migrations/20260813205628_protect_stock_images.sql", "utf8");

  for (const sql of [schema, migration]) {
    assert.match(sql, /image_path text/);
    assert.match(sql, /image_paths text\[\] not null default '\{\}'/);
    assert.match(sql, /values \('stock-images', 'stock-images', false\)/);
    assert.match(sql, /on conflict \(id\) do update set public = false/);
  }
});

test("stock image migration backfills paths without deleting legacy URL columns", async () => {
  const migration = await readFile("supabase/migrations/20260813205628_protect_stock_images.sql", "utf8");

  assert.match(migration, /split_part\(split_part\(source\.url, '\/storage\/v1\/object\/public\/stock-images\/', 2\), '\?', 1\)/);
  assert.match(migration, /update public\.stock_accounts\s+set\s+image_paths = parsed_images\.paths,\s+image_path = parsed_images\.paths\[1\]/s);
  assert.doesNotMatch(migration, /drop column\s+image_urls/i);
  assert.doesNotMatch(migration, /drop column\s+image_url/i);
});

test("stock storage has no broad direct read policy", async () => {
  const schema = await readFile("supabase/schema.sql", "utf8");
  const migration = await readFile("supabase/migrations/20260813205628_protect_stock_images.sql", "utf8");

  assert.doesNotMatch(schema, /create policy "stock images authenticated read"/);
  assert.match(migration, /drop policy if exists "stock images authenticated read" on storage\.objects/);
});

test("stock uploads store paths and do not create public URLs", async () => {
  const actions = await readFile("app/actions.ts", "utf8");
  const telegram = await readFile("app/api/telegram/webhook/route.ts", "utf8");

  for (const source of [actions, telegram]) {
    assert.doesNotMatch(source, /storage\.from\("stock-images"\)\.getPublicUrl/);
    assert.match(source, /image_path/);
    assert.match(source, /image_paths/);
  }
});

test("stock image consumers use server-generated signed URLs", async () => {
  const helper = await readFile("lib/stock-images.ts", "utf8");
  const detailPage = await readFile("app/(dashboard)/stock-accounts/[id]/page.tsx", "utf8");
  const refreshRoute = await readFile("app/api/stock-accounts/[id]/images/route.ts", "utf8");
  const gallery = await readFile("components/stock/stock-image-gallery.tsx", "utf8");

  assert.match(helper, /STOCK_IMAGE_SIGNED_URL_EXPIRES_IN = 10 \* 60/);
  assert.match(helper, /\.createSignedUrls\(paths, STOCK_IMAGE_SIGNED_URL_EXPIRES_IN\)/);
  assert.match(helper, /canViewStockImages/);
  assert.match(detailPage, /createSignedStockImageUrls\(account, currentProfile\)/);
  assert.match(refreshRoute, /supabase\.auth\.getUser\(\)/);
  assert.match(refreshRoute, /createSignedStockImageUrls\(account, profile\)/);
  assert.match(refreshRoute, /"Cache-Control": "private, no-store"/);
  assert.match(gallery, /refreshUrl/);
  assert.match(gallery, /fetch\(refreshUrl, \{ cache: "no-store" \}\)/);
});
