import {admin,customer,json,err,razorpay,verifyHmac,cors} from '../_shared/common.ts';
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response(null,{headers:cors});try{
 const {user}=await customer(req);const {order_id,razorpay_order_id,razorpay_payment_id,razorpay_signature}=await req.json();
 if(!order_id||!razorpay_order_id||!razorpay_payment_id||!razorpay_signature)throw Error('Missing payment confirmation fields');
 const {data:order,error:oe}=await admin.from('fd_orders').select('customer_id,status').eq('id',order_id).single();if(oe||order.customer_id!==user.id)throw Error('Not your reservation');
 const {data:payment,error:pe}=await admin.from('fd_payments').select('provider_order_id,amount_paise,status').eq('order_id',order_id).single();
 if(pe||payment.provider_order_id!==razorpay_order_id)throw Error('Order ID mismatch');
 const correct=await verifyHmac(`${payment.provider_order_id}|${razorpay_payment_id}`,razorpay_signature,Deno.env.get('RAZORPAY_KEY_SECRET')!);
 if(!correct)throw Error('Invalid payment signature');
 const actual=await razorpay(`payments/${encodeURIComponent(razorpay_payment_id)}`);
 if(actual.order_id!==razorpay_order_id||actual.amount!==3000||actual.currency!=='INR'||actual.status!=='captured')throw Error('Payment not yet captured. Please check your order status.');
 const {error}=await admin.rpc('fd_mark_deposit_captured',{p_order_id:order_id,p_provider_order_id:razorpay_order_id,p_payment_id:razorpay_payment_id});
 if(error)throw error;return json({ok:true,order_id});
 }catch(e){return err(e)}});
