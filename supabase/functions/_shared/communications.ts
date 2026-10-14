export async function whatsAppTemplate(phone:string,name:string,args:string[]){const token=Deno.env.get('META_WHATSAPP_TOKEN'),phoneId=Deno.env.get('META_PHONE_NUMBER_ID');if(!token||!phoneId)throw Error('WhatsApp Business credentials not configured');
 const language=Deno.env.get('META_TEMPLATE_LANGUAGE')||'en';const version=Deno.env.get('META_GRAPH_VERSION')||'v24.0';
 const response=await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({messaging_product:'whatsapp',to:phone.replace(/\D/g,''),type:'template',template:{name,language:{code:language},components:[{type:'body',parameters:args.map(text=>({type:'text',text}))}]}})});
 const result=await response.json();if(!response.ok)throw Error(`WhatsApp: ${JSON.stringify(result.error||result)}`);return result.messages?.[0]?.id||null;
}
export async function sendBrowserPush(subscriptions:any[],message:{title:string;body:string;url:string}){
 const pub=Deno.env.get('VAPID_PUBLIC_KEY'),priv=Deno.env.get('VAPID_PRIVATE_KEY');if(!pub||!priv)return {sent:0,skipped:true};
 const webpush=(await import('npm:web-push@3.6.7')).default;
 webpush.setVapidDetails(Deno.env.get('VAPID_CONTACT')||'mailto:hello@example.com',pub,priv);
 let sent=0;for(const sub of subscriptions){try{await webpush.sendNotification(sub.subscription,JSON.stringify(message));sent++}catch(e){console.warn('Web push failed',sub.endpoint,e)}}return {sent};
}
