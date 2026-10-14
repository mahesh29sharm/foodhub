-- Persistent customer onboarding, explicit per-restaurant consent, and verified checkout.
alter table public.fd_customer_profiles
  add column if not exists phone_e164 text,
  add column if not exists phone_verified boolean not null default false,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists first_restaurant_id uuid references public.fd_restaurants(id),
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists marketing_opt_out_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.fd_customer_profiles
  drop constraint if exists fd_customer_profiles_phone_e164_check;
alter table public.fd_customer_profiles
  add constraint fd_customer_profiles_phone_e164_check
  check (phone_e164 is null or phone_e164 ~ '^\+91[6-9][0-9]{9}$');

alter table public.fd_restaurants
  add column if not exists whatsapp_business_phone text;
alter table public.fd_restaurants
  drop constraint if exists fd_restaurants_whatsapp_business_phone_check;
alter table public.fd_restaurants
  add constraint fd_restaurants_whatsapp_business_phone_check
  check (whatsapp_business_phone is null or whatsapp_business_phone ~ '^\+91[6-9][0-9]{9}$');

revoke update on public.fd_restaurants from authenticated;
grant update(
  name,address,phone,logo_url,accepting_orders,pickup_enabled,dinein_enabled,
  prep_buffer_minutes,whatsapp_business_phone
) on public.fd_restaurants to authenticated;

create or replace function public.fd_save_customer_profile(
  p_name text,
  p_phone text,
  p_restaurant_id uuid,
  p_marketing boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  clean_name text := btrim(p_name);
  auth_phone text;
  verified boolean := false;
begin
  if uid is null then raise exception 'Sign in required'; end if;
  if length(clean_name) < 2 or length(clean_name) > 80 then
    raise exception 'Name must be between 2 and 80 characters';
  end if;
  if p_phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'Enter a valid Indian mobile number';
  end if;
  if not exists(select 1 from public.fd_restaurants where id=p_restaurant_id and is_active) then
    raise exception 'Restaurant is unavailable';
  end if;

  select phone into auth_phone from auth.users
  where id=uid and phone_confirmed_at is not null;
  verified := auth_phone = p_phone;

  insert into public.fd_customer_profiles(
    id,full_name,phone_e164,phone_verified,phone_verified_at,
    first_restaurant_id,onboarding_completed_at,whatsapp_opt_in,
    marketing_opt_in,marketing_opt_in_at,marketing_opt_out_at,updated_at
  ) values (
    uid,clean_name,p_phone,verified,case when verified then now() end,
    p_restaurant_id,now(),p_marketing,p_marketing,
    case when p_marketing then now() end,
    case when not p_marketing then now() end,now()
  )
  on conflict(id) do update set
    full_name=excluded.full_name,
    phone_e164=excluded.phone_e164,
    phone_verified=excluded.phone_verified,
    phone_verified_at=case
      when excluded.phone_verified then coalesce(public.fd_customer_profiles.phone_verified_at,now())
      else null
    end,
    first_restaurant_id=coalesce(public.fd_customer_profiles.first_restaurant_id,excluded.first_restaurant_id),
    onboarding_completed_at=coalesce(public.fd_customer_profiles.onboarding_completed_at,now()),
    whatsapp_opt_in=excluded.whatsapp_opt_in,
    marketing_opt_in=excluded.marketing_opt_in,
    marketing_opt_in_at=case
      when excluded.marketing_opt_in then coalesce(public.fd_customer_profiles.marketing_opt_in_at,now())
      else null
    end,
    marketing_opt_out_at=case when excluded.marketing_opt_in then null else now() end,
    updated_at=now();

  insert into public.fd_restaurant_followers(
    restaurant_id,customer_id,whatsapp_marketing_opt_in,opted_in_at,opted_out_at
  ) values (
    p_restaurant_id,uid,p_marketing,
    case when p_marketing then now() end,
    case when not p_marketing then now() end
  )
  on conflict(restaurant_id,customer_id) do update set
    whatsapp_marketing_opt_in=excluded.whatsapp_marketing_opt_in,
    opted_in_at=case
      when excluded.whatsapp_marketing_opt_in then coalesce(public.fd_restaurant_followers.opted_in_at,now())
      else public.fd_restaurant_followers.opted_in_at
    end,
    opted_out_at=case when excluded.whatsapp_marketing_opt_in then null else now() end;
end
$$;

revoke all on function public.fd_save_customer_profile(text,text,uuid,boolean) from public,anon;
grant execute on function public.fd_save_customer_profile(text,text,uuid,boolean) to authenticated;

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
  select * into profile from public.fd_customer_profiles where id=new.customer_id;
  if profile.id is null or profile.onboarding_completed_at is null then
    raise exception 'Complete your customer profile before placing an order';
  end if;
  if profile.phone_e164 is null then
    raise exception 'Add a valid mobile number to your profile before placing an order';
  end if;

  select phone into confirmed_phone from auth.users
  where id=new.customer_id and phone_confirmed_at is not null;
  is_verified := confirmed_phone is not null and confirmed_phone=profile.phone_e164;

  update public.fd_customer_profiles set
    phone_verified=is_verified,
    phone_verified_at=case when is_verified then coalesce(phone_verified_at,now()) else null end,
    updated_at=now()
  where id=new.customer_id;

  new.customer_name := profile.full_name;
  new.customer_phone := profile.phone_e164;
  return new;
end
$$;

drop trigger if exists fd_trg_prepare_customer_order on public.fd_orders;
create trigger fd_trg_prepare_customer_order
before insert on public.fd_orders
for each row execute function public.fd_prepare_customer_order();
