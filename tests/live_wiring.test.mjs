import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('Supabase is the only runtime data source',()=>{
 assert.doesNotMatch(file('.env.example'),/DEMO_MODE/);
 assert.doesNotMatch(file('src/lib/supabase.ts'),/demoMode|DEMO_/);
 assert.match(file('src/lib/supabase.ts'),/configurationError/);
});
test('merchant and customer read restaurant-scoped fd data',()=>{
 const store=file('src/lib/store.tsx');
 for(const table of ['fd_restaurants','fd_restaurant_staff','fd_menu_items','fd_offers','fd_orders'])assert.ok(store.includes(`from('${table}')`),table);
 assert.match(store,/if\(!merchant\)q=q\.eq\('customer_id',uid\)/);
 assert.doesNotMatch(store,/DEMO_|reserveDemo|demoMode/);
 assert.match(store,/fd-create-checkout/);
});
test('customer refreshes live data without a tab-focus page reload',()=>{
 const store=file('src/lib/store.tsx');
 assert.match(store,/document\.addEventListener\('visibilitychange',onVisible\)/);
 assert.match(store,/void load\(true\)/);
 assert.match(store,/event!=='INITIAL_SESSION'&&event!=='TOKEN_REFRESHED'/);
 assert.doesNotMatch(store,/window\.location\.reload|location\.reload/);
});
test('everyday availability is enforced consistently by RLS and checkout',()=>{
 const migration=file('supabase/migrations/006_everyday_offer_visibility.sql');
 assert.match(migration,/fd_offer_is_available_at/);
 assert.match(migration,/time zone 'Asia\/Kolkata'/);
 assert.match(migration,/stock_reserved < p_offer\.stock_total/);
 assert.match(migration,/fd_public see visible offers/);
 assert.match(migration,/create or replace function public\.fd_reserve_checkout/);
});
test('merchant account uses Auth email, not a new phone identity',()=>{
 const store=file('src/lib/store.tsx');
 assert.match(store,/auth\.signInWithPassword\(\{email/);
 assert.match(store,/auth\.signInWithOtp\(\{email/);
 assert.match(store,/type:'email'/);
});
test('all merchant photo, menu, and offer updates go through Supabase',()=>{
 const store=file('src/lib/store.tsx');
 assert.match(store,/storage\.from\('fd-dish-images'\)\.upload/);
 assert.match(store,/from\('fd_menu_items'\)\.update/);
 assert.match(store,/from\('fd_offers'\)\.update/);
 assert.match(store,/from\('fd_offers'\)\.insert/);
 assert.match(store,/fd_soft_delete_menu_item/);
 assert.match(store,/storage\.from\('fd-dish-images'\)\.remove/);
});
test('checkout uses server order creation, signature verification and safe abandonment',()=>{
 const customer=file('src/features/MainApp.tsx');
 assert.match(customer,/fd-verify-payment/);
 assert.match(file('src/lib/store.tsx'),/fd-abandon-checkout/);
 assert.match(file('supabase/functions/fd-create-checkout/index.ts'),/rzp_test_/);
 assert.match(file('supabase/functions/fd-razorpay-webhook/index.ts'),/payment\.failed/);
});
