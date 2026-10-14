# Meta WhatsApp Business: templates and opt-in

No unsolicited daily messages. A customer opts in independently for each restaurant via `fd_restaurant_followers`; utility WhatsApp messages also need their messaging preference. Merchant alerts require staff's explicit toggle and own number.

Create AND get Meta approval for these WhatsApp templates in the language configured as `META_TEMPLATE_LANGUAGE` (default `en`):

| Template name | Category | Body params | Suggested body |
|---|---|---|---|
| `bl_merchant_new_order` | Utility | `{{1}}` order ID | New paid reservation {{1}}. Open BiteLocal partner to accept it. |
| `bl_customer_order_accepted` | Utility | `{{1}}` order ID | Your reservation {{1}} was accepted. Follow your booking on BiteLocal. |
| `bl_customer_order_ready` | Utility | `{{1}}` order ID | Your food for reservation {{1}} is ready. Show your pickup code at the restaurant. |
| `bl_customer_order_rejected` | Utility | `{{1}}` order ID | Reservation {{1}} couldn't be fulfilled. Your refund request is being processed. |
| `bl_customer_order_completed` | Utility | `{{1}}` order ID | Reservation {{1}} was completed. Thanks for supporting a local food business. |
| `bl_daily_deal` | Marketing | `{{1}}` restaurant, `{{2}}` dish, `{{3}}` price, `{{4}}` URL | Today's BiteLocal special at {{1}}: {{2}} for {{3}}. Reserve: {{4}}. Reply STOP to unsubscribe. |

Note: Meta may reject a template or classify it differently. Names, approved body parameter counts, and account eligibility must match the actual account. For production, configure inbound `fd-whatsapp-webhook` with `META_VERIFY_TOKEN` and `META_APP_SECRET` so STOP/UNSUBSCRIBE immediately updates opt-outs. Phone numbers are never included in client-side configuration.

**Operational setup:** Verify Meta Business/WhatsApp sender, create templates, configure webhook, set secrets, enable dispatcher cron, then place real low-value test orders with opted-in testers. The `fd_marketing_deliveries` unique database key caps one attempt per user × merchant × Bengaluru calendar day; failed sends should not automatically retry without considering duplicate delivery.

**Web push:** `expo-notifications` does not send web push. This repo contains a standard service worker (`public/sw.js`), VAPID subscription registration, database-backed subscriptions and an Edge worker using web-push. Requires HTTPS, browser permission, VAPID keys and a running dispatcher. Native Android push remains a separate integration step when shipping an APK.
