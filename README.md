# Food Discovery

Expo/React Native customer and merchant applications backed exclusively by the existing Supabase `fd_` schema. There is no in-memory or static-data runtime mode.

## Local checks

```bash
npm install
npm run typecheck
npm run test:logic
npm run export:web
```

Copy `.env.example` to `.env` and set a Supabase publishable key plus a restaurant slug. Only `EXPO_PUBLIC_*` values are client configuration. Never put the Supabase service-role key or Razorpay secret in an `EXPO_PUBLIC_*` variable.

Customer: `/?r=<restaurant-slug>`  
Merchant: `/merchant?r=<restaurant-slug>`

## Supabase rollout

For an existing installation, apply [002_live_completion.sql](supabase/migrations/002_live_completion.sql) after the original schema. Do not rerun `001_initial.sql` against a project where those objects already exist. The second migration adds safe menu soft-delete, Storage path tracking, failed-checkout inventory release, and menu Realtime publication.

Deploy all `supabase/functions/fd-*` Edge Functions, including `fd-abandon-checkout`. Set server-side secrets:

```text
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

The checkout function refuses non-test Razorpay keys. Configure Razorpay to send `payment.captured`, `payment.failed`, `refund.processed`, and `refund.failed` to:

```text
https://<project-ref>.supabase.co/functions/v1/fd-razorpay-webhook
```

The webhook function has JWT verification disabled in `supabase/config.toml` and verifies Razorpay's HMAC signature itself. Customer/merchant functions retain Supabase JWT verification.

## Security and tenancy

- Customer totals, stock holds, the ₹30 deposit, and order snapshots are computed in Postgres—not trusted from the client.
- RLS and staff-membership checks scope every mutation to a restaurant.
- Razorpay secrets are read only by Edge Functions.
- Menu deletion is soft: the item and active offers are hidden while historical order lines remain intact.
- Image objects use `<restaurant-id>/<item-id>/<timestamp>.<ext>` paths and Storage RLS; replacement stores the new path before deleting the old object.
- Realtime changes are restaurant-filtered, with polling as a recovery path.

See [LIVE_SUPABASE.md](docs/LIVE_SUPABASE.md) for deployment and smoke-test steps.
