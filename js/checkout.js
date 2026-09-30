/* Durable checkout v2. Load after pos.js; enable only with deployed CheckoutSave.gs. */
Object.assign(POS, {
  async ensureCheckoutBackend() {
    if (App._checkoutBackendReady === true) return;
    const user=App.user,url=localStorage.getItem('khs_api_url');
    const response=await App.apiFetch(url+'?action=getConfig'),result=await response.json();
    if (App.user!==user || response.ok===false || !result.success || result.checkoutSaveVersion!==2) throw Object.assign(new Error('Backend thanh toán mới chưa sẵn sàng. Cần triển khai Code.gs và CheckoutSave.gs trước khi sử dụng bản app này.'),{notSubmitted:true});
    App._checkoutBackendReady=true;
  },
  checkoutPendingKey() { return 'khs_checkout_v2:' + App.user?.username; },

  getPendingCheckout() {
    const username = App.user?.username;
    if (!username) return null;
    let record;
    try { record = JSON.parse(localStorage.getItem(this.checkoutPendingKey()) || 'null'); }
    catch (_) { throw new Error('Không đọc được đơn đang chờ. Giữ dữ liệu app để kiểm tra trước khi thanh toán tiếp.'); }
    if (record && (record.version !== 2 || record.username !== username || record.request?.checkoutMutationVersion !== 2 || !record.request.clientRequestId || !['createOrder','confirmTikTokOrder'].includes(record.request.action) || !Array.isArray(record.request.items) || !Array.isArray(record.cart))) throw new Error('Đơn đang chờ không hợp lệ. Giữ dữ liệu app để kiểm tra.');
    return record;
  },

  checkoutLocked() {
    if (this._checkoutInProgress) return true;
    try { return !!this.getPendingCheckout(); } catch (_) { return true; }
  },

  lockCheckoutForm(locked) {
    if (!locked && this._checkoutDisabled) {
      for (const [node,disabled] of this._checkoutDisabled) if (node.isConnected !== false) node.disabled = disabled;
      this._checkoutDisabled = null;
    }
    if (locked) {
      this._checkoutDisabled ||= new Map();
      for (const node of document.querySelectorAll('#pos-overlay button, #pos-overlay input, #pos-overlay textarea, #pos-overlay select')) {
        if (['pos-close','btn-checkout'].includes(node.id)) continue;
        if (!this._checkoutDisabled.has(node)) this._checkoutDisabled.set(node,node.disabled);
        node.disabled = true;
      }
    }
  },

  updatePendingCheckoutUi() {
    let record;
    try { record = this.getPendingCheckout(); } catch (_) { this.lockCheckoutForm(true); return; }
    const btn = document.getElementById('btn-checkout');
    const banner = document.getElementById('pos-checkout-pending');
    if (record) {
      this.lockCheckoutForm(true);
      if (btn && !this._checkoutInProgress) {
        btn.disabled = false;
        btn.textContent = record.canRetry ? 'GỬI LẠI ĐƠN ĐANG CHỜ' : 'KIỂM TRA ĐƠN ĐANG CHỜ';
      }
      if (!banner) {
        const node = document.createElement('div'); node.id='pos-checkout-pending';
        node.style.cssText='padding:12px;background:#FFF7ED;color:#9A3412;font-size:14px;line-height:1.5;border-radius:8px;margin:8px';
        node.textContent='Đơn đang chờ xác nhận. Giỏ hàng được giữ nguyên. Bấm nút bên dưới để kiểm tra kết quả.';
        document.querySelector('.pos-cart-panel')?.prepend(node);
      }
    } else { banner?.remove(); this.lockCheckoutForm(false); }
  },

  restorePendingCheckout(record) {
    this.cart = JSON.parse(JSON.stringify(record.cart)); this.ensureCartLineIds();
    this.selectedCustomer = record.customer; this.currentDraftId = record.draftId;
    this._tiktokOrderId = record.request.action === 'confirmTikTokOrder' ? record.request.orderId : null;
    if (record.customer) this.showSelectedCustomer();
    const fields = {'pos-discount':record.request.discount ? record.request.discount.toLocaleString('vi-VN') : '', 'pos-note':record.request.note || '', 'pos-tax-revenue':record.request.taxRevenue || ''};
    for (const [id,value] of Object.entries(fields)) { const node=document.getElementById(id); if(node)node.value=value; }
    const tax=document.getElementById('pos-tax-check');if(tax)tax.checked=!!record.request.tax;
    for (const option of document.querySelectorAll('.pos-payment-option')) {const radio=option.querySelector('input');if(radio){radio.checked=radio.value===record.request.payment;option.classList.toggle('active',radio.checked);}}
    this.renderCart(); this.updateTotals();
    if (this._isMobile?.()) this.switchMobileView('cart');
    this.updatePendingCheckoutUi();
  },

  validateCheckoutReceipt(result, record) {
    const request=record.request, expected=new Set(request.items.map(i=>i.sku)), order=result.order;
    if (result.checkoutSaveVersion !== 2 || result.clientRequestId !== request.clientRequestId || !result.orderId || order?.id !== result.orderId || order.status !== 'completed' || (request.action==='confirmTikTokOrder' && result.orderId!==request.orderId) || ['total','discount','finalTotal'].some(k=>order[k]!==request[k]) || !Array.isArray(order.items) || order.items.length!==request.items.length || order.items.some((i,n)=>['sku','name','qty','price'].some(k=>i[k]!==request.items[n][k]) || !Number.isFinite(i.costPrice) || i.costPrice<0) ||
      !Array.isArray(result.affectedSkus) || result.affectedSkus.length!==expected.size || new Set(result.affectedSkus).size!==expected.size || result.affectedSkus.some(s=>!expected.has(s)) ||
      !Array.isArray(result.products) || result.products.length!==expected.size || new Set(result.products.map(p=>p.sku)).size!==expected.size || result.products.some(p=>!expected.has(p.sku)||['stock','costPrice','sellPrice'].some(k=>!Number.isFinite(p[k])||p[k]<0)) ||
      !Array.isArray(result.batches) || result.batches.some(b=>!expected.has(b.sku)||!b.id||!Number.isFinite(b.qtyRemaining)||b.qtyRemaining<0)) throw new Error('Chưa nhận đủ kết quả của đúng đơn đã gửi. Giữ yêu cầu để kiểm tra lại.');
  },

  async applyCheckoutReceipt(result, record) {
    this.validateCheckoutReceipt(result,record);
    const skus=new Set(result.affectedSkus);
    App._returnDataEpoch=(App._returnDataEpoch || 0)+1;
    for(const product of result.products){const current=App.products.find(p=>p.sku===product.sku);if(current)Object.assign(current,product);else App.products.push({...product});}
    App.batches=(App.batches || []).filter(b=>!skus.has(b.sku)).concat(result.batches);
    const existing=App.orders.find(o=>o.id===result.orderId);
    if(existing)Object.assign(existing,result.order);else App.orders.unshift(result.order);
    App.invalidateCustomerAccounting(); App._customerHistory=null;
    App.datasetSyncTimes={...(App.datasetSyncTimes || {}),orders:'',customers:''};
    // A subset receipt never certifies freshness of the entire inventory.
    try { if(App.saveCacheValue)await Promise.all(['products','batches','orders','datasetSyncTimes'].map(k=>App.saveCacheValue(k,App[k]))); }
    catch(_){App.toast('warning','Sheet đã lưu. Bộ nhớ đệm chưa lưu được; làm mới dữ liệu khi mở lại app.');}
  },

  async runPendingCheckout(record) {
    if(this._checkoutInProgress || this._stockRefreshPromise)return;
    const username=App.user?.username, user=App.user, key=this.checkoutPendingKey(),url=localStorage.getItem('khs_api_url');
    if(!url || !username){App.showSheetError('Chưa thể gửi đơn','Chưa cấu hình API hoặc chưa đăng nhập. Giỏ được giữ nguyên.');return;}
    const firstAttempt=!record.attempted, checkOnly=record.attempted && !record.canRetry;
    this._checkoutInProgress=true; App._checkoutSubmitting=true;App._returnDataEpoch=(App._returnDataEpoch || 0)+1;
    this._setCheckoutBusy(checkOnly?'ĐANG KIỂM TRA...':'ĐANG LƯU...');this.lockCheckoutForm(true);
    App.showSheetProgress(checkOnly?'Đang kiểm tra kết quả đơn đã gửi…':'Đang kiểm tra kho và ghi đơn…',checkOnly?'Đang tìm kết quả của đúng yêu cầu đang chờ.':'Đang cập nhật đơn và tồn kho. Vui lòng chờ.');
    let accepted=null,knownRejection=false;
    try {
      await App.waitForSheetPopupPaint();
      await this.ensureCheckoutBackend();
      if(App.user!==user || this.getPendingCheckout()?.request.clientRequestId!==record.request.clientRequestId)throw Object.assign(new Error('Tài khoản hoặc yêu cầu đang chờ vừa thay đổi.'),{notSubmitted:true});
      record.attempted=true;record.canRetry=false;localStorage.setItem(key,JSON.stringify(record));
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
      let result,response;
      try {response=await App.apiFetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},signal:controller.signal,body:JSON.stringify({...record.request,checkoutCheckOnly:!!checkOnly,_authUsername:username})});result=await response.json();}
      finally {clearTimeout(timer);}
      if(App.user!==user)throw new Error('Tài khoản đã thay đổi. Trở lại tài khoản cũ để kiểm tra đơn đang chờ.');
      if(result.code==='CHECKOUT_NOT_FOUND' && checkOnly && result.notSubmitted===true){
        record.canRetry=true;localStorage.setItem(key,JSON.stringify(record));
        App.showSheetError('Chưa có kết quả của đơn','Server chưa tìm thấy biên nhận. Bấm “Gửi lại đơn đang chờ” để gửi đúng yêu cầu cũ; giỏ được giữ nguyên.');return;
      }
      if(response.ok===false || result.success!==true){
        knownRejection=firstAttempt && result.notSubmitted===true;
        if(knownRejection && localStorage.getItem(key)===JSON.stringify(record))localStorage.removeItem(key);
        throw Object.assign(new Error(result.error || 'Chưa xác nhận được kết quả trên Sheet.'),{knownRejection});
      }
      await this.applyCheckoutReceipt(result,record);
      if(App.user!==user)throw new Error('Đơn đã lưu nhưng tài khoản vừa thay đổi. Mở lại tài khoản cũ để kiểm tra.');
      accepted=result;
      try {if(localStorage.getItem(key)===JSON.stringify(record))localStorage.removeItem(key);}
      catch(_){App.toast('warning','Đơn đã lưu. Yêu cầu vẫn được giữ để kiểm tra lại khi mở app.');}
    } catch(error) {
      if(firstAttempt && error.notSubmitted===true && localStorage.getItem(key)===JSON.stringify(record)){try{localStorage.removeItem(key);knownRejection=true;}catch(_){}}
      App.showSheetError(knownRejection?'Đơn chưa được ghi':'Đơn đang chờ xác nhận',knownRejection?error.message:'Chưa xác nhận được kết quả; Sheet có thể đã xử lý xong. '+error.message+' Giữ nguyên đơn, bấm “Kiểm tra đơn đang chờ”; không tạo lại cùng giao dịch.');
    } finally {
      this._checkoutInProgress=false;App._checkoutSubmitting=false;App._returnDataEpoch=(App._returnDataEpoch || 0)+1;
      // Progress and result dialogs share an ID. Do not remove an error just shown.
      if(accepted || document.getElementById('sheet-progress-overlay')?.dataset?.sheetProgress==='true')App.hideSheetProgress();
      if(App.user===user){this.lockCheckoutForm(false);this._resetCheckoutBtn();this.updatePendingCheckoutUi();this.updateSyncBadge();}
    }
    if(accepted && App.user===user){
      try {if(record.draftId)this.deleteDraft(record.draftId);}catch(_){App.toast('warning','Đơn đã lưu. Đơn tạm chưa xóa được; không thanh toán lại đơn tạm này.');}
      this.cart=[];this.currentDraftId=null;this._tiktokOrderId=null;this.close(true);
      if(record.request.action==='createOrder')this.showInvoice(accepted.order);
      else App.updateOrderTable();
      App.showSheetSuccess(accepted.replayed?'Đã tìm thấy đơn đã xử lý':'Đã ghi đơn thành công',accepted.message || 'Đơn đã được ghi và cập nhật tồn kho.');
    }
  },

  async checkout() {
    if(this._checkoutInProgress || this._stockRefreshPromise)return;
    let pending;
    try{pending=this.getPendingCheckout();}catch(error){App.showSheetError('Không thể thanh toán',error.message);return;}
    if(pending){await this.runPendingCheckout(pending);return;}
    if(!this.cart.length)return;
    if(!navigator.onLine){if(this._tiktokOrderId)App.showSheetError('Chưa có mạng','Đơn TikTok chưa được gửi. Kết nối mạng rồi xác nhận.');else{this.saveDraft();App.toast('warning','Không có mạng. Đơn được lưu tạm, chưa thanh toán.');}return;}
    const subtotal=this.cart.reduce((s,i)=>s+i.price*i.qty,0),discount=parseInt(document.getElementById('pos-discount').value.replace(/\D/g,'')) || 0;
    const tax=document.getElementById('pos-tax-check').checked,taxRevenue=tax?this.getTaxRevenueValue():0;
    if(!this._tiktokOrderId && tax && taxRevenue<=0){this.showTaxRevenueRequiredModal();return;}
    try {
      if(!App.user?.username || !localStorage.getItem('khs_api_url'))throw new Error('Chưa đăng nhập hoặc chưa cấu hình API. Đơn chưa được gửi.');
      const request={action:this._tiktokOrderId?'confirmTikTokOrder':'createOrder',checkoutMutationVersion:2,clientRequestId:'checkout:'+crypto.randomUUID(),items:this.cart.map(i=>({sku:i.sku || i.id || '',name:i.name || '',qty:i.qty,price:i.price})),total:subtotal,discount,finalTotal:Math.max(0,subtotal-discount)};
      if(this._tiktokOrderId)request.orderId=this._tiktokOrderId;
      else Object.assign(request,{customerId:this.selectedCustomer?.id || '',customerName:this.selectedCustomer?.name || 'Khách lẻ',customerPhone:this.selectedCustomer?.phone || '',customerAddress:this.selectedCustomer?.address || '',payment:document.querySelector('input[name="pos-payment"]:checked').value,note:document.getElementById('pos-note').value,tax,taxRevenue});
      const record={version:2,username:App.user.username,request,cart:JSON.parse(JSON.stringify(this.cart)),customer:this.selectedCustomer?{...this.selectedCustomer}:null,draftId:this.currentDraftId || null,attempted:false};
      localStorage.setItem(this.checkoutPendingKey(),JSON.stringify(record));
      await this.runPendingCheckout(record);
    }catch(error){App.showSheetError('Đơn chưa được gửi',error.message+' Giỏ được giữ nguyên.');}
  },

  async _doConfirmTikTok() { return this.checkout(); }
});

