-- TESTING ONLY: reset one customer so the first-visit profile popup appears.
--
-- 1. Run this SELECT first and copy the intended test customer's UUID.
-- 2. Replace the all-zero UUID in the DO block with that UUID.
-- 3. Run only the DO block, then sign out or refresh the customer app.
--
-- This deliberately refuses to run while the placeholder UUID is present and
-- never performs an unscoped update.

select
  id,
  full_name,
  phone_e164,
  onboarding_completed_at,
  updated_at
from public.fd_customer_profiles
order by updated_at desc nulls last
limit 20;

do $$
declare
  target_customer_id uuid := '00000000-0000-0000-0000-000000000000';
begin
  if target_customer_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Replace target_customer_id with the intended test customer UUID';
  end if;

  update public.fd_customer_profiles
  set
    full_name = null,
    phone_e164 = null,
    phone_verified = false,
    phone_verified_at = null,
    onboarding_completed_at = null,
    whatsapp_opt_in = false,
    marketing_opt_in = false,
    marketing_opt_in_at = null,
    marketing_opt_out_at = now(),
    updated_at = now()
  where id = target_customer_id;

  if not found then
    raise exception 'No customer profile found for %', target_customer_id;
  end if;

  update public.fd_restaurant_followers
  set
    whatsapp_marketing_opt_in = false,
    opted_out_at = now()
  where customer_id = target_customer_id;
end
$$;
