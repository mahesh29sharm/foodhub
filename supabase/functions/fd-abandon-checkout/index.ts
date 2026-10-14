import {admin,customer,json,err,cors} from '../_shared/common.ts';
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response(null,{headers:cors});try{
 const {user}=await customer(req);const {order_id,reason}=await req.json();if(!order_id)throw Error('Missing reservation ID');
 const {data:order,error:readError}=await admin.from('fd_orders').select('customer_id,status').eq('id',order_id).single();
 if(readError||!order||order.customer_id!==user.id)throw Error('Not your reservation');
 if(order.status!=='pending_payment')return json({ok:true,released:false});
 const {error}=await admin.rpc('fd_release_unpaid_order',{p_order_id:order_id,p_reason:String(reason||'customer_checkout_interrupted')});if(error)throw error;
 return json({ok:true,released:true});
 }catch(e){return err(e)}});
