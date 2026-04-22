/* ═══════════════════════════════════════════════════════════════
   POS Module — Point of Sale, QR Payment, Invoice
   ═══════════════════════════════════════════════════════════════ */

// VietQR config — User sẽ cập nhật thông tin ngân hàng thực
const QR_CONFIG = {
  bankId: 'MB', // Mã ngân hàng (VD: MB, VCB, TCB, ACB...)
  accountNo: '0123456789', // Số tài khoản
  accountName: 'KIEU HUONG STORE', // Tên chủ TK
  template: 'compact2' // compact, compact2, qr_only
};

const POS = {
  cart: [],
  selectedCustomer: null,
  posTimer: null,
  viewMode: localStorage.getItem('pos_view_mode') || 'grid',

  init() {
    document.getElementById('btn-open-pos').addEventListener('click', () => this.open());
    document.getElementById('pos-close').addEventListener('click', () => this.close());
    // Intercept Android back gesture / browser back button
    window.addEventListener('popstate', (e) => {
      if (this._posOpen) {
        if (this.cart.length > 0) {
          // Re-push state so back doesn't navigate away
          history.pushState({ pos: true }, '', location.href);
          this.showExitConfirm();
        } else {
          this.close(true);
        }
      }
    });
    document.getElementById('pos-product-search').addEventListener('input', e => this.renderProducts(e.target.value));
    document.getElementById('pos-discount').addEventListener('input', (e) => {
      const raw = e.target.value.replace(/\D/g, '');
      e.target.value = raw ? parseInt(raw).toLocaleString('vi-VN') : '';
      this.updateTotals();
    });
    document.getElementById('btn-checkout').addEventListener('click', () => this.checkout());
    document.getElementById('btn-save-draft').addEventListener('click', () => this.saveDraft());
    document.getElementById('btn-capture-cart').addEventListener('click', () => this.captureCart());
    document.getElementById('pos-drafts-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = document.getElementById('pos-drafts-panel');
      const isHidden = !panel || panel.style.display === 'none' || getComputedStyle(panel).display === 'none';
      if (isHidden) { this.renderDrafts(); } else { panel.style.display = 'none'; }
    });
    // View mode toggle
    document.querySelectorAll('.pos-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.viewMode = btn.dataset.view;
        localStorage.setItem('pos_view_mode', this.viewMode);
        document.querySelectorAll('.pos-view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.applyViewMode();
      });
    });
    // Customer search
    const cs = document.getElementById('pos-customer-search');
    cs.addEventListener('input', e => this.searchCustomers(e.target.value));
    cs.addEventListener('focus', e => { if (e.target.value) this.searchCustomers(e.target.value); });
    document.getElementById('pos-overlay').addEventListener('click', e => {
      if (!e.target.closest('.pos-customer-section')) document.getElementById('pos-customer-dropdown').style.display = 'none';
    });
    // Payment method toggle
    document.querySelectorAll('.pos-payment-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.pos-payment-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        opt.querySelector('input').checked = true;
      });
    });
    // Invoice buttons
    document.getElementById('btn-print-invoice').addEventListener('click', () => window.print());
    document.getElementById('btn-capture-invoice').addEventListener('click', () => this.captureInvoice());
    document.getElementById('btn-close-invoice').addEventListener('click', () => {
      document.getElementById('invoice-overlay').style.display = 'none';
    });
    document.getElementById('btn-x-close-invoice').addEventListener('click', () => {
      document.getElementById('invoice-overlay').style.display = 'none';
    });
    // Prevent closing on overlay click
    document.getElementById('invoice-overlay').addEventListener('click', e => {
      e.stopPropagation();
    });
    // Also connect "Tạo đơn hàng" button on orders page
    document.addEventListener('click', e => {
      if (e.target.id === 'btn-new-order' || e.target.closest('#btn-new-order')) this.open();
    });
    // Mobile: bottom sheet cart toggle
    this._isMobile = () => window.innerWidth <= 768;
    const cartPanel = document.querySelector('.pos-cart-panel');
    if (cartPanel) {
      // Tap on total bar → toggle expand/collapse
      cartPanel.addEventListener('click', e => {
        if (!this._isMobile()) return;
        // Only toggle on total row when in browse mode (bottom sheet)
        if (this._mobileView !== 'cart') {
          const totalRow = e.target.closest('.pos-total-row.total');
          if (totalRow) {
            cartPanel.classList.toggle('collapsed');
          }
        }
      });
    }
  },

  open() {
    this.cart = [];
    this.selectedCustomer = null;
    document.getElementById('pos-overlay').style.display = 'flex';
    // Delay pushState so it doesn't conflict with hash routing (#pos → #orders)
    setTimeout(() => {
      this._posOpen = true;
      history.pushState({ pos: true }, '', location.href);
    }, 300);
    document.getElementById('pos-product-search').value = '';
    document.getElementById('pos-customer-search').value = '';
    document.getElementById('pos-selected-customer').style.display = 'none';
    document.getElementById('pos-discount').value = '';
    document.getElementById('pos-note').value = '';
    // Reset customer-selected class
    document.querySelector('.pos-customer-section')?.classList.remove('customer-selected');
    // Mobile: always start in browse view
    if (window.innerWidth <= 768) {
      this._mobileView = 'browse';
      const posProducts = document.querySelector('.pos-products');
      const cartPanel = document.querySelector('.pos-cart-panel');
      if (posProducts) posProducts.style.display = '';
      if (cartPanel) {
        cartPanel.classList.remove('mobile-cart-view');
        cartPanel.classList.add('collapsed');
      }
      // Move customer section above product list
      const custSection = document.querySelector('.pos-customer-section');
      const searchBar = posProducts?.querySelector('.pos-search-bar');
      if (custSection && searchBar) {
        searchBar.insertAdjacentElement('afterend', custSection);
        custSection.style.display = '';
      }
    }

    document.querySelectorAll('.pos-payment-option').forEach((o, i) => {
      o.classList.toggle('active', i === 0);
      o.querySelector('input').checked = i === 0;
    });
    this.renderProducts('');
    this.renderCart();
    this.updateTotals();
    this.updateDraftsBar();
    document.getElementById('pos-drafts-panel').style.display = 'none';
    // Clock
    clearInterval(this.posTimer);
    const updateTime = () => {
      const now = new Date();
      document.getElementById('pos-time').textContent = now.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    updateTime();
    this.posTimer = setInterval(updateTime, 1000);
    setTimeout(() => document.getElementById('pos-product-search').focus(), 200);

    this.applyViewMode();
  },

  close(force) {
    // If cart has items and not forced, show confirmation popup
    if (!force && this.cart.length > 0) {
      this.showExitConfirm();
      return;
    }
    // Mobile: move customer back to cart panel
    const custSection = document.querySelector('.pos-customer-section');
    const cartPanel = document.querySelector('.pos-cart-panel');
    if (custSection && cartPanel && custSection.parentElement !== cartPanel) {
      cartPanel.insertBefore(custSection, cartPanel.firstChild);
    }
    document.getElementById('pos-overlay').style.display = 'none';
    this._posOpen = false;
    clearInterval(this.posTimer);
  },

  showExitConfirm() {
    // Remove existing popup if any
    document.getElementById('pos-exit-confirm')?.remove();
    const popup = document.createElement('div');
    popup.id = 'pos-exit-confirm';
    popup.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:20px;';
    popup.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:24px;max-width:340px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);position:relative">
        <button id="pos-exit-x" style="position:absolute;top:10px;right:10px;background:none;border:none;cursor:pointer;color:#EF4444;padding:4px;border-radius:6px;transition:background 0.2s" title="Tiếp tục">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="22" height="22"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div style="width:56px;height:56px;margin:0 auto 16px;background:#FEF3C7;border-radius:50%;display:flex;align-items:center;justify-content:center">
          <svg viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" width="28" height="28"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <h3 style="margin:0 0 8px;font-size:1.1rem;color:#1F2937">Bạn có muốn lưu đơn hàng này hay không?</h3>
        <p style="margin:0 0 20px;font-size:0.85rem;color:#6B7280">Đơn hàng có ${this.cart.length} sản phẩm sẽ bị mất nếu không lưu tạm.</p>
        <div style="display:flex;gap:12px;justify-content:center">
          <button id="pos-exit-discard" style="flex:1;padding:12px 16px;border:none;border-radius:10px;font-size:0.95rem;font-weight:700;cursor:pointer;background:linear-gradient(135deg,#EF4444,#B91C1C);color:#fff">Không</button>
          <button id="pos-exit-save" style="flex:1;padding:12px 16px;border:none;border-radius:10px;font-size:0.95rem;font-weight:700;cursor:pointer;background:linear-gradient(135deg,#1B5E20,#059669);color:#fff">Lưu tạm</button>
        </div>
      </div>
    `;
    document.body.appendChild(popup);
    // X button - dismiss popup, continue working
    document.getElementById('pos-exit-x').addEventListener('click', () => popup.remove());
    // Discard - close without saving
    document.getElementById('pos-exit-discard').addEventListener('click', () => {
      popup.remove();
      this.cart = [];
      this.close(true);
    });
    // Save draft then close
    document.getElementById('pos-exit-save').addEventListener('click', () => {
      popup.remove();
      this.saveDraft();
      this.close(true);
    });
  },

  renderProducts(query) {
    const q = (query || '').toLowerCase();
    const list = App.products.filter(p => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    const c = document.getElementById('pos-product-list');
    if (!list.length) {
      c.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">Không tìm thấy sản phẩm</div>';
      return;
    }
    c.innerHTML = list.map(p => {
      const stockClass = p.stock <= 0 ? 'out' : p.stock <= 3 ? 'low' : '';
      const outClass = p.stock <= 0 ? 'out-of-stock' : '';
      const cartItem = this.cart.find(ci => ci.id === p.id);
      const inCart = !!cartItem;
      const inCartClass = inCart ? 'in-cart' : '';
      // If product is in cart, show qty controls instead of simple click
      const qtyControls = inCart 
        ? `<div class="pos-p-qty-inline" onclick="event.stopPropagation()">
             <button onclick="POS.updateQty('${p.id}',-1)">−</button>
             <span>${cartItem.qty}</span>
             <button onclick="POS.updateQty('${p.id}',1)">+</button>
           </div>`
        : '';
      return `<div class="pos-p-card ${outClass} ${inCartClass}" data-sku="${p.sku}" onclick="POS.addToCart('${p.id}')">
        <img class="pos-p-img" id="posimg-${p.id}" src="" alt="">
        <div class="pos-p-info">
          <div class="pos-p-name">${p.name}</div>
          <div class="pos-p-sku">${p.sku}</div>
          <div class="pos-p-bottom">
            <span class="pos-p-price">${fmtd(p.sellPrice)}</span>
            <span class="pos-p-stock ${stockClass}">${p.stock <= 0 ? 'Hết hàng' : 'Kho: ' + p.stock}</span>
          </div>
        </div>
        ${qtyControls}
      </div>`;
    }).join('');

    // Load product images from IndexedDB (display only)
    this.loadPosImages(list);
  },

  async loadPosImages(products) {
    const defaultImg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="6" fill="#f0f4ff"/><path d="M16 32l6-8 4 5 6-7 6 10H10z" fill="#c5d5f7"/><circle cx="18" cy="18" r="3" fill="#a0b8e8"/></svg>');
    for (const p of products) {
      const img = document.getElementById('posimg-' + p.id);
      if (!img) continue;
      const saved = await App.getProductImage(p.id);
      img.src = saved || defaultImg;
    }
  },

  applyViewMode() {
    const list = document.getElementById('pos-product-list');
    if (!list) return;
    list.classList.remove('view-grid', 'view-compact', 'view-list');
    list.classList.add('view-' + this.viewMode);
    // Update active button
    document.querySelectorAll('.pos-view-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === this.viewMode);
    });
  },

  addToCart(productId) {
    const p = App.products.find(x => x.id === productId);
    if (!p) return;
    const existing = this.cart.find(c => c.id === productId);
    if (existing) {
      existing.qty++;
      if (p.stock <= 0) {
        App.toast('info', p.name + ' dang het hang. Hay luu tam don!');
      } else if (existing.qty > p.stock) {
        App.toast('info', p.name + ' vuot ton kho (con ' + p.stock + '). Hay luu tam don!');
      }
    } else {
      this.cart.push({ id: p.id, sku: p.sku, name: p.name, price: p.sellPrice, qty: 1, unit: p.unit, maxStock: p.stock });
      if (p.stock <= 0) {
        App.toast('info', p.name + ' dang het hang. Hay luu tam don!');
      }
    }
    // Mobile: ALWAYS switch to cart view after adding a product
    if (window.innerWidth <= 768) {
      this.switchMobileView('cart');
    }
    this.renderCart();
    this.updateTotals();
  },

  // Mobile POS: toggle between browse (product list) and cart (checkout) views
  switchMobileView(view) {
    if (!this._isMobile?.()) return;
    const posProducts = document.querySelector('.pos-products');
    const cartPanel = document.querySelector('.pos-cart-panel');
    const custSection = document.querySelector('.pos-customer-section');
    if (!posProducts || !cartPanel) return;

    if (view === 'cart') {
      // Move customer back to cart panel (so it's visible in cart view)
      if (custSection && custSection.parentElement !== cartPanel) {
        cartPanel.insertBefore(custSection, cartPanel.firstChild);
        custSection.style.display = '';
      }
      const custInCart = cartPanel.querySelector('.pos-customer-section');
      if (custInCart) custInCart.style.display = '';

      // Hide product list, show full cart
      posProducts.style.display = 'none';
      cartPanel.classList.remove('collapsed');
      cartPanel.classList.add('mobile-cart-view');
      this._mobileView = 'cart';
    } else {
      // Show as "search to add" mode
      if (custSection) custSection.style.display = 'none';
      
      // Show product list (includes drafts bar)
      posProducts.style.display = '';
      cartPanel.classList.remove('mobile-cart-view');
      // Always collapse cart (show only total bar at bottom)
      cartPanel.classList.add('collapsed');
      // Refresh drafts bar
      this.updateDraftsBar();
      // Close drafts panel
      const draftsPanel = document.getElementById('pos-drafts-panel');
      if (draftsPanel) draftsPanel.style.display = 'none';
      
      this._mobileView = 'browse';
      // Re-render products to show cart highlights
      this.renderProducts(document.getElementById('pos-product-search').value);
      // Focus search
      setTimeout(() => document.getElementById('pos-product-search')?.focus(), 100);
    }
  },

  updateQty(productId, delta) {
    const item = this.cart.find(c => c.id === productId);
    if (!item) return;
    const p = App.products.find(x => x.id === productId);
    const newQty = item.qty + delta;
    if (newQty <= 0) {
      this.cart = this.cart.filter(c => c.id !== productId);
    } else {
      item.qty = newQty;
      if (p && newQty > p.stock) {
        App.toast('info', p.name + ' vuot ton kho (con ' + p.stock + '). Hay luu tam don!');
      }
    }
    this.renderCart();
    this.updateTotals();
    // Re-render products to update highlights
    if (this._mobileView === 'browse') {
      this.renderProducts(document.getElementById('pos-product-search').value);
    }
    if (!this.cart.length && this._isMobile?.()) this.switchMobileView('browse');
  },

  removeFromCart(productId) {
    this.cart = this.cart.filter(c => c.id !== productId);
    this.renderCart();
    this.updateTotals();
    // Mobile: go back to browse if cart empty
    if (!this.cart.length && this._isMobile?.()) this.switchMobileView('browse');
  },

  renderCart() {
    const c = document.getElementById('pos-cart-items');
    if (!this.cart.length) {
      c.innerHTML = `<div class="pos-cart-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>
        <p>Chưa có sản phẩm</p><span>Tìm và chọn sản phẩm bên trái</span>
      </div>`;
      return;
    }
    // Mobile: add "Thêm SP" button at top of cart
    const addMoreBtn = this._isMobile?.() && this._mobileView === 'cart'
      ? `<div class="pos-add-more-bar" onclick="POS.switchMobileView('browse')">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
           <span>Thêm sản phẩm...</span>
         </div>`
      : '';
    
    c.innerHTML = addMoreBtn + this.cart.map(item => {
      const product = App.products.find(p => p.id === item.id || p.sku === item.sku || p.sku === item.id || p.id === item.sku || p.name === item.name);
      const stock = product ? product.stock : 999;
      const overStock = item.qty > stock;
      return `
      <div class="pos-cart-item">
        <button class="pos-cart-remove" onclick="POS.removeFromCart('${item.id}')" title="Xóa sản phẩm">✕</button>
        <img class="pos-cart-thumb" id="cartimg-${item.id}" src="" alt="">
        <div class="pos-cart-info">
          <div class="pos-cart-item-name">${item.name}</div>
          <div class="pos-cart-item-price">
            <span class="pos-price-edit" onclick="POS.editPrice('${item.id}')" title="Click để sửa giá">${fmtd(item.price)}</span>
            <span> × ${item.qty}</span>
          </div>
        </div>
        <div class="pos-cart-qty">
          <button onclick="POS.updateQty('${item.id}',-1)" class="${item.qty <= 1 ? 'remove' : ''}">−</button>
          <span class="pos-qty-edit ${overStock ? 'overstock' : ''}" onclick="POS.editQty('${item.id}')" title="Click để nhập số lượng">${item.qty}</span>
          <button onclick="POS.updateQty('${item.id}',1)">+</button>
        </div>
        <div class="pos-cart-item-total">${fmtd(item.price * item.qty)}</div>
      </div>`;
    }).join('');

    // Load cart item images
    this.loadCartImages();
  },

  async loadCartImages() {
    const defaultImg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="6" fill="#f0f4ff"/><path d="M16 32l6-8 4 5 6-7 6 10H10z" fill="#c5d5f7"/><circle cx="18" cy="18" r="3" fill="#a0b8e8"/></svg>');
    for (const item of this.cart) {
      const img = document.getElementById('cartimg-' + item.id);
      if (!img) continue;
      const saved = await App.getProductImage(item.id);
      img.src = saved || defaultImg;
    }
  },

  editPrice(productId) {
    const item = this.cart.find(c => c.id === productId);
    if (!item) return;
    const el = document.querySelector(`.pos-price-edit[onclick*="${productId}"]`);
    if (!el) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.value = item.price.toLocaleString('vi-VN');
    input.className = 'pos-price-input';
    input.style.cssText = 'width:100px;padding:2px 6px;border:1.5px solid var(--primary);border-radius:4px;font-size:0.85rem;outline:none;text-align:right;';
    el.replaceWith(input);
    input.focus();
    input.select();
    // Auto format with dots as user types
    input.addEventListener('input', () => {
      const raw = input.value.replace(/\D/g, '');
      input.value = raw ? parseInt(raw).toLocaleString('vi-VN') : '';
    });
    const save = () => {
      const raw = input.value.replace(/\D/g, '');
      const newPrice = parseInt(raw) || item.price;
      item.price = newPrice;
      this.renderCart();
      this.updateTotals();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
  },

  editQty(productId) {
    const item = this.cart.find(c => c.id === productId);
    if (!item) return;
    const el = document.querySelector(`.pos-qty-edit[onclick*="${productId}"]`);
    if (!el) return;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.value = item.qty;
    input.className = 'pos-qty-input';
    input.style.cssText = 'width:45px;padding:2px 4px;border:1.5px solid var(--primary);border-radius:4px;font-size:0.9rem;outline:none;text-align:center;';
    el.replaceWith(input);
    input.focus();
    input.select();
    const save = () => {
      const newQty = Math.max(1, parseInt(input.value) || 1);
      item.qty = newQty;
      this.renderCart();
      this.updateTotals();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
  },

  updateTotals() {
    const subtotal = this.cart.reduce((s, i) => s + i.price * i.qty, 0);
    const totalQty = this.cart.reduce((s, i) => s + i.qty, 0);
    const discount = parseInt(document.getElementById('pos-discount').value.replace(/\D/g, '')) || 0;
    const finalTotal = Math.max(0, subtotal - discount);
    document.getElementById('pos-subtotal').textContent = fmtd(subtotal);
    document.getElementById('pos-total-qty').textContent = totalQty;
    document.getElementById('pos-final-total').textContent = fmtd(finalTotal);
    const empty = this.cart.length === 0;
    document.getElementById('btn-checkout').disabled = empty;
    document.getElementById('btn-save-draft').disabled = empty;
    document.getElementById('btn-capture-cart').disabled = empty;
    // Mobile: show/hide bottom sheet
    if (this._isMobile?.()) {
      const cp = document.querySelector('.pos-cart-panel');
      if (cp) {
        if (empty) { cp.classList.add('collapsed'); }
        // Show collapsed bar with total when cart has items
      }
    }
  },

  async captureCart() {
    if (!this.cart.length) return;
    const btn = document.getElementById('btn-capture-cart');
    const origHTML = btn.innerHTML;
    btn.textContent = '...';
    btn.disabled = true;

    const subtotal = this.cart.reduce((s, i) => s + i.price * i.qty, 0);
    const discount = parseInt(document.getElementById('pos-discount').value.replace(/\D/g, '')) || 0;
    const finalTotal = Math.max(0, subtotal - discount);
    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const custName = this.selectedCustomer?.name || 'Khách lẻ';

    const temp = document.createElement('div');
    temp.style.cssText = 'position:fixed;left:-9999px;top:0;background:#ffffff;padding:24px 28px 28px 28px;width:420px;font-family:Inter,sans-serif;color:#000;';
    temp.innerHTML = `
      <div style="text-align:center;margin-bottom:2px">
        <img src="assets/logo2.png" style="max-width:260px;height:auto;display:block;margin:0 auto" crossorigin="anonymous">
      </div>
      <p style="font-size:1.2rem;font-weight:800;text-align:center;margin:2px 0 8px 0;color:#000">ĐƠN HÀNG</p>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:12px;padding:0 4px">
        <div style="flex:1;font-size:0.88rem;line-height:1.8">
          <div><b>Ngày:</b> ${dateStr} ${timeStr}</div>
          <div><b>Khách hàng:</b> ${custName}</div>
          <div><b>Trạng thái:</b> Đang chờ thanh toán</div>
          <div><b>Thanh toán:</b> ${document.querySelector('input[name="pos-payment"]:checked')?.value || 'Tiền mặt'}</div>
          <div><b>Địa chỉ:</b> ${localStorage.getItem('khs_store_addr') || 'Thanh Trì - Hà Nội'}</div>
          <div><b>Điện thoại:</b> ${localStorage.getItem('khs_store_phone') || '039 39 13 004'}</div>
        </div>
        <div id="inv-capture-qr-box" style="flex-shrink:0;border:1.5px solid #ddd;border-radius:8px;padding:8px;text-align:center;display:none">
          <img id="inv-capture-qr" src="" alt="" style="display:none;width:80px;height:80px;object-fit:contain;margin:0 auto">
          <div id="inv-capture-qr-info" style="font-size:0.68rem;font-weight:600;color:#222;line-height:1.5;margin-top:4px;white-space:pre-line;text-align:center"></div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:0.8rem">
        <thead>
          <tr style="border-bottom:2px solid #2E7D32">
            <th style="padding:6px 4px;text-align:left">#</th>
            <th style="padding:6px 4px;text-align:left">Sản phẩm</th>
            <th style="padding:6px 4px;text-align:right">SL</th>
            <th style="padding:6px 4px;text-align:right">Đơn giá</th>
            <th style="padding:6px 4px;text-align:right">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          ${this.cart.map((it, i) => `<tr style="border-bottom:1px solid #eee">
            <td style="padding:5px 4px">${i + 1}</td>
            <td style="padding:5px 4px"><img class="inv-prod-img" id="invimg-${it.id}" src="" style="width:28px;height:28px;border-radius:4px;object-fit:cover;vertical-align:middle;margin-right:4px">${it.name}</td>
            <td style="padding:5px 4px;text-align:right">${it.qty}</td>
            <td style="padding:5px 4px;text-align:right">${fmtd(it.price)}</td>
            <td style="padding:5px 4px;text-align:right;font-weight:600">${fmtd(it.qty * it.price)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="margin-top:12px;font-size:0.85rem">
        <div style="display:flex;justify-content:space-between;padding:4px 0"><span>Tổng tiền hàng:</span><span>${fmtd(subtotal)}</span></div>
        ${discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0"><span>Giảm giá:</span><span>-${fmtd(discount)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #2E7D32;font-size:1rem;font-weight:700;color:#2E7D32"><span>TỔNG CỘNG:</span><span>${fmtd(finalTotal)}</span></div>
      </div>
      <div style="text-align:center;margin-top:12px;font-size:0.9rem;color:#222;font-weight:600">
        <p>Cảm ơn quý khách đã mua hàng!</p>
        <p>Kiều Hương Store</p>
      </div>
    `;
    document.body.appendChild(temp);

    // Load saved QR code into invoice
    const savedQR = await App.getConfigValue('pos_qr_image');
    if (savedQR) {
      const qrImg = document.getElementById('inv-capture-qr');
      const box = document.getElementById('inv-capture-qr-box');
      qrImg.src = savedQR; qrImg.style.display = 'block';
      if (box) box.style.display = 'block';
    }
    const qrInfo = localStorage.getItem('khs_qr_info');
    if (qrInfo) {
      document.getElementById('inv-capture-qr-info').textContent = qrInfo;
      const box = document.getElementById('inv-capture-qr-box');
      if (box) box.style.display = 'block';
    }

    // Load product images into invoice before capture
    const defaultImg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="6" fill="#f0f4ff"/><path d="M16 32l6-8 4 5 6-7 6 10H10z" fill="#c5d5f7"/><circle cx="18" cy="18" r="3" fill="#a0b8e8"/></svg>');
    for (const it of this.cart) {
      const img = document.getElementById('invimg-' + it.id);
      if (!img) continue;
      const saved = await App.getProductImage(it.id);
      img.src = saved || defaultImg;
    }
    // Wait for images to load
    await new Promise(r => setTimeout(r, 300));

    try {
      const canvas = await html2canvas(temp, { backgroundColor: '#ffffff', scale: 2 });
      const dataUrl = canvas.toDataURL('image/png');

      // Show image in overlay instead of downloading
      const overlay = document.createElement('div');
      overlay.id = 'img-preview-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
      overlay.innerHTML = `
        <div style="background:#fff;border-radius:12px;padding:16px;max-width:480px;max-height:90vh;overflow:auto;position:relative;">
          <button id="img-x-close" style="position:absolute;top:8px;right:8px;background:none;border:none;cursor:pointer;padding:4px;color:#EF4444;border-radius:4px;transition:background 0.2s" title="Đóng">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <img src="${dataUrl}" style="width:100%;display:block;border-radius:8px;" alt="Đơn hàng">
          <div style="display:flex;gap:8px;margin-top:12px;justify-content:center;">
            <button id="img-save-btn" style="padding:8px 20px;background:#2E7D32;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;">Lưu ảnh</button>
            ${navigator.share ? '<button id="img-share-btn" style="padding:8px 20px;background:#1A73E8;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;">Chia sẻ</button>' : ''}
            <button id="img-close-btn" style="padding:8px 20px;background:#6b7280;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;">Đóng</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      // Close only via buttons
      document.getElementById('img-close-btn').onclick = () => overlay.remove();
      document.getElementById('img-x-close').onclick = () => overlay.remove();
      document.getElementById('img-x-close').onmouseover = (e) => e.currentTarget.style.background = '#FEE2E2';
      document.getElementById('img-x-close').onmouseout = (e) => e.currentTarget.style.background = 'none';

      // Save button — use File System API or open in new window
      document.getElementById('img-save-btn').onclick = async () => {
        try {
          const blob = await (await fetch(dataUrl)).blob();
          // Try modern File System Access API (shows native Save dialog)
          if (window.showSaveFilePicker) {
            const safeName = custName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            const safeDate = dateStr.replace(/\//g, '');
            const timeStamp = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
            const handle = await window.showSaveFilePicker({
              suggestedName: 'DonHang_' + safeName + '_' + safeDate + '_' + timeStamp + '.png',
              types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            App.toast('success', 'Da luu anh thanh cong!');
          } else {
            // Fallback: open in new tab
            const blobUrl = URL.createObjectURL(blob);
            window.open(blobUrl, '_blank');
            App.toast('info', 'Anh da mo trong tab moi. Nhan giu chuot phai de luu!');
          }
        } catch (e) {
          if (e.name !== 'AbortError') {
            // Last fallback: open data URL
            window.open(dataUrl, '_blank');
            App.toast('info', 'Nhan giu chuot phai vao anh de luu!');
          }
        }
      };

      // Share button (mobile)
      const shareBtn = document.getElementById('img-share-btn');
      if (shareBtn) {
        shareBtn.onclick = async () => {
          try {
            const blob = await (await fetch(dataUrl)).blob();
            const file = new File([blob], 'DonHang.png', { type: 'image/png' });
            await navigator.share({ title: 'Don hang', files: [file] });
          } catch (e) { /* user cancelled */ }
        };
      }

      App.toast('success', 'Anh don hang da san sang!');
    } catch (err) {
      App.toast('error', 'Loi: ' + err.message);
    }
    document.body.removeChild(temp);
    btn.innerHTML = origHTML;
    btn.disabled = false;
  },
  searchCustomers(query) {
    const dd = document.getElementById('pos-customer-dropdown');
    if (!query || query.length < 1) { dd.style.display = 'none'; return; }
    const q = query.toLowerCase();
    const matches = App.customers.filter(c => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)));
    if (!matches.length) {
      dd.innerHTML = `<div class="pos-customer-option" onclick="POS.setCustomerManual('${query.replace(/'/g, "\\'")}')">
        <span class="name">+ Thêm mới: "${query}"</span>
      </div>`;
    } else {
      dd.innerHTML = matches.slice(0, 5).map(c => `
        <div class="pos-customer-option" onclick="POS.selectCustomer('${c.id}')">
          <span class="name">${c.name}</span>
          <span class="phone">${c.phone || ''}</span>
        </div>
      `).join('');
    }
    dd.style.display = 'block';
  },

  selectCustomer(id) {
    const c = App.customers.find(x => x.id === id);
    if (!c) return;
    this.selectedCustomer = { id: c.id, name: c.name, phone: c.phone, address: c.address };
    this.showSelectedCustomer();
  },

  setCustomerManual(name) {
    this.selectedCustomer = { id: '', name: name, phone: '', address: '' };
    this.showSelectedCustomer();
  },

  showSelectedCustomer() {
    document.getElementById('pos-customer-dropdown').style.display = 'none';
    document.getElementById('pos-customer-search').value = '';
    // Hide search bar, show only selected name
    const section = document.querySelector('.pos-customer-section');
    if (section) section.classList.add('customer-selected');
    const el = document.getElementById('pos-selected-customer');
    el.style.display = 'flex';
    el.innerHTML = `<span class="cust-name" onclick="POS.clearCustomer()" title="Bấm để đổi khách hàng">👤 ${this.selectedCustomer.name}</span>
      <span class="cust-remove" onclick="POS.clearCustomer()">✕</span>`;
  },

  clearCustomer() {
    this.selectedCustomer = null;
    document.getElementById('pos-selected-customer').style.display = 'none';
    // Show search bar again
    const section = document.querySelector('.pos-customer-section');
    if (section) section.classList.remove('customer-selected');
    setTimeout(() => document.getElementById('pos-customer-search')?.focus(), 100);
  },



  checkout() {
    if (!this.cart.length) return;

    // Check if offline — auto save as draft
    if (!navigator.onLine) {
      this.saveDraft();
      App.toast('warning', 'Khong co mang! Don hang da duoc LUU TAM. Khi co mang, hay mo don tam va bam THANH TOAN de hoan tat.');
      return;
    }

    // Check stock availability
    const outOfStock = [];
    for (const item of this.cart) {
      const p = App.products.find(x => x.id === item.id || x.sku === item.sku || x.sku === item.id || x.id === item.sku || x.name === item.name);
      const stock = p ? p.stock : 0;
      console.log('[Stock Check]', item.name, 'id:', item.id, 'sku:', item.sku, '→ found:', !!p, 'stock:', stock);
      if (stock <= 0) {
        outOfStock.push(item.name + ' (het hang)');
      } else if (item.qty > stock) {
        outOfStock.push(item.name + ' (con ' + stock + ', dat ' + item.qty + ')');
      }
    }
    if (outOfStock.length) {
      App.toast('error', 'Khong du ton kho: ' + outOfStock.join(', '));
      return;
    }

    const subtotal = this.cart.reduce((s, i) => s + i.price * i.qty, 0);
    const discount = parseInt(document.getElementById('pos-discount').value.replace(/\D/g, '')) || 0;
    const finalTotal = Math.max(0, subtotal - discount);
    const payment = document.querySelector('input[name="pos-payment"]:checked').value;
    const note = document.getElementById('pos-note').value;
    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    const order = {
      id: 'DH' + now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + String(App.orders.length + 1).padStart(3, '0'),
      customerId: this.selectedCustomer?.id || '',
      customerName: this.selectedCustomer?.name || 'Khách lẻ',
      items: this.cart.map(i => ({ name: i.name, sku: i.sku, qty: i.qty, price: i.price })),
      total: subtotal, discount, finalTotal,
      payment, status: 'completed', note,
      createdBy: App.user.displayName,
      createdAt: `${dateStr} ${timeStr}`
    };

    // DON'T subtract local stock — let Google Sheets be the source of truth
    // Stock will be refreshed via autoSync after checkout

    // Update customer spending
    if (this.selectedCustomer?.id) {
      const cust = App.customers.find(c => c.id === this.selectedCustomer.id);
      if (cust) { cust.totalSpent += finalTotal; cust.lastOrder = dateStr; }
    }

    App.orders.unshift(order);
    App.toast('success', 'Đã tạo đơn hàng ' + order.id + ' - ' + fmtd(finalTotal));

    // If this was loaded from a draft, delete the draft now
    if (this.currentDraftId) {
      this.deleteDraft(this.currentDraftId);
      this.currentDraftId = null;
    }

    // Sync to Google Sheets if API is configured
    const apiUrl = localStorage.getItem('khs_api_url');
    if (apiUrl) {
      const orderPayload = {
        action: 'createOrder',
        customerId: order.customerId,
        customerName: order.customerName,
        customerPhone: this.selectedCustomer?.phone || '',
        customerAddress: this.selectedCustomer?.address || '',
        items: order.items,
        total: subtotal,
        discount,
        finalTotal,
        payment,
        note,
        createdBy: App.user.displayName
      };
      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(orderPayload)
      }).then(r => r.json()).then(res => {
        if (res.success) {
          App.toast('success', 'Đã đồng bộ lên Google Sheets: ' + res.orderId);
          setTimeout(() => App.autoSync(), 3000);
        }
      }).catch(() => {
        // Mất mạng → lưu vào queue chờ sync
        this.addToSyncQueue(orderPayload);
        App.toast('warning', '📡 Mất kết nối! Đơn đã lưu chờ đồng bộ khi có mạng.');
      });
    }

    this.cart = []; // Clear cart BEFORE close so popup won't trigger
    this.close(true);
    this.showInvoice(order);
  },

  saveDraft() {
    if (!this.cart.length) return;
    const drafts = JSON.parse(localStorage.getItem('khs_drafts') || '[]');
    const draft = {
      id: this.currentDraftId || Date.now(),
      cart: JSON.parse(JSON.stringify(this.cart)),
      customer: this.selectedCustomer ? { ...this.selectedCustomer } : null,
      discount: document.getElementById('pos-discount').value,
      note: document.getElementById('pos-note').value,
      savedAt: new Date().toLocaleString('vi-VN')
    };
    // Update existing draft or add new
    const existIdx = drafts.findIndex(d => d.id === draft.id);
    if (existIdx !== -1) {
      drafts[existIdx] = draft;
    } else {
      drafts.unshift(draft);
    }
    localStorage.setItem('khs_drafts', JSON.stringify(drafts));
    App.toast('success', `💾 Đã lưu tạm đơn hàng (${this.cart.length} SP)`);
    this.cart = [];
    this.selectedCustomer = null;
    this.currentDraftId = null;
    document.getElementById('pos-selected-customer').style.display = 'none';
    this.renderCart();
    this.updateTotals();
    this.updateDraftsBar();
  },

  loadDraft(draftId) {
    const drafts = JSON.parse(localStorage.getItem('khs_drafts') || '[]');
    const idx = drafts.findIndex(d => d.id === draftId);
    if (idx === -1) return;
    const draft = drafts[idx];
    // Load cart
    this.cart = draft.cart;
    this.selectedCustomer = draft.customer;
    this.currentDraftId = draft.id; // Track which draft is loaded
    if (draft.customer) {
      this.showSelectedCustomer();
    } else {
      document.getElementById('pos-selected-customer').style.display = 'none';
    }
    document.getElementById('pos-discount').value = draft.discount || '';
    document.getElementById('pos-note').value = draft.note || '';
    // Do NOT remove from drafts — only deleteDraft (X button) removes
    this.renderCart();
    this.updateTotals();
    document.getElementById('pos-drafts-panel').style.display = 'none';
    // Mobile: switch to cart view to show loaded draft
    if (window.innerWidth <= 768 && this.cart.length) {
      this.switchMobileView('cart');
    }
    App.toast('success', `📂 Đã tải đơn tạm (${this.cart.length} SP)`);
  },

  deleteDraft(draftId) {
    const drafts = JSON.parse(localStorage.getItem('khs_drafts') || '[]');
    const filtered = drafts.filter(d => d.id !== draftId);
    localStorage.setItem('khs_drafts', JSON.stringify(filtered));
    App.toast('info', '🗑 Đã xóa đơn tạm');
    this.updateDraftsBar();
    this.renderDrafts();
  },

  renderDrafts() {
    const drafts = JSON.parse(localStorage.getItem('khs_drafts') || '[]');
    const panel = document.getElementById('pos-drafts-panel');
    if (!drafts.length) {
      panel.style.display = 'none';
      return;
    }
    panel.innerHTML = drafts.map(d => {
      const totalQty = d.cart.reduce((s, i) => s + i.qty, 0);
      const totalPrice = d.cart.reduce((s, i) => s + i.price * i.qty, 0);
      const names = d.cart.map(i => i.name).join(', ');
      return `
      <div class="pos-draft-item">
        <div class="pos-draft-info" onclick="POS.loadDraft(${d.id})">
          <div class="pos-draft-title">${d.customer?.name || 'Khách lẻ'} — ${totalQty} SP</div>
          <div class="pos-draft-detail">${names.length > 60 ? names.substring(0, 60) + '...' : names}</div>
          <div class="pos-draft-meta">${fmtd(totalPrice)} · ${d.savedAt}</div>
        </div>
        <button class="pos-draft-delete" onclick="POS.deleteDraft(${d.id})" title="Xóa">✕</button>
      </div>`;
    }).join('');
    panel.style.display = 'block';
  },

  updateDraftsBar() {
    const drafts = JSON.parse(localStorage.getItem('khs_drafts') || '[]');
    const bar = document.getElementById('pos-drafts-bar');
    const count = document.getElementById('pos-drafts-count');
    if (drafts.length > 0) {
      bar.style.display = 'flex';
      count.textContent = drafts.length;
    } else {
      bar.style.display = 'none';
      document.getElementById('pos-drafts-panel').style.display = 'none';
    }
  },

  async captureInvoice() {
    const el = document.getElementById('invoice-content');
    if (!el) return;
    const btn = document.getElementById('btn-capture-invoice');
    btn.textContent = '⏳ Đang chụp...';
    btn.disabled = true;
    try {
      const canvas = await html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true
      });
      const link = document.createElement('a');
      const orderId = el.querySelector('.inv-info-row .val')?.textContent || 'hoadon';
      link.download = `${orderId}.png`;
      link.href = canvas.toDataURL('image/png');
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      App.toast('success', `📷 Đã tải ảnh hóa đơn: ${orderId}.png`);
    } catch (err) {
      App.toast('error', '❌ Lỗi chụp ảnh: ' + err.message);
    }
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> 📷 Tải ảnh`;
    btn.disabled = false;
  },

  showInvoice(order) {
    const el = document.getElementById('invoice-content');
    el.innerHTML = `
      <div class="inv-header" style="text-align:center">
        <img src="assets/logo2.png" style="max-width:220px;height:auto;margin-bottom:4px">
        <p style="margin:4px 0 8px 0;font-size:1.2rem;font-weight:800;color:#000">HÓA ĐƠN BÁN HÀNG</p>
      </div>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin:0 0 8px 0;padding:0;gap:12px">
        <div class="inv-info" style="flex:1">
          <div class="inv-info-row"><span class="label">Mã đơn:</span><span class="val">${order.id}</span></div>
          <div class="inv-info-row"><span class="label">Ngày:</span><span class="val">${order.createdAt}</span></div>
          <div class="inv-info-row"><span class="label">Khách hàng:</span><span class="val">${order.customerName}</span></div>
          <div class="inv-info-row"><span class="label">Thanh toán:</span><span class="val">${order.payment}</span></div>
          <div class="inv-info-row"><span class="label">Người bán:</span><span class="val">${order.createdBy}</span></div>
          <div class="inv-info-row"><span class="label">Địa chỉ:</span><span class="val">${localStorage.getItem('khs_store_addr') || 'Thanh Trì - Hà Nội'}</span></div>
          <div class="inv-info-row"><span class="label">Điện thoại:</span><span class="val">${localStorage.getItem('khs_store_phone') || '039 39 13 004'}</span></div>
        </div>
        <div id="inv-popup-qr-box" style="flex-shrink:0;border:1.5px solid #ddd;border-radius:8px;padding:8px;text-align:center;display:none">
          <img id="inv-popup-qr" src="" alt="" style="display:none;width:90px;height:90px;object-fit:contain;margin:0 auto">
          <div id="inv-popup-qr-info" style="font-size:0.72rem;font-weight:600;color:#222;line-height:1.5;margin-top:6px;white-space:pre-line;text-align:center"></div>
        </div>
      </div>
      <table class="inv-table">
        <thead><tr><th>#</th><th>Sản phẩm</th><th class="right">SL</th><th class="right">Đơn giá</th><th class="right">Thành tiền</th></tr></thead>
        <tbody>
          ${order.items.map((it, i) => `<tr>
            <td>${i + 1}</td><td>${it.name}</td>
            <td class="right">${it.qty}</td>
            <td class="right">${fmtd(it.price)}</td>
            <td class="right" style="font-weight:600">${fmtd(it.qty * it.price)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="inv-totals">
        <div class="inv-total-row"><span>Tổng tiền hàng:</span><span>${fmtd(order.total)}</span></div>
        ${order.discount > 0 ? `<div class="inv-total-row"><span>Giảm giá:</span><span>-${fmtd(order.discount)}</span></div>` : ''}
        <div class="inv-total-row final"><span>TỔNG THANH TOÁN:</span><span>${fmtd(order.finalTotal)}</span></div>
      </div>
      ${order.note ? `<div style="margin-top:12px;font-size:0.85rem;color:var(--text-secondary)">Ghi chú: ${order.note}</div>` : ''}
      <div class="inv-footer" style="font-size:1rem;font-weight:700;color:#111">
        <p>Cảm ơn quý khách đã mua hàng!</p>
        <p>Kiều Hương Store</p>
      </div>
    `;
    // Load QR + info into popup
    App.getConfigValue('pos_qr_image').then(saved => {
      if (saved) {
        const qr = document.getElementById('inv-popup-qr');
        const box = document.getElementById('inv-popup-qr-box');
        if (qr) { qr.src = saved; qr.style.display = 'block'; }
        if (box) box.style.display = 'block';
      }
    });
    const qrInfoPopup = localStorage.getItem('khs_qr_info');
    if (qrInfoPopup) {
      const infoEl = document.getElementById('inv-popup-qr-info');
      if (infoEl) infoEl.textContent = qrInfoPopup;
      const box = document.getElementById('inv-popup-qr-box');
      if (box) box.style.display = 'block';
    }
    document.getElementById('invoice-overlay').style.display = 'flex';
  },

  // ── Offline Sync Queue ──
  addToSyncQueue(payload) {
    const queue = JSON.parse(localStorage.getItem('khs_sync_queue') || '[]');
    payload._queuedAt = new Date().toLocaleString('vi-VN');
    queue.push(payload);
    localStorage.setItem('khs_sync_queue', JSON.stringify(queue));
    this.updateSyncBadge();
  },

  async processSyncQueue() {
    const queue = JSON.parse(localStorage.getItem('khs_sync_queue') || '[]');
    if (!queue.length) return;
    const apiUrl = localStorage.getItem('khs_api_url');
    if (!apiUrl || !navigator.onLine) return;

    App.toast('info', `📡 Đang đồng bộ ${queue.length} đơn chờ...`);
    const remaining = [];
    for (const payload of queue) {
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.success) {
          App.toast('success', `✅ Đã sync đơn: ${json.orderId || 'OK'}`);
        } else {
          remaining.push(payload);
        }
      } catch(e) {
        remaining.push(payload);
        break; // Mất mạng lại → dừng
      }
    }
    localStorage.setItem('khs_sync_queue', JSON.stringify(remaining));
    this.updateSyncBadge();
    if (!remaining.length) {
      App.toast('success', '🎉 Đã đồng bộ tất cả đơn chờ!');
      setTimeout(() => App.autoSync(), 2000);
    }
  },

  getSyncQueueCount() {
    return JSON.parse(localStorage.getItem('khs_sync_queue') || '[]').length;
  },

  updateSyncBadge() {
    const count = this.getSyncQueueCount();
    let badge = document.getElementById('sync-queue-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'sync-queue-badge';
        badge.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#EF4444;color:#fff;padding:8px 16px;border-radius:20px;font-size:0.85rem;font-weight:600;cursor:pointer;z-index:9999;box-shadow:0 4px 12px rgba(239,68,68,0.4);animation:pulse 2s infinite;';
        badge.onclick = () => this.processSyncQueue();
        document.body.appendChild(badge);
      }
      badge.textContent = `📡 ${count} đơn chờ sync`;
    } else if (badge) {
      badge.remove();
    }
  }
};

document.addEventListener('DOMContentLoaded', () => POS.init());

// Auto-retry sync khi có mạng lại
window.addEventListener('online', () => {
  App.toast('success', '🌐 Đã có mạng!');
  setTimeout(() => POS.processSyncQueue(), 1000);
});

// Check queue khi mở app
window.addEventListener('load', () => {
  setTimeout(() => {
    POS.updateSyncBadge();
    if (navigator.onLine && POS.getSyncQueueCount() > 0) {
      POS.processSyncQueue();
    }
  }, 3000);
});
