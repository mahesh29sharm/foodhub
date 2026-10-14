import {admin,customer,json,err,razorpay,cors} from '../_shared/common.ts';
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response(null,{headers:cors});try{
 const {client}=await customer(req);const {order_id}=await req.json();
 // Full refund only while waiting for merchant acceptance. Later cancellations require merchant policy/manual support.
 const {error}=await client.rpc('fd_customer_cancel_reservation',{p_order_id:order_id});if(error)throw error;
 const {data:p}=await admin.from('fd_payments').select('id,provider_payment_id').eq('order_id',order_id).single();
 if(p?.provider_payment_id){const {data:exists}=await admin.from('fd_refunds').select('id').eq('payment_id',p.id).maybeSingle();if(!exists){const {data:row}=await admin.from('fd_refunds').insert({payment_id:p.id,amount_paise:3000,reason:'cancel_before_acceptance',status:'pending'}).select('id').single();if(row)try{const x=await razorpay(`payments/${p.provider_payment_id}/refund`,'POST',{amount:3000});await admin.from('fd_refunds').update({provider_refund_id:x.id,status:x.status==='processed'?'processed':'processing'}).eq('id',row.id)}catch(e){await admin.from('fd_refunds').update({status:'failed'}).eq('id',row.id);console.error(e)}}}
 return json({ok:true,refund:'initiated'});
 }catch(e){return err(e)}});
