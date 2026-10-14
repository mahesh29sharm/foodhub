export type Restaurant = {id:string; slug:string; name:string; address:string; phone:string; whatsapp_business_phone?:string|null; accepting_orders:boolean; is_active:boolean; logo_url?:string|null; prep_buffer_minutes:number; pickup_enabled:boolean; dinein_enabled:boolean};
export type MenuItem = {id:string; restaurant_id:string; name:string; description:string; category:string; dietary:'veg'|'nonveg'|'egg'; price_paise:number; prep_minutes:number; image_url:string|null; image_path:string|null; emoji:string; is_active:boolean; is_persistent:boolean; deleted_at:string|null};
export type Offer = {id:string; restaurant_id:string; menu_item_id:string; price_paise:number; stock_total:number; stock_reserved:number; is_active:boolean; featured_rank:number|null; is_everyday:boolean; starts_at:string; ends_at:string; preset_percent:number|null};
export type DisplayItem = {item:MenuItem; offer:Offer|null};
export type CartEntry = {itemId:string; offerId:string|null; quantity:number};
export type Fulfillment = 'pickup'|'dinein';
export type OrderState='pending_payment'|'awaiting_acceptance'|'accepted'|'preparing'|'ready'|'completed'|'rejected'|'cancelled'|'expired'|'no_show';
export type MerchantOrderAction=OrderState|'accept_and_prepare';
export type Order = {id:string; restaurant_id:string; customer_id?:string; status:OrderState; payment_status?:string; refund_status?:string|null; mode:Fulfillment; customer_name:string; customer_phone:string; arrival_at:string; total_paise:number; deposit_paise:number; balance_paise:number; balance_paid:boolean; balance_method?:string; code:string; created_at:string; rows:{menu_item_id:string;offer_id:string;name:string;quantity:number;unit_paise:number}[]};
export type OfferPatch = Partial<Pick<Offer,'price_paise'|'stock_total'|'featured_rank'|'is_active'|'is_everyday'|'starts_at'|'ends_at'|'preset_percent'>>;
export type Profile = {id:string; full_name:string|null; phone_e164:string|null; phone_verified:boolean; phone_verified_at:string|null; first_restaurant_id:string|null; onboarding_completed_at:string|null; whatsapp_opt_in:boolean; marketing_opt_in:boolean; marketing_opt_in_at:string|null; marketing_opt_out_at:string|null; created_at:string; updated_at:string};
export const rupees=(paise:number)=>`₹${(paise/100).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
export const discount=(regular:number,price:number)=>regular>0?Math.round((1-price/regular)*100):0;
export const balance=(total:number,deposit:number)=>Math.max(0,total-deposit);
export const DEPOSIT_PAISE=3000;
const FULL_DAY_MS=23*60*60*1000+59*60*1000;
function kolkataSecondOfDay(value:number|string){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
 const part=(type:string)=>Number(parts.find(x=>x.type===type)?.value||0);
 return part('hour')*3600+part('minute')*60+part('second');
}
export function available(o:Offer|null,at=Date.now()){
 if(!o||!o.is_active||o.stock_reserved>=o.stock_total)return false;
 const starts=new Date(o.starts_at).getTime(),ends=new Date(o.ends_at).getTime();
 if(!Number.isFinite(starts)||!Number.isFinite(ends)||ends<=starts)return false;
 if(!o.is_everyday)return starts<=at&&ends>=at;
 // The merchant's default one-day window means an always-on everyday offer.
 if(ends-starts>=FULL_DAY_MS)return true;
 const now=kolkataSecondOfDay(at),start=kolkataSecondOfDay(starts),end=kolkataSecondOfDay(ends);
 return start<=end?now>=start&&now<=end:now>=start||now<=end;
}
export function availabilityWindow(o:Offer,locale='en-IN'){
 const options:Intl.DateTimeFormatOptions={timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit'};
 const starts=new Date(o.starts_at),ends=new Date(o.ends_at);
 if(o.is_everyday&&ends.getTime()-starts.getTime()>=FULL_DAY_MS)return 'Available every day';
 return `${o.is_everyday?'Available daily':'Available'} ${starts.toLocaleTimeString(locale,options)}–${ends.toLocaleTimeString(locale,options)}`;
}
