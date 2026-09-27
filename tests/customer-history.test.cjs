const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
const methods=source.slice(source.indexOf('  viewCustomerHistory('),source.indexOf('  // SVG avatars by gender'));
function setup(){
 const elements=new Map();
 const document={getElementById:id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',addEventListener(){}});return elements.get(id);}};
 const app=vm.runInNewContext('({'+methods+'})',{document,URLSearchParams,localStorage:{getItem:()=> 'https://test.invalid/api'},fmtd:n=>String(n)});
 Object.assign(app,{user:{username:'owner'},customers:[{id:'KH1',name:'Synthetic'}],orders:[{id:'global'}],orderCoverage:['unchanged'],returns:['unchanged'],openModal(){},saveCacheValue:async()=>{},formatSyncStatus:x=>x,getOrderStatusLabel:()=> 'Hoàn thành'});
 app._customerHistory={custId:'KH1',key:'owner:KH1',user:app.user,orders:[],offset:0,busy:false};
 return {app,elements};
}
const page=(offset=0,id='A',more=false)=>({customerStatsVersion:1,customerId:'KH1',checkedAt:'2026-09-27T01:00:00Z',summary:{totalSpent:90,totalOrders:2,lastOrder:'27/09/2026'},data:[{id,customerId:'KH1',netRevenue:90,items:[],returns:[]}],meta:{offset,hasMore:more}});
test('lazy customer API applies server summary without contaminating global orders/returns/coverage',async()=>{
 const {app}=setup();app.fetchApiJson=async(url,opts)=>{assert.match(url,/mode=history/);assert.match(url,/customerId=KH1/);assert.equal(opts.retries,0);return page();};
 await app.loadCustomerHistory();assert.equal(app.customers[0].totalSpent,90);assert.equal(app.customers[0].customerStatsVersion,1);
 assert.equal(app.orders[0].id,'global');assert.equal(app.orderCoverage[0],'unchanged');assert.equal(app.returns[0],'unchanged');
});
test('paging deduplicates IDs; refresh replaces deleted history',async()=>{
 const {app}=setup();app.fetchApiJson=async()=>page(0,'A',true);await app.loadCustomerHistory();
 app.fetchApiJson=async()=>page(1,'A',false);await app.loadCustomerHistory(true);assert.equal(app._customerHistory.orders.length,1);
 app.fetchApiJson=async()=>({...page(),data:[],summary:{totalSpent:0,totalOrders:0,lastOrder:''}});await app.loadCustomerHistory(false);
 assert.equal(app._customerHistory.orders.length,0);assert.equal(app.customers[0].totalSpent,0);
});
test('network error and legacy response preserve confirmed data and show error',async()=>{
 const {app}=setup();app.fetchApiJson=async()=>page();await app.loadCustomerHistory();
 app.fetchApiJson=async()=>{throw new Error('offline');};await app.loadCustomerHistory();assert.equal(app._customerHistory.orders[0].id,'A');assert.match(app._customerHistory.error,/offline/);
 app.fetchApiJson=async()=>({data:[]});await app.loadCustomerHistory();assert.equal(app.customers[0].totalSpent,90);assert.ok(app._customerHistory.error);
});
test('closed/switched popup or logged-out user ignores late responses',async()=>{
 for(const action of ['close','switch','logout']){
  const {app}=setup();let finish;app.fetchApiJson=()=>new Promise(r=>finish=r);const pending=app.loadCustomerHistory();
  if(action==='logout')app.user=null;else app._customerHistory=action==='close'?null:{};
  finish(page());await pending;assert.equal(app.customers[0].totalSpent,undefined);
 }
});
test('double clicks issue only one request',async()=>{
 const {app}=setup();let finish,count=0;app.fetchApiJson=()=>{count++;return new Promise(r=>finish=r);};
 const pending=app.loadCustomerHistory();await app.loadCustomerHistory();assert.equal(count,1);finish(page());await pending;
});
test('history escapes names and displays return records with server net amount',async()=>{
 const {app,elements}=setup();const p=page();p.data[0].items=[{name:'<img onerror=x>',qty:1}];p.data[0].returns=[{id:'R1',items:[]}];
 app.fetchApiJson=async()=>p;await app.loadCustomerHistory();const html=elements.get('modal-body').innerHTML;
 assert.ok(html.includes('&lt;img onerror=x&gt;'));assert.ok(html.includes('Phiếu R1'));assert.ok(html.includes('Sau trả: 90'));
});
test('customer list no longer sums partial local orders or trusts unversioned totals',()=>{
 const code=source.slice(source.indexOf('  updateCustomerTable()'),source.indexOf('  viewCustomerHistory('));
 assert.ok(!code.includes('this.orders'));assert.ok(code.includes('cu.customerStatsVersion === 1'));assert.ok(code.includes('Chưa cập nhật'));
});
