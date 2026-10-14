-- Compact merchant workflow: accepting an order also starts preparation.
-- The row lock makes transitions atomic, and same-action retries are idempotent.
create or replace function public.fd_merchant_transition(
  p_order_id uuid,
  p_next text,
  p_code text default null,
  p_method text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.fd_orders%rowtype;
  line record;
  target_status text;
begin
  select * into o
  from public.fd_orders
  where id = p_order_id
  for update;

  if not found or not public.fd_is_restaurant_staff(o.restaurant_id) then
    raise exception using errcode = '42501', message = 'This order does not belong to your restaurant';
  end if;

  target_status := case
    when p_next = 'accept_and_prepare' then 'preparing'
    else p_next
  end;

  -- A client retry after a confirmed transition is safe and does no extra work.
  if o.status = target_status then
    return;
  end if;

  if not (
    (o.status = 'awaiting_acceptance' and p_next in ('accepted', 'accept_and_prepare', 'rejected'))
    or (o.status = 'accepted' and p_next in ('preparing', 'ready'))
    or (o.status = 'preparing' and p_next = 'ready')
    or (o.status = 'ready' and p_next = 'completed')
  ) then
    raise exception using
      errcode = '22023',
      message = format('Order is already %s and cannot be changed to %s', replace(o.status, '_', ' '), replace(p_next, '_', ' '));
  end if;

  if p_next = 'completed' and (
    p_code is null
    or o.redemption_code <> p_code
    or p_method not in ('UPI', 'Cash', 'Other')
  ) then
    raise exception using errcode = '22023', message = 'The 4-digit collection code or payment method is incorrect';
  end if;

  update public.fd_orders
  set
    status = target_status,
    balance_paid = (target_status = 'completed'),
    balance_method = case when target_status = 'completed' then p_method else balance_method end,
    accepted_at = case when p_next in ('accepted', 'accept_and_prepare') then now() else accepted_at end,
    ready_at = case when target_status = 'ready' then now() else ready_at end,
    completed_at = case when target_status = 'completed' then now() else completed_at end,
    updated_at = now()
  where id = p_order_id;

  if target_status = 'rejected' then
    for line in
      select offer_id, quantity from public.fd_order_items where order_id = p_order_id
    loop
      update public.fd_offers
      set stock_reserved = greatest(0, stock_reserved - line.quantity)
      where id = line.offer_id;
    end loop;
    update public.fd_payments set status = 'refund_pending' where order_id = p_order_id;
  end if;
end
$$;

revoke all on function public.fd_merchant_transition(uuid,text,text,text) from public, anon;
grant execute on function public.fd_merchant_transition(uuid,text,text,text) to authenticated;

