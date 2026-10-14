import {admin,json,err,verifyHmac,cors,razorpay} from '../_shared/common.ts';
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response(null,{headers:cors});try{
 const raw=await req.text(),signature=req.headers.get('X-Razorpay-Signature')||'',secret=Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
 if(!secret||!(await verifyHmac(raw,signature,secret)))return json({error:'Bad signature'},401);
 const event=JSON.parse(raw);
 if(event.event==='payment.captured'){
  const pay=event.payload.payment.entity;
  if(pay.amount!==3000||pay.currency!=='INR'||pay.status!=='captured')throw Error('Unexpected payment');
  const {data:p,error}=await admin.from('fd_payments').select('order_id').eq('provider_order_id',pay.order_id).maybeSingle();
  if(error)throw error;if(!p)return json({ok:true,unmatched:true});
  const {error:e}=await admin.rpc('fd_mark_deposit_captured',{p_order_id:p.order_id,p_provider_order_id:pay.order_id,p_payment_id:pay.id});
  if(e){
    console.error('Capture reconciliation needed:',e.message);
    const {data:order}=await admin.from('fd_orders').select('status').eq('id',p.order_id).single();
    if(order&&['expired','cancelled','rejected'].includes(order.status)){
      const {data:payment}=await admin.from('fd_payments').select('id').eq('order_id',p.order_id).single();
      if(payment){
        await admin.from('fd_payments').update({provider_payment_id:pay.id,status:'refund_pending'}).eq('id',payment.id);
        const {data:old}=await admin.from('fd_refunds').select('id').eq('payment_id',payment.id).maybeSingle();
        if(!old){
          const {data:row}=await admin.from('fd_refunds').insert({payment_id:payment.id,amount_paise:3000,reason:'late_captured_payment',status:'pending'}).select('id').single();
          if(row){try{const refund=await razorpay(`payments/${pay.id}/refund`,'POST',{amount:3000});await admin.from('fd_refunds').update({provider_refund_id:refund.id,status:refund.status==='processed'?'processed':'processing'}).eq('id',row.id)}catch(fail){console.error('FAILED REFUND — MANUAL ACTION REQUIRED',fail);await admin.from('fd_refunds').update({status:'failed'}).eq('id',row.id)}}
        }
      }
    }
  }
 }
 if(event.event==='refund.processed'||event.event==='refund.failed'){
  const refund=event.payload.refund.entity;await admin.from('fd_refunds').update({status:event.event==='refund.processed'?'processed':'failed',updated_at:new Date().toISOString()}).eq('provider_refund_id',refund.id);if(event.event==='refund.processed'){const {data:row}=await admin.from('fd_refunds').select('payment_id').eq('provider_refund_id',refund.id).maybeSingle();if(row)await admin.from('fd_payments').update({status:'refunded'}).eq('id',row.payment_id)}
 }
 if(event.event==='payment.failed'){
  const pay=event.payload.payment.entity;const {data:p}=await admin.from('fd_payments').select('order_id').eq('provider_order_id',pay.order_id).maybeSingle();
  if(p)await admin.rpc('fd_release_unpaid_order',{p_order_id:p.order_id,p_reason:pay.error_description||'razorpay_payment_failed'});
 }
 return json({ok:true});
 }catch(e){return err(e)}});
