-- Food Discovery (fd_) Pilot v2. Run ONCE in an existing Supabase project, before creating app data.
-- Namespaced project-owned objects: public.fd_* tables/functions/indexes/triggers/policies and fd-dish-images bucket.
-- Assumes no earlier unprefixed pilot schema has been installed. Does not rename/migrate prior data.
-- Monetary amounts are INTEGER PAISE; all timestamps are UTC timestamptz.
-- All privileged checkout/payment/status operations run in SECURITY DEFINER functions.
-- gen_random_uuid() is built into modern PostgreSQL; no extension installation required.
BEGIN;

create table public.fd_restaurants (
 id uuid primary key default gen_random_uuid(), slug text not null unique check(slug~'^[a-z0-9-]+$'),
 name text not null, address text not null, phone text not null default '', logo_url text,
 accepting_orders boolean not null default true, is_active boolean not null default true,
 pickup_enabled boolean not null default true, dinein_enabled boolean not null default true,
 prep_buffer_minutes integer not null default 5 check(prep_buffer_minutes between 0 and 120),
 timezone text not null default 'Asia/Kolkata',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.fd_restaurant_staff (
 restaurant_id uuid not null references public.fd_restaurants(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','manager','staff')),
 alert_whatsapp_opt_in boolean not null default false,
 contact_phone text,
 created_at timestamptz not null default now(),
 primary key(restaurant_id,user_id)
);
create table public.fd_menu_items (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.fd_restaurants(id) on delete cascade,
 name text not null, description text not null default '', category text not null default 'Food',
 dietary text not null default 'veg' check(dietary in ('veg','nonveg','egg')),
 price_paise integer not null check(price_paise>0), prep_minutes int not null default 15 check(prep_minutes between 1 and 240),
 image_url text, emoji text not null default '🍽️', is_active boolean not null default true,
 is_persistent boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(restaurant_id,id)
);
create table public.fd_offers (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null,
 menu_item_id uuid not null, price_paise integer not null check(price_paise>3000),
 stock_total integer not null default 10 check(stock_total>=0), stock_reserved integer not null default 0 check(stock_reserved>=0 and stock_reserved<=stock_total),
 featured_rank int check(featured_rank between 1 and 3), is_everyday boolean not null default false,
 is_active boolean not null default true, preset_percent int check(preset_percent in (10,15,20,25,30)),
 starts_at timestamptz not null default now(), ends_at timestamptz not null default (now()+interval '1 day'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_at>starts_at), foreign key(restaurant_id,menu_item_id) references public.fd_menu_items(restaurant_id,id) on delete cascade,
 unique(restaurant_id,id)
);
-- Only a single live deal per item; switching an offer off permits creating its replacement.
create unique index fd_offers_one_live_item on public.fd_offers(menu_item_id) where is_active;
create unique index fd_offers_three_pins on public.fd_offers(restaurant_id,featured_rank) where is_active and featured_rank is not null;
create index fd_offers_visible on public.fd_offers(restaurant_id,is_active,starts_at,ends_at);

create table public.fd_customer_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text, whatsapp_opt_in boolean not null default false,
 marketing_opt_in boolean not null default false, marketing_opt_in_at timestamptz,
 last_marketing_sent_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.fd_orders (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.fd_restaurants(id),
 customer_id uuid not null references auth.users(id), customer_name text not null default '', customer_phone text not null default '',
 mode text not null check(mode in ('pickup','dinein')), arrival_at timestamptz not null,
 status text not null default 'pending_payment' check(status in ('pending_payment','awaiting_acceptance','accepted','preparing','ready','completed','rejected','cancelled','expired','no_show')),
 total_paise integer not null check(total_paise>3000), deposit_paise integer not null default 3000 check(deposit_paise=3000),
 balance_paise integer not null check(balance_paise>=0), balance_paid boolean not null default false,
 balance_method text check(balance_method in ('UPI','Cash','Other')),
 redemption_code text not null default lpad((floor(random()*10000))::text,4,'0'),
 payment_expires_at timestamptz not null default now()+interval '10 minutes',
 accepted_at timestamptz,ready_at timestamptz,completed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(restaurant_id,id),check(total_paise=deposit_paise+balance_paise)
);
create index fd_orders_restaurant_recent on public.fd_orders(restaurant_id,created_at desc);
create index fd_orders_customer_recent on public.fd_orders(customer_id,created_at desc);
create table public.fd_order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.fd_orders(id) on delete cascade,
 menu_item_id uuid not null references public.fd_menu_items(id),offer_id uuid not null references public.fd_offers(id),
 name_snapshot text not null, quantity integer not null check(quantity between 1 and 10),
 unit_paise integer not null check(unit_paise>3000),line_total_paise integer not null check(line_total_paise=unit_paise*quantity)
);
create index fd_order_items_order on public.fd_order_items(order_id);
create table public.fd_inventory_holds (
 order_id uuid primary key references public.fd_orders(id) on delete cascade,
 expires_at timestamptz not null, status text not null default 'held' check(status in ('held','committed','released')),
 created_at timestamptz not null default now()
);
create table public.fd_payments (
 id uuid primary key default gen_random_uuid(),order_id uuid not null unique references public.fd_orders(id) on delete cascade,
 provider text not null default 'razorpay', provider_order_id text unique, provider_payment_id text unique,
 amount_paise integer not null check(amount_paise=3000), status text not null default 'created'
 check(status in ('created','captured','failed','refunded','refund_pending')),
 captured_at timestamptz,created_at timestamptz not null default now()
);
create table public.fd_refunds (
 id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.fd_payments(id),
 provider_refund_id text unique,status text not null default 'pending' check(status in ('pending','processing','processed','failed')),
 reason text not null,amount_paise int not null check(amount_paise>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.fd_order_events (
 id bigint generated always as identity primary key, order_id uuid not null references public.fd_orders(id) on delete cascade,
 actor_id uuid, event_type text not null, old_status text, new_status text, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table public.fd_push_subscriptions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 restaurant_id uuid references public.fd_restaurants(id) on delete cascade,
 endpoint text not null unique, subscription jsonb not null,enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.fd_notification_outbox (
 id bigint generated always as identity primary key, restaurant_id uuid not null references public.fd_restaurants(id),
 order_id uuid references public.fd_orders(id), audience text not null check(audience in ('merchant','customer')),
 event_type text not null, dedupe_key text not null unique,
 attempts int not null default 0, due_at timestamptz not null default now(),
 sent_at timestamptz, last_error text, created_at timestamptz not null default now()
);
create table public.fd_marketing_deliveries (
 id bigint generated always as identity primary key, user_id uuid not null references auth.users(id),restaurant_id uuid not null references public.fd_restaurants(id),
 day_local date not null, provider_message_id text, status text not null default 'queued', created_at timestamptz not null default now(),
 unique(user_id,restaurant_id,day_local)
);

create function public.fd_is_restaurant_staff(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path=public
as $$select exists(select 1 from public.fd_restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid())$$;
create function public.fd_can_manage_restaurant(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path=public
as $$select exists(select 1 from public.fd_restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid() and role in ('owner','manager'))$$;
revoke all on function public.fd_is_restaurant_staff(uuid),public.fd_can_manage_restaurant(uuid) from public;
grant execute on function public.fd_is_restaurant_staff(uuid),public.fd_can_manage_restaurant(uuid) to authenticated,anon;

-- Security and tenant isolation.
alter table public.fd_restaurants enable row level security;
alter table public.fd_restaurant_staff enable row level security;
alter table public.fd_menu_items enable row level security;
alter table public.fd_offers enable row level security;
alter table public.fd_customer_profiles enable row level security;
alter table public.fd_orders enable row level security;
alter table public.fd_order_items enable row level security;
alter table public.fd_inventory_holds enable row level security;
alter table public.fd_payments enable row level security;
alter table public.fd_refunds enable row level security;
alter table public.fd_order_events enable row level security;
alter table public.fd_push_subscriptions enable row level security;
alter table public.fd_notification_outbox enable row level security;
alter table public.fd_marketing_deliveries enable row level security;
create policy "fd_public can see active restaurants" on public.fd_restaurants for select using(is_active or public.fd_is_restaurant_staff(id));
create policy "fd_owners edit their restaurant" on public.fd_restaurants for update to authenticated using(public.fd_can_manage_restaurant(id)) with check(public.fd_can_manage_restaurant(id));
create policy "fd_staff see their memberships" on public.fd_restaurant_staff for select to authenticated using(user_id=auth.uid() or public.fd_can_manage_restaurant(restaurant_id));
create policy "fd_public see active menu" on public.fd_menu_items for select using(is_active or public.fd_is_restaurant_staff(restaurant_id));
create policy "fd_staff add menu" on public.fd_menu_items for insert to authenticated with check(public.fd_is_restaurant_staff(restaurant_id));
create policy "fd_staff edit menu" on public.fd_menu_items for update to authenticated using(public.fd_is_restaurant_staff(restaurant_id)) with check(public.fd_is_restaurant_staff(restaurant_id));
create policy "fd_public see visible offers" on public.fd_offers for select using(is_active or public.fd_is_restaurant_staff(restaurant_id));
create policy "fd_staff create offers" on public.fd_offers for insert to authenticated with check(public.fd_is_restaurant_staff(restaurant_id));
create policy "fd_staff edit offers" on public.fd_offers for update to authenticated using(public.fd_is_restaurant_staff(restaurant_id)) with check(public.fd_is_restaurant_staff(restaurant_id));
create policy "fd_customers see own profile" on public.fd_customer_profiles for select to authenticated using(id=auth.uid());
create policy "fd_customers create own profile" on public.fd_customer_profiles for insert to authenticated with check(id=auth.uid());
create policy "fd_customers update own profile" on public.fd_customer_profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy "fd_participants see orders" on public.fd_orders for select to authenticated using(customer_id=auth.uid() or public.fd_is_restaurant_staff(restaurant_id));
create policy "fd_participants see order items" on public.fd_order_items for select to authenticated using(exists(select 1 from public.fd_orders o where o.id=order_id and (o.customer_id=auth.uid() or public.fd_is_restaurant_staff(o.restaurant_id))));
create policy "fd_participants see events" on public.fd_order_events for select to authenticated using(exists(select 1 from public.fd_orders o where o.id=order_id and (o.customer_id=auth.uid() or public.fd_is_restaurant_staff(o.restaurant_id))));
create policy "fd_customers see own payments" on public.fd_payments for select to authenticated using(exists(select 1 from public.fd_orders o where o.id=order_id and (o.customer_id=auth.uid() or public.fd_is_restaurant_staff(o.restaurant_id))));
create policy "fd_participants see refunds" on public.fd_refunds for select to authenticated using(exists(select 1 from public.fd_payments p join public.fd_orders o on o.id=p.order_id where p.id=payment_id and (o.customer_id=auth.uid() or public.fd_is_restaurant_staff(o.restaurant_id))));
create policy "fd_subscribers see own subscription" on public.fd_push_subscriptions for select to authenticated using(user_id=auth.uid());
create policy "fd_subscribers insert own subscription" on public.fd_push_subscriptions for insert to authenticated with check(user_id=auth.uid() and (restaurant_id is null or public.fd_is_restaurant_staff(restaurant_id)));
create policy "fd_subscribers update own subscription" on public.fd_push_subscriptions for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (restaurant_id is null or public.fd_is_restaurant_staff(restaurant_id)));
create policy "fd_subscribers delete own subscription" on public.fd_push_subscriptions for delete to authenticated using(user_id=auth.uid());
-- No direct client INSERT/UPDATE rights to orders, payments, holds, refunds, events, outbox, deliveries.

-- Merchant cannot alter stock_reserved, restaurant_id or the original item identity using direct PostgREST requests.
revoke update on public.fd_offers from authenticated;
grant update(price_paise,stock_total,featured_rank,is_everyday,is_active,preset_percent,starts_at,ends_at) on public.fd_offers to authenticated;
revoke update on public.fd_menu_items from authenticated;
grant update(name,description,category,dietary,price_paise,prep_minutes,image_url,emoji,is_active,is_persistent) on public.fd_menu_items to authenticated;
revoke update on public.fd_restaurants from authenticated;
grant update(name,address,phone,logo_url,accepting_orders,pickup_enabled,dinein_enabled,prep_buffer_minutes) on public.fd_restaurants to authenticated;
-- Staff read privileges are limited; merchant roles are assigned only through SQL / service role.

-- Protect offer selling price from being higher than item menu price.
create function public.fd_check_offer() returns trigger language plpgsql set search_path=public as $$
declare regular integer;
begin select price_paise into regular from public.fd_menu_items where id=new.menu_item_id and restaurant_id=new.restaurant_id;
if regular is null or new.price_paise>=regular then raise exception 'Offer must be below the current menu price';end if;
return new; end $$;
create trigger fd_trg_check_offer before insert or update of price_paise,menu_item_id,restaurant_id on public.fd_offers for each row execute function public.fd_check_offer();

create function public.fd_reserve_checkout(p_restaurant_id uuid,p_mode text,p_arrival_at timestamptz,p_lines jsonb)
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
 -- Acquire row locks in deterministic offer ID order to protect against overselling.
 for entry in select value from jsonb_array_elements(p_lines) order by value->>'offer_id' loop
   requested_id:=(entry->>'offer_id')::uuid; qty:=(entry->>'quantity')::int;
   if qty is null or qty<1 or qty>10 then raise exception 'Invalid quantity';end if;
   select * into offer_row from public.fd_offers where id=requested_id and restaurant_id=p_restaurant_id for update;
   if not found or not offer_row.is_active or now() not between offer_row.starts_at and offer_row.ends_at or offer_row.stock_total-offer_row.stock_reserved<qty then raise exception 'Offer unavailable or sold out';end if;
   select * into dish from public.fd_menu_items where id=offer_row.menu_item_id and is_active;
   if not found then raise exception 'Dish unavailable';end if;
   total:=total+offer_row.price_paise*qty;n:=n+qty; max_prep:=greatest(max_prep,dish.prep_minutes);
 end loop;
 if total<=3000 or total>2000000 then raise exception 'Order must be above ₹30 and below ₹20,000';end if;
 if p_arrival_at < now() + make_interval(mins => max_prep+r.prep_buffer_minutes) or p_arrival_at>now()+interval '24 hours' then raise exception 'Arrival must allow preparation time and be within 24 hours';end if;
 -- All items should remain offer-valid through requested arrival time.
 if exists(select 1 from jsonb_array_elements(p_lines) e join public.fd_offers o on o.id=(e.value->>'offer_id')::uuid where p_arrival_at>o.ends_at) then raise exception 'Offer ends before arrival';end if;
 insert into public.fd_customer_profiles(id) values(auth.uid()) on conflict(id) do nothing;
 insert into public.fd_orders(restaurant_id,customer_id,customer_phone,mode,arrival_at,total_paise,deposit_paise,balance_paise,payment_expires_at)
 values(p_restaurant_id,auth.uid(),coalesce((select phone from auth.users where id=auth.uid()),''),p_mode,p_arrival_at,total,3000,total-3000,hold_exp) returning id into new_id;
 for entry in select value from jsonb_array_elements(p_lines) loop
   requested_id:=(entry->>'offer_id')::uuid; qty:=(entry->>'quantity')::int;
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

-- Service-only: invoked after trusted Razorpay captured confirmation.
create function public.fd_mark_deposit_captured(p_order_id uuid,p_provider_order_id text,p_payment_id text)
returns void language plpgsql security definer set search_path=public as $$
declare o public.fd_orders%rowtype;p public.fd_payments%rowtype;
begin
 if auth.role()<>'service_role' then raise exception 'Forbidden';end if;
 select * into o from public.fd_orders where id=p_order_id for update;
 select * into p from public.fd_payments where order_id=p_order_id for update;
 if not found or p.provider_order_id<>p_provider_order_id then raise exception 'Payment order mismatch';end if;
 if p.status='captured' and p.provider_payment_id=p_payment_id then return;end if;
 if o.status<>'pending_payment' or now()>o.payment_expires_at then raise exception 'Payment needs manual reconciliation: reservation expired';end if;
 update public.fd_payments set status='captured',provider_payment_id=p_payment_id,captured_at=now() where id=p.id;
 update public.fd_orders set status='awaiting_acceptance',updated_at=now() where id=p_order_id;
 update public.fd_inventory_holds set status='committed' where order_id=p_order_id;
end $$;
revoke all on function public.fd_mark_deposit_captured(uuid,text,text) from public,anon,authenticated;
grant execute on function public.fd_mark_deposit_captured(uuid,text,text) to service_role;

create function public.fd_merchant_transition(p_order_id uuid,p_next text,p_code text default null,p_method text default null)
returns void language plpgsql security definer set search_path=public as $$
declare o public.fd_orders%rowtype; line record;
begin
 select * into o from public.fd_orders where id=p_order_id for update;
 if not found or not public.fd_is_restaurant_staff(o.restaurant_id) then raise exception 'Not authorized';end if;
 if not ((o.status='awaiting_acceptance' and p_next in ('accepted','rejected')) or (o.status='accepted' and p_next='preparing') or (o.status='preparing' and p_next='ready') or (o.status='ready' and p_next='completed')) then raise exception 'Invalid transition';end if;
 if p_next='completed' and (p_code is null or o.redemption_code<>p_code or p_method not in ('UPI','Cash','Other')) then raise exception 'Valid redemption code and payment method required';end if;
 update public.fd_orders set status=p_next,balance_paid=(p_next='completed'),balance_method=case when p_next='completed' then p_method else balance_method end,
 accepted_at=case when p_next='accepted' then now() else accepted_at end,
 ready_at=case when p_next='ready' then now() else ready_at end,
 completed_at=case when p_next='completed' then now() else completed_at end,updated_at=now() where id=p_order_id;
 if p_next='rejected' then
   for line in select offer_id,quantity from public.fd_order_items where order_id=p_order_id loop
     update public.fd_offers set stock_reserved=greatest(0,stock_reserved-line.quantity) where id=line.offer_id;
   end loop;
   update public.fd_payments set status='refund_pending' where order_id=p_order_id;
 end if;
end $$;
revoke all on function public.fd_merchant_transition(uuid,text,text,text) from public,anon;
grant execute on function public.fd_merchant_transition(uuid,text,text,text) to authenticated;

create function public.fd_expire_unpaid_reservations()
returns integer language plpgsql security definer set search_path=public as $$
declare o record;line record;changed integer:=0;
begin
 if auth.role()<>'service_role' then raise exception 'Forbidden';end if;
 for o in select id from public.fd_orders where status='pending_payment' and payment_expires_at<now() for update skip locked loop
   for line in select offer_id,quantity from public.fd_order_items where order_id=o.id loop
     update public.fd_offers set stock_reserved=greatest(0,stock_reserved-line.quantity) where id=line.offer_id;
   end loop;
   update public.fd_orders set status='expired',updated_at=now() where id=o.id;
   update public.fd_inventory_holds set status='released' where order_id=o.id;
   changed:=changed+1;
 end loop; return changed;
end $$;
revoke all on function public.fd_expire_unpaid_reservations() from public,anon,authenticated;
grant execute on function public.fd_expire_unpaid_reservations() to service_role;

-- Status history and notification queue (no external HTTP in database triggers).
create function public.fd_log_order_status_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
  insert into public.fd_order_events(order_id,event_type,new_status,actor_id) values(new.id,'created',new.status,auth.uid());
 elsif old.status is distinct from new.status then
  insert into public.fd_order_events(order_id,event_type,old_status,new_status,actor_id) values(new.id,'status_change',old.status,new.status,auth.uid());
  if new.status in ('awaiting_acceptance','accepted','ready','rejected','completed') then
    insert into public.fd_notification_outbox(restaurant_id,order_id,audience,event_type,dedupe_key)
    values(new.restaurant_id,new.id,case when new.status='awaiting_acceptance' then 'merchant' else 'customer' end,
      'order_'||new.status,new.id::text||':'||new.status) on conflict(dedupe_key) do nothing;
  end if;
 end if;
 return new;
end $$;
create trigger fd_trg_order_status after insert or update of status on public.fd_orders for each row execute function public.fd_log_order_status_change();

-- Public bucket with tightly restricted staff upload folders: <restaurant_uuid>/<item_uuid>/<timestamp>.jpg
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fd-dish-images','fd-dish-images',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy "fd_merchant image uploads" on storage.objects for insert to authenticated with check(bucket_id='fd-dish-images' and public.fd_is_restaurant_staff((storage.foldername(name))[1]::uuid));
create policy "fd_merchant image deletion" on storage.objects for delete to authenticated using(bucket_id='fd-dish-images' and public.fd_is_restaurant_staff((storage.foldername(name))[1]::uuid));
-- Public bucket provides GET access automatically, but not write access to anonymous visitors.

-- Supabase Realtime publication may already contain tables on a fresh project.
do $$ begin alter publication supabase_realtime add table public.fd_orders;exception when duplicate_object then null;end $$;
do $$ begin alter publication supabase_realtime add table public.fd_offers;exception when duplicate_object then null;end $$;

-- No merchant seed: insert each restaurant when onboarding (see docs/02_first_run_supabase.sql).

-- Consent is PER RESTAURANT: opting into one restaurant does not opt into any other restaurant.
create table public.fd_restaurant_followers (
 restaurant_id uuid not null references public.fd_restaurants(id) on delete cascade,
 customer_id uuid not null references auth.users(id) on delete cascade,
 whatsapp_marketing_opt_in boolean not null default false,
 opted_in_at timestamptz, opted_out_at timestamptz,
 created_at timestamptz not null default now(),
 primary key(restaurant_id,customer_id)
);
alter table public.fd_restaurant_followers enable row level security;
create policy "fd_customers see their following" on public.fd_restaurant_followers for select to authenticated using(customer_id=auth.uid());
create policy "fd_customers follow restaurant" on public.fd_restaurant_followers for insert to authenticated with check(customer_id=auth.uid());
create policy "fd_customers update their following" on public.fd_restaurant_followers for update to authenticated using(customer_id=auth.uid()) with check(customer_id=auth.uid());

-- Staff can opt their own phone into transactional WhatsApp alerts; no self-granting new roles.
create policy "fd_staff update own alert preferences" on public.fd_restaurant_staff for update to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke update on public.fd_restaurant_staff from authenticated;
grant update(alert_whatsapp_opt_in,contact_phone) on public.fd_restaurant_staff to authenticated;

create function public.fd_unsubscribe_phone(p_phone text)
returns integer language plpgsql security definer set search_path=public as $$
declare changed int;
begin
 if auth.role()<>'service_role' then raise exception 'Forbidden';end if;
 update public.fd_restaurant_followers set whatsapp_marketing_opt_in=false,opted_out_at=now()
 where customer_id in (select id from auth.users where regexp_replace(phone,'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g'));
 get diagnostics changed=row_count;return changed;
end $$;
revoke all on function public.fd_unsubscribe_phone(text) from public,anon,authenticated;
grant execute on function public.fd_unsubscribe_phone(text) to service_role;

-- Timeout helper for the scheduled notification/refund worker.
create function public.fd_timeout_reject_order(p_order_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare old public.fd_orders%rowtype;line record;
begin
 if auth.role()<>'service_role' then raise exception 'Forbidden';end if;
 select * into old from public.fd_orders where id=p_order_id for update;
 if not found or old.status<>'awaiting_acceptance' or old.updated_at>now()-interval '5 minutes' then raise exception 'Order not eligible for timeout';end if;
 update public.fd_orders set status='rejected',updated_at=now() where id=p_order_id;
 for line in select offer_id,quantity from public.fd_order_items where order_id=p_order_id loop
   update public.fd_offers set stock_reserved=greatest(0,stock_reserved-line.quantity) where id=line.offer_id;
 end loop;
 update public.fd_payments set status='refund_pending' where order_id=p_order_id;
end $$;
revoke all on function public.fd_timeout_reject_order(uuid) from public,anon,authenticated;
grant execute on function public.fd_timeout_reject_order(uuid) to service_role;

create function public.fd_customer_cancel_reservation(p_order_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare o public.fd_orders%rowtype;line record;
begin
 select * into o from public.fd_orders where id=p_order_id for update;
 if not found or auth.uid()<>o.customer_id then raise exception 'Not your reservation';end if;
 if o.status<>'awaiting_acceptance' then raise exception 'Online cancellation is available only before merchant acceptance';end if;
 update public.fd_orders set status='cancelled',updated_at=now() where id=p_order_id;
 for line in select offer_id,quantity from public.fd_order_items where order_id=p_order_id loop
   update public.fd_offers set stock_reserved=greatest(0,stock_reserved-line.quantity) where id=line.offer_id;
 end loop;
 update public.fd_payments set status='refund_pending' where order_id=p_order_id;
end $$;
revoke all on function public.fd_customer_cancel_reservation(uuid) from public,anon;
grant execute on function public.fd_customer_cancel_reservation(uuid) to authenticated;

COMMIT;
