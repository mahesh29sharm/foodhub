import {admin,json,err,authenticateDispatcher,cors} from '../_shared/common.ts';
import {whatsAppTemplate} from '../_shared/communications.ts';
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response(null,{headers:cors});try{
 authenticateDispatcher(req);
 if(!Deno.env.get('META_WHATSAPP_TOKEN')||!Deno.env.get('META_PHONE_NUMBER_ID'))throw Error('WhatsApp is not configured');
 const now=new Date();const localDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const {data:restaurants}=await admin.from('fd_restaurants').select('id,name,slug').eq('is_active',true);
 let sent=0,skipped=0;
 for(const restaurant of restaurants||[]){
  const {data:deals}=await admin.from('fd_offers').select('price_paise,fd_menu_items(name),stock_total,stock_reserved').eq('restaurant_id',restaurant.id).eq('is_active',true).lte('starts_at',now.toISOString()).gte('ends_at',now.toISOString()).order('featured_rank',{ascending:true,nullsFirst:false}).limit(3);
  const offer=deals?.find((o:any)=>o.stock_total>o.stock_reserved);if(!offer)continue;
  const {data:followers}=await admin.from('fd_restaurant_followers').select('customer_id').eq('restaurant_id',restaurant.id).eq('whatsapp_marketing_opt_in',true);
  for(const f of followers||[]){
   const {data:existing}=await admin.from('fd_marketing_deliveries').select('id').eq('user_id',f.customer_id).eq('restaurant_id',restaurant.id).eq('day_local',localDay).maybeSingle();
   // Previous row query uses user_id (see below): unique constraint ensures daily cap regardless of retries.
   if(existing){skipped++;continue}
   const {data:row,error:ins}=await admin.from('fd_marketing_deliveries').insert({user_id:f.customer_id,restaurant_id:restaurant.id,day_local:localDay}).select('id').maybeSingle();if(ins||!row){skipped++;continue}
   try{const {data:u}=await admin.auth.admin.getUserById(f.customer_id);if(!u.user?.phone){skipped++;await admin.from('fd_marketing_deliveries').update({status:'no_phone'}).eq('id',row.id);continue}
    const name=(offer.fd_menu_items as any)?.name||'Today’s special';
    const site=(Deno.env.get('PUBLIC_SITE_URL')||'').replace(/\/$/,'');const link=`${site}/?r=${restaurant.slug}`;
    const id=await whatsAppTemplate(u.user.phone,'bl_daily_deal',[restaurant.name,name,`₹${(offer.price_paise/100).toFixed(0)}`,link]);
    await admin.from('fd_marketing_deliveries').update({status:'sent',provider_message_id:id}).eq('id',row.id);sent++;
   }catch(e){console.error(e);await admin.from('fd_marketing_deliveries').update({status:'failed'}).eq('id',row.id)}
  }
 }
 return json({ok:true,local_day:localDay,sent,skipped});
 }catch(e){return err(e)}});
