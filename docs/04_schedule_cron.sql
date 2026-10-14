-- Optional Supabase SQL Editor setup for automatic delivery.
-- Use Supabase Vault / Dashboard to create TWO secrets without pasting them into public app code:
--   fd_functions_base_url = https://YOUR_PROJECT.supabase.co/functions/v1
--   fd_dispatcher_secret = same long random string set as DISPATCH_SECRET on Edge Functions
-- See Supabase Vault docs to create secrets securely. Cron is UTC by default.
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- Every minute: payment hold expiry, merchant no-response, outbound utility notifications.
select cron.schedule('fd-dispatch','* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='fd_functions_base_url')||'/fd-dispatch-notifications',
    headers := jsonb_build_object('Content-Type','application/json','x-dispatch-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='fd_dispatcher_secret')),
    body := '{}'::jsonb
  );
$$);
-- 10:00 IST daily = 04:30 UTC: opt-in daily offer notification, maximum one per merchant per day.
select cron.schedule('fd-daily-deals','30 4 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='fd_functions_base_url')||'/fd-daily-digest',
    headers := jsonb_build_object('Content-Type','application/json','x-dispatch-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='fd_dispatcher_secret')),
    body := '{}'::jsonb
  );
$$);
