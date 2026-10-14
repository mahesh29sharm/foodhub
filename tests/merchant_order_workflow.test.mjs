import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const merchant = readFileSync(
  new URL("../src/features/MerchantApp.tsx", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/003_merchant_order_workflow.sql", import.meta.url),
  "utf8",
);
const edgeFunction = readFileSync(
  new URL("../supabase/functions/fd-merchant-order-action/index.ts", import.meta.url),
  "utf8",
);
const client = readFileSync(
  new URL("../src/lib/supabase.ts", import.meta.url),
  "utf8",
);

test("merchant cards expose the compact state-specific workflow", () => {
  assert.match(merchant, /action:\s*"accept_and_prepare"/);
  assert.match(merchant, /label:\s*"Accept & Prepare"/);
  assert.match(merchant, /label:\s*"Mark Ready"/i);
  assert.match(merchant, /label:\s*"Complete Order"/);
  assert.match(merchant, /loading=\{isPending\}/);
  assert.match(merchant, /actionErrors\[o\.id\]/);
});

test("accept and prepare is an atomic, locked and idempotent database transition", () => {
  assert.match(migration, /for update/i);
  assert.match(migration, /when p_next = 'accept_and_prepare' then 'preparing'/i);
  assert.match(migration, /if o\.status = target_status then\s+return;/i);
  assert.match(migration, /fd_is_restaurant_staff\(o\.restaurant_id\)/i);
  assert.match(migration, /status = target_status/i);
  assert.match(migration, /accepted_at = case when p_next in \('accepted', 'accept_and_prepare'\)/i);
});

test("merchant action validates input and returns the confirmed database status", () => {
  assert.match(edgeFunction, /actions = new Set/);
  assert.match(edgeFunction, /select\('status,balance_paid,balance_method'\)/);
  assert.match(edgeFunction, /return json\(\{ ok: true, order \}\)/);
});

test("function HTTP errors surface the response body to the UI", () => {
  assert.match(client, /error instanceof FunctionsHttpError/);
  assert.match(client, /errorMessage\(payload, ''\)/);
  assert.match(client, /Network error while contacting/);
});
