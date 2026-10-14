-- Run this AFTER the fd_ initial migration. Example onboards one restaurant;
-- repeat for every new merchant with their own slug and owner auth UUID.
-- Replace ALL placeholders before running. Avoid reusing an existing merchant's slug.

-- 1) Add the first restaurant.
insert into public.fd_restaurants (slug, name, address, phone)
values ('your-restaurant-slug', 'Your Restaurant Name', 'Full address', '+91XXXXXXXXXX')
on conflict (slug) do nothing;

-- 2) The owner must sign in once to create a user in Authentication > Users.
-- Replace YOUR_AUTH_USER_UUID with their actual authenticated user UUID.
insert into public.fd_restaurant_staff (restaurant_id, user_id, role)
select id, 'YOUR_AUTH_USER_UUID'::uuid, 'owner'
from public.fd_restaurants where slug = 'your-restaurant-slug'
on conflict (restaurant_id, user_id) do update set role = 'owner';

-- 3) Verify.
select r.id, r.slug, r.name, s.user_id, s.role
from public.fd_restaurants r
left join public.fd_restaurant_staff s on s.restaurant_id = r.id
where r.slug = 'your-restaurant-slug';

-- Each subsequent merchant is another fd_restaurants row and a separate
-- fd_restaurant_staff membership. Customer links: /?r=merchant-slug
