-- READ-ONLY: run inside your EXISTING Supabase project's SQL editor.
-- This does not create, modify or remove any records.
select r.id as restaurant_id,r.slug,r.name,r.is_active,r.accepting_orders,
       (select count(*) from public.fd_menu_items i where i.restaurant_id=r.id) as dishes,
       (select count(*) from public.fd_offers o where o.restaurant_id=r.id) as offers,
       (select count(*) from public.fd_offers o where o.restaurant_id=r.id and o.is_active
          and o.stock_total>o.stock_reserved and now() between o.starts_at and o.ends_at) as offers_live_now
from public.fd_restaurants r
order by r.created_at desc;

select r.slug,u.email,s.role,s.user_id
from public.fd_restaurant_staff s
join public.fd_restaurants r on r.id=s.restaurant_id
join auth.users u on u.id=s.user_id
order by r.slug,u.email;

select r.slug,i.name,i.price_paise/100.0 as menu_price_rupees,
  o.price_paise/100.0 as offer_price_rupees,o.stock_total-o.stock_reserved as stock_left,
  o.is_active,o.starts_at,o.ends_at,i.image_url
from public.fd_menu_items i
join public.fd_restaurants r on r.id=i.restaurant_id
left join lateral (
 select * from public.fd_offers q where q.menu_item_id=i.id
 order by q.is_active desc,q.created_at desc limit 1
) o on true
order by r.slug,i.name;
