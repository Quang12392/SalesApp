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
const response=(data,ok=true)=>({ok,json:async()=>data.success&&data.id?{customerFieldsVersion:1,customer:{...draft,gender:'',facebook:'',note:'',id:data.id},...data}:data});
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
test('new fields are sent and preserved in an unresolved request across reopen',async()=>{
 const h=setup(),input={...draft,gender:'Nữ',facebook:'FB "Test"',note:'First\nSecond'};let sent;
 h.app.apiFetch=async(u,o)=>{sent=JSON.parse(o.body);throw new Error('offline');};
 await assert.rejects(h.app.saveCustomerConfirmed(input,null));assert.equal(sent.gender,'Nữ');assert.equal(sent.facebook,input.facebook);assert.equal(sent.note,input.note);
 const stored=JSON.parse([...h.store.values()][0]);assert.equal(stored.data.note,input.note);
 const reopened=setup(h.store);reopened.app.apiFetch=async(u,o)=>{assert.equal(JSON.parse(o.body).clientRequestId,sent.clientRequestId);return response({success:true,id:'KH2',customer:{id:'KH2',...input,facebook:'Server FB'}});};
 const saved=await reopened.app.saveCustomerConfirmed(input,null);assert.equal(saved.facebook,'Server FB');assert.equal(saved.note,input.note);assert.equal(saved.gender,'Nữ');
});
test('v382 pending request retains its identity and refuses adding fields until resolved',async()=>{
 const h=setup(),data={action:'addCustomer',id:'',...draft};h.store.set('khs_customer_create_pending:owner',JSON.stringify({data,clientRequestId:'customer:legacy-test'}));let calls=0;
 h.app.apiFetch=async(u,o)=>{calls++;const sent=JSON.parse(o.body);assert.equal(sent.clientRequestId,'customer:legacy-test');assert.equal(sent.gender,undefined);return response({success:true,id:'KH3'});};
 await assert.rejects(h.app.saveCustomerConfirmed({...draft,note:'New note'},null));assert.equal(calls,0);
 await h.app.saveCustomerConfirmed({...draft,gender:'',facebook:'',note:''},null);assert.equal(calls,1);
});
test('old backend success cannot silently discard new fields',async()=>{
 const h=setup();h.app.apiFetch=async()=>({ok:true,json:async()=>({success:true,id:'KH4'})});
 await assert.rejects(h.app.saveCustomerConfirmed({...draft,gender:'Nam'},null));assert.equal(h.app.customers.length,0);assert.equal(h.store.size,1);
});
test('editing can clear optional fields and requires confirmed response',async()=>{
 const h=setup(),old={id:'KH5',...draft,gender:'Nam',facebook:'Old',note:'Old'};h.app.customers=[old];
 h.app.apiFetch=async(u,o)=>{const sent=JSON.parse(o.body);assert.equal(sent.gender,'');assert.equal(sent.facebook,'');assert.equal(sent.note,'');return response({success:true,id:'KH5',customer:{...old,gender:'',facebook:'',note:''}});};
 await h.app.saveCustomerConfirmed({...draft,gender:'',facebook:'',note:''},old);assert.equal(old.facebook,'');assert.equal(old.note,'');
});
test('pending optional fields reappear in the form and text cannot escape HTML attributes',()=>{
 const storage=new Map([['khs_customer_create_pending:owner',JSON.stringify({clientRequestId:'customer:old',data:{action:'addCustomer',id:'',...draft,gender:'Nữ',facebook:'FB "quoted"',note:'line 1\n</textarea><img src=x>'}})]]);
 const elements=new Map();const document={getElementById:id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',addEventListener(){}});return elements.get(id);}};
 const modal=source.slice(source.indexOf('  customerModal('),source.indexOf('\n  delCustomer('));
 const app=vm.runInNewContext('({'+modal+'})',{document,localStorage:{getItem:k=>storage.get(k)||null}});
 Object.assign(app,{user:{username:'owner'},customers:[],toast(){},openModal(){},avatarSvg(){return '';}});
 app.customerModal();const html=elements.get('modal-body').innerHTML;
 assert.ok(html.includes('value="Nữ" selected'));assert.ok(html.includes('FB &quot;quoted&quot;'));
 assert.ok(html.includes('&lt;/textarea&gt;&lt;img src=x&gt;'));assert.ok(!html.includes('</textarea><img src=x>'));
});
test('confirmed fields update cache and mark the whole customer dataset stale',async()=>{
 const h=setup(),cache=new Map();h.app.datasetSyncTimes={products:'keep',customers:'old'};
 h.app.saveCacheValue=async(k,v)=>cache.set(k,JSON.parse(JSON.stringify(v)));
 h.app.apiFetch=async()=>response({success:true,id:'KH9',customer:{...draft,id:'KH9',gender:'Nữ',facebook:'Saved FB',note:'Saved note'}});
 await h.app.saveCustomerConfirmed({...draft,note:'Draft'},null);
 assert.equal(cache.get('customers')[0].note,'Saved note');assert.equal(cache.get('datasetSyncTimes').customers,'');assert.equal(cache.get('datasetSyncTimes').products,'keep');
});
test('cache failure after server success never reports an unconfirmed write',async()=>{
 const h=setup();h.app.saveCacheValue=async()=>{throw new Error('cache unavailable');};h.app.apiFetch=async()=>response({success:true,id:'KH10'});
 assert.equal((await h.app.saveCustomerConfirmed(draft,null)).id,'KH10');assert.equal(h.store.size,0);
});
