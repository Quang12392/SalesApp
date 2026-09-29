const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
function setup(url='https://test.invalid',store=new Map()){
 const button={disabled:false,textContent:'TRẢ HÀNG'},input={disabled:false},locked={disabled:true};
 const controls=[button,input,locked];
 const nodes=new Map();
 const document={getElementById:id=>{if(id==='return-confirm')return button;if(!nodes.has(id))nodes.set(id,{value:'test',style:{},textContent:''});return nodes.get(id);},querySelector:()=>({value:'1'}),querySelectorAll:s=>s==='.return-item-check'?[{checked:true,dataset:{idx:'0'}}]:s.includes('button')?controls:[input,locked]};
 const storage={getItem:k=>k==='khs_api_url'?url:store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const timers=[];const ctx={document,confirm:()=>true,fmtd:String,AbortController,crypto:require('node:crypto').webcrypto,localStorage:storage,setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length;},clearTimeout(){}};
 const app=vm.runInNewContext('({'+src.slice(src.indexOf('  returnLineRemaining('),src.indexOf('  // ═════════ SETTINGS'))+'})',ctx);ctx.App=app;
 Object.assign(app,{user:{username:'owner',displayName:'Test'},returnSubmitting:false,returns:[],orders:[],batches:[],products:[{sku:'S'}],returnSelectedOrder:{id:'A',items:[{sku:'S',name:'Synthetic',qty:1,price:100}]},isReturnableOrder:()=>true,getOrderReturnedQtyMap:()=>({}),getReturnItemKey:i=>`${i.sku}|${i.price}`,toMoneyNumber:Number,showSheetProgress(){app.progress=true;},hideSheetProgress(){app.progress=false;},showSheetError(t,m){app.failure=m;},toast(){},invalidateCustomerAccounting(){app.invalidated=true;},saveCacheValue:async()=>{},closeReturn(){app.closed=true;},autoSync(){throw Error('Must not full-sync');}});
 return {app,button,controls,timers,store,storage,ctx,nodes};
}
function receipt(app){const r=app.getPendingReturn().request;return {success:true,returnSaveVersion:2,orderId:r.orderId,returnId:r.returnId,affectedSkus:['S'],products:[{sku:'S',stock:6,costPrice:40,sellPrice:100}],batches:[{id:'new',sku:'S'}],returns:[{id:r.returnId,orderId:r.orderId,items:r.items,returnTotal:r.returnTotal}]};}
test('return popup covers request, locks form and prevents duplicate sends until confirmation',async()=>{
 const {app,controls,button}=setup();let finish,calls=0;app.apiFetch=()=>{calls++;return new Promise(r=>finish=r);};
 const pending=app.processReturn();assert.equal(app.progress,true);assert.ok(controls.every(c=>c.disabled));assert.equal(app.returns.length,0);
 await app.processReturn();assert.equal(calls,1);
 finish({json:async()=>receipt(app)});await pending;
 assert.equal(app.progress,false);assert.equal(app.returnSubmitting,false);assert.equal(app.returns.length,1);assert.equal(app.closed,true);
 assert.equal(button.textContent,'TRẢ HÀNG');assert.deepEqual(controls.map(c=>c.disabled),[false,false,true]);
});
test('server rejection cleans up popup, retains form and shows an error',async()=>{
 const {app,button}=setup();app.apiFetch=async()=>({json:async()=>({success:false,error:'Rejected'})});await app.processReturn();
 assert.equal(app.progress,false);assert.match(app.failure,/Rejected/);assert.equal(app.returns.length,0);assert.equal(app.closed,undefined);assert.equal(button.disabled,false);
});
test('uncertain network failure warns to check saved receipt, never reports local success',async()=>{
 const {app}=setup();app.apiFetch=async()=>{throw Error('offline');};await app.processReturn();
 assert.match(app.failure,/Chưa xác nhận/);assert.match(app.failure,/trước khi thao tác lại/);assert.equal(app.returns.length,0);assert.equal(app.progress,false);
});
test('no API cannot report a successful return',async()=>{
 const {app}=setup('');await app.processReturn();assert.match(app.failure,/Chưa cấu hình/);assert.equal(app.returns.length,0);assert.equal(app.returnSubmitting,false);
});
test('90 second bound aborts the request without a retry and releases form',async()=>{
 const {app,timers}=setup();let calls=0;app.apiFetch=async(u,o)=>{calls++;return new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(Error('timeout'))));};
 const pending=app.processReturn();timers.find(t=>t.ms===90000).f();await pending;
 assert.equal(calls,1);assert.equal(app.progress,false);assert.equal(app.returnSubmitting,false);assert.match(app.failure,/Chưa xác nhận/);
});

