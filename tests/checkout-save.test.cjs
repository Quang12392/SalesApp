const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const posSource=fs.readFileSync(path.join(__dirname,'../js/pos.js'),'utf8'),checkoutSource=fs.readFileSync(path.join(__dirname,'../js/checkout.js'),'utf8');
function setup(store=new Map(),tiktok=false){
  const nodes=new Map(),timers=[];
  function node(id){if(!nodes.has(id))nodes.set(id,{id,value:'',checked:false,disabled:false,style:{},classList:{remove(){},add(){},toggle(){}},remove(){nodes.delete(this.id);},prepend(n){nodes.set(n.id,n);}});return nodes.get(id);}
  node('pos-overlay').style.display='flex';node('btn-checkout').disabled=false;
  const input=node('pos-note'),locked=node('locked');locked.disabled=true;
  const document={getElementById:id=>['sync-queue-badge','pos-checkout-pending'].includes(id)?nodes.get(id)||null:node(id),createElement:()=>({style:{},remove(){nodes.delete(this.id);}}),body:{appendChild:n=>nodes.set(n.id,n)},addEventListener(){},querySelector:s=>s==='.pos-cart-panel'?node('panel'):{value:'Tiền mặt'},querySelectorAll:s=>s.includes('#pos-overlay')?[node('btn-checkout'),input,locked,node('pos-close')]:[]};
  const storage={getItem:k=>k==='khs_api_url'?'https://test.invalid/api':store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  const app={_checkoutBackendReady:true,user:{username:'owner',displayName:'Owner'},orders:[],products:[{sku:'S',stock:8,costPrice:40,sellPrice:100},{sku:'OTHER',stock:9}],batches:[{id:'old',sku:'S'},{id:'other',sku:'OTHER'}],datasetSyncTimes:{products:'old'},productsLastSyncAt:'old',orderCoverage:['keep'],showSheetProgress(){this.progress=true;},hideSheetProgress(){this.progress=false;},waitForSheetPopupPaint:async()=>{},showSheetError(t,m){this.progress=false;this.error={t,m};},showSheetSuccess(t,m){this.success={t,m};},toast(){},invalidateCustomerAccounting(){this.invalidated=true;},saveCacheValue:async()=>{},updateOrderTable(){this.table=true;}};
  const context=vm.createContext({console,App:app,crypto:require('node:crypto').webcrypto,AbortController,navigator:{onLine:true},window:{addEventListener(){}},document,localStorage:storage,setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length;},clearTimeout(){}});
  vm.runInContext(posSource,context);const pos=vm.runInContext('POS',context);
  Object.assign(pos,{open(){node('pos-overlay').style.display='flex';},close(){this.closed=true;},renderCart(){},updateTotals(){},showSelectedCustomer(){},showInvoice(order){this.invoice=order;},deleteDraft(id){this.deletedDraft=id;},switchMobileView(){},_isMobile:()=>false});
  vm.runInContext(checkoutSource,context);
  pos.cart=[{sku:'S',name:'Item',qty:2,price:100,lineId:'line-1'}];if(tiktok)pos._tiktokOrderId='TK1';
  function receipt(){const record=pos.getPendingCheckout(),q=record.request;return {success:true,checkoutSaveVersion:2,clientRequestId:q.clientRequestId,orderId:q.orderId || 'DH1',affectedSkus:['S'],products:[{sku:'S',stock:6,costPrice:40,sellPrice:100}],batches:[{id:'L1',sku:'S',qtyRemaining:6}],order:{id:q.orderId || 'DH1',status:'completed',total:q.total,discount:q.discount,finalTotal:q.finalTotal,items:q.items.map(i=>({...i,costPrice:i.qty*40}))}};}
  return {pos,app,store,storage,nodes,input,locked,timers,receipt,context};
}
test('double click sends once, locks fields, updates only scoped data after receipt without a full refresh',async()=>{
  const h=setup(new Map(),true);let finish,calls=0;h.app.apiFetch=()=>{calls++;return new Promise(r=>finish=r);};
  const p=h.pos.checkout();await new Promise(r=>setImmediate(r));assert.equal(h.input.disabled,true);assert.equal(h.pos._checkoutInProgress,true);await h.pos.checkout();assert.equal(calls,1);assert.equal(h.app.orders.length,0);
  finish({json:async()=>h.receipt()});await p;
  assert.equal(h.app.orders[0].id,'TK1');assert.equal(h.app.products[0].stock,6);assert.equal(h.app.products[1].stock,9);assert.equal(h.app.batches[0].id,'other');assert.equal(h.pos.closed,true);assert.equal(h.app.progress,false);assert.equal(h.store.size,0);assert.equal(h.input.disabled,false);assert.equal(h.locked.disabled,true);
  assert.equal(h.app.productsLastSyncAt,'old');assert.equal(h.app.datasetSyncTimes.products,'old');assert.deepEqual(h.app.orderCoverage,['keep']);assert.equal(h.app.invalidated,true);assert.ok(!h.timers.some(t=>[500,2000,3000].includes(t.ms)));
});
test('uncertain TikTok response survives reload and check-only recovers the same immutable payload',async()=>{
  const h=setup(new Map(),true);let original;h.app.apiFetch=async(u,o)=>{original=JSON.parse(o.body);return {status:502,ok:false,json:async()=>({success:false,code:'UPSTREAM_UNCONFIRMED',error:'unknown'})};};await h.pos.checkout();
  assert.ok(h.pos.getPendingCheckout().attempted);assert.match(h.app.error.t,/chờ xác nhận/);assert.equal(h.app.orders.length,0);assert.equal(h.pos.closed,undefined);assert.equal(h.nodes.get('btn-checkout').textContent,'KIỂM TRA ĐƠN ĐANG CHỜ');
  const next=setup(h.store);next.pos.open();assert.equal(next.pos._tiktokOrderId,'TK1');assert.equal(next.pos.cart[0].qty,2);assert.equal(next.input.disabled,true);
  next.pos.cart[0].qty=999;next.app.apiFetch=async(u,o)=>{const sent=JSON.parse(o.body);assert.deepEqual({...sent,checkoutCheckOnly:false},original);return {json:async()=>({...next.receipt(),replayed:true})};};await next.pos.checkout();assert.equal(next.app.orders[0].items[0].qty,2);assert.equal(next.store.size,0);assert.equal(next.pos.closed,true);
});
test('ordinary sale is durable before send and a recovered receipt opens its actual server invoice',async()=>{
  const h=setup();h.pos.currentDraftId=77;h.pos.selectedCustomer={id:'KH',name:'Customer',phone:'0123'};h.app.apiFetch=async(u,o)=>{assert.ok(h.pos.getPendingCheckout());assert.equal(JSON.parse(o.body).customerPhone,'0123');throw Error('lost');};await h.pos.checkout();
  assert.equal(h.app.orders.length,0);assert.equal(h.store.has('khs_sync_queue'),false);
  const next=setup(h.store);next.app.apiFetch=async()=>({json:async()=>next.receipt()});await next.pos.checkout();assert.equal(next.pos.invoice.id,'DH1');assert.equal(next.pos.deletedDraft,77);assert.equal(next.app.orders.length,1);
});
test('check-only not found does not write; explicit retry uses the old request ID and body',async()=>{
  const h=setup();h.app.apiFetch=async()=>{throw Error('lost');};await h.pos.checkout();const saved=JSON.parse(JSON.stringify(h.pos.getPendingCheckout().request));
  h.app.apiFetch=async(u,o)=>{assert.equal(JSON.parse(o.body).checkoutCheckOnly,true);return {json:async()=>({success:false,code:'CHECKOUT_NOT_FOUND',notSubmitted:true})};};await h.pos.checkout();assert.equal(h.pos.getPendingCheckout().canRetry,true);
  h.app.apiFetch=async(u,o)=>{const p=JSON.parse(o.body);assert.equal(p.checkoutCheckOnly,false);assert.deepEqual(p,{...saved,checkoutCheckOnly:false,_authUsername:'owner'});return {json:async()=>h.receipt()};};await h.pos.checkout();assert.equal(h.store.size,0);
});
test('known first rejection unlocks cart; a rejection after unknown outcome cannot discard original request',async()=>{
  const h=setup();h.app.apiFetch=async()=>({json:async()=>({success:false,notSubmitted:true,error:'stock rejected'})});await h.pos.checkout();assert.equal(h.store.size,0);assert.equal(h.pos.cart.length,1);assert.equal(h.input.disabled,false);
  h.app.apiFetch=async()=>{throw Error('lost');};await h.pos.checkout();const id=h.pos.getPendingCheckout().request.clientRequestId;
  h.app.apiFetch=async()=>({json:async()=>({success:false,notSubmitted:true,error:'busy'})});await h.pos.checkout();assert.equal(h.pos.getPendingCheckout().request.clientRequestId,id);
});
test('malformed success never applies inventory or clears pending request',async()=>{
  for(const mutate of [()=>({success:true}),r=>({...r,clientRequestId:'wrong'}),r=>({...r,products:[{sku:'S',stock:-1}]}),r=>({...r,order:{...r.order,items:[]}})]){
    const h=setup();h.app.apiFetch=async()=>({json:async()=>mutate(h.receipt())});await h.pos.checkout();assert.ok(h.pos.getPendingCheckout());assert.equal(h.app.products[0].stock,8);assert.equal(h.app.orders.length,0);
  }
});
test('storage failure before sending cannot create a sale; cache failure after success cannot report a failed sale',async()=>{
  const h=setup();let calls=0;h.storage.setItem=()=>{throw Error('quota');};h.app.apiFetch=async()=>calls++;await h.pos.checkout();assert.equal(calls,0);assert.equal(h.pos.cart.length,1);
  const n=setup();n.app.saveCacheValue=async()=>{throw Error('cache');};n.app.apiFetch=async()=>({json:async()=>n.receipt()});await n.pos.checkout();assert.ok(n.app.success);assert.equal(n.store.size,0);assert.equal(n.app.orders.length,1);
});
test('timeout stops waiting once and preserves pending request',async()=>{
  const h=setup();let calls=0;h.app.apiFetch=async(u,o)=>{calls++;return new Promise((r,j)=>o.signal.addEventListener('abort',()=>j(Error('timeout'))));};const pending=h.pos.checkout();await new Promise(r=>setImmediate(r));h.timers.find(t=>t.ms===90000).f();await pending;assert.equal(calls,1);assert.ok(h.pos.getPendingCheckout());assert.equal(h.app.progress,false);
});
test('account change while awaiting response cannot apply another accounts receipt or delete its pending request',async()=>{
  const h=setup();let finish;h.app.apiFetch=()=>new Promise(r=>finish=r);const p=h.pos.checkout();await new Promise(r=>setImmediate(r));const result=h.receipt();h.app.user={username:'different'};finish({json:async()=>result});await p;assert.equal(h.app.orders.length,0);assert.equal(h.app.products[0].stock,8);assert.equal(h.store.size,1);
});
test('pending request prevents modifying cart, drafts or launching the old sync queue',async()=>{
  const h=setup();h.app.apiFetch=async()=>{throw Error('lost');};await h.pos.checkout();const before=JSON.stringify(h.pos.cart);h.pos.updateQty('line-1',1);h.pos.removeFromCart('line-1');h.pos.saveDraft();h.pos.loadDraft(99);assert.equal(JSON.stringify(h.pos.cart),before);
  h.store.set('khs_sync_queue',JSON.stringify([{action:'createOrder',clientRequestId:'legacy'}]));let calls=0;h.app.apiFetch=async()=>calls++;await h.pos.processSyncQueue();assert.equal(calls,0);h.pos.close();assert.equal(h.pos.closed,true);assert.ok(h.pos.getPendingCheckout());
});
test('auth failure definitely before submission retains cart with no queued or completed order',async()=>{
  const h=setup();h.app.apiFetch=async()=>{throw Object.assign(Error('login required'),{code:'AUTH_REQUIRED',notSubmitted:true});};await h.pos.checkout();assert.equal(h.store.size,0);assert.equal(h.pos.cart.length,1);assert.equal(h.app.orders.length,0);assert.equal(h.pos.closed,undefined);
});
test('an old backend cannot receive a business request or silently fall back to legacy checkout',async()=>{
  const h=setup();h.app._checkoutBackendReady=false;let calls=0;
  h.app.apiFetch=async url=>{calls++;assert.match(url,/action=getConfig/);return {json:async()=>({success:true,data:{}})};};
  await h.pos.checkout();assert.equal(calls,1);assert.equal(h.store.size,0);assert.equal(h.app.orders.length,0);assert.equal(h.pos.cart.length,1);assert.match(h.app.error.m,/Backend thanh toán mới/);
});
