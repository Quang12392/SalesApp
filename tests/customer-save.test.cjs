const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
const method=source.slice(source.indexOf('  async saveCustomerConfirmed('),source.indexOf('\n  customerModal('));
const draft={name:'Synthetic',phone:'0981234567',address:'TEST'};
function setup(store=new Map()){
 const localStorage={getItem:key=>key==='khs_api_url'?'https://example.test/api':store.get(key)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const ctx={localStorage,crypto:require('node:crypto'),AbortController,setTimeout,clearTimeout};
 const app=vm.runInNewContext('({'+method+'})',ctx);app.user={username:'owner'};app.customers=[];
 return {app,store,localStorage};
}
const response=(data,ok=true)=>({ok,json:async()=>data});
test('double submit sends once, mutates local only after confirmed server ID',async()=>{
 const h=setup();let resolve,calls=0;
 h.app.apiFetch=async()=>{calls++;return new Promise(r=>resolve=r);};
 const pending=h.app.saveCustomerConfirmed(draft,null);
 assert.equal(h.app.customers.length,0);
 await assert.rejects(h.app.saveCustomerConfirmed(draft,null));assert.equal(calls,1);
 resolve(response({success:true,id:'KH001717'}));await pending;
 assert.equal(h.app.customers[0].id,'KH001717');assert.equal(h.app.customers[0].phone,'0981234567');assert.equal(h.app._customerSaveBusy,false);
});
test('uncertain create survives reopening and retries same request without allocating local ID',async()=>{
 const h=setup();let first;
 h.app.apiFetch=async(url,opts)=>{first=JSON.parse(opts.body);throw new Error('network');};
 await assert.rejects(h.app.saveCustomerConfirmed(draft,null));assert.equal(h.app.customers.length,0);
 const reopened=setup(h.store);let second;
 reopened.app.apiFetch=async(url,opts)=>{second=JSON.parse(opts.body);return response({success:true,id:'KH900',replayed:true});};
 await reopened.app.saveCustomerConfirmed(draft,null);
 assert.equal(first.clientRequestId,second.clientRequestId);assert.equal(second.id,'');assert.equal(second._authUsername,'owner');assert.equal(h.store.size,0);
});
test('different payload cannot replace an unresolved create',async()=>{
 const h=setup();let calls=0;h.app.apiFetch=async()=>{calls++;throw new Error('offline');};
 await assert.rejects(h.app.saveCustomerConfirmed(draft,null));await assert.rejects(h.app.saveCustomerConfirmed({...draft,name:'Other'},null));assert.equal(calls,1);
});
test('rejected update does not change cached customer',async()=>{
 const h=setup(),customer={id:'KH1',name:'Old',phone:'01'};h.app.customers=[customer];
 h.app.apiFetch=async()=>response({success:false,error:'No permission'},false);
 await assert.rejects(h.app.saveCustomerConfirmed(draft,customer));assert.equal(customer.name,'Old');assert.equal(customer.phone,'01');
});
test('storage failure prevents create request; missing server ID keeps pending request',async()=>{
 const h=setup();let calls=0;h.localStorage.setItem=()=>{throw new Error('quota');};h.app.apiFetch=async()=>{calls++;};
 await assert.rejects(h.app.saveCustomerConfirmed(draft,null));assert.equal(calls,0);
 const h2=setup();h2.app.apiFetch=async()=>response({success:true});await assert.rejects(h2.app.saveCustomerConfirmed(draft,null));assert.equal(h2.app.customers.length,0);assert.equal(h2.store.size,1);
});
test('explicit ID conflict allows correction but never reports local success',async()=>{
 const h=setup();h.app.apiFetch=async()=>response({success:false,code:'CUSTOMER_ID_EXISTS',error:'Exists'});
 await assert.rejects(h.app.saveCustomerConfirmed(draft,null,'KH1'));assert.equal(h.store.size,0);assert.equal(h.app.customers.length,0);
});
test('same confirmed ID already in cache is not pushed twice',async()=>{
 const h=setup();h.app.customers=[{id:'KH1',name:'Old'}];h.app.apiFetch=async()=>response({success:true,id:'KH1',replayed:true});
 await h.app.saveCustomerConfirmed(draft,null);assert.equal(h.app.customers.length,1);
});
