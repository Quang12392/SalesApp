const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/pos.js'),'utf8');
function harness(secure=false){
 const cache=new Map([['khs_api_url','https://example.test/api']]),errors=[];
 const app={_checkoutBackendReady:true,user:{username:'owner',displayName:'Owner'},orders:[],showSheetProgress(){},hideSheetProgress(){},waitForSheetPopupPaint:async()=>{},showSheetError:(...args)=>errors.push(args),toast(){}};
 const context={console,App:app,crypto:{randomUUID:()=> 'request-test'},AbortController,navigator:{onLine:true},window:{addEventListener(){}},document:{addEventListener(){},getElementById:()=>({value:'',checked:false,style:{},remove(){}}),querySelector:()=>({value:'Tiền mặt',prepend(){}}),querySelectorAll:()=>[]},localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)},setTimeout,clearTimeout};
 if(secure)context.KHS_AUTH={enabled:true};
 vm.createContext(context);vm.runInContext(source,context);const pos=vm.runInContext('POS',context);
 pos._setCheckoutBusy=()=>{};pos._resetCheckoutBtn=()=>{};pos.makeLineId=()=> 'request-test';pos.updateSyncBadge=()=>{};
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/checkout.js'),'utf8'),context);
 return{pos,app,cache,errors};
}
test('authentication failure before submission retains cart and does not create or queue an order',async()=>{
 const h=harness();h.pos.cart=[{sku:'SKU',name:'Item',qty:1,price:10}];let queued=0;
 h.pos.addToSyncQueue=()=>{queued++;};
 h.app.apiFetch=async()=>{throw Object.assign(new Error('Need login'),{code:'AUTH_REQUIRED',notSubmitted:true});};
 await h.pos.checkout();assert.equal(h.pos.cart.length,1);assert.equal(h.app.orders.length,0);assert.equal(queued,0);assert.equal(h.errors.length,1);
});
test('queue preserves every untouched entry on auth rejection or network failure',async()=>{
 for(const network of [false,true]){
  const h=harness();const queued=[{clientRequestId:'a'},{clientRequestId:'b'},{clientRequestId:'c'}];
  h.cache.set('khs_sync_queue',JSON.stringify(queued));
  h.app.apiFetch=async()=>{if(network)throw new Error('offline');return {status:401,json:async()=>({success:false,code:'AUTH_REQUIRED'})};};
  await h.pos.processSyncQueue();assert.deepEqual(JSON.parse(h.cache.get('khs_sync_queue')),queued);
 }
});
test('uncertain secure checkout keeps a durable request but never records completion or creates an old queue entry',async()=>{
 for(const network of [false,true]){
  const h=harness(true);let closed=false;h.pos.close=()=>{closed=true;};
  h.pos.cart=[{sku:'SKU',name:'Item',qty:1,price:10}];
  h.app.apiFetch=async()=>{if(network)throw new Error('offline');return {json:async()=>({success:false,code:'UPSTREAM_UNCONFIRMED'})};};
  await h.pos.checkout();const pending=JSON.parse(h.cache.get('khs_checkout_v2:owner'));
  assert.equal(pending.request.clientRequestId,'checkout:request-test');assert.equal(pending.username,'owner');assert.equal(h.cache.has('khs_sync_queue'),false);
  assert.equal(h.app.orders.length,0);assert.equal(closed,false);assert.equal(h.errors.length,1);
 }
});
