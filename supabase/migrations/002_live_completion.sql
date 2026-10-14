-- Live completion: soft-delete menu items, tracked Storage paths, safe checkout release, and complete Realtime.
begin;

alter table public.fd_menu_items add column if not exists image_path text;
alter table public.fd_menu_items add column if not exists deleted_at timestamptz;

revoke update on public.fd_menu_items from authenticated;
grant update(name,description,category,dietary,price_paise,prep_minutes,image_url,image_path,emoji,is_active,is_persistent) on public.fd_menu_items to authenticated;

create or replace function public.fd_soft_delete_menu_item(p_item_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_item public.fd_menu_items%rowtype;
begin
 select * into v_item from public.fd_menu_items where id=p_item_id for update;
 if not found or not public.fd_is_restaurant_staff(v_item.restaurant_id) then raise exception 'Not authorized'; end if;
 if v_item.deleted_at is not null then return; end if;
 update public.fd_offers set is_active=false,featured_rank=null,updated_at=now()
 where menu_item_id=p_item_id and restaurant_id=v_item.restaurant_id and is_active;
 update public.fd_menu_items set is_active=false,is_persistent=false,deleted_at=now(),updated_at=now() where id=p_item_id;
end $$;
revoke all on function public.fd_soft_delete_menu_item(uuid) from public,anon;
grant execute on function public.fd_soft_delete_menu_item(uuid) to authenticated;

create or replace function public.fd_release_unpaid_order(p_order_id uuid,p_reason text default 'checkout_abandoned')
returns void language plpgsql security definer set search_path=public as $$
declare v_order public.fd_orders%rowtype;v_line record;
begin
 if auth.role()<>'service_role' then raise exception 'Forbidden';end if;
 select * into v_order from public.fd_orders where id=p_order_id for update;
 if not found then raise exception 'Reservation not found';end if;
 if v_order.status<>'pending_payment' then return;end if;
 for v_line in select offer_id,quantity from public.fd_order_items where order_id=p_order_id loop
  update public.fd_offers set stock_reserved=greatest(0,stock_reserved-v_line.quantity),updated_at=now() where id=v_line.offer_id;
 end loop;
 update public.fd_orders set status='cancelled',updated_at=now() where id=p_order_id;
 update public.fd_inventory_holds set status='released' where order_id=p_order_id;
 update public.fd_payments set status='failed' where order_id=p_order_id and status='created';
 insert into public.fd_order_events(order_id,event_type,new_status,metadata)
 values(p_order_id,'payment_abandoned','cancelled',jsonb_build_object('reason',left(coalesce(p_reason,'unknown'),120)));
end $$;
revoke all on function public.fd_release_unpaid_order(uuid,text) from public,anon,authenticated;
grant execute on function public.fd_release_unpaid_order(uuid,text) to service_role;

do $$ begin alter publication supabase_realtime add table public.fd_menu_items;exception when duplicate_object then null;end $$;

commit;
