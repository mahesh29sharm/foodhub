import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url);
let ts;
try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=path.dirname(fileURLToPath(import.meta.url));
function load(file,dependencies={}){
 const code=ts.transpileModule(readFileSync(path.join(root,'../src/lib',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={},module={exports};
 vm.runInNewContext(code,{module,exports,require:name=>dependencies[name]||require(name),Date,Math,Intl}, {filename:file});
 return module.exports;
}
const types=load('types.ts');
const logic=load('logic.ts',{'./types':types});
const item=(price,offerPrice,id='dish')=>({item:{id,price_paise:price},offer:{id:`offer-${id}`,price_paise:offerPrice}});

test('one ₹30 deposit for any number of dishes',()=>{
 const catalog=[item(14500,11900,'momos'),item(9900,7900,'fries')];
 const cart=[{itemId:'momos',offerId:'offer-momos',quantity:1},{itemId:'fries',offerId:'offer-fries',quantity:2}];
 assert.equal(logic.cartTotal(cart,catalog),27700);
 assert.equal(types.balance(27700,types.DEPOSIT_PAISE),24700);
});
test('10% and 20% presets round to rupee and does not mutate menu price',()=>{
 assert.equal(logic.seededDiscount(14500,20),11600);
 assert.equal(logic.seededDiscount(14500,10),13100);
 assert.equal(types.discount(14500,11600),20);
});
test('checkout refuses empty carts and missing offer IDs',()=>{
 const catalog=[item(14500,11900,'momos')];
 assert.equal(logic.cartEligible([],catalog),false);
 assert.equal(logic.cartEligible([{itemId:'momos',offerId:'stale',quantity:1}],catalog),false);
 assert.equal(logic.cartEligible([{itemId:'momos',offerId:'offer-momos',quantity:1}],catalog),true);
});
test('Indian mobile numbers are normalized for phone OTP',()=>{
 assert.equal(logic.parseShopperPhone('98765 43210'),'+919876543210');
 assert.equal(logic.parseShopperPhone('919876543210'),'+919876543210');
 assert.equal(logic.parseShopperPhone('999'),null);
});
test('offers are hidden when paused or sold out',()=>{
 const now=Date.now();const row={is_active:true,stock_total:10,stock_reserved:10,starts_at:new Date(now-60000).toISOString(),ends_at:new Date(now+60000).toISOString()};
 assert.equal(types.available(row),false);
 assert.equal(types.available({...row,stock_reserved:9}),true);
 assert.equal(types.available({...row,stock_reserved:9,is_active:false}),false);
});
test('everyday offers recur in Asia/Kolkata and default day-long offers stay discoverable',()=>{
 const allDay={is_active:true,is_everyday:true,stock_total:10,stock_reserved:2,starts_at:'2026-10-12T12:19:04.924Z',ends_at:'2026-10-13T12:20:04.924Z'};
 assert.equal(types.available(allDay,Date.parse('2026-10-14T11:49:57Z')),true);
 assert.equal(types.availabilityWindow(allDay),'Available every day');
 const lunch={...allDay,starts_at:'2026-10-12T06:30:00Z',ends_at:'2026-10-12T09:30:00Z'}; // 12:00–15:00 IST
 assert.equal(types.available(lunch,Date.parse('2026-10-14T07:00:00Z')),true);
 assert.equal(types.available(lunch,Date.parse('2026-10-14T10:00:00Z')),false);
});
