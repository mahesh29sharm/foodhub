-- Keep customer discovery, RLS, and checkout on one Asia/Kolkata availability rule.
-- This migration is non-destructive: no offer, menu, restaurant, or order rows are changed.
begin;

create or replace function public.fd_offer_is_available_at(
  p_offer public.fd_offers,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    p_offer.is_active
    and p_offer.stock_reserved < p_offer.stock_total
    and case
      when not p_offer.is_everyday then p_at between p_offer.starts_at and p_offer.ends_at
      -- A default ~24-hour window represents an always-on everyday deal.
      when p_offer.ends_at - p_offer.starts_at >= interval '23 hours 59 minutes' then true
      when (p_offer.starts_at at time zone 'Asia/Kolkata')::time
           <= (p_offer.ends_at at time zone 'Asia/Kolkata')::time
        then (p_at at time zone 'Asia/Kolkata')::time between
             (p_offer.starts_at at time zone 'Asia/Kolkata')::time and
             (p_offer.ends_at at time zone 'Asia/Kolkata')::time
      else (p_at at time zone 'Asia/Kolkata')::time >=
             (p_offer.starts_at at time zone 'Asia/Kolkata')::time
        or (p_at at time zone 'Asia/Kolkata')::time <=
             (p_offer.ends_at at time zone 'Asia/Kolkata')::time
    end
$$;

revoke all on function public.fd_offer_is_available_at(public.fd_offers,timestamptz) from public;
grant execute on function public.fd_offer_is_available_at(public.fd_offers,timestamptz) to anon, authenticated;

drop policy if exists "fd_public can see active restaurants" on public.fd_restaurants;
create policy "fd_public can see active restaurants" on public.fd_restaurants
for select to anon, authenticated
using (is_active or public.fd_is_restaurant_staff(id));

drop policy if exists "fd_public see active menu" on public.fd_menu_items;
create policy "fd_public see active menu" on public.fd_menu_items
for select to anon, authenticated
using (
  public.fd_is_restaurant_staff(restaurant_id)
  or (
    is_active and deleted_at is null
    and exists (
      select 1 from public.fd_restaurants r
      where r.id = restaurant_id and r.is_active
    )
  )
);

drop policy if exists "fd_public see visible offers" on public.fd_offers;
create policy "fd_public see visible offers" on public.fd_offers
for select to anon, authenticated
using (
  public.fd_is_restaurant_staff(restaurant_id)
  or (
    public.fd_offer_is_available_at(fd_offers, now())
    and exists (
      select 1
      from public.fd_menu_items m
      join public.fd_restaurants r on r.id = m.restaurant_id
      where m.id = menu_item_id
        and m.restaurant_id = fd_offers.restaurant_id
        and m.is_active
        and m.deleted_at is null
        and r.is_active
    )
  )
);

create or replace function public.fd_reserve_checkout(p_restaurant_id uuid,p_mode text,p_arrival_at timestamptz,p_lines jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare r public.fd_restaurants%rowtype; offer_row public.fd_offers%rowtype; dish public.fd_menu_items%rowtype;
 entry jsonb; requested_id uuid; qty int; total bigint:=0; n int:=0; new_id uuid; max_prep int:=0; hold_exp timestamptz:=now()+interval '10 minutes';
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_mode not in ('pickup','dinein') then raise exception 'Invalid fulfilment mode';end if;
 select * into r from public.fd_restaurants where id=p_restaurant_id and is_active and accepting_orders for share;
 if not found then raise exception 'Restaurant not accepting reservations';end if;
 if (p_mode='pickup' and not r.pickup_enabled) or (p_mode='dinein' and not r.dinein_enabled) then raise exception 'Fulfilment mode unavailable';end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<1 or jsonb_array_length(p_lines)>12 then raise exception 'Invalid order lines';end if;
 if (select count(*) from jsonb_array_elements(p_lines))<>(select count(distinct x.value->>'offer_id') from jsonb_array_elements(p_lines) as x(value)) then raise exception 'Duplicate offer lines';end if;
 for entry in select value from jsonb_array_elements(p_lines) order by value->>'offer_id' loop
   requested_id:=(entry->>'offer_id')::uuid; qty:=(entry->>'quantity')::int;
   if qty is null or qty<1 or qty>10 then raise exception 'Invalid quantity';end if;
   select * into offer_row from public.fd_offers where id=requested_id and restaurant_id=p_restaurant_id for update;
   if not found or not public.fd_offer_is_available_at(offer_row,now()) or offer_row.stock_total-offer_row.stock_reserved<qty then raise exception 'Offer unavailable or sold out';end if;
   select * into dish from public.fd_menu_items where id=offer_row.menu_item_id and restaurant_id=p_restaurant_id and is_active and deleted_at is null;
   if not found then raise exception 'Dish unavailable';end if;
   total:=total+offer_row.price_paise*qty;n:=n+qty;max_prep:=greatest(max_prep,dish.prep_minutes);
 end loop;
 if total<=3000 or total>2000000 then raise exception 'Order must be above ₹30 and below ₹20,000';end if;
 if p_arrival_at < now() + make_interval(mins => max_prep+r.prep_buffer_minutes) or p_arrival_at>now()+interval '24 hours' then raise exception 'Arrival must allow preparation time and be within 24 hours';end if;
 if exists(select 1 from jsonb_array_elements(p_lines) e join public.fd_offers o on o.id=(e.value->>'offer_id')::uuid where not public.fd_offer_is_available_at(o,p_arrival_at)) then raise exception 'Offer is not available at the requested arrival time';end if;
 insert into public.fd_customer_profiles(id) values(auth.uid()) on conflict(id) do nothing;
 insert into public.fd_orders(restaurant_id,customer_id,customer_phone,mode,arrival_at,total_paise,deposit_paise,balance_paise,payment_expires_at)
 values(p_restaurant_id,auth.uid(),coalesce((select phone from auth.users where id=auth.uid()),''),p_mode,p_arrival_at,total,3000,total-3000,hold_exp) returning id into new_id;
 for entry in select value from jsonb_array_elements(p_lines) loop
   requested_id:=(entry->>'offer_id')::uuid;qty:=(entry->>'quantity')::int;
   select * into offer_row from public.fd_offers where id=requested_id;
   select * into dish from public.fd_menu_items where id=offer_row.menu_item_id;
   insert into public.fd_order_items(order_id,menu_item_id,offer_id,name_snapshot,quantity,unit_paise,line_total_paise)
   values(new_id,dish.id,offer_row.id,dish.name,qty,offer_row.price_paise,offer_row.price_paise*qty);
   update public.fd_offers set stock_reserved=stock_reserved+qty where id=offer_row.id;
 end loop;
 insert into public.fd_inventory_holds(order_id,expires_at) values(new_id,hold_exp);
 insert into public.fd_payments(order_id,amount_paise) values(new_id,3000);
 return new_id;
end $$;

revoke all on function public.fd_reserve_checkout(uuid,text,timestamptz,jsonb) from public,anon;
grant execute on function public.fd_reserve_checkout(uuid,text,timestamptz,jsonb) to authenticated;

commit;
