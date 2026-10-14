-- Pilot checkout uses the authenticated Supabase user ID (including anonymous
-- users) as ownership. A phone number is profile metadata, never an identity key.
create or replace function public.fd_prepare_customer_order()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  profile public.fd_customer_profiles%rowtype;
  confirmed_phone text;
  is_verified boolean := false;
begin
  select * into profile
  from public.fd_customer_profiles
  where id = new.customer_id;

  if profile.id is null or profile.onboarding_completed_at is null then
    raise exception 'Complete your customer profile before placing an order';
  end if;
  if profile.phone_e164 is null then
    raise exception 'Add a valid mobile number to your profile before placing an order';
  end if;

  select phone into confirmed_phone
  from auth.users
  where id = new.customer_id and phone_confirmed_at is not null;
  is_verified := confirmed_phone is not null and confirmed_phone = profile.phone_e164;

  update public.fd_customer_profiles
  set
    phone_verified = is_verified,
    phone_verified_at = case
      when is_verified then coalesce(phone_verified_at, now())
      else null
    end,
    updated_at = now()
  where id = new.customer_id;

  new.customer_name := profile.full_name;
  new.customer_phone := profile.phone_e164;
  return new;
end
$$;

