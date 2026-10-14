import {admin,json,err,authenticateDispatcher,cors,razorpay} from '../_shared/common.ts';
import {sendBrowserPush,whatsAppTemplate} from '../_shared/communications.ts';
const templates:Record<string,string>={order_awaiting_acceptance:'bl_merchant_new_order',order_accepted:'bl_customer_order_accepted',order_ready:'bl_customer_order_ready',order_rejected:'bl_customer_order_rejected',order_completed:'bl_customer_order_completed'};
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response(null,{headers:cors});try{
 authenticateDispatcher(req);
 const {data:expired,error:expErr}=await admin.rpc('fd_expire_unpaid_reservations');if(expErr)console.error('Expiry cleanup failed',expErr.message);
 // Merchant no-response protection: cancel after five minutes and initiate refund using the same audited path.
 const cutOff=new Date(Date.now()-5*60000).toISOString();
 const {data:timedOut}=await admin.from('fd_orders').select('id,restaurant_id').eq('status','awaiting_acceptance').lt('updated_at',cutOff).limit(20);
 for(const o of timedOut||[]){
  const {data:p}=await admin.from('fd_payments').select('id,provider_payment_id').eq('order_id',o.id).single();
  const {error:cancelErr}=await admin.rpc('fd_timeout_reject_order',{p_order_id:o.id});if(cancelErr){console.error(cancelErr.message);continue}
  if(p?.provider_payment_id){const {data:already}=await admin.from('fd_refunds').select('id').eq('payment_id',p.id).maybeSingle();if(!already){const {data:row}=await admin.from('fd_refunds').insert({payment_id:p.id,reason:'merchant_timeout',amount_paise:3000,status:'pending'}).select('id').single();if(row){try{const rz=await razorpay(`payments/${p.provider_payment_id}/refund`,'POST',{amount:3000});await admin.from('fd_refunds').update({status:rz.status==='processed'?'processed':'processing',provider_refund_id:rz.id}).eq('id',row.id)}catch(e){console.error(e);await admin.from('fd_refunds').update({status:'failed'}).eq('id',row.id)}}}}
 }
 const {data:queue,error:qerr}=await admin.from('fd_notification_outbox').select('*,fd_orders(customer_id,status,mode)').is('sent_at',null).lte('due_at',new Date().toISOString()).lt('attempts',5).order('created_at').limit(30);if(qerr)throw qerr;
 let done=0;
 for(const job of queue||[]){try{
  const order=job.fd_orders;const recipients:string[]=[];const phones:string[]=[];
  if(job.audience==='merchant'){
    const {data:staff}=await admin.from('fd_restaurant_staff').select('user_id,contact_phone,alert_whatsapp_opt_in').eq('restaurant_id',job.restaurant_id);
    for(const member of staff||[]){recipients.push(member.user_id);if(member.alert_whatsapp_opt_in&&member.contact_phone)phones.push(member.contact_phone)}
  }else if(order?.customer_id){recipients.push(order.customer_id);const {data:user}=await admin.auth.admin.getUserById(order.customer_id);const {data:profile}=await admin.from('fd_customer_profiles').select('whatsapp_opt_in').eq('id',order.customer_id).maybeSingle();if(profile?.whatsapp_opt_in&&user?.user?.phone)phones.push(user.user.phone)}
  const {data:subs}=await admin.from('fd_push_subscriptions').select('endpoint,subscription').eq('enabled',true).in('user_id',recipients.length?recipients:['00000000-0000-0000-0000-000000000000']);
  const site=(Deno.env.get('PUBLIC_SITE_URL')||'').replace(/\/$/,'');const url=job.audience==='merchant'?`${site}/merchant`:`${site}/?view=orders`;
  const titles:Record<string,string>={order_awaiting_acceptance:'New paid reservation!',order_accepted:'Booking confirmed',order_ready:'Your food is ready',order_rejected:'Booking rejected — refund initiated',order_completed:'Order completed'};
  const msg={title:titles[job.event_type]||'Order update',body:`Order ${job.order_id?.slice(0,8)}`,url};
  await sendBrowserPush(subs||[],msg);
  // Do not send a WhatsApp template until it is approved in the Meta dashboard.
  if(phones.length&&templates[job.event_type]){for(const phone of phones){await whatsAppTemplate(phone,templates[job.event_type],[job.order_id?.slice(0,8)||''])}}
  await admin.from('fd_notification_outbox').update({sent_at:new Date().toISOString(),last_error:null}).eq('id',job.id);done++;
 }catch(e){await admin.from('fd_notification_outbox').update({attempts:job.attempts+1,last_error:String(e).slice(0,500),due_at:new Date(Date.now()+Math.pow(2,job.attempts)*60000).toISOString()}).eq('id',job.id)}}
 return json({ok:true,expired,processed:done,queued:queue?.length||0});
 }catch(e){return err(e)}});
