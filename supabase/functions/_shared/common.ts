import {createClient} from 'npm:@supabase/supabase-js@2';
export const base=Deno.env.get('SUPABASE_URL')!;
export const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
export const admin=createClient(base,service,{auth:{persistSession:false,autoRefreshToken:false}});
export const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-dispatch-secret','Access-Control-Allow-Methods':'POST, OPTIONS'};
export function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...cors}})}
export function errorMessage(e:unknown){
 const seen=new Set<unknown>();
 const read=(value:unknown,depth:number):string=>{
  if(depth>5||value==null)return '';
  if(typeof value==='string'){
   const text=value.trim();
   if(!text||text==='[object Object]')return '';
   if((text.startsWith('{')||text.startsWith('['))&&text.length<10000){try{const nested=read(JSON.parse(text),depth+1);if(nested)return nested}catch{/* ordinary text */}}
   return text;
  }
  if(typeof value!=='object'||seen.has(value))return '';
  seen.add(value);
  const object=value as Record<string,unknown>;
  for(const key of ['error','message','details','hint','description','cause']){const nested=read(object[key],depth+1);if(nested)return nested}
  return typeof object.code==='string'?`Database error ${object.code}`:'';
 };
 return read(e,0)||'Unexpected server error';
}
export function err(e:unknown,status=400){const message=errorMessage(e);console.error(message);return json({error:message},status)}
export async function customer(req:Request){const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)throw Error('Sign in required');const {data,error}=await admin.auth.getUser(token);if(error||!data.user)throw Error('Invalid session');return {user:data.user,client:createClient(base,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{autoRefreshToken:false,persistSession:false}})};}
export async function razorpay(path:string,method='GET',payload?:unknown){const key=Deno.env.get('RAZORPAY_KEY_ID'),secret=Deno.env.get('RAZORPAY_KEY_SECRET');if(!key||!secret)throw Error('Configure Razorpay secrets first');const resp=await fetch(`https://api.razorpay.com/v1/${path}`,{method,headers:{Authorization:'Basic '+btoa(`${key}:${secret}`),'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});const data=await resp.json();if(!resp.ok)throw Error(`Razorpay: ${JSON.stringify(data.error||data)}`);return data;}
export async function verifyHmac(message:string,signature:string,secret:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);if(!/^[0-9a-f]{64}$/i.test(signature))return false;return crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g)!,x=>parseInt(x,16)),new TextEncoder().encode(message));}
export function authenticateDispatcher(req:Request){const expected=Deno.env.get('DISPATCH_SECRET');if(!expected||req.headers.get('x-dispatch-secret')!==expected)throw Error('Dispatcher secret invalid');}
