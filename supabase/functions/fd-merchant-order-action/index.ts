import {
  admin,
  cors,
  customer,
  err,
  errorMessage,
  json,
  razorpay,
} from '../_shared/common.ts';

const actions = new Set([
  'accepted',
  'accept_and_prepare',
  'preparing',
  'ready',
  'completed',
  'rejected',
]);

function statusFor(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  if (message.includes('sign in') || message.includes('session')) return 401;
  if (message.includes('does not belong') || message.includes('not authorized')) return 403;
  if (message.includes('already') || message.includes('cannot be changed')) return 409;
  return 400;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const { client } = await customer(req);
    const body = await req.json();
    const { order_id, action, balance_method, redemption_code } = body;

    if (typeof order_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(order_id)) {
      throw Error('A valid order ID is required');
    }
    if (typeof action !== 'string' || !actions.has(action)) {
      throw Error('Unsupported order action');
    }

    const { error } = await client.rpc('fd_merchant_transition', {
      p_order_id: order_id,
      p_next: action,
      p_code: redemption_code || null,
      p_method: balance_method || null,
    });
    if (error) throw error;

    if (action === 'rejected') {
      const { data: payment } = await admin
        .from('fd_payments')
        .select('id,provider_payment_id')
        .eq('order_id', order_id)
        .single();
      if (payment?.provider_payment_id) {
        const { data: existing } = await admin
          .from('fd_refunds')
          .select('id')
          .eq('payment_id', payment.id)
          .maybeSingle();
        if (!existing) {
          const { data: refundRow, error: insertError } = await admin
            .from('fd_refunds')
            .insert({
              payment_id: payment.id,
              amount_paise: 3000,
              reason: 'merchant_rejected',
              status: 'pending',
            })
            .select('id')
            .single();
          if (insertError) throw insertError;
          try {
            const response = await razorpay(
              `payments/${payment.provider_payment_id}/refund`,
              'POST',
              { amount: 3000, notes: { booking_id: order_id } },
            );
            await admin
              .from('fd_refunds')
              .update({
                status: response.status === 'processed' ? 'processed' : 'processing',
                provider_refund_id: response.id,
              })
              .eq('id', refundRow.id);
          } catch (refundError) {
            await admin.from('fd_refunds').update({ status: 'failed' }).eq('id', refundRow.id);
            console.error(refundError);
          }
        }
      }
    }

    const { data: order, error: readError } = await admin
      .from('fd_orders')
      .select('status,balance_paid,balance_method')
      .eq('id', order_id)
      .single();
    if (readError) throw readError;
    return json({ ok: true, order });
  } catch (error) {
    return err(error, statusFor(error));
  }
});
