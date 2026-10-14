import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const main = readFileSync(new URL("../src/features/MainApp.tsx", import.meta.url), "utf8");
const store = readFileSync(new URL("../src/lib/store.tsx", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../supabase/migrations/004_customer_onboarding_and_sharing.sql", import.meta.url),
  "utf8",
);
const anonymousCheckout = readFileSync(
  new URL("../supabase/migrations/005_anonymous_customer_checkout.sql", import.meta.url),
  "utf8",
);
const schema = migration + readFileSync(
  new URL("../supabase/migrations/001_initial.sql", import.meta.url),
  "utf8",
);
const html = readFileSync(new URL("../app/+html.tsx", import.meta.url), "utf8");

test("first visit creates a persistent anonymous session behind a profile popup", () => {
  assert.match(store, /signInAnonymously\(\)/);
  assert.match(main, /\[marketing, setMarketing\] = useState\(true\)/);
  assert.match(main, /const hasCompletedProfile = Boolean\(/);
  assert.match(main, /\(a\.customerProfile\.full_name\?\.trim\(\)\.length \|\| 0\) >= 2/);
  assert.match(main, /parseShopperPhone\(a\.customerProfile\.phone_e164 \|\| ""\)/);
  assert.match(main, /<Modal[\s\S]*!a\.loading[\s\S]*!hasCompletedProfile/);
  assert.match(main, /if \(a\.loading\) \{/);
  assert.match(main, /Send me food deals and offers from/);
  assert.match(main, /accessibilityRole="checkbox"/);
  assert.match(main, /Uncheck this if you do not want marketing messages/);
  assert.match(main, /completeOnboarding\(customerName, phone, marketing\)/);
});

test("customer profile is tenant-aware and checkout remains UID-owned", () => {
  assert.match(migration, /first_restaurant_id uuid references public\.fd_restaurants/);
  assert.match(schema, /primary key\(restaurant_id,customer_id\)/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(anonymousCheckout, /where id = new\.customer_id/);
  assert.match(anonymousCheckout, /new\.customer_phone := profile\.phone_e164/);
  assert.match(anonymousCheckout, /phone_verified = is_verified/);
  assert.doesNotMatch(anonymousCheckout, /Verify your mobile number before placing an order/);
  assert.match(store, /profile\?\.onboarding_completed_at/);
});

test("checkout does not request SMS OTP in the active customer flow", () => {
  assert.doesNotMatch(main, /Send login OTP|Verify OTP|requestPhoneVerification\(/);
  assert.match(main, /Pay ₹30 to reserve/);
});

test("sharing preserves restaurant context and has Open Graph metadata", () => {
  assert.match(main, /r=\$\{encodeURIComponent\(a\.restaurant\.slug\)\}/);
  assert.match(main, /navigator\.canShare/);
  assert.match(main, /https:\/\/wa\.me\/\?text=/);
  assert.match(html, /property="og:image"/);
  assert.match(html, /Good food\. Better deals\./);
  assert.ok(existsSync(new URL("../public/chatako-food-deals-hero.jpg", import.meta.url)));
});

test("reorder only uses currently eligible offers", () => {
  assert.match(main, /entry\.item\.id === row\.menu_item_id && available\(entry\.offer\)/);
  assert.match(main, /Reorder available dishes/);
});
