# Pilot launch checklist — Chatako BTM 2nd Stage

## You need to provide / confirm

- Real Chatako food menu, regular in-store prices, dish photos, dietary labels, prep times, portion limits.
- Owner's verified mobile number and assigned Supabase Auth user ID for `fd_restaurant_staff`.
- Preferred public domain (so we can generate and print the real QR poster).
- Payment settlement owner: who receives ₹30, how to credit it against the rest of the bill, GST/invoicing, and permitted Razorpay account configuration.
- A cancellation/no-show/refund policy, including whether customer-initiated cancellation is allowed after acceptance.
- Meta WhatsApp Business number/account, approved marketing & utility templates, consent wording, unsubscribe process.
- Staff device environment: one tablet/Android phone, browser notification permission and WhatsApp number.

## Sandbox tests before launching

1. Customer loads `/?r=chatako-btm2` from QR, opens offer, chooses pickup and completes test deposit.
2. User comes from WhatsApp link to a dish, checks the real discounted price and reserves without app install.
3. Merchant sees new paid booking in-app, through browser background notification and (only if opted in) WhatsApp.
4. Merchant accepts, marks preparing/ready and confirms code + ₹ balance in-store.
5. Run two competing checkouts for the final portion; exactly one succeeds.
6. Cancel/expire a payment hold. Stock returns. Confirm no duplicate orders after webhook replay.
7. Reject before acceptance and verify gateway refund success. Test failed-refund support handling.
8. Merchant doesn't answer within five minutes: scheduled job rejects and starts refund.
9. Replace dish photo, set one-tap 10%/20%, pin Top 3, pause a deal, pause restaurant.
10. Opt into daily Chatako messages, receive a single approved marketing template; reply STOP and confirm no further sends.
11. Add a second restaurant and owner; ensure user A cannot edit or view merchant B's private orders and device subscriptions.
12. Refresh phone browser and complete payment callback flows with a poor mobile network.

## Scope deliberately out of first pilot

- Native Android payment integration, native background push, multi-restaurant feeds, multi-merchant baskets, table inventory and integration to merchant's billing software.
- Automated no-show deposit forfeiture. This requires an explicit fair cancellation policy and a merchant/customer support process.
- Proof of offline balance transfer: staff acknowledgment is a record, not bank reconciliation.

## Default design assumptions

- **₹30 fixed per order**, not per item. Item-level discounted price visible before checkout.
- Merchant manually chooses 10%, 15%, 20%, 25%, 30%, or a custom price, and manually controls offer quantity.
- Top 3 are manually pinned; everyday dishes are marked by owner, with active recurring-style offers for everyday pricing.
- Service radius/discovery is not geolocated in v1; each merchant has a direct `?r=` URL. This allows QR + WhatsApp pilot without GPS permissions.
