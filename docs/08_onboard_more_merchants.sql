-- Reusable, non-destructive merchant onboarding for an ALREADY INITIALISED fd_ schema.
-- Edit these values for every NEW merchant. Owner must already exist in auth.users.
begin;
do $onboard$
declare
  v_slug text := 'new-merchant-slug';
  v_name text := 'New Merchant Name';
  v_address text := 'Full address';
  v_phone text := '+91XXXXXXXXXX';
  v_owner_email text := 'real-owner@example.com';
  v_user uuid;
  v_restaurant uuid;
begin
  select id into v_user from auth.users where lower(email)=lower(trim(v_owner_email)) limit 1;
  if v_user is null then raise exception 'Auth account not found for %',v_owner_email;end if;
  insert into public.fd_restaurants(slug,name,address,phone)
  values(v_slug,v_name,v_address,v_phone) on conflict(slug) do nothing;
  select id into v_restaurant from public.fd_restaurants where slug=v_slug;
  insert into public.fd_restaurant_staff(restaurant_id,user_id,role)
  values(v_restaurant,v_user,'owner') on conflict(restaurant_id,user_id)
  do update set role=excluded.role;
end;
$onboard$;
commit;
