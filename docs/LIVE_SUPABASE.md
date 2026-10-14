# Live Supabase rollout

The app reads and writes only the configured Supabase project. An empty menu or order list is shown as an empty state and is never replaced with sample records.

## Existing project

1. Review and apply all unapplied `supabase/migrations/*.sql` files in order. Migration `006_everyday_offer_visibility.sql` makes everyday schedules recur in Asia/Kolkata and aligns customer RLS with checkout eligibility.
2. Deploy the Edge Functions, including the new `fd-abandon-checkout` function.
3. Add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` with `supabase secrets set`. The key ID must begin with `rzp_test_`.
4. Configure Razorpay's signed webhook for `payment.captured`, `payment.failed`, `refund.processed`, and `refund.failed`.
5. Configure a Supabase SMS provider for customer OTP. Merchant users must already exist in Auth and be assigned to the restaurant in `fd_restaurant_staff`.

## Data setup

Open `/merchant?r=<slug>`, authenticate as assigned staff, add a dish, upload its image, and create an offer. The live project may legitimately have no menu rows; the customer then sees “Nothing on offer right now.”

Use the menu editor to set preparation minutes. One-time offers use their exact `starts_at`/`ends_at` range. Everyday offers repeat the configured clock-time window in Asia/Kolkata; the default day-long window is always available. Customer cards render “Available …” and “Ready in ~… min”.

## Required smoke tests

- Verify anonymous users can read only active restaurants, non-deleted active menu items, and active offers.
- Verify staff for restaurant A cannot change restaurant B's menu, offers, settings, images, or orders.
- Upload and replace JPEG, PNG, and WebP images; confirm the database path changes and the old object is removed.
- Soft-delete a dish with prior orders; confirm it disappears from both apps while order snapshots remain readable.
- Complete a ₹30 Razorpay test payment and replay the signed capture webhook; only one captured payment/order transition should result.
- Fail and dismiss checkout; confirm the order becomes cancelled/failed and held stock is restored.
- Reject a paid reservation and cancel one before acceptance; confirm the refund record and Razorpay test refund reach `processed`.
- Exercise merchant transitions through acceptance, preparation, ready, and code-verified completion.
- Open customer and merchant sessions together and verify menu, stock, and order updates appear through Realtime.

Do not use live Razorpay keys: this checkout build intentionally rejects them.
