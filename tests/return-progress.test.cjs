const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
function setup(url='https://test.invalid'){
 const button={disabled:false,textContent:'TRẢ HÀNG'},input={disabled:false},locked={disabled:true};
 const controls=[button,input,locked];
 const document={getElementById:id=>id==='return-confirm'?button:{value:'test'},querySelector:()=>({value:'1'}),querySelectorAll:s=>s==='.return-item-check'?[{checked:true,dataset:{idx:'0'}}]:controls};
 const timers=[];const ctx={document,confirm:()=>true,fmtd:String,AbortController,localStorage:{getItem:()=>url},setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length;},clearTimeout(){}};
 const app=vm.runInNewContext('({'+src.slice(src.indexOf('  async processReturn()'),src.indexOf('  // ═════════ SETTINGS'))+'})',ctx);ctx.App=app;
 Object.assign(app,{user:{displayName:'Test'},returns:[],products:[{sku:'S'}],returnSelectedOrder:{id:'A',items:[{sku:'S',name:'Synthetic',qty:1,price:100}]},isReturnableOrder:()=>true,getOrderReturnedQtyMap:()=>({}),getReturnItemKey:()=> 'S',toMoneyNumber:Number,showSheetProgress(){app.progress=true;},hideSheetProgress(){app.progress=false;},showSheetError(t,m){app.failure=m;},toast(){},invalidateCustomerAccounting(){},closeReturn(){app.closed=true;},autoSync(){}});
 return {app,button,controls,timers};
}
test('return popup covers request, locks form and prevents duplicate sends until confirmation',async()=>{
 const {app,controls,button}=setup();let finish,calls=0;app.apiFetch=()=>{calls++;return new Promise(r=>finish=r);};
 const pending=app.processReturn();assert.equal(app.progress,true);assert.ok(controls.every(c=>c.disabled));assert.equal(app.returns.length,0);
 await app.processReturn();assert.equal(calls,1);
 finish({json:async()=>({success:true})});await pending;
 assert.equal(app.progress,false);assert.equal(app.returnSubmitting,false);assert.equal(app.returns.length,1);assert.equal(app.closed,true);
 assert.equal(button.textContent,'TRẢ HÀNG');assert.deepEqual(controls.map(c=>c.disabled),[false,false,true]);
});
test('server rejection cleans up popup, retains form and shows an error',async()=>{
 const {app,button}=setup();app.apiFetch=async()=>({json:async()=>({success:false,error:'Rejected'})});await app.processReturn();
 assert.equal(app.progress,false);assert.equal(app.failure,'Rejected');assert.equal(app.returns.length,0);assert.equal(app.closed,undefined);assert.equal(button.disabled,false);
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
