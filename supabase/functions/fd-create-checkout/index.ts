import {admin,customer,json,err,razorpay,cors} from '../_shared/common.ts';
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 try{
  const {client}=await customer(req);
  const body=await req.json();
  const {restaurant_id,mode,arrival_at,items}=body;
  if(!restaurant_id||!Array.isArray(items))throw Error('Invalid checkout request');
  // SECURITY DEFINER RPC locks offer stock and computes the price, never trusting client totals.
  const {data:orderId,error:reserveError}=await client.rpc('fd_reserve_checkout',{p_restaurant_id:restaurant_id,p_mode:mode,p_arrival_at:arrival_at,p_lines:items});
  if(reserveError)throw reserveError;
  try{
   const keyId=Deno.env.get('RAZORPAY_KEY_ID');if(!keyId?.startsWith('rzp_test_'))throw Error('Razorpay test-mode key is required');
   const rz=await razorpay('orders','POST',{amount:3000,currency:'INR',receipt:`fd_${orderId}`,notes:{booking_id:orderId,restaurant_id}});
   const {error:paymentError}=await admin.from('fd_payments').update({provider_order_id:rz.id}).eq('order_id',orderId);if(paymentError)throw paymentError;
   return json({order_id:orderId,razorpay_order_id:rz.id,amount:3000,key_id:keyId});
  }catch(e){await admin.rpc('fd_release_unpaid_order',{p_order_id:orderId,p_reason:'razorpay_order_creation_failed'});throw e}
 }catch(e){return err(e)}
});
