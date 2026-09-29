const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
function setup(){
 const nodes=new Map();const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,{style:{display:'flex'},addEventListener(){},innerHTML:''});return nodes.get(id);}};
 const code=source.slice(source.indexOf('  viewOrder('),source.indexOf('  // ═════════ RETURNS PAGE'));
 const app=vm.runInNewContext('({'+code+'})',{document,fmtd:String});
 app.showSheetProgress=()=>{};app.hideSheetProgress=()=>{};
 app.getPendingReturn=()=>null;app.mergeOrderReturns=(id,rows)=>{app.returns=rows;};
 Object.assign(app,{user:{username:'test'},orders:[],returns:[],openModal(){},closeModal(){},openReturn(){},getOrderReturnState:()=> 'none',getOrderStatusLabel:()=> 'Hoàn thành',isReturnableOrder:o=>!o.returns?.length,toast(){},selectReturnOrder:(id,o)=>app.selected=o});
 return {app,nodes,button:{disabled:false,isConnected:true}};
}
const order=()=>({id:'OLD',items:[],total:100,finalTotal:100,status:'completed'});
test('old order outside global cache opens full detail without API or global mutation',()=>{
 const {app,nodes}=setup();app.viewOrder('OLD',order(),()=>{});
 assert.match(nodes.get('modal-body').innerHTML,/OLD/);assert.match(nodes.get('modal-footer').innerHTML,/m-history-back/);assert.match(nodes.get('modal-footer').innerHTML,/m-return-order/);assert.equal(app.orders.length,0);
});
test('full return hides return button',()=>{
 const {app,nodes}=setup();app.viewOrder('OLD',{...order(),returns:[{}]});assert.ok(!nodes.get('modal-footer').innerHTML.includes('m-return-order'));
});
test('checks latest returns then passes old order directly to return form without global order insertion',async()=>{
 const {app,button}=setup();app.fetchOrderReturns=async(id)=>{assert.equal(id,'OLD');return [];};
 await app.startDetailReturn(order(),button);assert.equal(app.selected.id,'OLD');assert.equal(app.orders.length,0);
});
test('new full return on another device prevents opening return form',async()=>{
 const {app,button}=setup();app.fetchOrderReturns=async()=>[{orderId:'OLD'}];await app.startDetailReturn(order(),button);assert.equal(app.selected,undefined);
});
test('failure is retryable; late response after close/logout cannot open return form',async()=>{
 const h=setup();h.app.fetchOrderReturns=async()=>{throw Error('offline');};await h.app.startDetailReturn(order(),h.button);assert.equal(h.button.disabled,false);assert.equal(h.app.selected,undefined);
 for(const reason of ['close','logout']){const {app,button}=setup();let finish;app.fetchOrderReturns=()=>new Promise(r=>finish=r);const pending=app.startDetailReturn(order(),button);if(reason==='close')button.isConnected=false;else app.user=null;finish([]);await pending;assert.equal(app.selected,undefined);}
});