// Preserve existing POS presentation, while preventing edits to immutable pending requests.
for (const name of ['addToCart','updateQty','removeFromCart','editPrice','editQty','saveDraft','loadDraft','selectCustomer','setCustomerManual','clearCustomer','openNewCustomerModal','openNewProductModal']) {
  const original=POS[name];if(typeof original!=='function')continue;
  POS[name]=function(...args){if(this.checkoutLocked())return;return original.apply(this,args);};
}
const checkoutOriginalOpen=POS.open;
POS.open=function(){
  if(this._checkoutInProgress)return;
  let pending;try{pending=this.getPendingCheckout();}catch(error){App.showSheetError('Không thể mở bán hàng',error.message);return;}
  this.lockCheckoutForm(false);checkoutOriginalOpen.call(this);if(pending)this.restorePendingCheckout(pending);this.updateSyncBadge();
};
const checkoutOriginalTikTokOpen=POS.openWithTikTokOrder;
POS.openWithTikTokOrder=function(orderId){if(this.checkoutLocked()){this.open();return;}return checkoutOriginalTikTokOpen.call(this,orderId);};
const checkoutOriginalClose=POS.close;
POS.close=function(force){if(this._checkoutInProgress)return;const result=checkoutOriginalClose.call(this,this.checkoutLocked()?true:force);this.updateSyncBadge();return result;};
const checkoutOriginalRender=POS.renderCart;
POS.renderCart=function(...args){const result=checkoutOriginalRender.apply(this,args);this.updatePendingCheckoutUi();return result;};
const checkoutOriginalAvailability=POS._updateCheckoutAvailability;
POS._updateCheckoutAvailability=function(){checkoutOriginalAvailability.call(this);this.updatePendingCheckoutUi();};
const checkoutOriginalQueue=POS.processSyncQueue;
POS.processSyncQueue=async function(){if(this.checkoutLocked())return;return checkoutOriginalQueue.call(this);};
const checkoutOriginalBadge=POS.updateSyncBadge;
POS.updateSyncBadge=function(){
  checkoutOriginalBadge.call(this);
  let pending;try{pending=this.getPendingCheckout();}catch(_){return;}
  if(!pending)return;
  let badge=document.getElementById('sync-queue-badge');
  if(!badge){badge=document.createElement('div');badge.id='sync-queue-badge';badge.style.cssText='position:fixed;bottom:20px;right:20px;background:#9A3412;color:white;padding:10px 16px;border-radius:20px;z-index:9999;cursor:pointer';document.body.appendChild(badge);}
  badge.textContent='⏳ Kiểm tra đơn đang chờ';badge.onclick=()=>this.open();
  badge.style.display=document.getElementById('pos-overlay')?.style.display!=='none'?'none':'';
};
