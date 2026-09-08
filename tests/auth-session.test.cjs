const test=require('node:test'),assert=require('node:assert/strict');
const {createClient}=require('../js/auth.js');
const legacy='https://script.google.com/macros/s/TEST_ONLY/exec',origin='https://worker.example';
const id='1'.repeat(32),refresh='sr1_'+id+'.'+'2'.repeat(64);
function setup(fetcher){
 let saved=null;const events=[];
 const storage={load:async()=>saved,save:async v=>{saved=structuredClone(v);},clear:async()=>{saved=null;}};
 const client=createClient({gatewayOrigin:origin,legacyUrl:legacy,storage,fetcher,onRequired:()=>events.push('required')});
 return {client,get:()=>saved,set:v=>{saved=v;},events,storage};
}
const loginReply=()=>Response.json({success:true,user:{username:'owner'},sessionId:id,refreshToken:refresh,refreshExpiresAt:Date.now()+365*86400000,accessToken:'access1',accessExpiresAt:Date.now()+900000});
test('login stores a refresh credential and user but no password or access token',async()=>{
 const h=setup(async()=>loginReply());await h.client.login('owner','private password');
 assert.equal(h.get().password,undefined);assert.equal(h.get().accessToken,undefined);assert.equal(h.get().refreshToken,refresh);
});
test('restored devices refresh once for simultaneous requests, never resend password',async()=>{
 let renewals=0,writes=0;
 const h=setup(async(url,options)=>{
   if(url.endsWith('/refresh')){renewals++;assert.deepEqual(JSON.parse(options.body),{refreshToken:refresh});await new Promise(r=>setTimeout(r,10));return Response.json({success:true,accessToken:'access2',accessExpiresAt:Date.now()+900000,user:{username:'owner'}});}
   writes++;assert.equal(options.headers.Authorization,'Bearer access2');return Response.json({success:true});
 });
 h.set({origin,refreshToken:refresh,user:{username:'owner'}});
 await Promise.all([h.client.fetchApi(legacy+'?action=getProducts'),h.client.fetchApi(legacy+'?action=getConfig')]);
 assert.equal(renewals,1);assert.equal(writes,2);
});
test('network failure before submitting preserves device trust and identifies notSubmitted',async()=>{
 const h=setup(async()=>{throw new Error('offline');});h.set({origin,refreshToken:refresh});
 await assert.rejects(h.client.fetchApi(legacy+'?action=getProducts'),e=>e.code==='AUTH_NETWORK'&&e.notSubmitted);
 assert.equal(h.get().refreshToken,refresh);assert.equal(h.events.length,0);
});
test('revoked refresh asks for login and never submits business request',async()=>{
 let calls=0;const h=setup(async()=>{calls++;return Response.json({success:false,code:'AUTH_REQUIRED'},{status:401});});
 h.set({origin,refreshToken:refresh});await assert.rejects(h.client.fetchApi(legacy+'?action=createOrder'),/thiết bị|Thiết bị/);
 assert.equal(calls,1);assert.equal(h.get(),null);
});
test('explicit expired-access response renews and retries same request exactly once',async()=>{
 let apiCalls=0,refreshCalls=0;const bodies=[];
 const h=setup(async(url,options)=>{
   if(url.endsWith('/login'))return loginReply();
   if(url.endsWith('/refresh')){refreshCalls++;return Response.json({success:true,accessToken:'access2',accessExpiresAt:Date.now()+900000});}
   bodies.push(options.body);apiCalls++;
   return apiCalls===1?Response.json({success:false,code:'ACCESS_EXPIRED'},{status:401}):Response.json({success:true});
 });
 await h.client.login('owner','password');
 await h.client.fetchApi(legacy,{method:'POST',body:JSON.stringify({action:'createOrder',clientRequestId:'same-id'})});
 assert.equal(apiCalls,2);assert.equal(refreshCalls,1);assert.equal(bodies[0],bodies[1]);
});
test('forbidden and uncertain responses do not auto-retry writes',async()=>{
 for(const status of [403,502]){
   let calls=0;const h=setup(async url=>url.endsWith('/login')?loginReply():(calls++,Response.json({success:false,code:'FAIL'},{status})));
   await h.client.login('owner','password');const response=await h.client.fetchApi(legacy,{method:'POST',body:JSON.stringify({action:'createOrder'})});
   assert.equal(response.status,status);assert.equal(calls,1);
 }
});
test('stored keys are origin-bound; unconfigured rollout remains legacy',async()=>{
 const h=setup(()=>{throw new Error('Must not fetch');});h.set({origin:'https://other.example',refreshToken:refresh});
 assert.equal(await h.client.restore(),null);
 await assert.rejects(h.client.fetchApi('https://other.example/?action=getProducts'),e=>e.code==='API_ENDPOINT_MISMATCH');
 let url;const legacyClient=createClient({storage:h.storage,fetcher:async u=>{url=u;return Response.json({success:true});}});
 await legacyClient.fetchApi(legacy+'?action=getProducts');assert.equal(url,legacy+'?action=getProducts');
});
test('logout during pending refresh cannot resurrect the credential',async()=>{
 let release;const gate=new Promise(r=>{release=r;});
 const h=setup(async url=>{if(url.endsWith('/refresh')){await gate;return Response.json({success:true,accessToken:'new',accessExpiresAt:Date.now()+900000});}return Response.json({success:true});});
 h.set({origin,refreshToken:refresh});const pending=h.client.token();
 await new Promise(r=>setTimeout(r,0));h.set(null);release();
 await assert.rejects(pending);assert.equal(h.get(),null);
});
test('caller timeout bounds waiting for refresh and never submits its business request',async()=>{
 let release,writes=0;const gate=new Promise(r=>{release=r;});
 const h=setup(async url=>{if(url.endsWith('/refresh')){await gate;return Response.json({success:true,accessToken:'new',accessExpiresAt:Date.now()+900000});}writes++;return Response.json({success:true});});
 h.set({origin,refreshToken:refresh});const controller=new AbortController();
 const pending=h.client.fetchApi(legacy+'?action=getProducts',{signal:controller.signal});
 controller.abort();await assert.rejects(pending,e=>e.notSubmitted&&e.code==='AUTH_ABORTED');
 release();await new Promise(r=>setTimeout(r,0));assert.equal(writes,0);assert.equal(h.get().refreshToken,refresh);
});
test('storage error is not mistaken for an uncertain order submission',async()=>{
 const client=createClient({gatewayOrigin:origin,legacyUrl:legacy,storage:{load:async()=>{throw new Error('IndexedDB failed');}},fetcher:()=>{throw new Error('Must not fetch');}});
 await assert.rejects(client.fetchApi(legacy+'?action=createOrder'),e=>e.code==='AUTH_STORAGE'&&e.notSubmitted);
});
