import {CartEntry,DisplayItem,DEPOSIT_PAISE} from './types';
export function cartTotal(cart:CartEntry[],catalog:DisplayItem[]){return cart.reduce((sum,line)=>{const found=catalog.find(x=>x.item.id===line.itemId);return sum+(found?(found.offer?.price_paise??found.item.price_paise)*line.quantity:0)},0)}
export function cartEligible(cart:CartEntry[],catalog:DisplayItem[]){return cart.length>0&&cartTotal(cart,catalog)>DEPOSIT_PAISE&&cart.every(c=>c.quantity>0&&catalog.some(x=>x.item.id===c.itemId&&x.offer?.id===c.offerId));}
export function seededDiscount(price:number,pct:10|15|20|25|30){return Math.round(price*(100-pct)/100/100)*100;}
export function parseShopperPhone(phone:string){const digits=phone.replace(/\D/g,'');return digits.length===10?'+91'+digits:digits.length===12&&digits.startsWith('91')?'+'+digits:null;}
