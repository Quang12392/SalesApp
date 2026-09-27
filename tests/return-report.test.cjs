const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
function setup(){
 const methods=source.slice(source.indexOf('  isCancelledOrder('),source.indexOf('  renderOrders('));
 const app=vm.runInNewContext('({'+methods+'})');app.returns=[];app.products=[];return app;
}
const order=()=>({id:'A',status:'completed',total:300,finalTotal:270,items:[{sku:'S',name:'Same',qty:2,price:100,costPrice:80},{sku:'T',name:'Other',qty:1,price:100,costPrice:40}]});
test('partial/full states and revenue/cost use return quantities without changing original rows',()=>{
 const app=setup(),o=order(),before=JSON.stringify(o);assert.equal(app.getOrderReturnState(o),'none');
 app.returns=[{orderId:'A',items:[{...o.items[0],qty:1}]}];
 assert.equal(app.getOrderReturnState(o),'partial');assert.equal(app.getOrderNetRevenue(o),180);assert.equal(app.getOrderNetCostTotal(o),80);
 app.returns.push({orderId:'A',items:[{...o.items[0],qty:1},o.items[1]]});
 assert.equal(app.getOrderReturnState(o),'full');assert.equal(app.getOrderStatusLabel(o),'Đã trả hết');assert.equal(app.getOrderNetRevenue(o),0);assert.equal(app.getOrderNetCostTotal(o),0);assert.equal(JSON.stringify(o),before);
});
test('same SKU different prices and gifts retain independent quantities; zero-price sale is not a full return',()=>{
 const app=setup(),o=order();o.items=[{sku:'S',name:'Same',qty:1,price:100},{sku:'S',name:'Same',qty:1,price:0}];
 o.returns=[{items:[o.items[0]]}];assert.equal(app.getOrderReturnState(o),'partial');assert.equal(app.getRemainingOrderItems(o)[0].price,0);
 o.returns=[];o.finalTotal=0;assert.equal(app.getOrderReturnState(o),'none');
});
test('duplicate identical lines consume returned quantity once, never twice',()=>{
 const app=setup(),o=order();o.items=[o.items[0],{...o.items[0]}];o.returns=[{items:[{...o.items[0],qty:1}]}];
 assert.equal(app.getRemainingOrderItems(o).reduce((s,i)=>s+i.qty,0),3);
});
test('net product revenue and quantities reconcile after discounts and partial returns',()=>{
 const app=setup(),o=order();o.returns=[{items:[{...o.items[0],qty:1}]}];
 const items=app.getNetProductSales([o]);assert.equal(items.reduce((s,i)=>s+i.qty,0),2);assert.equal(items.reduce((s,i)=>s+i.revenue,0),app.getOrderNetRevenue(o));
 o.returns=[{items:o.items}];assert.equal(app.getNetProductSales([o]).length,0);
});
test('sales report counts full returns separately and excludes them from remaining sale count',()=>{
 const app=setup();const method=source.slice(source.indexOf('  reportSales('),source.indexOf('  reportProducts('));
 Object.assign(app,vm.runInNewContext('({'+method+'})',{fmtd:String}));
 const full=order();full.returns=[{items:full.items}];const partial={...order(),id:'B',returns:[{items:[{...order().items[0],qty:1}]}]};
 const el={};app.reportSales(el,[full,partial],'table');assert.ok(el.innerHTML.includes('Trả hết: 1'));assert.ok(el.innerHTML.includes('Trả một phần: 1'));assert.ok(el.innerHTML.includes('Số đơn</div><div class="rpt-card-value">1'));
});

test('report refresh waits for returns even when order coverage is fresh and shows failure honestly',async()=>{
 const method=source.slice(source.indexOf('  async updateReport()'),source.indexOf('  // Canvas bar chart helper'));
 const el={},app=vm.runInNewContext('({'+method+'})',{document:{getElementById:()=>el}});
 let reads=0,status='';Object.assign(app,{reportType:'sales',getReportDateRange:()=>[new Date(),new Date()],filterOrdersByDateRange:()=>[],renderReportWithOrders(){},hasFreshOrderCoverage:()=>true,isDatasetFresh:()=>false,setReportSyncStatus:m=>status=m,ensureOrdersForRange:async()=>{},refreshArrayDataset:async()=>{reads++;throw new Error('Returns unavailable');}});
 await app.updateReport();assert.equal(reads,1);assert.match(status,/Returns unavailable/);
});
