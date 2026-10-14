import {admin,json,err,verifyHmac,cors} from '../_shared/common.ts';
Deno.serve(async(req)=>{
 if(req.method==='GET'){
  const u=new URL(req.url);const token=Deno.env.get('META_VERIFY_TOKEN');
  if(u.searchParams.get('hub.mode')==='subscribe'&&token&&u.searchParams.get('hub.verify_token')===token)return new Response(u.searchParams.get('hub.challenge')||'',{status:200});
  return new Response('Verification failed',{status:403});
 }
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 try{const raw=await req.text(),sig=req.headers.get('X-Hub-Signature-256')||'',secret=Deno.env.get('META_APP_SECRET');
  if(!secret||!sig.startsWith('sha256=')||!(await verifyHmac(raw,sig.slice(7),secret)))return json({error:'Bad signature'},401);
  const event=JSON.parse(raw);
  for(const entry of event.entry||[])for(const change of entry.changes||[])for(const msg of change.value?.messages||[]){
   const body=(msg.text?.body||'').trim().toLowerCase();
   if(['stop','unsubscribe','cancel','opt out','remove'].includes(body)){
    await admin.rpc('fd_unsubscribe_phone',{p_phone:msg.from});
    // Outbound acknowledgement can be enabled in the service window if needed.
   }
  }
  return json({ok:true});
 }catch(e){return err(e)}
});
