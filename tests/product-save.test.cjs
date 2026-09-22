const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
const methods=source.slice(source.indexOf('  productPendingKey('),source.indexOf('\n  productModal('));
const base={id:'SKU',sku:'SKU',name:'Name',category:'Cat',sellPrice:200,costPrice:100,stock:10,unit:'hộp'};
const batch={qty:15,costPrice:200,importDate:'2026-09-22',note:'Note',customBatchId:'LOT-22092026'};
const receipt=()=>({success:true,productSaveVersion:2,checkedAt:'2026-09-22T00:00:00Z',product:{...base,stock:25,costPrice:160},batches:[{id:'LOT-1',sku:'SKU',qtyRemaining:10,costPrice:100},{id:'LOT-2',sku:'SKU',qtyRemaining:15,costPrice:200}],createdBatchIds:['LOT-2']});
function setup(store=new Map()){
 const storage={getItem:k=>k==='khs_api_url'?'https://example.test/api':store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const app=vm.runInNewContext('({'+methods+'})',{localStorage:storage,crypto:require('node:crypto').webcrypto,TextEncoder,AbortController,setTimeout,clearTimeout});
 Object.assign(app,{user:{username:'owner'},products:[{...base},{id:'OTHER',sku:'OTHER',stock:8}],batches:[{id:'old',sku:'SKU'},{id:'other',sku:'OTHER'}],productsLastSyncAt:'whole-catalog-time',datasetSyncTimes:{products:'old-products',batches:'old-batches'},saveCacheValue:async()=>{},showSheetProgress(){},compressImage:async()=> 'data:image/png;base64,compressed',saveProductImage:async()=>{}});
 return {app,store,storage};
}
const response=r=>({ok:true,json:async()=>r});
test('one inventory API, latest receipt applied only to its SKU, no global freshness claim',async()=>{
 const h=setup();let calls=0,payload;h.app.apiFetch=async(u,o)=>{calls++;payload=JSON.parse(o.body);return response(receipt());};
 await h.app.saveProductConfirmed(base,{...base},batch);
 assert.equal(calls,1);assert.equal(payload.action,'updateProduct');assert.equal(payload.productMutationVersion,2);assert.deepEqual(payload.changes,{});assert.equal(payload.batch.qty,15);
 assert.equal(h.app.products[0].stock,25);assert.equal(h.app.products[1].stock,8);assert.equal(h.app.batches.filter(b=>b.sku==='OTHER').length,1);assert.equal(h.app.productsLastSyncAt,'whole-catalog-time');assert.equal(h.app.datasetSyncTimes.products,'old-products');assert.equal(h.store.size,0);
});
test('double click sends once and never optimistically changes stock',async()=>{
 const h=setup();let resolve,calls=0;h.app.apiFetch=async()=>{calls++;return new Promise(r=>resolve=r);};
 const first=h.app.saveProductConfirmed(base,{...base},batch);assert.equal(h.app.products[0].stock,10);
 await assert.rejects(h.app.saveProductConfirmed(base,{...base},batch));assert.equal(calls,1);resolve(response(receipt()));await first;
});
test('lost response and reopened client reuse the same request ID',async()=>{
 const h=setup();let sent;h.app.apiFetch=async(u,o)=>{sent=JSON.parse(o.body);throw new Error('offline');};await assert.rejects(h.app.saveProductConfirmed(base,{...base},batch));
 const next=setup(h.store);next.app.apiFetch=async(u,o)=>{assert.equal(JSON.parse(o.body).clientRequestId,sent.clientRequestId);return response({...receipt(),replayed:true});};
 await next.app.saveProductConfirmed(base,{...base},batch);assert.equal(next.app.products[0].stock,25);assert.equal(h.store.size,0);
});
test('image failure after stock acknowledgement retries image only even after reopen',async()=>{
 const h=setup();let calls=0;h.app.apiFetch=async()=>{calls++;return response(receipt());};h.app.saveProductImage=async()=>{throw new Error('image network');};
 await assert.rejects(h.app.saveProductConfirmed(base,{...base},batch,'data:image/png;base64,new'),/Kho đã lưu/);assert.equal(h.app.products[0].stock,25);
 const record=JSON.parse([...h.store.values()][0]);assert.equal(record.confirmed,true);
 const next=setup(h.store);next.app.apiFetch=async()=>{throw new Error('must not resubmit stock');};let imageCalls=0;next.app.saveProductImage=async(sku,img,options)=>{imageCalls++;assert.equal(options.authUsername,'owner');assert.equal(img,record.image);};
 await next.app.saveProductConfirmed(base,{...base},batch,record.image);assert.equal(calls,1);assert.equal(imageCalls,1);assert.equal(h.store.size,0);
});
test('unchanged image is never uploaded, image-only edit never calls inventory API',async()=>{
 const h=setup();let images=0,calls=0;h.app.apiFetch=async()=>{calls++;return response(receipt());};h.app.saveProductImage=async()=>images++;
 await h.app.saveProductConfirmed(base,{...base},batch,null);assert.equal(images,0);
 await h.app.saveProductConfirmed(base,{...base},null,'data:image/png;base64,new');assert.equal(images,1);assert.equal(calls,1);
});
test('no changes, invalid qty and storage errors cannot send inventory writes',async()=>{
 const h=setup();let calls=0;h.app.apiFetch=async()=>calls++;
 assert.equal((await h.app.saveProductConfirmed(base,{...base})).noop,true);
 await assert.rejects(h.app.saveProductConfirmed(base,{...base},{...batch,qty:0}));
 h.storage.setItem=()=>{throw new Error('quota');};await assert.rejects(h.app.saveProductConfirmed(base,{...base},batch));assert.equal(calls,0);
});
test('unknown server receipt preserves draft and requires confirmation, never marks success',async()=>{
 const h=setup();h.app.apiFetch=async()=>response({success:true});await assert.rejects(h.app.saveProductConfirmed(base,{...base},batch));assert.equal(h.app.products[0].stock,10);assert.equal(h.store.size,1);
});
test('definitive conflict allows reopening fresh, uncertain state never changes request',async()=>{
 const h=setup();h.app.apiFetch=async()=>response({success:false,code:'PRODUCT_CONFLICT',notSubmitted:true,error:'conflict'});await assert.rejects(h.app.saveProductConfirmed(base,{...base},batch));assert.equal(h.store.size,0);
 h.app.apiFetch=async()=>response({success:false,code:'PRODUCT_SAVE_UNCONFIRMED',error:'unknown'});await assert.rejects(h.app.saveProductConfirmed(base,{...base},batch));const pending=[...h.store.values()][0];
 await assert.rejects(h.app.saveProductConfirmed(base,{...base},{...batch,qty:16}));assert.equal([...h.store.values()][0],pending);
});
test('unchanged rounded display price is not written back over fractional stored price',async()=>{
 const h=setup(),fractional={...base,costPrice:100.4};let payload;h.app.apiFetch=async(u,o)=>{payload=JSON.parse(o.body);return response(receipt());};
 await h.app.saveProductConfirmed(fractional,{...fractional,costPrice:100,name:'New'});assert.deepEqual(payload.changes,{name:'New'});
});
test('actual product modal edit uses one inventory call, no full refresh and no unchanged image upload',async()=>{
 const elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{value:'',src:'',checked:false,disabled:false,style:{},handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}});return elements.get(id);}
 const document={getElementById:el,querySelectorAll:selector=>selector.startsWith('#pf ')?[...elements.values()]:[]};
 const store=new Map(),storage={getItem:k=>k==='khs_api_url'?'https://example.test/api':store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const modal=source.slice(source.indexOf('  productModal('),source.indexOf('\n  confirmDelete('));
 const app=vm.runInNewContext('({'+methods+modal+'})',{document,localStorage:storage,crypto:require('node:crypto').webcrypto,TextEncoder,AbortController,setTimeout,clearTimeout,fmt:n=>String(Math.round(n||0)),fmtd:n=>String(n),unfmt:v=>Number(v)||0,dateInputLocal:()=> '2026-09-22',parseDateInputParts:v=>({d:v.slice(8),m:v.slice(5,7),y:v.slice(0,4)})});
 let apiCalls=0,images=0,closed=false;
 Object.assign(app,{user:{username:'owner'},products:[{...base}],batches:[],openModal(){},closeModal(){closed=true;},toast(){},showSheetProgress(){},hideSheetProgress(){},renderProducts(){},saveCacheValue:async()=>{},getProductImage:async()=> 'data:image/png;base64,existing',saveProductImage:async()=>images++,refreshInventoryOnly:async()=>{throw new Error('full refresh forbidden');},apiFetch:async(u,o)=>{apiCalls++;const payload=JSON.parse(o.body);assert.equal(payload.productMutationVersion,2);assert.equal(payload.batch.qty,15);return response(receipt());}});
 app.productModal('SKU');await Promise.resolve();
 for(const [id,value] of Object.entries({'pf-sku':'SKU','pf-name':'Name','pf-cat':'Cat','pf-sell':'200','pf-cost':'100','pf-stock':'10','pf-unit':'hộp','pf-batch-date':'2026-09-22','pf-batch-qty':'15','pf-batch-cost':'200','pf-batch-note':'Note','pf-batch-suffix':''}))el(id).value=value;
 el('pf-batch-toggle').checked=true;await el('m-save').handlers.click();assert.equal(apiCalls,1);assert.equal(images,0);assert.equal(closed,true);assert.equal(app.products[0].stock,25);
});