test('lost response survives restart and replays the identical immutable payload, including zero refund',async()=>{
 const h=setup();h.app._returnRefund=0;let sent;
 h.app.apiFetch=async(u,o)=>{sent=JSON.parse(o.body);throw Error('lost');};await h.app.processReturn();
 assert.equal(sent.returnTotal,0);assert.equal(sent.returnMutationVersion,2);assert.ok(h.app.getPendingReturn().attempted);
 const next=setup('https://test.invalid',h.store);next.app._returnRefund=999;next.app.isReturnableOrder=()=>false;
 next.app.apiFetch=async(u,o)=>{assert.deepEqual(JSON.parse(o.body),sent);return {json:async()=>({...receipt(next.app),replayed:true})};};
 await next.app.processReturn();assert.equal(next.app.closed,true);assert.equal(next.store.size,0);assert.equal(next.app.returns.length,1);assert.equal(next.app.products[0].stock,6);
});
test('scoped receipt updates only affected SKU and order, preserves coverage and inventory freshness',async()=>{
 const h=setup();Object.assign(h.app,{products:[{sku:'S',stock:5},{sku:'OTHER',stock:9}],batches:[{id:'old',sku:'S'},{id:'other',sku:'OTHER'}],returns:[{id:'unrelated',orderId:'B'}],orders:[{id:'B'}],orderCoverage:['keep'],productsLastSyncAt:'old-time',datasetSyncTimes:{products:'old-time',batches:'old-batches',returns:'old-returns'}});
 h.app.apiFetch=async()=>({json:async()=>receipt(h.app)});await h.app.processReturn();
 assert.equal(h.app.products[1].stock,9);assert.equal(h.app.batches[0].id,'other');assert.equal(h.app.returns[0].id,'unrelated');assert.equal(h.app.returnSelectedOrder.returns.length,1);
 assert.deepEqual(h.app.orders,[{id:'B'}]);assert.deepEqual(h.app.orderCoverage,['keep']);assert.equal(h.app.productsLastSyncAt,'old-time');assert.equal(h.app.datasetSyncTimes.batches,'old-batches');assert.equal(h.app.datasetSyncTimes.returns,'');assert.equal(h.app.invalidated,true);
 assert.ok(!h.timers.some(t=>t.ms===3000));
});
test('malformed or legacy success keeps request and never changes stock',async()=>{
 for(const mutate of [()=>({success:true}),r=>({...r,affectedSkus:['OTHER']}),r=>({...r,returns:[]}),r=>({...r,products:[{sku:'S',stock:-1}]})]){
  const h=setup();h.app.apiFetch=async()=>({json:async()=>mutate(receipt(h.app))});await h.app.processReturn();assert.ok(h.app.getPendingReturn());assert.equal(h.app.products[0].stock,undefined);assert.equal(h.app.closed,undefined);
 }
});
test('storage failure before submission prevents writes; cache failure after confirmation is not a failed return',async()=>{
 const h=setup();let calls=0;h.storage.setItem=()=>{throw Error('quota');};h.app.apiFetch=async()=>calls++;await h.app.processReturn();assert.equal(calls,0);
 const next=setup();next.app.saveCacheValue=async()=>{throw Error('cache');};next.app.apiFetch=async()=>({json:async()=>receipt(next.app)});await next.app.processReturn();assert.equal(next.app.closed,true);assert.equal(next.store.size,0);
});
test('known first rejection permits correction; an uncertain earlier attempt is never discarded by a later rejection',async()=>{
 const h=setup();h.app.apiFetch=async()=>({json:async()=>({success:false,notSubmitted:true,error:'invalid'})});await h.app.processReturn();assert.equal(h.store.size,0);
 h.app.apiFetch=async()=>{throw Error('lost');};await h.app.processReturn();const id=h.app.getPendingReturn().request.clientRequestId;
 h.app.apiFetch=async()=>({json:async()=>({success:false,notSubmitted:true,error:'invalid'})});await h.app.processReturn();assert.equal(h.app.getPendingReturn().request.clientRequestId,id);
});
test('logout while submitting cannot apply another accounts return or delete original pending request',async()=>{
 const h=setup();let finish;h.app.apiFetch=()=>new Promise(r=>finish=r);const pending=h.app.processReturn(),result=receipt(h.app);
 h.app.user={username:'different'};finish({json:async()=>result});await pending;assert.equal(h.app.products[0].stock,undefined);assert.equal(h.store.size,1);assert.equal(h.app.closed,undefined);
});
test('reopening return form restores pending order and disables editing, without loading global datasets',async()=>{
 const h=setup();h.app.apiFetch=async()=>{throw Error('lost');};await h.app.processReturn();
 const next=setup('https://test.invalid',h.store);
 Object.assign(next.app,vm.runInNewContext('({'+src.slice(src.indexOf('  openReturn()'),src.indexOf('  closeReturn()'))+'})',next.ctx));
 next.app.returnStep1=()=>{};next.app.renderReturnOrders=()=>{};next.app.selectReturnOrder=(id,order,recovering)=>{assert.equal(recovering,true);next.app.returnSelectedOrder=order;};
 next.app.openReturn();assert.match(next.nodes.get('return-title').textContent,/TH/);assert.equal(next.controls[1].disabled,true);assert.equal(next.button.textContent,'KIỂM TRA PHIẾU ĐANG CHỜ');
});
test('order-scoped lookup requires scope metadata and supports an authoritative empty ledger',async()=>{
 const h=setup();h.app.fetchApiJson=async(url,opts)=>{assert.match(url,/orderId=A/);assert.equal(opts.retries,0);assert.equal(opts.timeoutMs,30000);return {meta:{scope:'order',orderId:'A'},data:[]};};
 assert.equal((await h.app.fetchOrderReturns('A')).length,0);
 for(const result of [{data:[]},{meta:{scope:'order',orderId:'B'},data:[]},{meta:{scope:'order',orderId:'A'},data:[{orderId:'B',items:[]}]}]){h.app.fetchApiJson=async()=>result;await assert.rejects(h.app.fetchOrderReturns('A'));}
});
test('late whole-catalog or ledger reads cannot overwrite a newer scoped return',async()=>{
 for(const kind of ['products','returns','batches','customers']){
  const h=setup(),part=kind==='products'?src.slice(src.indexOf('  async refreshProductsOnly('),src.indexOf('  async refreshInventoryOnly(')):src.slice(src.indexOf('  async refreshArrayDataset('),src.indexOf('  async refreshStoreConfigOnly('));
  Object.assign(h.app,vm.runInNewContext('({'+part+'})',h.ctx));let finish;h.app.fetchApiJson=()=>new Promise(r=>finish=r);
  const pending=kind==='products'?h.app.refreshProductsOnly():h.app.refreshArrayDataset(kind,'getReturns');
  h.app._returnDataEpoch=1;finish({data:[],customerStatsVersion:1});await assert.rejects(pending,/phản hồi cũ/);
  assert.equal(h.app.products.length,1);
 }
});
test('duplicate identical sale lines consume past returns once, gift price remains separate',()=>{
 const h=setup();h.app.getOrderReturnedQtyMap=()=>({'S|100':2});const items=[{sku:'S',qty:2,price:100},{sku:'S',qty:3,price:100},{sku:'S',qty:1,price:0}];
 assert.deepEqual(Array.from(h.app.returnLineRemaining({items})),[0,3,1]);
});
