/* ═══════════════════════════════════════════════════════════════
   QLBH Kiều Hương Store — KiotViet-style App
   ═══════════════════════════════════════════════════════════════ */

const DEMO_USERS = [
  // Đăng nhập qua Google Sheets API — không dùng tài khoản mặc định
];

// ── UTILS ──
function fmt(n) { return new Intl.NumberFormat('vi-VN').format(n || 0); }
function fmtd(n) { return fmt(n) + 'đ'; }
function unfmt(s) { return parseInt(String(s).replace(/\./g,''))||0; }
function fmtInput(el) { const v=unfmt(el.value); el.value=v?fmt(v):''; }
function fmtShort(n) {
  if (n >= 1000000) return (n/1000000).toFixed(1).replace('.0','') + ' tr';
  if (n >= 1000) return Math.round(n/1000) + 'K';
  return String(n);
}
function stockStatus(s) {
  if (s <= 0) return { c:'out-of-stock', t:'Hết hàng' };
  if (s <= 3) return { c:'low-stock', t:`Còn ${s}` };
  return { c:'in-stock', t:`Còn ${s}` };
}
function avatarColor(name) {
  const cols = ['#1A73E8','#7C3AED','#EC4899','#F59E0B','#EF4444','#06B6D4','#10B981','#8B5CF6'];
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return cols[Math.abs(h) % cols.length];
}

// ── APP ──
const App = {
  user: null,
  page: 'dashboard',
  products: [],
  customers: [],
  orders: [],
  returns: [],
  users: [],
  roles: [],
  batches: [],
  pSearch: '', pFilter: 'all', cSearch: '',

  init() {
    this.checkAuth();
    this.bind();
    this.initReturn();
    this.handleRoute();
    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('resize', () => {
      if (this.page === 'dashboard') this.drawChart();
    });
    // Phát hiện bản cập nhật Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (!reg) return;
        // Check for updates every 5 minutes
        setInterval(() => reg.update(), 5 * 60 * 1000);
        const showUpdateBanner = () => {
          if (document.getElementById('sw-update-banner')) return;
          const banner = document.createElement('div');
          banner.id = 'sw-update-banner';
          banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;font-size:0.9rem;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
          banner.innerHTML = `
            <span>🔄 Có bản cập nhật mới!</span>
            <button onclick="location.reload()" style="background:#fff;color:#764ba2;border:none;padding:6px 16px;border-radius:6px;font-weight:700;cursor:pointer;font-size:0.85rem">Cập nhật ngay</button>
          `;
          document.body.prepend(banner);
        };
        // New SW waiting
        if (reg.waiting) showUpdateBanner();
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner();
            }
          });
        });
      });
    }
    // Auto-sync from Google Sheets if API is configured
    this.autoSync();
  },

  async autoSync() {
    const splash = document.getElementById('loading-splash');
    const hideSplash = () => {
      if (splash && splash.parentNode) { splash.style.opacity='0'; splash.style.transition='0.3s'; setTimeout(()=>{ if(splash.parentNode) splash.remove(); },300); }
    };
    // Safety: hide splash after 10s no matter what
    const safety = setTimeout(hideSplash, 10000);
    try {
      let url = localStorage.getItem('khs_api_url');
      if (!url) {
        url = await this.getConfigValue('api_url');
        if (url) localStorage.setItem('khs_api_url', url);
      }
      if (!url) { hideSplash(); clearTimeout(safety); return; }
      const [pRes, cRes, oRes, rRes, uRes, roRes, bRes] = await Promise.all([
        fetch(url + '?action=getProducts').then(r => r.json()).catch(() => ({ success: false })),
        fetch(url + '?action=getCustomers').then(r => r.json()).catch(() => ({ success: false })),
        fetch(url + '?action=getOrders').then(r => r.json()).catch(() => ({ success: false })),
        fetch(url + '?action=getReturns').then(r => r.json()).catch(() => ({ success: false })),
        fetch(url + '?action=getUsers').then(r => r.json()).catch(() => ({ success: false })),
        fetch(url + '?action=getRoles').then(r => r.json()).catch(() => ({ success: false })),
        fetch(url + '?action=getBatches').then(r => r.json()).catch(() => ({ success: false }))
      ]);
      if (pRes.success && pRes.data?.length) this.products = pRes.data;
      if (cRes.success && cRes.data?.length) this.customers = cRes.data;
      if (oRes.success && oRes.data?.length) this.orders = oRes.data;
      if (rRes.success && rRes.data?.length) this.returns = rRes.data;
      if (uRes.success && uRes.data) this.users = uRes.data;
      if (roRes.success && roRes.data) this.roles = roRes.data;
      if (bRes.success && bRes.data) this.batches = bRes.data;
      this.handleRoute();
      // Sync ảnh từ cloud (background, không block UI)
      this.syncImagesFromCloud();
    } catch (e) {
      console.warn('Auto-sync failed:', e);
    } finally {
      clearTimeout(safety);
      hideSplash();
    }
  },

  hasPermission(perm) {
    const perms = this.user?.permissions || {};
    if (perms['*']) return true;
    return !!perms[perm];
  },

  checkAuth() {
    const s = localStorage.getItem('khs_user');
    if (s) {
      this.user = JSON.parse(s);
      // Ensure permissions exist (old cache may not have them)
      if (!this.user.permissions) {
        this.user.permissions = this.user.role === 'admin' || this.user.role === 'Admin' ? {'*': true} : {};
      }
      this.showApp();
    }
  },

  async login(u, p) {
    const url = localStorage.getItem('khs_api_url');
    // Try API auth first
    if (url) {
      try {
        const res = await fetch(url + '?action=auth&user=' + encodeURIComponent(u) + '&pass=' + encodeURIComponent(p)).then(r => r.json());
        if (res.success && res.user) {
          this.user = res.user;
          localStorage.setItem('khs_user', JSON.stringify(this.user));
          this.showApp();
          location.hash = '#dashboard';
          this.toast('success', `Chào mừng ${res.user.displayName}!`);
          return true;
        }
        if (res.error) return res.error;
      } catch (e) { console.warn('API login failed, trying offline:', e); }
    }
    // Fallback to local DEMO_USERS (offline mode)
    const user = DEMO_USERS.find(x => x.username === u && x.password === p);
    if (user) {
      this.user = { username:user.username, displayName:user.displayName, role:user.role, permissions: user.role==='admin'?{'*':true}:{} };
      localStorage.setItem('khs_user', JSON.stringify(this.user));
      this.showApp();
      location.hash = '#dashboard';
      this.toast('success', `Chào mừng ${user.displayName}!`);
      return true;
    }
    return 'Sai tên đăng nhập hoặc mật khẩu!';
  },

  logout() {
    this.user = null;
    localStorage.removeItem('khs_user');
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('login-page').style.display = 'flex';
    location.hash = '';
  },

  showApp() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    const dn = this.user.displayName;
    document.getElementById('header-username').textContent = dn;
    document.getElementById('header-avatar').textContent = dn[0];
    document.getElementById('dropdown-name').textContent = dn;
    document.getElementById('dropdown-role').textContent = this.user.role || 'Nhân viên';

    // Permission enforcement — hide nav items
    this.enforcePermissions();
  },

  enforcePermissions() {
    const navMap = {
      'dashboard': 'dashboard',
      'products': 'products.view',
      'orders': 'orders.view',
      'returns': 'orders.return',
      'customers': 'customers.view',
      'reports': 'reports',
      'settings': 'settings'
    };
    document.querySelectorAll('.nav-tab[data-page], .nav-tab-wrapper').forEach(el => {
      const page = el.dataset?.page || el.querySelector('.nav-tab')?.dataset?.page;
      if(page && navMap[page]) {
        el.style.display = this.hasPermission(navMap[page]) ? '' : 'none';
      }
    });
    // Return button
    const retBtn = document.getElementById('btn-return-header');
    if(retBtn) retBtn.style.display = this.hasPermission('orders.return') ? '' : 'none';
    // POS button
    const posBtn = document.getElementById('btn-pos');
    if(posBtn) posBtn.style.display = this.hasPermission('orders.create') ? '' : 'none';
    // Settings gear icon
    const settBtn = document.getElementById('btn-header-settings');
    if(settBtn) settBtn.style.display = this.hasPermission('settings') ? '' : 'none';
  },

  handleRoute() {
    if (!this.user) return;
    let h = location.hash.replace('#','') || 'dashboard';
    // "Bán hàng" tab → open POS overlay, stay on orders
    if (h === 'pos') {
      POS.open();
      location.hash = '#orders';
      return;
    }
    this.page = h;
    document.querySelectorAll('.nav-tab, .mob-nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === h);
    });
    this.render(h);
  },

  render(page) {
    const c = document.getElementById('page-container');
    // Permission check per page
    const pagePerms = {
      'dashboard': 'dashboard',
      'products': 'products.view',
      'orders': 'orders.view',
      'returns': 'orders.return',
      'customers': 'customers.view',
      'reports': 'reports',
      'settings': 'settings',
      'inventory': 'inventory'
    };
    if (pagePerms[page] && !this.hasPermission(pagePerms[page])) {
      this.toast('error', 'Bạn không có quyền truy cập trang này!');
      // Find first allowed page
      const fallbacks = ['dashboard','products','orders','customers','reports'];
      const allowed = fallbacks.find(p => !pagePerms[p] || this.hasPermission(pagePerms[p])) || 'dashboard';
      if (page !== allowed) { location.hash = '#' + allowed; return; }
    }
    c.style.opacity = '0';
    setTimeout(() => {
      switch(page) {
        case 'dashboard': this.renderDash(c); break;
        case 'products': this.renderProducts(c); break;
        case 'orders': this.renderOrders(c); break;
        case 'returns': this.renderReturnsPage(c); break;
        case 'customers': this.renderCustomers(c); break;
        case 'reports': this.renderReports(c); break;
        case 'settings': this.renderSettings(c); break;
        case 'inventory': this.renderInventory(c); break;
        default: this.renderDash(c);
      }
      c.style.opacity = '1';
      c.style.transition = 'opacity 0.2s ease';
    }, 80);
  },

  bind() {
    // Login
    document.getElementById('login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const u = document.getElementById('login-username').value;
      const p = document.getElementById('login-password').value;
      const btn = e.target.querySelector('button[type="submit"], .btn-primary');
      const origText = btn?.textContent;
      if(btn) { btn.textContent = 'Đang đăng nhập...'; btn.disabled = true; }
      const result = await this.login(u, p);
      if(btn) { btn.textContent = origText || 'Đăng nhập'; btn.disabled = false; }
      if (result !== true) {
        const err = document.getElementById('login-error');
        err.textContent = typeof result === 'string' ? result : 'Sai tên đăng nhập hoặc mật khẩu!';
        err.style.display = 'block';
        setTimeout(() => err.style.display = 'none', 3000);
      }
      // 'pending' = API login in progress, will handle via apiLogin
    });
    document.querySelector('.toggle-password').addEventListener('click', () => {
      const inp = document.getElementById('login-password');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
    // ── API config on login page ──
    const apiToggle = document.getElementById('login-api-toggle');
    const apiBox = document.getElementById('login-api-box');
    const apiInput = document.getElementById('login-api-url');
    const apiSave = document.getElementById('login-api-save');
    const apiStatus = document.getElementById('login-api-status');
    if (apiToggle) {
      apiToggle.addEventListener('click', () => {
        apiBox.style.display = apiBox.style.display === 'none' ? 'block' : 'none';
        const saved = localStorage.getItem('khs_api_url');
        if (saved) { apiInput.value = saved; apiStatus.textContent = '✅ Đã kết nối'; }
      });
    }
    if (apiSave) {
      apiSave.addEventListener('click', () => {
        const url = apiInput.value.trim();
        if (!url) { apiStatus.textContent = '❌ Vui lòng nhập URL'; apiStatus.style.color = '#EF4444'; return; }
        localStorage.setItem('khs_api_url', url);
        apiStatus.textContent = '✅ Đã lưu! Hãy đăng nhập.';
        apiStatus.style.color = '#10B981';
        this.autoSync();
      });
    }
    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => this.logout());
    // User dropdown
    document.getElementById('header-user-menu').addEventListener('click', function(e) {
      e.stopPropagation();
      this.classList.toggle('open');
    });
    document.addEventListener('click', () => {
      document.getElementById('header-user-menu').classList.remove('open');
    });
    // Modal
    document.getElementById('modal-close').addEventListener('click', () => this.closeModal());
    // Mobile nav toggle
    document.getElementById('mobile-menu-toggle').addEventListener('click', () => {
      document.querySelector('.main-nav').classList.toggle('open');
    });
    // POS button is handled by pos.js
    // Close mobile nav on tab click
    document.querySelectorAll('.nav-tab, .mob-nav-item').forEach(el => {
      el.addEventListener('click', () => document.querySelector('.main-nav').classList.remove('open'));
    });
  },

  // ═════════ DASHBOARD ═════════
  renderDash(c) {
    const now = new Date();
    const todayStr = String(now.getDate()).padStart(2,'0') + '/' + String(now.getMonth()+1).padStart(2,'0') + '/' + now.getFullYear();
    const monthStr = '/' + String(now.getMonth()+1).padStart(2,'0') + '/' + now.getFullYear();

    const completedOrders = this.orders.filter(o => o.status === 'completed');
    const todayOrders = completedOrders.filter(o => o.createdAt && o.createdAt.includes(todayStr));
    const monthOrders = completedOrders.filter(o => o.createdAt && o.createdAt.includes(monthStr));

    const todayRev = todayOrders.reduce((s, o) => s + (o.finalTotal || 0), 0);
    const monthRev = monthOrders.reduce((s, o) => s + (o.finalTotal || 0), 0);

    // Top 10 products from real order items
    const productQtyMap = {};
    monthOrders.forEach(o => {
      if (o.items) o.items.forEach(it => {
        const key = it.name || 'Unknown';
        productQtyMap[key] = (productQtyMap[key] || 0) + (it.qty || 1);
      });
    });
    const topProducts = Object.entries(productQtyMap)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    // Top 10 customers from real data
    const customerSpendMap = {};
    monthOrders.forEach(o => {
      const key = o.customerName || 'Khách lẻ';
      customerSpendMap[key] = (customerSpendMap[key] || 0) + (o.finalTotal || 0);
    });
    const topCustomers = Object.entries(customerSpendMap)
      .map(([name, total]) => ({ name, totalSpent: total }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);
    const maxSpent = topCustomers[0]?.totalSpent || 1;

    // Daily revenue for chart (current month)
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailyRev = new Array(daysInMonth).fill(0);
    monthOrders.forEach(o => {
      if (o.createdAt) {
        const dayMatch = o.createdAt.match(/^(\d{2})\//);
        if (dayMatch) {
          const day = parseInt(dayMatch[1]);
          if (day >= 1 && day <= daysInMonth) dailyRev[day - 1] += (o.finalTotal || 0);
        }
      }
    });
    // Only show up to today
    const chartData = dailyRev.slice(0, now.getDate());
    const chartLabels = chartData.map((_, i) => String(i + 1).padStart(2, '0'));

    // Store for drawChart
    this._chartData = chartData;
    this._chartLabels = chartLabels;

    c.innerHTML = `
      <!-- Kết quả bán hàng hôm nay -->
      <div class="dash-today">
        <h3>Kết quả bán hàng hôm nay</h3>
        <div class="today-stats">
          <div class="today-stat">
            <div class="today-stat-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <div>
              <div class="today-stat-label">Doanh thu</div>
              <div class="today-stat-value">${fmt(todayRev)}</div>
            </div>
          </div>
          <div class="today-stat">
            <div class="today-stat-icon red">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
            </div>
            <div>
              <div class="today-stat-label">Trả hàng</div>
              <div class="today-stat-value">0</div>
            </div>
          </div>
          <div class="today-stat">
            <div class="today-stat-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            </div>
            <div>
              <div class="today-stat-label">Doanh thu thuần</div>
              <div class="today-stat-value" style="color:var(--primary)">${fmt(todayRev)}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="dash-grid">
        <!-- LEFT MAIN -->
        <div class="dash-main">
          <!-- Revenue Chart -->
          <div class="card">
            <div class="card-header">
              <div>
                <span style="color:var(--text-secondary);font-size:0.85rem">Doanh thu thuần</span>
                <div class="chart-legend" id="chart-rev-label">${fmtd(monthRev)}</div>
              </div>
              <div class="card-header-right" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <select id="chart-period">
                  <option value="today">Hôm nay</option>
                  <option value="yesterday">Hôm qua</option>
                  <option value="thisWeek">Tuần này</option>
                  <option value="lastWeek">Tuần trước</option>
                  <option value="thisMonth" selected>Tháng này</option>
                  <option value="lastMonth">Tháng trước</option>
                  <option value="thisYear">Năm nay</option>
                  <option value="lastYear">Năm trước</option>
                  <option value="custom">Tùy chỉnh thời gian</option>
                </select>
                <div id="custom-date-range" style="display:none;gap:6px;align-items:center">
                  <input type="date" id="chart-from" style="padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:0.8rem">
                  <span style="color:var(--text-secondary)">→</span>
                  <input type="date" id="chart-to" style="padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:0.8rem">
                </div>
              </div>
            </div>
            <div class="card-body">
              <div class="chart-area"><canvas id="revenue-chart"></canvas></div>
            </div>
          </div>

          <!-- Top 10 grids -->
          <div class="top2-grid">
            <div class="card">
              <div class="card-header">
                <h3>Top 10 hàng bán chạy</h3>
                <div class="card-header-right">
                  <select><option>Theo số lượng</option></select>
                  <select><option>Tháng này</option></select>
                </div>
              </div>
              <div class="card-body">
                <div class="hbar-list">
                  ${topProducts.map(p => `
                    <div class="hbar-item">
                      <div class="hbar-label" title="${p.name}">${p.name}</div>
                      <div class="hbar-bar-wrap">
                        <div class="hbar-bar" style="width:${(p.qty / topProducts[0].qty * 100)}%"></div>
                      </div>
                      <div class="hbar-value">${p.qty}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
            <div class="card">
              <div class="card-header">
                <h3>Top 10 khách mua nhiều nhất</h3>
                <div class="card-header-right">
                  <select><option>Tháng này</option></select>
                </div>
              </div>
              <div class="card-body">
                <div class="hbar-list">
                  ${topCustomers.map(cu => `
                    <div class="hbar-item">
                      <div class="hbar-label" title="${cu.name}">${cu.name}</div>
                      <div class="hbar-bar-wrap">
                        <div class="hbar-bar" style="width:${(cu.totalSpent / maxSpent * 100)}%;background:#10B981"></div>
                      </div>
                      <div class="hbar-value">${fmtShort(cu.totalSpent)}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT SIDEBAR: Activity -->
        <div>
          <div class="card activity-card">
            <div class="card-header"><h3>Hoạt động gần đây</h3></div>
            <div class="card-body">
              ${this.orders.map(o => `
                <div class="act-item">
                  <div class="act-icon order">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/></svg>
                  </div>
                  <div>
                    <div class="act-text">
                      <a href="#">${o.createdBy}</a> vừa bán đơn hàng với giá trị <strong>${fmtd(o.finalTotal)}</strong>
                    </div>
                    <div class="act-time">${o.createdAt}</div>
                  </div>
                </div>
              `).join('')}
              <div class="act-item">
                <div class="act-icon check">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </div>
                <div>
                  <div class="act-text"><a href="#">Kiều Hương</a> vừa thực hiện kiểm hàng</div>
                  <div class="act-time">3 ngày trước</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Low Stock -->
          <div class="card">
            <div class="card-header"><h3>Cảnh báo tồn kho thấp</h3></div>
            <div class="card-body">
              ${(() => {
                const low = this.products.filter(p => p.stock <= 3).sort((a,b) => a.stock - b.stock);
                if (!low.length) return '<p style="color:var(--text-secondary);text-align:center;padding:16px">Không có sản phẩm nào sắp hết hàng</p>';
                return '<div class="low-stock-list">' + low.map(p => `
                  <div class="low-stock-item">
                    <div class="low-stock-name">${p.name}</div>
                    <span class="stock-badge ${p.stock <= 0 ? 'out' : 'low'}">${p.stock <= 0 ? 'Hết hàng' : 'Còn ' + p.stock}</span>
                  </div>
                `).join('') + '</div>';
              })()}
            </div>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      this.updateChartPeriod();
      document.getElementById('chart-period').addEventListener('change', () => this.updateChartPeriod());
      document.getElementById('chart-from').addEventListener('change', () => this.updateChartPeriod());
      document.getElementById('chart-to').addEventListener('change', () => this.updateChartPeriod());
    }, 150);
  },

  updateChartPeriod() {
    const period = document.getElementById('chart-period').value;
    const customEl = document.getElementById('custom-date-range');
    customEl.style.display = period === 'custom' ? 'flex' : 'none';

    const now = new Date();
    const completedOrders = this.orders.filter(o => o.status === 'completed');

    const parseDate = (str) => {
      if (!str) return null;
      const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      return m ? new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])) : null;
    };
    const fmtDay = (d) => String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
    const dayOfWeek = now.getDay() || 7;

    let startDate, endDate, data = [], labels = [], useHourly = false;

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = now;
        useHourly = true;
        break;
      case 'yesterday': {
        const y = new Date(now); y.setDate(y.getDate() - 1);
        startDate = new Date(y.getFullYear(), y.getMonth(), y.getDate());
        endDate = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59);
        useHourly = true;
        break;
      }
      case 'thisWeek':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1);
        endDate = now;
        break;
      case 'lastWeek':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek - 6);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 23, 59, 59);
        break;
      case 'thisMonth':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = now;
        break;
      case 'lastMonth':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        break;
      case 'thisYear':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = now;
        break;
      case 'lastYear':
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
        break;
      case 'custom': {
        const fromVal = document.getElementById('chart-from').value;
        const toVal = document.getElementById('chart-to').value;
        if (!fromVal || !toVal) { this._chartData = []; this._chartLabels = []; this.drawChart(); return; }
        startDate = new Date(fromVal);
        endDate = new Date(toVal); endDate.setHours(23, 59, 59);
        break;
      }
    }

    // Filter orders in range
    const periodOrders = completedOrders.filter(o => {
      const d = parseDate(o.createdAt);
      if (!d) return false;
      return d >= startDate && d <= endDate;
    });

    if (useHourly) {
      data = new Array(24).fill(0);
      periodOrders.forEach(o => {
        const hm = o.createdAt.match(/(\d{2}):(\d{2})$/);
        if (hm) data[parseInt(hm[1])] += (o.finalTotal || 0);
      });
      if (period === 'today') data = data.slice(0, now.getHours() + 1);
      labels = data.map((_, i) => String(i).padStart(2, '0') + 'h');
    } else {
      const diffMs = endDate - startDate;
      const diffDays = Math.ceil(diffMs / 86400000) + 1;

      if (diffDays <= 31) {
        // Daily bars
        data = new Array(diffDays).fill(0);
        labels = [];
        for (let i = 0; i < diffDays; i++) {
          const d = new Date(startDate); d.setDate(d.getDate() + i);
          labels.push(fmtDay(d));
        }
        periodOrders.forEach(o => {
          const d = parseDate(o.createdAt);
          if (!d) return;
          const idx = Math.floor((d - startDate) / 86400000);
          if (idx >= 0 && idx < diffDays) data[idx] += (o.finalTotal || 0);
        });
      } else {
        // Monthly bars
        const months = [];
        let cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        while (cur <= endDate) {
          months.push(new Date(cur));
          cur.setMonth(cur.getMonth() + 1);
        }
        data = new Array(months.length).fill(0);
        labels = months.map(d => 'T' + (d.getMonth() + 1));
        periodOrders.forEach(o => {
          const d = parseDate(o.createdAt);
          if (!d) return;
          const idx = months.findIndex((m, i) => {
            const next = i < months.length - 1 ? months[i + 1] : new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1);
            return d >= m && d < next;
          });
          if (idx >= 0) data[idx] += (o.finalTotal || 0);
        });
      }
    }

    const periodRev = periodOrders.reduce((s, o) => s + (o.finalTotal || 0), 0);
    document.getElementById('chart-rev-label').textContent = fmtd(periodRev);

    this._chartData = data;
    this._chartLabels = labels;
    this.drawChart();
  },

  drawChart() {
    const canvas = document.getElementById('revenue-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);

    const w = rect.width, h = rect.height;
    const pad = { top: 20, right: 20, bottom: 32, left: 55 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    // Daily revenue data from real orders
    const data = this._chartData || [];
    const labels = this._chartLabels || [];
    if (!data.length) return;
    const maxVal = Math.max(...data) * 1.2 || 1;
    const barW = Math.min(cw / data.length * 0.55, 40);
    const gap = cw / data.length;

    // Grid lines
    ctx.strokeStyle = '#F3F4F6';
    ctx.lineWidth = 1;
    ctx.font = '11px Be Vietnam Pro, sans-serif';
    ctx.fillStyle = '#9CA3AF';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + ch - (ch * i / 5);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      const val = (maxVal * i) / 5;
      ctx.fillText(fmtShort(Math.round(val)), pad.left - 6, y + 4);
    }

    // X labels
    ctx.textAlign = 'center';
    labels.forEach((label, i) => {
      const x = pad.left + gap * i + gap / 2;
      ctx.fillText(label, x, h - 8);
    });

    // Bars
    data.forEach((val, i) => {
      const x = pad.left + gap * i + (gap - barW) / 2;
      const barH = (val / maxVal) * ch;
      const y = pad.top + ch - barH;

      // Bar with rounded top
      const r = 3;
      ctx.beginPath();
      ctx.moveTo(x, pad.top + ch);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
      ctx.lineTo(x + barW, pad.top + ch);
      ctx.closePath();
      ctx.fillStyle = val > 0 ? '#1A73E8' : '#E5E7EB';
      ctx.fill();
    });
  },

  // ═════════ PRODUCTS ═════════
  renderProducts(c) {
    const cats = [...new Set(this.products.map(p => p.category))].sort();

    // Only render shell once (check if product toolbar exists specifically)
    if (!c.querySelector('#p-toolbar')) {
      c.innerHTML = `
        <div class="products-sticky-header" id="p-toolbar">
          <div class="toolbar-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="p-search" placeholder="Tìm sản phẩm, mã SKU..." value="${this.pSearch}">
          </div>
          <div class="products-summary-bar" id="p-summary">
            <span>Tổng tồn: <strong>0</strong></span>
            <span>0 sản phẩm</span>
          </div>
          <button class="btn btn-primary products-add-btn" id="btn-add-product">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Thêm sản phẩm
          </button>
        </div>
        <div class="table-wrapper products-desktop-table">
          <table class="data-table">
            <thead><tr>
              <th style="width:50px">Ảnh</th><th>Mã hàng</th><th>Tên sản phẩm</th><th>Nhóm</th>
              <th>Giá bán</th><th>Giá vốn</th><th>Tồn kho</th><th>Thao tác</th>
            </tr></thead>
            <tbody id="p-tbody"></tbody>
          </table>
          <div class="table-pagination" id="p-pagination"></div>
        </div>
        <!-- Mobile product cards -->
        <div class="products-card-list" id="p-card-list"></div>
      `;

      document.getElementById('p-search').addEventListener('input', e => { this.pSearch = e.target.value; this.updateProductTable(); });
      document.getElementById('btn-add-product').addEventListener('click', () => this.productModal());
    }

    this.updateProductTable();
  },

  updateProductTable() {
    let list = this.products.filter(p => {
      return !this.pSearch || p.name.toLowerCase().includes(this.pSearch.toLowerCase()) || p.sku.toLowerCase().includes(this.pSearch.toLowerCase());
    });

    const totalStock = list.reduce((s, p) => s + (p.stock || 0), 0);

    // Update sticky header summary
    const pSummary = document.getElementById('p-summary');
    if (pSummary) {
      pSummary.innerHTML = `
        <span>Tổng tồn: <strong>${totalStock.toLocaleString('vi-VN')}</strong></span>
        <span>${list.length} sản phẩm</span>
      `;
    }

    // ── Mobile: product cards ──
    const cardList = document.getElementById('p-card-list');
    if (cardList) {
      cardList.innerHTML = list.length ? list.map(p => {
        const st = stockStatus(p.stock);
        return `<div class="product-mobile-card" data-pid="${p.id}">
          <div class="pmc-body">
            <img class="pmc-thumb" id="pimg-m-${p.id}" src="" alt="">
            <div class="pmc-info">
              <div class="pmc-row1">
                <span class="pmc-name">${p.name}</span>
                <span class="pmc-price">${fmt(p.sellPrice)}</span>
              </div>
              <div class="pmc-row2">
                <span class="pmc-sku">${p.sku}</span>
                <span class="stock-badge ${st.c}">${st.t}</span>
              </div>
            </div>
          </div>
          <div class="pmc-row3">
            <span class="pmc-actions">
              <button class="btn-icon edit-p-m" data-id="${p.id}" title="Sửa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
              <button class="btn-icon danger del-p-m" data-id="${p.id}" title="Xóa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </span>
          </div>
        </div>`;
      }).join('') : '<div class="omc-empty">Không tìm thấy sản phẩm</div>';
      // Bind mobile card actions
      cardList.querySelectorAll('.edit-p-m').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); this.productModal(b.dataset.id); }));
      cardList.querySelectorAll('.del-p-m').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); this.delProduct(b.dataset.id); }));
      cardList.querySelectorAll('.product-mobile-card').forEach(card => card.addEventListener('click', () => this.viewProduct(card.dataset.pid)));
    }

    // ── Desktop: table ──
    const tbody = document.getElementById('p-tbody');
    const pagination = document.getElementById('p-pagination');
    if (!tbody) return;

    tbody.innerHTML = list.length ? list.map(p => {
      const st = stockStatus(p.stock);
      return `<tr>
        <td><div class="prod-img-cell" data-id="${p.id}" title="Click để chọn ảnh"><img class="prod-thumb" id="pimg-${p.id}" src="" alt=""><input type="file" accept="image/*" class="prod-img-input" data-id="${p.id}" style="display:none"></div></td>
        <td><span class="product-sku">${p.sku}</span></td>
        <td><span class="product-name view-p" data-id="${p.id}" style="cursor:pointer;color:var(--primary);text-decoration:underline">${p.name}</span></td>
        <td><span class="category-badge">${p.category}</span></td>
        <td><span class="price-text">${fmt(p.sellPrice)}</span></td>
        <td><span class="cost-text">${fmt(p.costPrice)}</span></td>
        <td><span class="stock-badge ${st.c}">${st.t}</span></td>
        <td><div class="table-actions">
          <button class="btn-icon edit-p" data-id="${p.id}" title="Sửa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn-icon danger del-p" data-id="${p.id}" title="Xóa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div></td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" class="table-empty"><p>Không tìm thấy sản phẩm</p></td></tr>`;

    if (pagination) {
      pagination.innerHTML = `<div class="product-summary-bar">
        <span>Tổng tồn: <strong>${totalStock.toLocaleString('vi-VN')}</strong></span>
        <span>${list.length} sản phẩm</span>
      </div>`;
    }

    // Re-bind row actions
    tbody.querySelectorAll('.edit-p').forEach(b => b.addEventListener('click', () => this.productModal(b.dataset.id)));
    tbody.querySelectorAll('.del-p').forEach(b => b.addEventListener('click', () => this.delProduct(b.dataset.id)));
    tbody.querySelectorAll('.view-p').forEach(b => b.addEventListener('click', () => this.viewProduct(b.dataset.id)));

    // Product image upload
    tbody.querySelectorAll('.prod-img-cell').forEach(cell => {
      cell.addEventListener('click', () => cell.querySelector('.prod-img-input').click());
    });
    tbody.querySelectorAll('.prod-img-input').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const pid = inp.dataset.id;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target.result;
          this.saveProductImage(pid, dataUrl);
          const img = document.getElementById('pimg-' + pid);
          if (img) img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      });
    });

    // Load saved images from IndexedDB
    this.loadAllProductImages();
  },

  async viewProduct(id) {
    const p = this.products.find(x => x.id === id);
    if (!p) return;
    const st = stockStatus(p.stock);
    const savedImg = await this.getProductImage(p.id);
    const defaultImg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" fill="none"><rect width="80" height="80" rx="12" fill="#f0f4ff"/><path d="M24 56l12-16 8 10 12-14 12 20H16z" fill="#c5d5f7"/><circle cx="28" cy="28" r="6" fill="#a0b8e8"/></svg>');
    const profit = p.sellPrice - (p.costPrice || 0);

    document.getElementById('modal-title').textContent = 'Chi tiết sản phẩm';
    document.getElementById('modal-body').innerHTML = `
      <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div style="flex-shrink:0">
          <img src="${savedImg || defaultImg}" style="width:80px;height:80px;border-radius:12px;object-fit:cover;border:2px solid var(--border-light)">
        </div>
        <div style="flex:1;min-width:0">
          <h3 style="margin:0 0 4px 0;font-size:1.05rem;color:var(--text-primary);word-break:break-word">${p.name}</h3>
          <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
            <span class="category-badge">${p.category}</span>
            <span class="stock-badge ${st.c}">${st.t}</span>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;background:var(--bg-secondary);border-radius:10px;padding:16px">
        <div>
          <div style="font-size:0.75rem;color:var(--text-secondary)">Mã hàng (SKU)</div>
          <div style="font-weight:600;font-size:0.9rem;margin-top:2px">${p.sku}</div>
        </div>
        <div>
          <div style="font-size:0.75rem;color:var(--text-secondary)">Tồn kho</div>
          <div style="font-weight:600;font-size:0.9rem;margin-top:2px">${p.stock} ${p.unit || 'hộp'}</div>
        </div>
        <div>
          <div style="font-size:0.75rem;color:var(--text-secondary)">Giá bán</div>
          <div style="font-weight:700;font-size:1rem;margin-top:2px;color:var(--primary)">${fmt(p.sellPrice)}</div>
        </div>
        <div>
          <div style="font-size:0.75rem;color:var(--text-secondary)">Giá vốn</div>
          <div style="font-weight:600;font-size:0.9rem;margin-top:2px">${fmt(p.costPrice || 0)}</div>
        </div>
        <div>
          <div style="font-size:0.75rem;color:var(--text-secondary)">Lợi nhuận</div>
          <div style="font-weight:600;font-size:0.9rem;margin-top:2px;color:#10B981">${fmt(profit)}</div>
        </div>
        <div>
          <div style="font-size:0.75rem;color:var(--text-secondary)">Đơn vị tính</div>
          <div style="font-weight:600;font-size:0.9rem;margin-top:2px">${p.unit || 'hộp'}</div>
        </div>
      </div>
    `;
    document.getElementById('modal-footer').innerHTML = `
      <div style="display:flex;gap:8px;width:100%;justify-content:space-between">
        <div style="display:flex;gap:8px">
          <button class="btn" id="m-del-from-view" style="background:#EF4444;color:#fff">🗑 Xóa</button>
          <button class="btn" id="m-copy-from-view" style="background:#8B5CF6;color:#fff">📋 Sao chép</button>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" id="m-cancel">Đóng</button>
          <button class="btn btn-primary" id="m-edit-from-view">✏️ Chỉnh sửa</button>
        </div>
      </div>
    `;
    this.openModal();
    document.getElementById('m-cancel').addEventListener('click', () => this.closeModal());
    document.getElementById('m-edit-from-view').addEventListener('click', () => { this.closeModal(); this.productModal(id); });
    document.getElementById('m-del-from-view').addEventListener('click', () => { this.closeModal(); this.delProduct(id); });
    document.getElementById('m-copy-from-view').addEventListener('click', async () => {
      const clone = { ...p, id: 'SP' + String(this.products.length + 1).padStart(3, '0'), sku: '(Copy)' + p.sku, name: '(Copy) ' + p.name };
      this.products.push(clone);
      this.closeModal();
      this.updateProductTable();
      this.toast('success', `Đã sao chép "${p.name}"`);
      // Open edit modal for the new clone
      setTimeout(() => this.productModal(clone.id), 200);
      // Sync to Google Sheets
      const url = localStorage.getItem('khs_api_url');
      if (url) {
        try {
          await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'addProduct', sku: clone.sku, name: clone.name, category: clone.category, sellPrice: clone.sellPrice, costPrice: clone.costPrice, stock: clone.stock })
          });
        } catch (e) { console.warn('Sync copy failed:', e); }
      }
    });
  },

  productModal(id) {
    const p = id ? this.products.find(x => x.id === id) : null;
    const cats = [...new Set(this.products.map(x => x.category))].sort();
    const skuBatchCount = p ? (this.batches||[]).filter(b => b.sku === p.sku).length : 0;
    const hasAnyBatch = skuBatchCount > 0;
    const hasBatches = skuBatchCount > 1;
    document.getElementById('modal-title').textContent = p ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới';
    document.getElementById('modal-body').innerHTML = `
      <form class="modal-form" id="pf">
        <div style="display:flex;gap:12px;align-items:flex-start">
          <div style="flex:1">
            <div class="form-row">
              <div class="form-group"><label>Mã hàng (SKU)${hasAnyBatch?' <span style="font-size:0.7rem;color:#EF4444">🔒</span>':''}</label><input class="form-control" id="pf-sku" value="${p?.sku||''}" required ${hasAnyBatch?'readonly style="background:#F3F4F6;cursor:not-allowed"':''}></div>
              <div class="form-group"><label>Nhóm hàng</label><select class="form-control" id="pf-cat">${cats.map(ca=>`<option ${p?.category===ca?'selected':''}>${ca}</option>`).join('')}</select></div>
            </div>
          </div>
          <div class="pf-img-upload" id="pf-img-upload" title="Click để chọn ảnh" style="width:80px;height:80px;min-height:80px;flex-shrink:0;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:2px solid #D1D5DB;background:#FAFAFA;overflow:hidden;position:relative">
            <img id="pf-img-preview" src="" alt="" style="width:100%;height:100%;object-fit:cover;display:none">
            <span id="pf-img-text" style="font-size:0.6rem;text-align:center;color:#9CA3AF;line-height:1.3">📷<br>Ảnh SP</span>
            <input type="file" accept="image/*" id="pf-img-input" style="display:none">
          </div>
        </div>
        <div class="form-group"><label>Tên sản phẩm</label><input class="form-control" id="pf-name" value="${p?.name||''}" required></div>
        <div class="form-row">
          <div class="form-group"><label>Giá bán</label><input class="form-control" id="pf-sell" type="text" inputmode="numeric" value="${p?.sellPrice?fmt(p.sellPrice):''}" oninput="fmtInput(this)" required></div>
          <div class="form-group"><label>Giá vốn${hasBatches?' <span style=\"font-size:0.7rem;color:#10B981\">(tự tính từ lô)</span>':''}</label><input class="form-control" id="pf-cost" type="text" inputmode="numeric" value="${p?.costPrice?fmt(p.costPrice):''}" oninput="fmtInput(this)" ${hasBatches?'readonly style="background:#F3F4F6;cursor:not-allowed"':''}></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Tồn kho${hasBatches?' <span style=\"font-size:0.7rem;color:#10B981\">(quản lý qua lô)</span>':''}</label><input class="form-control" id="pf-stock" type="number" value="${p?.stock??''}" ${hasBatches?'readonly style="background:#F3F4F6;cursor:not-allowed"':'required'}></div>
          <div class="form-group"><label>Đơn vị tính</label><input class="form-control" id="pf-unit" value="${p?.unit||'hộp'}"></div>
        </div>
        ${p ? (() => {
          const skuBatches = (this.batches||[]).filter(b => b.sku === p.sku)
            .sort((a,b) => {
              // Còn hàng lên trước
              if (a.qtyRemaining > 0 && b.qtyRemaining <= 0) return -1;
              if (a.qtyRemaining <= 0 && b.qtyRemaining > 0) return 1;
              // Sửa gần nhất lên trước
              const da = a.updatedAt || a.importDate || '';
              const db = b.updatedAt || b.importDate || '';
              return da > db ? -1 : da < db ? 1 : 0;
            });
          const batchRows = skuBatches.map(b => `<tr style="${b.qtyRemaining<=0?'opacity:0.5':''}">
            <td style="font-size:0.7rem;word-break:break-all;line-height:1.2;overflow:visible;font-weight:600">${b.id}</td>
            <td style="text-align:center;font-size:0.8rem;overflow:visible;font-weight:700">${b.qtyRemaining}</td>
            <td style="text-align:right;font-size:0.8rem;white-space:nowrap;overflow:visible;font-weight:700">${fmtd(b.costPrice)}</td>
            <td style="font-size:0.7rem;color:#6B7280;overflow:visible;display:flex;align-items:center;justify-content:space-between;gap:2px;font-weight:600">
              <span>${(b.importDate||'').substring(0,10)}${b.updatedAt ? '<br><span style="color:#10B981;font-weight:700">⇢ '+(b.updatedAt||'').substring(0,10)+'</span>' : ''}</span>
              <span style="display:flex;flex-direction:column;gap:12px;align-items:center;flex-shrink:0;justify-content:space-between">
                <button class="btn btn-sm batch-edit-btn" data-bid="${b.id}" style="padding:0;font-size:1rem;background:none;border:none;cursor:pointer;line-height:1" title="Sửa">✏️</button>
                ${b.qtyRemaining<=0 ? `<button class="btn btn-sm batch-del-btn" data-bid="${b.id}" style="padding:0;font-size:1rem;background:none;border:none;cursor:pointer;line-height:1" title="Xóa">🗑️</button>` : ''}
              </span>
            </td>
          </tr>`).join('');
          return `<div style="border-top:2px solid var(--border-color);margin-top:16px;padding-top:16px">
          <label style="font-weight:700;font-size:0.95rem;color:#10B981;display:flex;align-items:center;gap:6px;margin-bottom:12px"><input type="checkbox" id="pf-batch-toggle"> 📦 Nhập thêm lô mới</label>
          <div id="pf-batch-fields" style="display:none">
            <div class="form-row">
              <div class="form-group"><label>Ngày nhập</label><input class="form-control" id="pf-batch-date" type="date" value="${new Date().toISOString().substring(0,10)}"></div>
              <div class="form-group"><label>Ký hiệu lô</label><input class="form-control" id="pf-batch-suffix" placeholder="VD: NCC1, A01..."></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>SL nhập</label><input class="form-control" id="pf-batch-qty" type="number" min="1" value="1"></div>
              <div class="form-group"><label>Giá nhập lô này</label><input class="form-control" id="pf-batch-cost" type="text" inputmode="numeric" value="${p.costPrice?fmt(p.costPrice):'0'}" oninput="fmtInput(this)"></div>
            </div>
            <div class="form-group"><label>Ghi chú lô</label><input class="form-control" id="pf-batch-note" placeholder="VD: Nhập từ NCC X"></div>
            <div id="pf-batch-id-preview" style="font-size:0.8rem;color:#6B7280;margin-top:4px"></div>
          </div>
          ${skuBatches.length ? `<div style="margin-top:16px">
            <div style="font-weight:600;font-size:0.85rem;margin-bottom:8px;color:#6B7280">📋 Các lô đã nhập (${skuBatches.length} lô)</div>
            <div style="max-height:280px;overflow:auto;border:1px solid var(--border-color);border-radius:8px">
            <table class="data-table batch-table" style="margin:0;width:100%"><thead style="position:sticky;top:0;z-index:1;background:#fff"><tr>
              <th>Mã lô</th><th style="min-width:24px">SL</th><th>Giá nhập</th><th>Ngày</th>
            </tr></thead><tbody>${batchRows}</tbody></table>
            </div>
          </div>` : ''}
        </div>`;
        })() : ''}
      </form>
    `;
    // Load existing image
    if (p) {
      this.getProductImage(p.id).then(saved => {
        const preview = document.getElementById('pf-img-preview');
        if (saved) { preview.src = saved; preview.style.display = 'block'; document.getElementById('pf-img-text').style.display = 'none'; }
      });
    }
    // Image upload click
    document.getElementById('pf-img-upload').addEventListener('click', () => document.getElementById('pf-img-input').click());
    document.getElementById('pf-img-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const preview = document.getElementById('pf-img-preview');
        preview.src = ev.target.result;
        preview.style.display = 'block';
        document.getElementById('pf-img-text').style.display = 'none';
      };
      reader.readAsDataURL(file);
    });
    // Batch toggle + live preview
    document.getElementById('pf-batch-toggle')?.addEventListener('change', (e) => {
      document.getElementById('pf-batch-fields').style.display = e.target.checked ? '' : 'none';
    });
    const updateBatchPreview = () => {
      const dateEl = document.getElementById('pf-batch-date');
      const suffixEl = document.getElementById('pf-batch-suffix');
      const prevEl = document.getElementById('pf-batch-id-preview');
      if (!dateEl || !prevEl) return;
      const d = new Date(dateEl.value);
      const dd = String(d.getDate()).padStart(2,'0') + String(d.getMonth()+1).padStart(2,'0') + d.getFullYear();
      const suffix = suffixEl?.value?.trim() || '';
      prevEl.textContent = 'Mã lô: LOT-' + dd + (suffix ? '-' + suffix : '');
    };
    document.getElementById('pf-batch-date')?.addEventListener('change', updateBatchPreview);
    document.getElementById('pf-batch-suffix')?.addEventListener('input', updateBatchPreview);
    updateBatchPreview();


    // Batch edit buttons
    document.querySelectorAll('.batch-edit-btn').forEach(btn => btn.addEventListener('click', (e) => {
      e.preventDefault();
      const bid = btn.dataset.bid;
      const batch = (this.batches||[]).find(b => b.id === bid);
      if (!batch) return;
      // Remove any existing edit form
      document.querySelectorAll('.batch-edit-form').forEach(f => f.remove());
      // Create edit form as standalone div OUTSIDE table
      const scrollContainer = btn.closest('div[style*="max-height"]');
      const editDiv = document.createElement('div');
      editDiv.className = 'batch-edit-form';
      editDiv.innerHTML = `
        <div class="be-title">✏️ Sửa lô ${bid}</div>
        <div class="be-field">
          <label>SL còn</label>
          <input class="form-control" id="be-qty" type="number" value="${batch.qtyRemaining}">
        </div>
        <div class="be-field">
          <label>Giá nhập</label>
          <input class="form-control" id="be-cost" type="text" inputmode="numeric" value="${fmt(batch.costPrice)}" oninput="fmtInput(this)">
        </div>
        <div class="be-field">
          <label>Ghi chú</label>
          <input class="form-control" id="be-note" value="${batch.note||''}">
        </div>
        <div class="be-actions">
          <button class="btn btn-secondary btn-sm" id="be-cancel">Hủy</button>
          <button class="btn btn-primary btn-sm" id="be-save">💾 Lưu</button>
        </div>
      `;
      if (scrollContainer) scrollContainer.after(editDiv);
      else btn.closest('div').appendChild(editDiv);
      editDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      document.getElementById('be-cancel').addEventListener('click', () => editDiv.remove());
      document.getElementById('be-save').addEventListener('click', async () => {
        const newCost = unfmt(document.getElementById('be-cost').value);
        const newNote = document.getElementById('be-note').value||'';
        const newQty = parseInt(document.getElementById('be-qty').value);
        const url = localStorage.getItem('khs_api_url');
        if (!url) return;
        document.getElementById('be-save').textContent = 'Đang lưu...';
        document.getElementById('be-save').disabled = true;
        try {
          const res = await fetch(url, { method:'POST', headers:{'Content-Type':'text/plain'},
            body: JSON.stringify({ action:'updateBatch', batchId: bid, costPrice: newCost, note: newNote, qtyRemaining: newQty })
          }).then(r=>r.json());
          if (res.success) { this.toast('success','Đã sửa lô '+bid); await this.autoSync(); this.closeModal(); this.productModal(p.id); }
          else this.toast('error', res.error);
        } catch(e) { this.toast('error','Lỗi: '+e.message); }
      });
    }));
    // Batch delete buttons (only for empty batches)
    document.querySelectorAll('.batch-del-btn').forEach(btn => btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const bid = btn.dataset.bid;
      if (!confirm('Xóa lô ' + bid + ' (đã bán hết)?')) return;
      const url = localStorage.getItem('khs_api_url');
      if (!url) return;
      try {
        const res = await fetch(url, { method:'POST', headers:{'Content-Type':'text/plain'},
          body: JSON.stringify({ action:'deleteBatch', batchId: bid })
        }).then(r=>r.json());
        if (res.success) { this.toast('success','Đã xóa lô '+bid); await this.autoSync(); this.closeModal(); this.productModal(p.id); }
        else this.toast('error', res.error);
      } catch(e) { this.toast('error','Lỗi: '+e.message); }
    }));

    document.getElementById('modal-footer').innerHTML = `
      <button class="btn btn-secondary" id="m-cancel">Hủy</button>
      <button class="btn btn-primary" id="m-save">${p ? 'Cập nhật' : 'Thêm mới'}</button>
    `;
    this.openModal();
    document.getElementById('m-cancel').addEventListener('click', () => this.closeModal());
    document.getElementById('m-save').addEventListener('click', async () => {
      const d = {
        sku: document.getElementById('pf-sku').value.trim(),
        name: document.getElementById('pf-name').value.trim(),
        category: document.getElementById('pf-cat').value,
        sellPrice: unfmt(document.getElementById('pf-sell').value),
        costPrice: unfmt(document.getElementById('pf-cost').value),
        stock: parseInt(document.getElementById('pf-stock').value)||0,
        unit: document.getElementById('pf-unit').value.trim()||'hộp'
      };
      if (!d.sku || !d.name) { this.toast('error','Vui lòng nhập đầy đủ thông tin!'); return; }
      let productId;
      const url = localStorage.getItem('khs_api_url');
      if (p) {
        const oldSku = p.sku;
        const oldId = p.id;
        Object.assign(p, d);
        p.id = d.sku; // ID luôn = SKU
        productId = p.id;
        // Migrate ảnh khi đổi SKU
        if (oldId !== p.id) {
          this.getProductImage(oldId).then(img => {
            if (img) { this.saveProductImage(p.id, img); }
          });
        }
        this.toast('success','Đã cập nhật!');
        // Sync update to Google Sheets
        const batchToggle = document.getElementById('pf-batch-toggle');
        const hasBatch = batchToggle?.checked;
        if (url) {
          try {
            const skuBatchCount = (this.batches||[]).filter(b => b.sku === d.sku).length;
            const updateData = { action: 'updateProduct', oldSku: oldSku, newSku: d.sku, name: d.name, category: d.category, sellPrice: d.sellPrice, costPrice: d.costPrice, _hasBatch: skuBatchCount >= 2 };
            // Gửi stock để backend tạo lô điều chỉnh nếu thay đổi
            if (!hasBatch) updateData.stock = d.stock;
            await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
              body: JSON.stringify(updateData)
            });
          } catch (e) { console.warn('Sync update failed:', e); }
        }
        // Nhập lô mới nếu checkbox được tick
        if (hasBatch && url) {
          const bQty = parseInt(document.getElementById('pf-batch-qty').value)||0;
          const bCost = unfmt(document.getElementById('pf-batch-cost').value);
          const bNote = document.getElementById('pf-batch-note').value||'';
          const bDate = document.getElementById('pf-batch-date').value||'';
          const bSuffix = document.getElementById('pf-batch-suffix').value?.trim()||'';
          // Build custom batch ID: LOT-DDMMYYYY-suffix
          const bd = new Date(bDate);
          const bDateStr = String(bd.getDate()).padStart(2,'0') + String(bd.getMonth()+1).padStart(2,'0') + bd.getFullYear();
          const customBatchId = 'LOT-' + bDateStr + (bSuffix ? '-' + bSuffix : '');
          if (bQty > 0) {
            try {
              const bRes = await fetch(url, { method:'POST', headers:{'Content-Type':'text/plain'},
                body: JSON.stringify({ action:'addBatch', sku: d.sku, name: d.name, qty: bQty, costPrice: bCost, sellPrice: d.sellPrice, importedBy: this.user?.displayName||'Admin', note: bNote, customBatchId, importDate: bDate })
              }).then(r=>r.json());
              if (bRes.success) this.toast('success','Đã nhập lô: '+bRes.batchId);
              else this.toast('error','Lỗi nhập lô: '+bRes.error);
            } catch(e) { console.warn('Batch import failed:', e); }
          }
          // Sync lại để lấy tồn kho đúng từ server
          await this.autoSync();
        }
      } else {
        // Kiểm tra trùng SKU trước khi thêm
        const existingSku = this.products.find(pp => pp.sku === d.sku);
        if (existingSku) {
          this.toast('error', `Mã hàng "${d.sku}" đã tồn tại (${existingSku.name})! Vui lòng dùng mã khác.`);
          return;
        }
        d.id = d.sku; // Dùng SKU làm ID — khớp với backend
        productId = d.id;
        this.products.push(d);
        this.toast('success','Đã thêm sản phẩm!');
        // Sync add to Google Sheets
        if (url) {
          try {
            await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
              body: JSON.stringify({ action: 'addProduct', sku: d.sku, name: d.name, category: d.category, sellPrice: d.sellPrice, costPrice: d.costPrice, stock: d.stock })
            });
          } catch (e) { console.warn('Sync add failed:', e); }
        }
      }
      // Save image if selected
      const imgPreview = document.getElementById('pf-img-preview');
      if (imgPreview.src && imgPreview.style.display !== 'none' && imgPreview.src.startsWith('data:')) {
        await this.saveProductImage(productId, imgPreview.src);
      }
      this.closeModal();
      this.renderProducts(document.getElementById('page-container'));
    });
  },

  confirmDelete(title, name, onConfirm) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = `
      <div style="text-align:center;padding:12px 0">
        <div style="width:56px;height:56px;border-radius:50%;background:#FEE2E2;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
          <svg viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2" width="28" height="28"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </div>
        <p style="font-size:1rem;color:var(--text-primary);margin:0">Bạn có muốn xóa <strong style="color:#EF4444">${name}</strong> không?</p>
        <p style="font-size:0.8rem;color:var(--text-secondary);margin:8px 0 0">Hành động này không thể hoàn tác.</p>
      </div>
    `;
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn btn-secondary" id="m-cancel">Hủy</button>
      <button class="btn" id="m-confirm-del" style="background:#EF4444;color:#fff">🗑 Xác nhận xóa</button>
    `;
    this.openModal();
    document.getElementById('m-cancel').addEventListener('click', () => this.closeModal());
    document.getElementById('m-confirm-del').addEventListener('click', () => { this.closeModal(); onConfirm(); });
  },

  delProduct(id) {
    const p = this.products.find(x => x.id === id);
    if (!p) return;
    this.confirmDelete('Xóa sản phẩm', p.name, () => {
      this.products = this.products.filter(x => x.id !== id);
      this.toast('success','Đã xóa!');
      this.renderProducts(document.getElementById('page-container'));
      // Sync delete to Google Sheets
      const url = localStorage.getItem('khs_api_url');
      if (url) {
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action: 'deleteProduct', sku: p.sku })
        }).catch(e => console.warn('Sync delete failed:', e));
      }
    });
  },

  // ═════════ ORDERS ═════════
  oSearch: '', oFilter: 'all', oTime: 'all',

  renderOrders(c) {
    // Only build full layout once
    if (!c.querySelector('#o-search')) {
      c.innerHTML = `
        <div class="orders-sticky-header">
          <div class="toolbar-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="o-search" placeholder="Tìm mã đơn, khách hàng..." value="${this.oSearch}">
          </div>
          <div class="orders-filter-row">
            <select class="orders-time-filter" id="o-time-filter">
              <option value="all">Tất cả</option>
              <option value="today">Hôm nay</option>
              <option value="yesterday">Hôm qua</option>
              <option value="week">Tuần này</option>
              <option value="month" selected>Tháng này</option>
              <option value="lastmonth">Tháng trước</option>
            </select>
          </div>
          <div class="orders-summary-bar" id="o-summary">
            <span>Tổng tiền hàng: <strong>0đ</strong></span>
            <span>0 đơn hàng</span>
          </div>
        </div>
        <div class="orders-card-list" id="o-card-list"></div>
        <div class="table-wrapper orders-desktop-table">
          <table class="data-table">
            <thead><tr>
              <th>Mã đơn</th><th>Khách hàng</th><th>Sản phẩm</th>
              <th>Tổng tiền</th><th style="color:#10B981">Lợi nhuận</th><th>Thanh toán</th><th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th>
            </tr></thead>
            <tbody id="o-tbody"></tbody>
          </table>
        </div>
      `;
      document.getElementById('o-search').addEventListener('input', e => { this.oSearch = e.target.value; this.updateOrderTable(); });
      document.getElementById('o-time-filter').addEventListener('change', e => { this.oTime = e.target.value; this.updateOrderTable(); });
      this.oTime = 'month'; // default
    }
    this.updateOrderTable();
  },

  _getDateRange(period) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch(period) {
      case 'today': return { start: today, end: now };
      case 'yesterday': {
        const y = new Date(today); y.setDate(y.getDate() - 1);
        return { start: y, end: today };
      }
      case 'week': {
        const w = new Date(today); w.setDate(w.getDate() - w.getDay() + 1); // Monday
        if (w > today) w.setDate(w.getDate() - 7);
        return { start: w, end: now };
      }
      case 'month': {
        return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
      }
      case 'lastmonth': {
        const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        return { start: s, end: e };
      }
      default: return null;
    }
  },

  updateOrderTable() {
    const range = this._getDateRange(this.oTime);
    let list = this.orders.filter(o => {
      const ms = !this.oSearch || o.id.toLowerCase().includes(this.oSearch.toLowerCase()) || o.customerName.toLowerCase().includes(this.oSearch.toLowerCase());
      if (!ms) return false;
      if (range && o.createdAt) {
        // Parse "dd/MM/yyyy HH:mm:ss" or similar
        const parts = o.createdAt.match(/(\d+)/g);
        if (parts && parts.length >= 3) {
          const d = new Date(parts[2], parts[1]-1, parts[0], parts[3]||0, parts[4]||0, parts[5]||0);
          if (d < range.start || d > range.end) return false;
        }
      }
      return true;
    });
    // ── Mobile: card list ──
    const cardList = document.getElementById('o-card-list');
    if (cardList) {
      cardList.innerHTML = list.length ? list.map(o => {
        const items = o.items || [];
        const ct = items.reduce((s,i) => {
          if (i.costPrice > 0) return s + i.costPrice;
          const p = this.products.find(p => p.sku === i.sku) || this.products.find(p => p.name === i.name);
          return s + (p?.costPrice||0) * i.qty;
        }, 0);
        const pf = (o.finalTotal||0) - ct;
        const fi = items[0];
        const mc = items.length - 1;
        const st = o.status==='completed'?'Hoàn thành':o.status==='pending'?'Chờ xử lý':'Đã hủy';
        return `<div class="order-mobile-card" data-oid="${o.id}">
          <div class="omc-row1">
            <span class="omc-customer">${o.customerName||'Khách lẻ'}</span>
            <span class="omc-total">${fmtd(o.finalTotal)}</span>
          </div>
          <div class="omc-row2">
            <span class="omc-date">${o.createdAt||''} · ${o.id||''}</span>
            <span class="omc-payment">${o.payment||''}</span>
          </div>
          <div class="omc-items">
            ${fi ? `<span>${fi.name||'SP'} <strong>x${fi.qty||0}</strong></span>` : '<span style="color:#999">Không có sản phẩm</span>'}
            ${mc > 0 ? `<span class="omc-more">+${mc} mặt hàng khác</span>` : ''}
          </div>
          <div class="omc-row3">
            <span class="omc-status ${o.status}">${st}</span>
            <span class="omc-profit">LN: ${fmtd(pf)}</span>
          </div>
        </div>`;
      }).join('') : '<div class="omc-empty">Không tìm thấy đơn hàng</div>';
    }
    // ── Desktop: table ──
    const tbody = document.getElementById('o-tbody');
    if (!tbody) return;
    tbody.innerHTML = list.length ? list.map(o => {
      const items = o.items || [];
      const costTotal = items.reduce((s,i) => {
        if (i.costPrice > 0) return s + i.costPrice;
        const prod = this.products.find(p => p.sku === i.sku) || this.products.find(p => p.name === i.name);
        return s + (prod?.costPrice||0) * i.qty;
      }, 0);
      const profit = (o.finalTotal||0) - costTotal;
      const itemsSummary = items.map(i=>`${i.name||'?'} x${i.qty||0}`).join(', ') || 'Không có SP';
      return `<tr class="order-card" data-oid="${o.id}">
      <td class="oc-id"><span class="product-sku">${o.id||''}</span></td>
      <td class="oc-cust" style="font-weight:600">${o.customerName||'Khách lẻ'}</td>
      <td class="oc-items" style="max-width:200px;font-size:0.8rem">${itemsSummary}</td>
      <td class="oc-total"><span class="price-text">${fmtd(o.finalTotal)}</span></td>
      <td class="oc-profit" style="color:#10B981;font-weight:600">${fmtd(profit)}</td>
      <td class="oc-payment">${o.payment||''}</td>
      <td class="oc-status"><span class="order-status ${o.status}">${o.status==='completed'?'Hoàn thành':o.status==='pending'?'Chờ xử lý':'Đã hủy'}</span></td>
      <td class="oc-date" style="white-space:nowrap;color:var(--text-secondary)">${o.createdAt||''}</td>
      <td class="oc-actions"><div class="table-actions">
        <button class="btn-icon view-order" data-id="${o.id}" title="Xem / In hóa đơn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
      </div></td>
    </tr>`;
    }).join('') : `<tr><td colspan="9" class="table-empty"><p>Không tìm thấy đơn hàng</p></td></tr>`;
    // Update summary in sticky header
    const totalRevenue = list.reduce((s, o) => s + (o.finalTotal || 0), 0);
    const summaryEl = document.getElementById('o-summary');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <span>Tổng tiền hàng: <strong>${fmtd(totalRevenue)}</strong></span>
        <span>${list.length} đơn hàng</span>
      `;
    }
    document.querySelectorAll('.view-order').forEach(b => b.addEventListener('click', () => this.viewOrder(b.dataset.id)));
    document.querySelectorAll('.order-card').forEach(tr => tr.addEventListener('click', (e) => {
      if (!e.target.closest('.btn-icon')) this.viewOrder(tr.dataset.oid);
    }));
    // Mobile cards click
    document.querySelectorAll('.order-mobile-card').forEach(card => card.addEventListener('click', () => this.viewOrder(card.dataset.oid)));
  },

  viewOrder(orderId) {
    const o = this.orders.find(x => x.id === orderId);
    if (!o) return;
    document.getElementById('modal-title').textContent = 'Chi tiết đơn hàng';
    document.getElementById('modal-body').innerHTML = `
      <div class="order-detail">
        <div class="od-info-grid">
          <div class="od-info"><span class="od-label">Mã đơn:</span><strong>${o.id}</strong></div>
          <div class="od-info"><span class="od-label">Ngày tạo:</span>${o.createdAt}</div>
          <div class="od-info"><span class="od-label">Khách hàng:</span><strong>${o.customerName}</strong></div>
          <div class="od-info"><span class="od-label">Thanh toán:</span>${o.payment}</div>
          <div class="od-info"><span class="od-label">Người bán:</span>${o.createdBy}</div>
          <div class="od-info"><span class="od-label">Trạng thái:</span><span class="order-status ${o.status}">${o.status==='completed'?'Hoàn thành':o.status==='pending'?'Chờ xử lý':'Đã hủy'}</span></div>
        </div>
        <table class="data-table" style="margin-top:16px">
          <thead><tr><th>#</th><th>Sản phẩm</th><th style="text-align:right">SL</th><th style="text-align:right">Đơn giá</th><th style="text-align:right">Thành tiền</th></tr></thead>
          <tbody>
            ${o.items.map((it,i) => `<tr>
              <td>${i+1}</td><td style="font-weight:600">${it.name}</td>
              <td style="text-align:right">${it.qty}</td>
              <td style="text-align:right">${fmtd(it.price)}</td>
              <td style="text-align:right;font-weight:600">${fmtd(it.qty * it.price)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div class="od-totals">
          <div class="od-total-row"><span>Tổng tiền hàng:</span><span>${fmtd(o.total)}</span></div>
          ${o.discount > 0 ? `<div class="od-total-row"><span>Giảm giá:</span><span>-${fmtd(o.discount)}</span></div>` : ''}
          <div class="od-total-row final"><span>TỔNG THANH TOÁN:</span><span class="price-text">${fmtd(o.finalTotal)}</span></div>
        </div>
      </div>
    `;
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn btn-secondary" id="m-cancel">Đóng</button>
      <button class="btn btn-primary" id="m-print-order">In hóa đơn</button>
    `;
    this.openModal();
    document.getElementById('m-cancel').addEventListener('click', () => this.closeModal());
    document.getElementById('m-print-order').addEventListener('click', () => {
      this.closeModal();
      if (typeof POS !== 'undefined' && POS.showInvoice) POS.showInvoice(o);
    });
  },

  // ═════════ RETURNS PAGE ═════════
  rSearch: '', rPage: 1, rPerPage: 10,

  renderReturnsPage(c) {
    if (!c.querySelector('#r-search')) {
      c.innerHTML = `
        <div class="page-toolbar">
          <div class="toolbar-left">
            <div class="toolbar-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" id="r-search" placeholder="Tìm mã phiếu trả, mã đơn, khách hàng...">
            </div>
          </div>
          <button class="btn btn-primary" id="btn-new-return" style="background:linear-gradient(135deg,#F59E0B,#D97706)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            Trả hàng
          </button>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr>
              <th>Mã trả hàng</th><th>Mã đơn gốc</th><th>Người bán</th><th>Thời gian</th>
              <th>Khách hàng</th><th style="text-align:right">Tổng tiền hàng</th><th style="text-align:right">Cần trả khách</th>
            </tr></thead>
            <tbody id="r-tbody"></tbody>
          </table>
          <div class="table-pagination" id="r-pagination"></div>
        </div>
      `;
      document.getElementById('r-search').addEventListener('input', e => { this.rSearch = e.target.value; this.rPage = 1; this.updateReturnsTable(); });
      document.getElementById('btn-new-return').addEventListener('click', () => this.openReturn());
    }
    this.updateReturnsTable();
  },

  updateReturnsTable() {
    const q = this.rSearch.toLowerCase();
    const filtered = this.returns.filter(r => {
      if(!q) return true;
      return (r.id||'').toLowerCase().includes(q) || (r.orderId||'').toLowerCase().includes(q) || (r.customerName||'').toLowerCase().includes(q);
    });

    const total = filtered.length;
    const pages = Math.ceil(total / this.rPerPage) || 1;
    if(this.rPage > pages) this.rPage = pages;
    const start = (this.rPage - 1) * this.rPerPage;
    const shown = filtered.slice(start, start + this.rPerPage);

    // Summary row
    const totalItems = filtered.reduce((s,r) => s + (r.itemsValue||r.returnTotal||0), 0);
    const totalRefund = filtered.reduce((s,r) => s + (r.returnTotal||0), 0);

    const tbody = document.getElementById('r-tbody');
    if(!shown.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:#9CA3AF">Chưa có phiếu trả hàng</td></tr>';
    } else {
      tbody.innerHTML = `
        <tr style="background:#FEF3C7;font-weight:700">
          <td colspan="5"></td>
          <td style="text-align:right;color:#92400E">${fmtd(totalItems)}</td>
          <td style="text-align:right;color:#B91C1C">${fmtd(totalRefund)}</td>
        </tr>
      ` + shown.map(r => {
        const itemsVal = r.itemsValue || r.returnTotal || 0;
        return `<tr>
          <td style="color:#1A73E8;font-weight:600">${r.id}</td>
          <td style="color:#6B7280">${r.orderId||''}</td>
          <td>${r.createdBy||''}</td>
          <td>${r.createdAt||''}</td>
          <td>${r.customerName||'Khách lẻ'}</td>
          <td style="text-align:right;font-weight:600">${fmtd(itemsVal)}</td>
          <td style="text-align:right;font-weight:700;color:#B91C1C">${fmtd(r.returnTotal||0)}</td>
        </tr>`;
      }).join('');
    }

    // Pagination
    const pg = document.getElementById('r-pagination');
    if(pages <= 1) { pg.innerHTML = `<span class="pg-info">Hiện ${shown.length} trên ${total} phiếu</span>`; return; }
    let html = '';
    if(this.rPage > 1) html += `<button class="pg-btn" data-rtp="${this.rPage-1}">&lt;</button>`;
    for(let i=1;i<=pages;i++) {
      if(pages>7 && i>2 && i<pages-1 && Math.abs(i-this.rPage)>1) { if(i===3||i===pages-2) html+='<span class="pg-dots">...</span>'; continue; }
      html += `<button class="pg-btn ${i===this.rPage?'active':''}" data-rtp="${i}">${i}</button>`;
    }
    if(this.rPage < pages) html += `<button class="pg-btn" data-rtp="${this.rPage+1}">&gt;</button>`;
    html += `<span class="pg-info">Hiện ${start+1}-${Math.min(start+this.rPerPage,total)} trên ${total}</span>`;
    pg.innerHTML = html;
    pg.querySelectorAll('.pg-btn').forEach(b => b.addEventListener('click', () => { this.rPage = parseInt(b.dataset.rtp); this.updateReturnsTable(); }));
  },

  // ═════════ CUSTOMERS ═════════
  renderCustomers(c) {
    // Only build full layout once
    if (!c.querySelector('#c-search')) {
      c.innerHTML = `
        <div class="page-toolbar">
          <div class="toolbar-left">
            <div class="toolbar-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" id="c-search" placeholder="Tìm khách hàng, SĐT..." value="${this.cSearch}">
            </div>
          </div>
          <button class="btn btn-primary" id="btn-add-cust">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Thêm khách hàng
          </button>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr>
              <th>Mã KH</th><th>Tên khách hàng</th><th>Điện thoại</th><th>Địa chỉ</th>
              <th>Tổng mua</th><th>Giao dịch cuối</th><th>Thao tác</th>
            </tr></thead>
            <tbody id="c-tbody"></tbody>
          </table>
          <div class="table-pagination" id="c-pagination"></div>
        </div>
      `;
      document.getElementById('c-search').addEventListener('input', e => { this.cSearch = e.target.value; this.updateCustomerTable(); });
      document.getElementById('btn-add-cust').addEventListener('click', () => this.customerModal());
    }
    this.updateCustomerTable();
  },

  updateCustomerTable() {
    let list = this.customers.filter(cu => {
      return !this.cSearch || cu.name.toLowerCase().includes(this.cSearch.toLowerCase()) || (cu.phone && cu.phone.includes(this.cSearch));
    });

    // Fallback: compute from local orders if Sheets didn't provide data
    const spendMap = {};
    const lastOrderMap = {};
    this.orders.filter(o => o.status === 'completed').forEach(o => {
      const cid = o.customerId;
      if (cid) {
        spendMap[cid] = (spendMap[cid] || 0) + (o.finalTotal || 0);
        if (!lastOrderMap[cid] || o.createdAt > lastOrderMap[cid]) lastOrderMap[cid] = o.createdAt;
      }
    });

    const tbody = document.getElementById('c-tbody');
    if (!tbody) return;
    tbody.innerHTML = list.map(cu => {
      const spent = cu.totalSpent || spendMap[cu.id] || 0;
      const lastOrd = cu.lastOrder || lastOrderMap[cu.id] || '';
      return `<tr>
      <td><span class="product-sku">${cu.id}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          ${cu.avatar ? `<img src="${cu.avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">` : `<div class="customer-avatar-cell" style="background:${cu.gender==='Nữ'?'#FCE7F3':cu.gender==='Nam'?'#DBEAFE':avatarColor(cu.name)};color:${cu.gender==='Nữ'?'#BE185D':cu.gender==='Nam'?'#1E40AF':'#fff'}">${cu.name[0].toUpperCase()}</div>`}
          <span style="font-weight:600">${cu.name}</span>
        </div>
      </td>
      <td>${cu.phone||'—'}</td>
      <td style="max-width:180px;font-size:0.8rem;color:var(--text-secondary)">${cu.address||'—'}</td>
      <td><span class="price-text">${fmtd(spent)}</span></td>
      <td style="color:var(--text-secondary)">${lastOrd||'—'}</td>
      <td><div class="table-actions">
        <button class="btn-icon hist-c" data-id="${cu.id}" title="Lịch sử mua"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button>
        <button class="btn-icon edit-c" data-id="${cu.id}" title="Sửa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn-icon danger del-c" data-id="${cu.id}" title="Xóa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </div></td>
    </tr>`;
    }).join('');
    document.getElementById('c-pagination').innerHTML = `<span>Hiển thị ${list.length} / ${this.customers.length} khách hàng</span>`;
    document.querySelectorAll('.edit-c').forEach(b => b.addEventListener('click', () => this.customerModal(b.dataset.id)));
    document.querySelectorAll('.del-c').forEach(b => b.addEventListener('click', () => this.delCustomer(b.dataset.id)));
    document.querySelectorAll('.hist-c').forEach(b => b.addEventListener('click', () => this.viewCustomerHistory(b.dataset.id)));
  },

  viewCustomerHistory(custId) {
    const cu = this.customers.find(x => x.id === custId);
    if (!cu) return;
    const orders = this.orders.filter(o => o.customerId === custId);
    document.getElementById('modal-title').textContent = `Lich su mua hang - ${cu.name}`;
    document.getElementById('modal-body').innerHTML = `
      <div class="cust-history">
        <div class="ch-stats">
          <div class="ch-stat"><span class="ch-stat-label">Tong don</span><strong>${cu.totalOrders || orders.length}</strong></div>
          <div class="ch-stat"><span class="ch-stat-label">Tong chi tieu</span><strong class="price-text">${fmtd(cu.totalSpent)}</strong></div>
          <div class="ch-stat"><span class="ch-stat-label">Giao dich cuoi</span><strong>${cu.lastOrder || '-'}</strong></div>
        </div>
        ${orders.length ? `<table class="data-table" style="margin-top:16px">
          <thead><tr><th>Ma don</th><th>San pham</th><th style="text-align:right">Tong</th><th>Ngay</th><th>TT</th></tr></thead>
          <tbody>
            ${orders.map(o => `<tr>
              <td><span class="product-sku">${o.id}</span></td>
              <td style="font-size:0.8rem;max-width:200px">${o.items.map(i => i.name + ' x' + i.qty).join(', ')}</td>
              <td style="text-align:right"><span class="price-text">${fmtd(o.finalTotal)}</span></td>
              <td style="white-space:nowrap;font-size:0.8rem">${o.createdAt}</td>
              <td><span class="order-status ${o.status}">${o.status === 'completed' ? 'OK' : '...'}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>` : '<p style="text-align:center;color:var(--text-secondary);padding:24px">Chua co don hang nao</p>'}
      </div>
    `;
    document.getElementById('modal-footer').innerHTML = '<button class="btn btn-secondary" id="m-cancel">Dong</button>';
    this.openModal();
    document.getElementById('m-cancel').addEventListener('click', () => this.closeModal());
  },

  // SVG avatars by gender
  avatarSvg(gender) {
    if(gender === 'Nữ') return `<svg viewBox="0 0 80 80" width="60" height="60"><circle cx="40" cy="40" r="40" fill="#FCE7F3"/><circle cx="40" cy="30" r="13" fill="#BE185D"/><path d="M18 68c0-12.15 9.85-22 22-22s22 9.85 22 22" fill="#BE185D"/></svg>`;
    return `<svg viewBox="0 0 80 80" width="60" height="60"><circle cx="40" cy="40" r="40" fill="#DBEAFE"/><circle cx="40" cy="30" r="13" fill="#1E40AF"/><path d="M18 68c0-12.15 9.85-22 22-22s22 9.85 22 22" fill="#1E40AF"/></svg>`;
  },

  customerModal(id) {
    const cu = id ? this.customers.find(x => x.id === id) : null;
    document.getElementById('modal-title').textContent = cu ? 'Sửa khách hàng' : 'Thêm khách hàng mới';
    const gender = cu?.gender || '';
    const avatarUrl = cu?.avatar || '';
    document.getElementById('modal-body').innerHTML = `
      <form class="modal-form" id="cf">
        <div style="display:flex;gap:20px;align-items:flex-start">
          <div style="text-align:center;flex-shrink:0">
            <div id="cf-avatar-preview" style="width:70px;height:70px;border-radius:50%;overflow:hidden;border:2px solid #E5E7EB;display:flex;align-items:center;justify-content:center;background:#F9FAFB;cursor:pointer" title="Click để chọn ảnh">
              ${avatarUrl ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover">` : this.avatarSvg(gender)}
            </div>
            <input type="file" id="cf-avatar-file" accept="image/*" style="display:none">
            <div style="font-size:0.7rem;color:#9CA3AF;margin-top:4px">Click để đổi ảnh</div>
          </div>
          <div style="flex:1">
            <div class="form-group"><label>Tên khách hàng</label><input class="form-control" id="cf-name" value="${cu?.name||''}" required placeholder="Nhập tên khách hàng"></div>
            <div class="form-row">
              <div class="form-group"><label>Số điện thoại</label><input class="form-control" id="cf-phone" value="${cu?.phone||''}" placeholder="VD: 0912345678"></div>
              <div class="form-group"><label>Mã KH</label><input class="form-control" id="cf-id" value="${cu?.id||''}" ${cu?'readonly style="opacity:0.6"':''} placeholder="Tự động"></div>
            </div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Giới tính</label>
            <select class="form-control" id="cf-gender">
              <option value="">-- Chưa chọn --</option>
              <option value="Nam" ${gender==='Nam'?'selected':''}>Nam</option>
              <option value="Nữ" ${gender==='Nữ'?'selected':''}>Nữ</option>
            </select>
          </div>
          <div class="form-group"><label>Facebook</label><input class="form-control" id="cf-facebook" value="${cu?.facebook||''}" placeholder="Link hoặc tên FB"></div>
        </div>
        <div class="form-group"><label>Địa chỉ</label><input class="form-control" id="cf-addr" value="${cu?.address||''}" placeholder="Nhập địa chỉ"></div>
        <div class="form-group"><label>Ghi chú</label><textarea class="form-control" id="cf-note" rows="2" placeholder="Ghi chú về khách hàng..." style="resize:vertical">${cu?.note||''}</textarea></div>
        <input type="hidden" id="cf-avatar-data" value="${avatarUrl}">
      </form>
    `;

    // Avatar click to upload
    document.getElementById('cf-avatar-preview').addEventListener('click', () => document.getElementById('cf-avatar-file').click());
    document.getElementById('cf-avatar-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        document.getElementById('cf-avatar-data').value = ev.target.result;
        document.getElementById('cf-avatar-preview').innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover">`;
      };
      reader.readAsDataURL(file);
    });
    // Gender change updates default avatar
    document.getElementById('cf-gender').addEventListener('change', (e) => {
      const av = document.getElementById('cf-avatar-data').value;
      if(!av) document.getElementById('cf-avatar-preview').innerHTML = this.avatarSvg(e.target.value);
    });

    document.getElementById('modal-footer').innerHTML = `
      <button class="btn btn-secondary" id="m-cancel">Hủy</button>
      <button class="btn btn-primary" id="m-save">${cu ? 'Cập nhật' : 'Thêm mới'}</button>
    `;
    this.openModal();
    document.getElementById('m-cancel').addEventListener('click', () => this.closeModal());
    document.getElementById('m-save').addEventListener('click', async () => {
      const name = document.getElementById('cf-name').value.trim();
      if (!name) { this.toast('error', 'Vui lòng nhập tên khách hàng!'); return; }
      const d = {
        name,
        phone: document.getElementById('cf-phone').value.trim(),
        address: document.getElementById('cf-addr').value.trim(),
        gender: document.getElementById('cf-gender').value,
        facebook: document.getElementById('cf-facebook').value.trim(),
        note: document.getElementById('cf-note').value.trim(),
        avatar: document.getElementById('cf-avatar-data').value
      };
      const url = localStorage.getItem('khs_api_url');
      if (cu) {
        Object.assign(cu, d);
        this.toast('success', 'Đã cập nhật khách hàng!');
        if (url) {
          try {
            await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
              body: JSON.stringify({ action: 'updateCustomer', id: cu.id, ...d })
            });
          } catch (e) { console.warn('Sync customer update failed:', e); }
        }
      } else {
        const newId = document.getElementById('cf-id').value.trim() || 'KH' + String(this.customers.length + 800).padStart(6, '0');
        this.customers.push({ id: newId, ...d, totalOrders: 0, totalSpent: 0, lastOrder: '' });
        this.toast('success', 'Đã thêm khách hàng!');
        if (url) {
          try {
            await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
              body: JSON.stringify({ action: 'addCustomer', id: newId, ...d })
            });
          } catch (e) { console.warn('Sync customer add failed:', e); }
        }
      }
      this.closeModal();
      this.renderCustomers(document.getElementById('page-container'));
    });
  },

  delCustomer(id) {
    const cu = this.customers.find(x => x.id === id);
    if (!cu) return;
    this.confirmDelete('Xóa khách hàng', cu.name, () => {
      this.customers = this.customers.filter(x => x.id !== id);
      this.toast('success', 'Đã xóa khách hàng!');
      this.renderCustomers(document.getElementById('page-container'));
      // Sync delete to Google Sheets
      const url = localStorage.getItem('khs_api_url');
      if (url) {
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action: 'deleteCustomer', id: cu.id })
        }).catch(e => console.warn('Sync customer delete failed:', e));
      }
    });
  },

  // ═════════ REPORTS ═════════
  reportType: 'sales',
  reportPeriod: 'thisMonth',
  reportView: 'chart',

  renderReports(c) {
    c.innerHTML = `
      <div class="report-layout">
        <div class="report-sidebar">
          <div class="report-filter-group">
            <h4>Kiểu hiển thị</h4>
            <div class="rpt-view-toggle">
              <button class="rpt-view-btn ${this.reportView==='chart'?'active':''}" data-view="chart">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="18" y="3" width="4" height="18"/><rect x="10" y="8" width="4" height="13"/><rect x="2" y="13" width="4" height="8"/></svg>
                Biểu đồ
              </button>
              <button class="rpt-view-btn ${this.reportView==='table'?'active':''}" data-view="table">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg>
                Báo cáo
              </button>
            </div>
          </div>
          <div class="report-filter-group">
            <h4>Loại báo cáo</h4>
            <div class="report-type-list">
              <button class="report-type-btn ${this.reportType==='sales'?'active':''}" data-type="sales"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg> Bán hàng</button>
              <button class="report-type-btn ${this.reportType==='products'?'active':''}" data-type="products"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> Hàng hóa</button>
              <button class="report-type-btn ${this.reportType==='customers'?'active':''}" data-type="customers"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> Khách hàng</button>
              <button class="report-type-btn ${this.reportType==='finance'?'active':''}" data-type="finance"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Tài chính</button>
            </div>
          </div>
          <div class="report-filter-group">
            <h4>Thời gian</h4>
            <select id="rpt-period" class="form-control">
              <option value="today" ${this.reportPeriod==='today'?'selected':''}>Hôm nay</option>
              <option value="yesterday" ${this.reportPeriod==='yesterday'?'selected':''}>Hôm qua</option>
              <option value="thisWeek" ${this.reportPeriod==='thisWeek'?'selected':''}>Tuần này</option>
              <option value="lastWeek" ${this.reportPeriod==='lastWeek'?'selected':''}>Tuần trước</option>
              <option value="thisMonth" ${this.reportPeriod==='thisMonth'?'selected':''}>Tháng này</option>
              <option value="lastMonth" ${this.reportPeriod==='lastMonth'?'selected':''}>Tháng trước</option>
              <option value="thisYear" ${this.reportPeriod==='thisYear'?'selected':''}>Năm nay</option>
              <option value="custom" ${this.reportPeriod==='custom'?'selected':''}>Tùy chỉnh</option>
            </select>
            <div id="rpt-custom-dates" style="display:${this.reportPeriod==='custom'?'flex':'none'};gap:6px;margin-top:8px;flex-direction:column">
              <input type="date" id="rpt-from" class="form-control">
              <input type="date" id="rpt-to" class="form-control">
            </div>
          </div>
        </div>
        <div class="report-main" id="report-content"></div>
      </div>`;
    // Bind view toggle
    document.querySelectorAll('.rpt-view-btn').forEach(btn => btn.addEventListener('click', () => {
      this.reportView = btn.dataset.view;
      document.querySelectorAll('.rpt-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); this.updateReport();
    }));
    document.querySelectorAll('.report-type-btn').forEach(btn => btn.addEventListener('click', () => {
      this.reportType = btn.dataset.type;
      document.querySelectorAll('.report-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); this.updateReport();
    }));
    document.getElementById('rpt-period').addEventListener('change', e => {
      this.reportPeriod = e.target.value;
      document.getElementById('rpt-custom-dates').style.display = this.reportPeriod === 'custom' ? 'flex' : 'none';
      this.updateReport();
    });
    document.getElementById('rpt-from')?.addEventListener('change', () => this.updateReport());
    document.getElementById('rpt-to')?.addEventListener('change', () => this.updateReport());
    document.querySelectorAll('[data-report]').forEach(link => link.addEventListener('click', () => { this.reportType = link.dataset.report; this.renderReports(document.getElementById('page-container')); }));
    this.updateReport();
  },

  getReportDateRange() {
    const now = new Date(), dow = now.getDay() || 7;
    switch (this.reportPeriod) {
      case 'today': return [new Date(now.getFullYear(),now.getMonth(),now.getDate()), now];
      case 'yesterday': { const y=new Date(now); y.setDate(y.getDate()-1); return [new Date(y.getFullYear(),y.getMonth(),y.getDate()), new Date(y.getFullYear(),y.getMonth(),y.getDate(),23,59,59)]; }
      case 'thisWeek': return [new Date(now.getFullYear(),now.getMonth(),now.getDate()-dow+1), now];
      case 'lastWeek': return [new Date(now.getFullYear(),now.getMonth(),now.getDate()-dow-6), new Date(now.getFullYear(),now.getMonth(),now.getDate()-dow,23,59,59)];
      case 'thisMonth': return [new Date(now.getFullYear(),now.getMonth(),1), now];
      case 'lastMonth': return [new Date(now.getFullYear(),now.getMonth()-1,1), new Date(now.getFullYear(),now.getMonth(),0,23,59,59)];
      case 'thisYear': return [new Date(now.getFullYear(),0,1), now];
      case 'custom': { const f=document.getElementById('rpt-from')?.value, t=document.getElementById('rpt-to')?.value; if(!f||!t) return [new Date(now.getFullYear(),now.getMonth(),1),now]; return [new Date(f), new Date(t+'T23:59:59')]; }
      default: return [new Date(now.getFullYear(),now.getMonth(),1), now];
    }
  },

  updateReport() {
    const el = document.getElementById('report-content'); if (!el) return;
    const [s,e] = this.getReportDateRange();
    const pD = str => { if(!str) return null; const m=str.match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? new Date(+m[3],+m[2]-1,+m[1]) : null; };
    const orders = this.orders.filter(o => { if(o.status!=='completed') return false; const d=pD(o.createdAt); return d&&d>=s&&d<=e; });
    const v = this.reportView;
    switch(this.reportType) {
      case 'sales': this.reportSales(el,orders,v); break;
      case 'products': this.reportProducts(el,orders,v); break;
      case 'customers': this.reportCustomers(el,orders,v); break;
      case 'finance': this.reportFinance(el,orders,v); break;
    }
  },

  // Canvas bar chart helper with hover tooltips
  rptBarChart(id, labels, data, color, extras) {
    setTimeout(() => {
      const cvs = document.getElementById(id); if(!cvs) return;
      const ctx = cvs.getContext('2d'), dpr = devicePixelRatio||1;
      const rr = cvs.getBoundingClientRect();
      cvs.width = rr.width*dpr; cvs.height = rr.height*dpr; ctx.scale(dpr,dpr);
      const w=rr.width, h=rr.height, p={t:30,r:20,b:40,l:65};
      const cw=w-p.l-p.r, ch=h-p.t-p.b;
      if(!data.length){ctx.fillStyle='#999';ctx.font='14px "Be Vietnam Pro"';ctx.fillText('Không có dữ liệu',w/2-50,h/2);return;}
      const mx=Math.max(...data)*1.2||1, bw=Math.min(cw/data.length*0.6,50), gap=cw/data.length;
      const clr = color||'#1A73E8';

      // Store bar rects for hit detection
      const bars = [];
      const drawBars = (hoverIdx) => {
        ctx.clearRect(0,0,w,h);
        // Grid lines
        ctx.strokeStyle='#F3F4F6'; ctx.lineWidth=1;
        for(let i=0;i<=4;i++){const y=p.t+(ch/4)*i; ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(w-p.r,y);ctx.stroke(); ctx.fillStyle='#9CA3AF';ctx.font='11px "Be Vietnam Pro"';ctx.textAlign='right'; ctx.fillText(fmtShort(mx-(mx/4)*i),p.l-8,y+4);}
        // Bars
        data.forEach((v,i)=>{
          const x=p.l+gap*i+(gap-bw)/2, bh=(v/mx)*ch, y=p.t+ch-bh;
          const isHover = i === hoverIdx;
          // Bar with rounded top
          ctx.fillStyle = isHover ? clr+'CC' : clr;
          if(isHover){ ctx.shadowColor=clr+'40'; ctx.shadowBlur=12; ctx.shadowOffsetY=2; }
          ctx.beginPath(); const rd=Math.min(4,bw/2);
          ctx.moveTo(x,y+rd);ctx.arcTo(x,y,x+rd,y,rd);ctx.arcTo(x+bw,y,x+bw,y+rd,rd);
          ctx.lineTo(x+bw,p.t+ch);ctx.lineTo(x,p.t+ch);ctx.closePath();ctx.fill();
          ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetY=0;
          // Label below
          ctx.fillStyle='#6B7280';ctx.font='10px "Be Vietnam Pro"';ctx.textAlign='center';
          ctx.fillText(labels[i]||'',x+bw/2,p.t+ch+16);
          // Value above bar on hover
          if(isHover){
            const txt = fmtd(v);
            const extra = extras && extras[i] ? extras[i] : null;
            const line2 = extra ? extra : null;
            ctx.font='bold 12px "Be Vietnam Pro"'; ctx.textAlign='center';
            const tw1 = ctx.measureText(txt).width;
            ctx.font='11px "Be Vietnam Pro"';
            const tw2 = line2 ? ctx.measureText(line2).width : 0;
            const twMax = Math.max(tw1, tw2);
            const tipH = line2 ? 34 : 20;
            const ty = y - (line2 ? 16 : 8);
            // Background pill
            ctx.fillStyle='#1F2937'; ctx.beginPath();
            const px=6, py=4, bx=x+bw/2-twMax/2-px, by=ty-12-py;
            ctx.roundRect(bx,by,twMax+px*2,tipH+py*2,5); ctx.fill();
            // Arrow
            ctx.beginPath(); ctx.moveTo(x+bw/2-5,by+tipH+py*2); ctx.lineTo(x+bw/2,by+tipH+py*2+5); ctx.lineTo(x+bw/2+5,by+tipH+py*2); ctx.fill();
            // Text line 1
            ctx.fillStyle='#fff'; ctx.font='bold 12px "Be Vietnam Pro"'; ctx.fillText(txt,x+bw/2,ty);
            // Text line 2 (extra info)
            if(line2){ ctx.fillStyle='#93C5FD'; ctx.font='11px "Be Vietnam Pro"'; ctx.fillText(line2,x+bw/2,ty+16); }
          }
          if(!bars[i]) bars[i]={x,y,w:bw,h:bh};
          else { bars[i].x=x;bars[i].y=y;bars[i].w=bw;bars[i].h=bh; }
        });
      };
      drawBars(-1);

      // Mouse events
      let lastHover = -1;
      cvs.addEventListener('mousemove', (e) => {
        const rect = cvs.getBoundingClientRect();
        const mx2 = e.clientX - rect.left, my = e.clientY - rect.top;
        let hit = -1;
        bars.forEach((b,i) => { if(mx2>=b.x && mx2<=b.x+b.w && my>=b.y && my<=p.t+ch) hit=i; });
        if(hit !== lastHover){ lastHover=hit; drawBars(hit); cvs.style.cursor=hit>=0?'pointer':'default'; }
      });
      cvs.addEventListener('mouseleave', () => { lastHover=-1; drawBars(-1); cvs.style.cursor='default'; });
    },100);
  },


  // Canvas pie/donut chart helper with hover
  rptPieChart(id, labels, data, colors) {
    setTimeout(() => {
      const cvs = document.getElementById(id); if(!cvs) return;
      const ctx = cvs.getContext('2d'), dpr = devicePixelRatio||1;
      const rr = cvs.getBoundingClientRect();
      cvs.width=rr.width*dpr; cvs.height=rr.height*dpr; ctx.scale(dpr,dpr);
      const w=rr.width, h=rr.height, total=data.reduce((a,b)=>a+b,0);
      if(!total){ctx.fillStyle='#999';ctx.font='14px "Be Vietnam Pro"';ctx.fillText('Không có dữ liệu',w/2-50,h/2);return;}
      const cx=w*0.35, cy=h/2, radius=Math.min(cx-20,cy-20);
      const lx=w*0.65;

      // Build slice angles
      const slices = [];
      let angle = -Math.PI/2;
      data.forEach((v,i) => {
        const sweep = (v/total)*Math.PI*2;
        slices.push({ start: angle, end: angle+sweep, val: v, pct: Math.round(v/total*100) });
        angle += sweep;
      });

      const drawPie = (hoverIdx) => {
        ctx.clearRect(0,0,w,h);
        // Draw slices
        slices.forEach((s,i) => {
          const isHover = i === hoverIdx;
          const offset = isHover ? 6 : 0;
          const midAngle = (s.start+s.end)/2;
          const ox = Math.cos(midAngle)*offset, oy = Math.sin(midAngle)*offset;
          if(isHover){ ctx.shadowColor=colors[i%colors.length]+'60'; ctx.shadowBlur=16; }
          ctx.beginPath(); ctx.moveTo(cx+ox,cy+oy);
          ctx.arc(cx+ox,cy+oy,radius,s.start,s.end); ctx.closePath();
          ctx.fillStyle=colors[i%colors.length]; ctx.fill();
          ctx.shadowColor='transparent'; ctx.shadowBlur=0;
        });
        // Donut hole
        ctx.beginPath(); ctx.arc(cx,cy,radius*0.55,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
        // Center text
        if(hoverIdx >= 0){
          const pct = slices[hoverIdx].pct;
          ctx.fillStyle='#374151'; ctx.font='bold 20px "Be Vietnam Pro"'; ctx.textAlign='center';
          ctx.fillText(pct+'%', cx, cy+2);
          ctx.font='11px "Be Vietnam Pro"'; ctx.fillStyle='#9CA3AF';
          ctx.fillText(labels[hoverIdx], cx, cy+18);
        } else {
          ctx.fillStyle='#374151'; ctx.font='bold 15px "Be Vietnam Pro"'; ctx.textAlign='center';
          ctx.fillText(fmtShort(total), cx, cy+6);
        }
        // Legend
        labels.forEach((l,i) => {
          const ly=30+i*28;
          const isH = i===hoverIdx;
          ctx.fillStyle=colors[i%colors.length];
          ctx.beginPath(); ctx.roundRect(lx,ly,14,14,3); ctx.fill();
          ctx.fillStyle = isH ? '#111' : '#374151';
          ctx.font = isH ? 'bold 12px "Be Vietnam Pro"' : '12px "Be Vietnam Pro"';
          ctx.textAlign='left';
          const pct = total ? Math.round(data[i]/total*100) : 0;
          ctx.fillText(`${l}: ${fmtShort(data[i])} (${pct}%)`, lx+20, ly+12);
        });
        // Tooltip on hover
        if(hoverIdx >= 0){
          const s = slices[hoverIdx];
          const midA = (s.start+s.end)/2;
          const tipX = cx + Math.cos(midA)*(radius*0.78);
          const tipY = cy + Math.sin(midA)*(radius*0.78);
          const txt = `${fmtd(s.val)} (${s.pct}%)`;
          ctx.font='bold 11px "Be Vietnam Pro"'; ctx.textAlign='center';
          const tw = ctx.measureText(txt).width;
          ctx.fillStyle='#1F2937'; ctx.beginPath();
          ctx.roundRect(tipX-tw/2-6, tipY-18, tw+12, 22, 4); ctx.fill();
          ctx.fillStyle='#fff'; ctx.fillText(txt, tipX, tipY-2);
        }
      };
      drawPie(-1);

      // Hit detection using angle
      let lastH = -1;
      cvs.addEventListener('mousemove', (e) => {
        const rect=cvs.getBoundingClientRect();
        const mx=e.clientX-rect.left-cx, my=e.clientY-rect.top-cy;
        const dist = Math.sqrt(mx*mx+my*my);
        let hit = -1;
        if(dist > radius*0.55 && dist < radius+10){
          let a = Math.atan2(my,mx);
          if(a < -Math.PI/2) a += Math.PI*2;
          slices.forEach((s,i) => { let sa=s.start, ea=s.end; if(a>=sa&&a<ea) hit=i; });
        }
        if(hit!==lastH){ lastH=hit; drawPie(hit); cvs.style.cursor=hit>=0?'pointer':'default'; }
      });
      cvs.addEventListener('mouseleave', () => { lastH=-1; drawPie(-1); cvs.style.cursor='default'; });
    },100);
  },


  reportSales(el, orders, view) {
    const rev=orders.reduce((s,o)=>s+(o.finalTotal||0),0), disc=orders.reduce((s,o)=>s+(o.discount||0),0), cnt=orders.length, avg=cnt?Math.round(rev/cnt):0;
    const periodLabels = {today:'hôm nay',yesterday:'hôm qua',thisWeek:'tuần này',lastWeek:'tuần trước',thisMonth:'tháng này',lastMonth:'tháng trước',thisYear:'năm nay',custom:'tùy chỉnh'};
    const periodLabel = periodLabels[this.reportPeriod] || 'ngày';
    const dm={}; orders.forEach(o=>{const k=o.createdAt?.substring(0,10)||'';if(!dm[k])dm[k]={r:0,c:0};dm[k].r+=(o.finalTotal||0);dm[k].c++;});
    const dr=Object.entries(dm).sort((a,b)=>a[0].localeCompare(b[0]));
    // Payment breakdown
    const cT=orders.filter(o=>o.payment==='Tiền mặt'), bT=orders.filter(o=>o.payment==='Chuyển khoản');
    const codT=orders.filter(o=>o.payment==='Ship COD'), shipT=orders.filter(o=>o.payment==='Ship Thường');
    const cS=cT.reduce((s,o)=>s+(o.finalTotal||0),0), bS=bT.reduce((s,o)=>s+(o.finalTotal||0),0);
    const codS=codT.reduce((s,o)=>s+(o.finalTotal||0),0), shipS=shipT.reduce((s,o)=>s+(o.finalTotal||0),0);
    // Employee breakdown
    const em={}; orders.forEach(o=>{const k=o.createdBy||'Không rõ';if(!em[k])em[k]={r:0,c:0};em[k].r+=(o.finalTotal||0);em[k].c++;});
    const empSorted=Object.entries(em).sort((a,b)=>b[1].r-a[1].r);
    const cards=`<div class="report-summary-cards"><div class="rpt-card blue"><div class="rpt-card-label">Doanh thu</div><div class="rpt-card-value">${fmtd(rev)}</div></div><div class="rpt-card green"><div class="rpt-card-label">Số đơn</div><div class="rpt-card-value">${cnt}</div></div><div class="rpt-card purple"><div class="rpt-card-label">TB / đơn</div><div class="rpt-card-value">${fmtd(avg)}</div></div><div class="rpt-card orange"><div class="rpt-card-label">Giảm giá</div><div class="rpt-card-value">${fmtd(disc)}</div></div></div>`;
    if(view==='chart'){
      el.innerHTML=`<h2 class="report-title">Báo cáo bán hàng</h2>${cards}<div class="card" style="margin-top:16px"><div class="card-header"><h3>Phân bổ thanh toán</h3></div><div class="card-body"><div class="chart-area" style="height:280px"><canvas id="rc5"></canvas></div></div></div><div class="card" style="margin-top:16px"><div class="card-header"><h3>Doanh thu theo nhân viên</h3></div><div class="card-body"><div class="chart-area" style="height:320px"><canvas id="rc-emp"></canvas></div></div></div><div class="card" style="margin-top:16px"><div class="card-header"><h3>Doanh thu ${periodLabel}</h3></div><div class="card-body"><div class="chart-area" style="height:320px"><canvas id="rc1"></canvas></div></div></div>`;
      this.rptPieChart('rc5',['Tiền mặt','Chuyển khoản','Ship COD','Ship Thường'],[cS,bS,codS,shipS],['#1A73E8','#10B981','#F59E0B','#8B5CF6']);
      this.rptBarChart('rc-emp',empSorted.map(([n])=>n.length>12?n.substring(0,12)+'…':n),empSorted.map(([,d])=>d.r),'#10B981',empSorted.map(([,d])=>d.c+' đơn'));
      this.rptBarChart('rc1',dr.map(([d])=>d.substring(0,5)),dr.map(([,d])=>d.r),'#1A73E8',dr.map(([,d])=>d.c+' đơn'));
    } else {
      el.innerHTML=`<h2 class="report-title">Báo cáo bán hàng</h2>${cards}<div class="card" style="margin-top:16px"><div class="card-header"><h3>Phân loại thanh toán</h3></div><div class="card-body"><table class="data-table"><thead><tr><th>Hình thức</th><th style="text-align:right">Số đơn</th><th style="text-align:right">Số tiền</th></tr></thead><tbody><tr><td>💵 Tiền mặt</td><td style="text-align:right">${cT.length}</td><td style="text-align:right;font-weight:600">${fmtd(cS)}</td></tr><tr><td>🏦 Chuyển khoản</td><td style="text-align:right">${bT.length}</td><td style="text-align:right;font-weight:600">${fmtd(bS)}</td></tr><tr><td>🚚 Ship COD</td><td style="text-align:right">${codT.length}</td><td style="text-align:right;font-weight:600">${fmtd(codS)}</td></tr><tr><td>📦 Ship Thường</td><td style="text-align:right">${shipT.length}</td><td style="text-align:right;font-weight:600">${fmtd(shipS)}</td></tr></tbody><tfoot><tr style="font-weight:700;background:var(--bg-secondary)"><td>Tổng</td><td style="text-align:right">${cnt}</td><td style="text-align:right">${fmtd(rev)}</td></tr></tfoot></table></div></div><div class="card" style="margin-top:16px"><div class="card-header"><h3>Doanh thu theo nhân viên</h3></div><div class="card-body"><table class="data-table"><thead><tr><th>Nhân viên</th><th style="text-align:right">Số đơn</th><th style="text-align:right">Doanh thu</th><th style="text-align:right">TB / đơn</th></tr></thead><tbody>${empSorted.map(([n,d])=>`<tr><td style="font-weight:600">${n}</td><td style="text-align:right">${d.c}</td><td style="text-align:right;font-weight:600">${fmtd(d.r)}</td><td style="text-align:right">${fmtd(d.c?Math.round(d.r/d.c):0)}</td></tr>`).join('')}</tbody><tfoot><tr style="font-weight:700;background:var(--bg-secondary)"><td>Tổng</td><td style="text-align:right">${cnt}</td><td style="text-align:right">${fmtd(rev)}</td><td style="text-align:right">${fmtd(avg)}</td></tr></tfoot></table></div></div><div class="card" style="margin-top:16px"><div class="card-header"><h3>Chi tiết ${periodLabel}</h3></div><div class="card-body"><table class="data-table"><thead><tr><th>Ngày</th><th style="text-align:right">Số đơn</th><th style="text-align:right">Doanh thu</th></tr></thead><tbody>${dr.reverse().map(([d,v])=>`<tr><td>${d}</td><td style="text-align:right">${v.c}</td><td style="text-align:right;font-weight:600">${fmtd(v.r)}</td></tr>`).join('')}</tbody><tfoot><tr style="font-weight:700;background:var(--bg-secondary)"><td>Tổng</td><td style="text-align:right">${cnt}</td><td style="text-align:right">${fmtd(rev)}</td></tr></tfoot></table></div></div>`;
    }
  },

  reportProducts(el, orders, view) {
    const rm={},qm={}; orders.forEach(o=>{if(o.items)o.items.forEach(it=>{const k=it.name||'?';rm[k]=(rm[k]||0)+(it.qty||1)*(it.price||0);qm[k]=(qm[k]||0)+(it.qty||1);});});
    const br=Object.entries(rm).sort((a,b)=>b[1]-a[1]).slice(0,10), bq=Object.entries(qm).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const mr=br[0]?.[1]||1, mq=bq[0]?.[1]||1;
    const cards=`<div class="report-summary-cards"><div class="rpt-card blue"><div class="rpt-card-label">Tổng SP bán</div><div class="rpt-card-value">${Object.values(qm).reduce((a,b)=>a+b,0)}</div></div><div class="rpt-card green"><div class="rpt-card-label">Số loại SP</div><div class="rpt-card-value">${Object.keys(qm).length}</div></div><div class="rpt-card purple"><div class="rpt-card-label">Tổng doanh thu</div><div class="rpt-card-value">${fmtd(Object.values(rm).reduce((a,b)=>a+b,0))}</div></div></div>`;
    if(view==='chart'){
      el.innerHTML=`<h2 class="report-title">Báo cáo hàng hóa</h2>${cards}<div class="card" style="margin-top:16px"><div class="card-header"><h3>Top 10 SP theo doanh thu</h3></div><div class="card-body"><div class="chart-area" style="height:320px"><canvas id="rc2"></canvas></div></div></div><div class="card" style="margin-top:16px"><div class="card-header"><h3>Top 10 SP theo số lượng</h3></div><div class="card-body"><div class="chart-area" style="height:320px"><canvas id="rc3"></canvas></div></div></div>`;
      this.rptBarChart('rc2',br.map(([n])=>n.length>12?n.substring(0,12)+'…':n),br.map(([,v])=>v),'#1A73E8',br.map(([n])=>'SL: '+(qm[n]||0)));
      this.rptBarChart('rc3',bq.map(([n])=>n.length>12?n.substring(0,12)+'…':n),bq.map(([,v])=>v),'#10B981',bq.map(([n])=>'DT: '+fmtShort(rm[n]||0)));
    } else {
      el.innerHTML=`<h2 class="report-title">Báo cáo hàng hóa</h2>${cards}<div class="card" style="margin-top:16px"><div class="card-header"><h3>Top 10 theo doanh thu</h3></div><div class="card-body"><div class="hbar-list">${br.map(([n,v])=>`<div class="hbar-item"><div class="hbar-label" title="${n}">${n}</div><div class="hbar-bar-wrap"><div class="hbar-bar" style="width:${v/mr*100}%"></div></div><div class="hbar-value">${fmtShort(v)}</div></div>`).join('')}</div></div></div><div class="card" style="margin-top:16px"><div class="card-header"><h3>Top 10 theo số lượng</h3></div><div class="card-body"><div class="hbar-list">${bq.map(([n,v])=>`<div class="hbar-item"><div class="hbar-label" title="${n}">${n}</div><div class="hbar-bar-wrap"><div class="hbar-bar" style="width:${v/mq*100}%;background:#10B981"></div></div><div class="hbar-value">${v}</div></div>`).join('')}</div></div></div>`;
    }
  },

  reportCustomers(el, orders, view) {
    const cm={}; orders.forEach(o=>{const k=o.customerName||'Khách lẻ';if(!cm[k])cm[k]={s:0,c:0};cm[k].s+=(o.finalTotal||0);cm[k].c++;});
    const sorted=Object.entries(cm).sort((a,b)=>b[1].s-a[1].s), ms=sorted[0]?.[1].s||1;
    const cards=`<div class="report-summary-cards"><div class="rpt-card blue"><div class="rpt-card-label">Tổng khách</div><div class="rpt-card-value">${sorted.length}</div></div><div class="rpt-card green"><div class="rpt-card-label">Tổng doanh thu</div><div class="rpt-card-value">${fmtd(orders.reduce((s,o)=>s+(o.finalTotal||0),0))}</div></div></div>`;
    if(view==='chart'){
      el.innerHTML=`<h2 class="report-title">Báo cáo khách hàng</h2>${cards}<div class="card" style="margin-top:16px"><div class="card-header"><h3>Top khách hàng chi tiêu</h3></div><div class="card-body"><div class="chart-area" style="height:360px"><canvas id="rc4"></canvas></div></div></div>`;
      this.rptBarChart('rc4',sorted.slice(0,10).map(([n])=>n.length>10?n.substring(0,10)+'…':n),sorted.slice(0,10).map(([,d])=>d.s),'#8B5CF6',sorted.slice(0,10).map(([,d])=>d.c+' đơn hàng'));
    } else {
      el.innerHTML=`<h2 class="report-title">Báo cáo khách hàng</h2>${cards}<div class="card" style="margin-top:16px"><div class="card-header"><h3>Xếp hạng chi tiêu</h3></div><div class="card-body"><div class="hbar-list">${sorted.slice(0,15).map(([n,d])=>`<div class="hbar-item"><div class="hbar-label" title="${n}">${n}</div><div class="hbar-bar-wrap"><div class="hbar-bar" style="width:${d.s/ms*100}%;background:#8B5CF6"></div></div><div class="hbar-value">${fmtd(d.s)} (${d.c} đơn)</div></div>`).join('')}</div></div></div>`;
    }
  },


  reportFinance(el, orders, view) {
    const rev=orders.reduce((s,o)=>s+(o.finalTotal||0),0);
    const cost=orders.reduce((s,o)=>{let c=0;if(o.items)o.items.forEach(it=>{if(it.costPrice>0){c+=it.costPrice;}else{const p=this.products.find(p=>p.sku===it.sku)||this.products.find(p=>p.name===it.name);c+=(p?.costPrice||0)*(it.qty||1);}});return s+c;},0);
    const disc=orders.reduce((s,o)=>s+(o.discount||0),0);
    const profit=rev-cost-disc;
    const cards=`<div class="report-summary-cards"><div class="rpt-card blue"><div class="rpt-card-label">Doanh thu</div><div class="rpt-card-value">${fmtd(rev)}</div></div><div class="rpt-card red"><div class="rpt-card-label">Giá vốn</div><div class="rpt-card-value">${fmtd(cost)}</div></div><div class="rpt-card green"><div class="rpt-card-label">Lợi nhuận</div><div class="rpt-card-value">${fmtd(profit)}</div></div><div class="rpt-card orange"><div class="rpt-card-label">Chiết khấu</div><div class="rpt-card-value">${fmtd(disc)}</div></div></div>`;
    if(view==='chart'){
      el.innerHTML=`<h2 class="report-title">Báo cáo tài chính</h2>${cards}<div class="card" style="margin-top:16px"><div class="card-header"><h3>Cơ cấu doanh thu</h3></div><div class="card-body"><div class="chart-area" style="height:280px"><canvas id="rc6"></canvas></div></div></div>`;
      this.rptPieChart('rc6',['Giá vốn','Lợi nhuận','Chiết khấu'],[cost,profit,disc],['#EF4444','#10B981','#F59E0B']);
    } else {
      el.innerHTML=`<h2 class="report-title">Báo cáo tài chính</h2>${cards}<div class="card" style="margin-top:16px"><div class="card-header"><h3>Tổng hợp</h3></div><div class="card-body"><table class="data-table"><tbody><tr><td>Tổng doanh thu</td><td style="text-align:right;font-weight:600;color:var(--primary)">${fmtd(rev)}</td></tr><tr><td>Giá vốn hàng bán</td><td style="text-align:right;font-weight:600;color:#EF4444">${fmtd(cost)}</td></tr><tr><td>Chiết khấu</td><td style="text-align:right">${fmtd(disc)}</td></tr><tr style="font-size:1.1rem;font-weight:700;background:var(--bg-secondary)"><td>Lợi nhuận gộp</td><td style="text-align:right;color:#10B981">${fmtd(profit)}</td></tr><tr><td>Biên lợi nhuận</td><td style="text-align:right;font-weight:600">${rev?Math.round(profit/rev*100):0}%</td></tr></tbody></table></div></div>`;
    }
  },
  // ═════════ INVENTORY ═════════
  inventoryView: 'chart',
  renderInventory(c) {
    const prods = this.products.filter(p => p.stock > 0);
    const totalQty = prods.reduce((s,p) => s + (p.stock||0), 0);
    const totalCost = prods.reduce((s,p) => s + (p.costPrice||0)*(p.stock||0), 0);
    const totalRev = prods.reduce((s,p) => s + (p.sellPrice||0)*(p.stock||0), 0);
    const totalProfit = totalRev - totalCost;
    const allProds = this.products.slice().sort((a,b) => (b.stock||0) - (a.stock||0));
    const top10 = allProds.filter(p=>p.stock>0).slice(0,10);

    const viewToggle = `<div class="rpt-view-toggle" style="margin-bottom:16px">
      <button class="rpt-view-btn ${this.inventoryView==='chart'?'active':''}" data-inv-view="chart">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="18" y="3" width="4" height="18"/><rect x="10" y="8" width="4" height="13"/><rect x="2" y="13" width="4" height="8"/></svg> Biểu đồ
      </button>
      <button class="rpt-view-btn ${this.inventoryView==='table'?'active':''}" data-inv-view="table">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg> Báo cáo
      </button>
      <button class="rpt-view-btn ${this.inventoryView==='batches'?'active':''}" data-inv-view="batches">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> Lô hàng
      </button>
    </div>`;

    const cards = `<div class="report-summary-cards">
      <div class="rpt-card blue"><div class="rpt-card-label">Tổng tồn kho</div><div class="rpt-card-value">${totalQty.toLocaleString('vi-VN')} SP</div></div>
      <div class="rpt-card red"><div class="rpt-card-label">Tổng giá vốn tồn kho</div><div class="rpt-card-value">${fmtd(totalCost)}</div></div>
      <div class="rpt-card green"><div class="rpt-card-label">Tổng doanh thu dự kiến</div><div class="rpt-card-value">${fmtd(totalRev)}</div></div>
      <div class="rpt-card purple"><div class="rpt-card-label">Lợi nhuận dự kiến</div><div class="rpt-card-value">${fmtd(totalProfit)}</div></div>
    </div>`;

    let content = '';
    if (this.inventoryView === 'chart') {
      content = `<div class="card" style="margin-top:16px"><div class="card-header"><h3>Top 10 SP tồn kho (theo số lượng)</h3></div>
        <div class="card-body"><div class="chart-area" style="height:340px"><canvas id="inv-qty-chart"></canvas></div></div></div>
        <div class="card" style="margin-top:16px"><div class="card-header"><h3>Giá trị tồn kho (Giá vốn vs Doanh thu)</h3></div>
        <div class="card-body"><div class="chart-area" style="height:280px"><canvas id="inv-pie"></canvas></div></div></div>`;
    } else if (this.inventoryView === 'batches') {
      // Lô hàng view
      const batches = (this.batches || []).filter(b => b.qtyRemaining > 0);
      const allBatches = (this.batches || []).slice().reverse();
      content = `<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" id="btn-import-batch">📦 Nhập kho</button>
        <button class="btn btn-secondary btn-sm" id="btn-init-batches">🔄 Khởi tạo lô từ tồn kho</button>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-header"><h3>Lô hàng còn tồn (${batches.length} lô)</h3></div><div class="card-body">
        <table class="data-table"><thead><tr>
          <th>Mã lô</th><th>Sản phẩm</th><th style="text-align:right">SL nhập</th>
          <th style="text-align:right">SL còn</th><th style="text-align:right">Giá nhập</th>
          <th>Ngày nhập</th><th>Người nhập</th><th>Ghi chú</th>
        </tr></thead><tbody>${allBatches.map(b => {
          const badge = b.qtyRemaining <= 0 ? 'out-of-stock' : b.qtyRemaining <= 3 ? 'low-stock' : 'in-stock';
          return `<tr style="${b.qtyRemaining<=0?'opacity:0.5':''}">
            <td style="font-size:0.8rem;color:#6B7280">${b.id}</td>
            <td style="font-weight:600">${b.name||b.sku}</td>
            <td style="text-align:right">${b.qtyImported}</td>
            <td style="text-align:right"><span class="stock-badge ${badge}">${b.qtyRemaining}</span></td>
            <td style="text-align:right;font-weight:600">${fmtd(b.costPrice)}</td>
            <td style="font-size:0.85rem">${b.importDate}</td>
            <td>${b.importedBy}</td>
            <td style="font-size:0.85rem;color:#6B7280">${b.note||''}</td>
          </tr>`;
        }).join('')}</tbody></table>
      </div></div>`;
    } else {
      const outOfStock = this.products.filter(p => (p.stock||0) <= 0);
      const lowStock = this.products.filter(p => p.stock > 0 && p.stock <= 3);
      content = `<div class="card" style="margin-top:16px"><div class="card-header"><h3>Chi tiết tồn kho (${this.products.length} SP)</h3></div><div class="card-body">
        <table class="data-table"><thead><tr><th>Sản phẩm</th><th style="text-align:right">Tồn kho</th><th style="text-align:right">Giá vốn TB</th><th style="text-align:right">Giá bán</th><th style="text-align:right">Tổng vốn</th><th style="text-align:right">Tổng DT</th></tr></thead>
        <tbody>${allProds.map(p => {
          const st = p.stock||0, cp = p.costPrice||0, sp = p.sellPrice||0;
          const badge = st<=0?'out-of-stock':st<=3?'low-stock':'in-stock';
          const label = st<=0?'Hết hàng':'Còn '+st;
          return `<tr><td>${p.name}</td><td style="text-align:right"><span class="stock-badge ${badge}">${label}</span></td><td style="text-align:right">${fmtd(cp)}</td><td style="text-align:right">${fmtd(sp)}</td><td style="text-align:right">${fmtd(cp*st)}</td><td style="text-align:right;font-weight:600">${fmtd(sp*st)}</td></tr>`;
        }).join('')}</tbody>
        <tfoot><tr style="font-weight:700;background:var(--bg-secondary)"><td>Tổng (${prods.length} SP còn hàng)</td><td style="text-align:right">${totalQty}</td><td></td><td></td><td style="text-align:right;color:#EF4444">${fmtd(totalCost)}</td><td style="text-align:right;color:var(--primary)">${fmtd(totalRev)}</td></tr></tfoot>
        </table>
        <div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap">
          <div style="font-size:0.85rem;color:#EF4444;font-weight:600">🔴 Hết hàng: ${outOfStock.length} SP</div>
          <div style="font-size:0.85rem;color:#F59E0B;font-weight:600">🟡 Sắp hết: ${lowStock.length} SP</div>
          <div style="font-size:0.85rem;color:#10B981;font-weight:600">🟢 Còn hàng: ${prods.length} SP</div>
        </div>
      </div></div>`;
    }

    c.innerHTML = `<h2 class="report-title">📦 Kiểm kho</h2>${viewToggle}${cards}${content}`;

    // Bind view toggle
    document.querySelectorAll('[data-inv-view]').forEach(btn => btn.addEventListener('click', () => {
      this.inventoryView = btn.dataset.invView;
      this.renderInventory(c);
    }));

    // Bind import batch button
    document.getElementById('btn-import-batch')?.addEventListener('click', () => this.openImportBatch());
    document.getElementById('btn-init-batches')?.addEventListener('click', async () => {
      if (!confirm('Khởi tạo lô hàng từ tồn kho hiện tại? (Chỉ chạy 1 lần)')) return;
      const url = localStorage.getItem('khs_api_url');
      if (!url) return;
      this.toast('info', 'Đang khởi tạo...');
      try {
        const res = await fetch(url, { method:'POST', headers:{'Content-Type':'text/plain'}, body: JSON.stringify({ action:'initBatches' }) }).then(r=>r.json());
        if (res.success) { this.toast('success', res.message); await this.autoSync(); this.renderInventory(c); }
        else this.toast('error', res.error);
      } catch(e) { this.toast('error', 'Lỗi: ' + e.message); }
    });

    // Draw charts
    if (this.inventoryView === 'chart') {
      this.rptBarChart('inv-qty-chart',
        top10.map(p => p.name.length>12?p.name.substring(0,12)+'…':p.name),
        top10.map(p => p.stock||0),
        '#1A73E8',
        top10.map(p => 'Vốn: '+fmtShort((p.costPrice||0)*(p.stock||0)))
      );
      this.rptPieChart('inv-pie',['Giá vốn','Lợi nhuận DK'],[totalCost,totalProfit],['#EF4444','#10B981']);
    }
  },

  // Modal nhập kho
  openImportBatch() {
    const prodOpts = this.products.map(p => `<option value="${p.sku}">${p.name} (${p.sku})</option>`).join('');
    const html = `<div class="modal-overlay active" id="batch-modal-overlay">
      <div class="modal" style="max-width:480px">
        <div class="modal-header"><h3>📦 Nhập kho</h3><button class="modal-close" id="batch-modal-close">×</button></div>
        <div class="modal-body" style="padding:20px">
          <div class="form-group"><label>Sản phẩm</label>
            <select id="batch-sku" class="form-control">${prodOpts}</select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group"><label>Số lượng nhập</label><input type="number" id="batch-qty" class="form-control" min="1" value="1"></div>
            <div class="form-group"><label>Giá nhập (VNĐ)</label><input type="text" id="batch-cost" class="form-control" placeholder="0"></div>
          </div>
          <div class="form-group"><label>Ghi chú</label><input type="text" id="batch-note" class="form-control" placeholder="VD: Nhập từ NCC X"></div>
          <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-secondary" id="batch-cancel">Hủy</button>
            <button class="btn btn-primary" id="batch-save">📦 Nhập kho</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const close = () => document.getElementById('batch-modal-overlay')?.remove();
    document.getElementById('batch-modal-close').onclick = close;
    document.getElementById('batch-cancel').onclick = close;

    // Format giá nhập
    const costInput = document.getElementById('batch-cost');
    costInput.addEventListener('input', () => {
      const v = costInput.value.replace(/\D/g, '');
      costInput.value = v ? parseInt(v).toLocaleString('vi-VN') : '';
    });

    // Pre-fill giá vốn hiện tại
    const skuSelect = document.getElementById('batch-sku');
    const fillCost = () => {
      const p = this.products.find(x => x.sku === skuSelect.value);
      if (p) costInput.value = (p.costPrice||0).toLocaleString('vi-VN');
    };
    fillCost();
    skuSelect.addEventListener('change', fillCost);

    document.getElementById('batch-save').addEventListener('click', async () => {
      const sku = skuSelect.value;
      const prod = this.products.find(x => x.sku === sku);
      const qty = parseInt(document.getElementById('batch-qty').value) || 0;
      const cost = parseInt(costInput.value.replace(/\D/g, '')) || 0;
      const note = document.getElementById('batch-note').value;
      if (!sku || qty <= 0) { this.toast('error', 'Vui lòng nhập đầy đủ!'); return; }
      const url = localStorage.getItem('khs_api_url');
      if (!url) { this.toast('error', 'Chưa kết nối API!'); return; }
      const saveBtn = document.getElementById('batch-save');
      saveBtn.textContent = 'Đang nhập...'; saveBtn.disabled = true;
      try {
        const res = await fetch(url, {
          method:'POST', headers:{'Content-Type':'text/plain'},
          body: JSON.stringify({ action:'addBatch', sku, name: prod?.name||'', qty, costPrice: cost, importedBy: this.user?.displayName||'Admin', note })
        }).then(r=>r.json());
        if (res.success) {
          this.toast('success', res.message);
          close();
          await this.autoSync();
          this.renderInventory(document.getElementById('page-container'));
        } else { this.toast('error', res.error); saveBtn.textContent = '📦 Nhập kho'; saveBtn.disabled = false; }
      } catch(e) { this.toast('error', 'Lỗi: '+e.message); saveBtn.textContent = '📦 Nhập kho'; saveBtn.disabled = false; }
    });
  },

  // ═════════ RETURNS ═════════
  returns: [],
  returnPage: 1,
  returnPerPage: 7,
  returnSearch: '',
  returnSelectedOrder: null,

  initReturn() {
    document.getElementById('btn-open-return')?.addEventListener('click', () => this.openReturn());
    document.getElementById('return-close')?.addEventListener('click', () => this.closeReturn());
    // Only close via X button, not by clicking overlay
    document.getElementById('return-search')?.addEventListener('input', (e) => { this.returnSearch=e.target.value; this.returnPage=1; this.renderReturnOrders(); });
    document.getElementById('return-back')?.addEventListener('click', () => this.returnStep1());
    document.getElementById('return-confirm')?.addEventListener('click', () => this.processReturn());
  },

  openReturn() {
    this.returnSearch = '';
    this.returnPage = 1;
    this.returnSelectedOrder = null;
    document.getElementById('return-overlay').style.display = 'flex';
    document.getElementById('return-search').value = '';
    this.returnStep1();
    this.renderReturnOrders();
  },

  closeReturn() {
    document.getElementById('return-overlay').style.display = 'none';
  },

  returnStep1() {
    document.getElementById('return-step1').style.display = '';
    document.getElementById('return-step2').style.display = 'none';
    document.getElementById('return-title').textContent = 'Chọn hóa đơn trả hàng';
  },

  renderReturnOrders() {
    const q = this.returnSearch.toLowerCase();
    const filtered = this.orders.filter(o => {
      if(o.status === 'returned') return false;
      if(!q) return true;
      return (o.id||'').toLowerCase().includes(q) || (o.customerName||'').toLowerCase().includes(q);
    });
    const total = filtered.length;
    const pages = Math.ceil(total / this.returnPerPage) || 1;
    if(this.returnPage > pages) this.returnPage = pages;
    const start = (this.returnPage - 1) * this.returnPerPage;
    const shown = filtered.slice(start, start + this.returnPerPage);

    const el = document.getElementById('return-order-list');
    if(!shown.length) {
      el.innerHTML = '<div style="text-align:center;padding:30px;color:#9CA3AF">Không tìm thấy đơn hàng</div>';
    } else {
      el.innerHTML = `<table><thead><tr><th>Mã đơn</th><th>Thời gian</th><th>Khách hàng</th><th style="text-align:right">Tổng cộng</th><th></th></tr></thead>
        <tbody>${shown.map(o => {
          const totalReturned = this.returns.filter(r => r.orderId === o.id).reduce((s,r) => s + (r.returnTotal||0), 0);
          const remaining = (o.finalTotal||0) - totalReturned;
          const hasReturn = totalReturned > 0;
          return `<tr>
          <td style="color:#1A73E8;font-weight:600">${o.id}${hasReturn?' <span style="color:#F59E0B;font-size:0.7rem">⟳ đã trả</span>':''}</td>
          <td>${o.createdAt||''}</td>
          <td>${o.customerName||'Khách lẻ'}</td>
          <td style="text-align:right;font-weight:600">${hasReturn?`<span style="text-decoration:line-through;color:#9CA3AF;font-size:0.75rem">${fmtd(o.finalTotal||0)}</span> ${fmtd(remaining)}`:fmtd(o.finalTotal||0)}</td>
          <td><button class="btn-choose" data-oid="${o.id}">Chọn</button></td>
        </tr>`;}).join('')}</tbody></table>`;
      el.querySelectorAll('.btn-choose').forEach(b => b.addEventListener('click', () => this.selectReturnOrder(b.dataset.oid)));
    }

    // Pagination
    const pg = document.getElementById('return-pagination');
    if(pages <= 1) { pg.innerHTML = `<span>Hiện thị ${shown.length} trên ${total} đơn</span>`; return; }
    let html = '';
    if(this.returnPage > 1) html += `<button data-rp="${this.returnPage-1}">&lt;</button>`;
    for(let i=1;i<=pages;i++) {
      if(pages>7 && i>2 && i<pages-1 && Math.abs(i-this.returnPage)>1) { if(i===3||i===pages-2) html+='<span>...</span>'; continue; }
      html += `<button class="${i===this.returnPage?'active':''}" data-rp="${i}">${i}</button>`;
    }
    if(this.returnPage < pages) html += `<button data-rp="${this.returnPage+1}">&gt;</button>`;
    html += `<span>Hiện thị ${start+1}-${Math.min(start+this.returnPerPage,total)} trên ${total}</span>`;
    pg.innerHTML = html;
    pg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { this.returnPage=parseInt(b.dataset.rp); this.renderReturnOrders(); }));
  },

  selectReturnOrder(orderId) {
    const order = this.orders.find(o => o.id === orderId);
    if(!order) return;
    this.returnSelectedOrder = order;
    document.getElementById('return-step1').style.display = 'none';
    document.getElementById('return-step2').style.display = '';
    document.getElementById('return-title').textContent = 'Trả hàng / ' + order.id;

    // Right panel - order info
    document.getElementById('return-order-info').innerHTML = `
      <div class="info-item"><span class="info-label" style="color:#1A73E8;font-weight:700">Trả hàng / ${order.id} - ${order.createdBy||''}</span></div>
      <div class="info-item" style="margin-top:4px"><span class="info-label">👤 ${order.customerName||'Khách lẻ'}</span></div>
    `;

    // Calculate already-returned qty per item
    const prevReturns = this.returns.filter(r => r.orderId === order.id);
    const returnedQty = {};
    prevReturns.forEach(r => (r.items||[]).forEach(ri => {
      const key = ri.sku || ri.name;
      returnedQty[key] = (returnedQty[key]||0) + ri.qty;
    }));

    // Left panel - items with editable price
    const items = order.items || [];
    document.getElementById('return-items-list').innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:0.83rem">
        <thead><tr style="background:#F9FAFB;font-weight:600;color:#6B7280">
          <th style="padding:8px 4px;width:24px"></th>
          <th style="padding:8px 4px;text-align:left">Sản phẩm</th>
          <th style="padding:8px 4px;text-align:center;width:50px">SL</th>
          <th style="padding:8px 4px;text-align:right;width:80px">Đơn giá</th>
          <th style="padding:8px 4px;text-align:right;width:80px">Thành tiền</th>
        </tr></thead>
        <tbody>${items.map((it, i) => {
          const key = it.sku || it.name;
          const alreadyReturned = returnedQty[key] || 0;
          const remaining = Math.max(0, it.qty - alreadyReturned);
          const disabled = remaining <= 0;
          return `<tr style="border-bottom:1px solid #F3F4F6;${disabled?'opacity:0.4':''}">
          <td style="padding:6px 4px"><input type="checkbox" class="return-item-check" data-idx="${i}" style="accent-color:#EF4444" ${disabled?'disabled':''}></td>
          <td style="padding:6px 4px">${it.name}${alreadyReturned>0?` <span style="color:#EF4444;font-size:0.75rem">(đã trả ${alreadyReturned})</span>`:''}</td>
          <td style="padding:6px 4px;text-align:center"><input type="number" class="return-qty-input" data-idx="${i}" min="0" max="${remaining}" value="0" style="width:40px;text-align:center;border:1px solid #D1D5DB;border-radius:4px;padding:2px" ${disabled?'disabled':''}><span style="color:#9CA3AF;font-size:0.75rem"> /${remaining}</span></td>
          <td style="padding:6px 4px;text-align:right"><input type="text" class="return-price-input" data-idx="${i}" value="${it.price.toLocaleString('vi-VN')}" style="width:70px;text-align:right;border:1px solid #D1D5DB;border-radius:4px;padding:2px 4px;font-size:0.83rem" ${disabled?'disabled':''}></td>
          <td style="padding:6px 4px;text-align:right;font-weight:600" class="return-item-total" data-idx="${i}">0</td>
        </tr>`;}).join('')}</tbody>
      </table>`;

    // Right panel - detail rows (editable)
    document.getElementById('return-detail-rows').innerHTML = `
      <div class="return-detail-row"><span class="rdl">Tổng giá gốc hàng mua</span><span class="rdv" id="rd-original-total">${fmtd(order.finalTotal||0)}</span></div>
      <div class="return-detail-row"><span class="rdl">Tổng tiền hàng trả</span><span class="rdv" id="rd-items-value">0</span></div>
      <div class="return-detail-row"><span class="rdl">Tiền trả khách</span><input type="text" id="rd-return-value" value="0"></div>
      <div class="return-detail-row"><span class="rdl">Giảm giá</span><input type="text" id="rd-discount" value="0"></div>
      <div class="return-detail-row"><span class="rdl">Phí trả hàng</span><input type="text" id="rd-fee" value="0"></div>
      <div class="return-detail-row"><span class="rdl">Hoàn trả thu khác</span><input type="text" id="rd-other" value="0"></div>
      <div class="return-detail-row highlight"><span class="rdl">Cần trả khách</span><span class="rdv" id="rd-refund" style="color:#B91C1C">0</span></div>
    `;

    // Payment methods
    document.getElementById('return-payment-methods').innerHTML = `
      <div class="rp-label">Hình thức hoàn tiền</div>
      <div class="return-payment-options">
        <label><input type="radio" name="return-payment" value="Tiền mặt" checked> Tiền mặt</label>
        <label><input type="radio" name="return-payment" value="Chuyển khoản"> CK</label>
      </div>
    `;

    // Bind events
    document.querySelectorAll('.return-qty-input, .return-price-input').forEach(el => {
      el.addEventListener('input', () => {
        const idx = el.dataset.idx;
        const cb = document.querySelector(`.return-item-check[data-idx="${idx}"]`);
        if(el.classList.contains('return-qty-input')) {
          const val = parseInt(el.value) || 0;
          if(cb) cb.checked = val > 0;
        }
        this.updateReturnSummary();
      });
    });
    document.querySelectorAll('.return-item-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const idx = cb.dataset.idx;
        const qi = document.querySelector(`.return-qty-input[data-idx="${idx}"]`);
        if(!cb.checked && qi) qi.value = 0;
        if(cb.checked && qi && parseInt(qi.value) === 0) qi.value = 1;
        this.updateReturnSummary();
      });
    });
    // Editable summary fields
    ['rd-return-value','rd-discount','rd-fee','rd-other'].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => this.calcReturnRefund());
      el?.addEventListener('blur', () => { const v = parseInt((el.value||'0').replace(/\D/g,''))||0; el.value = v ? this.fmtNum(v) : '0'; this.calcReturnRefund(); });
    });
    this.updateReturnSummary();
  },

  updateReturnSummary() {
    const order = this.returnSelectedOrder;
    const items = order?.items || [];
    let itemsValue = 0;
    document.querySelectorAll('.return-item-check').forEach(cb => {
      const i = parseInt(cb.dataset.idx);
      const qi = document.querySelector(`.return-qty-input[data-idx="${i}"]`);
      const pi = document.querySelector(`.return-price-input[data-idx="${i}"]`);
      const ti = document.querySelector(`.return-item-total[data-idx="${i}"]`);
      const qty = Math.min(parseInt(qi?.value)||0, items[i].qty);
      const price = parseInt((pi?.value||'0').replace(/\D/g,'')) || 0;
      const total = cb.checked ? qty * price : 0;
      if(ti) ti.textContent = total ? fmtd(total) : '0';
      itemsValue += total;
    });
    document.getElementById('rd-items-value').textContent = fmtd(itemsValue);
    const rvEl = document.getElementById('rd-return-value');
    if(document.activeElement !== rvEl) rvEl.value = this.fmtNum(itemsValue);
    this.calcReturnRefund();
  },

  fmtNum(n) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); },

  calcReturnRefund() {
    const parse = id => parseInt((document.getElementById(id)?.value||'0').replace(/\D/g,'')) || 0;
    // Auto-format inputs with dots
    ['rd-return-value','rd-discount','rd-fee','rd-other'].forEach(id => {
      const el = document.getElementById(id);
      if(el && document.activeElement !== el) { const v = parse(id); el.value = v ? this.fmtNum(v) : '0'; }
    });
    const returnValue = parse('rd-return-value');
    const discount = parse('rd-discount');
    const fee = parse('rd-fee');
    const other = parse('rd-other');
    const refund = returnValue - discount - fee - other;
    document.getElementById('rd-refund').textContent = fmtd(Math.max(0, refund));
    this._returnRefund = Math.max(0, refund);
    this._returnItemsValue = parse('rd-items-value') || returnValue;
    this._returnPropDiscount = discount;
  },

  async processReturn() {
    const order = this.returnSelectedOrder;
    if(!order) return;
    const items = order.items || [];
    const returnItems = [];

    document.querySelectorAll('.return-item-check').forEach(cb => {
      const i = parseInt(cb.dataset.idx);
      const qi = document.querySelector(`.return-qty-input[data-idx="${i}"]`);
      if(cb.checked && qi) {
        const qty = Math.min(parseInt(qi.value)||0, items[i].qty);
        if(qty > 0) returnItems.push({ name: items[i].name, sku: items[i].sku, qty, price: items[i].price });
      }
    });

    if(!returnItems.length) { this.toast('error','Chưa chọn sản phẩm trả'); return; }

    // Kiểm tra SP đã bị xóa
    const deletedItems = returnItems.filter(i => !this.products.find(p => p.sku === i.sku));
    if (deletedItems.length > 0) {
      const names = deletedItems.map(i => `• ${i.name} (${i.sku})`).join('\n');
      if (!confirm(`⚠️ Các sản phẩm sau đã bị xóa:\n${names}\n\nHệ thống sẽ tự động khôi phục sản phẩm và lô hàng.\nBạn có muốn tiếp tục?`)) return;
    }

    const itemsValue = returnItems.reduce((s,i) => s + i.qty * i.price, 0);
    const returnTotal = this._returnRefund || itemsValue; // Use proportional refund
    const propDiscount = this._returnPropDiscount || 0;
    const note = document.getElementById('return-note').value;

    let confirmMsg = `Xác nhận trả ${returnItems.length} mặt hàng?\nTổng giá hàng: ${fmtd(itemsValue)}`;
    if(propDiscount > 0) confirmMsg += `\nGiảm giá phân bổ: -${fmtd(propDiscount)}`;
    confirmMsg += `\nCần trả khách: ${fmtd(returnTotal)}`;
    if(!confirm(confirmMsg)) return;

    // Create return record
    const now = new Date();
    const returnId = 'TH' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + String(this.returns.length+1).padStart(3,'0');
    const returnRecord = {
      id: returnId,
      orderId: order.id,
      customerName: order.customerName || 'Khách lẻ',
      customerId: order.customerId || '',
      items: returnItems,
      itemsValue,
      discount: propDiscount,
      returnTotal,
      note,
      createdBy: this.user.displayName,
      createdAt: now.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'}) + ' ' + now.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})
    };

    this.returns.unshift(returnRecord);
    this.toast('success', `Đã tạo phiếu trả hàng ${returnId} - Hoàn ${fmtd(returnTotal)}`);

    // Sync to Google Sheets
    const apiUrl = localStorage.getItem('khs_api_url');
    if(apiUrl) {
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'returnOrder',
            returnId,
            orderId: order.id,
            customerName: returnRecord.customerName,
            customerId: returnRecord.customerId,
            items: returnItems,
            returnTotal,
            note,
            createdBy: returnRecord.createdBy
          })
        }).then(r => r.json());
        if(res.success) {
          this.toast('success', 'Đã đồng bộ trả hàng lên Google Sheets');
          setTimeout(() => this.autoSync(), 3000);
        } else {
          this.toast('warning', 'Lỗi đồng bộ: ' + (res.error||''));
        }
      } catch(e) {
        this.toast('warning', 'Mất kết nối! Phiếu trả đã lưu local.');
      }
    }

    this.closeReturn();
    if(this.page === 'orders') this.renderOrders(document.getElementById('page-container'));
  },

  // ═════════ SETTINGS ═════════
  renderSettings(c) {
    const apiUrl = localStorage.getItem('khs_api_url') || '';
    const apiStatus = apiUrl ? '🟢 Đã kết nối' : '🔴 Chưa kết nối';
    c.innerHTML = `
      <div class="card" style="max-width:640px">
        <div class="card-header"><h3>🔗 Kết nối Google Sheets API</h3></div>
        <div class="card-body">
          <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px">
            Paste URL Deploy từ Google Apps Script để kết nối dữ liệu thật.
            <a href="https://docs.google.com/spreadsheets/d/1iC3fiarqZF9bzbk5K-XXRqGXxWEUW-_G5444GMi72Ts/edit" target="_blank" style="color:var(--primary)">Mở Google Sheets →</a>
          </p>
          <div class="form-group">
            <label>URL Google Apps Script Web App</label>
            <input class="form-control" id="set-api-url" value="${apiUrl}" placeholder="https://script.google.com/macros/s/.../exec">
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-primary btn-sm" id="btn-save-api">Lưu & Kiểm tra</button>
            <button class="btn btn-secondary btn-sm" id="btn-sync-data">🔄 Đồng bộ dữ liệu</button>
            <span id="api-status" style="font-size:0.85rem">${apiStatus}</span>
          </div>
        </div>
      </div>
      <div class="card" style="max-width:640px;margin-top:16px">
        <div class="card-header"><h3>🏪 Thông tin cửa hàng</h3></div>
        <div class="card-body">
          <div class="form-group"><label>Tên cửa hàng</label><input class="form-control" id="set-store-name" value="${localStorage.getItem('khs_store_name')||'Kiều Hương Store'}"></div>
          <div class="form-group"><label>Địa chỉ</label><input class="form-control" id="set-store-addr" value="${localStorage.getItem('khs_store_addr')||''}"></div>
          <div class="form-group"><label>SĐT</label><input class="form-control" id="set-store-phone" value="${localStorage.getItem('khs_store_phone')||''}"></div>
          <button class="btn btn-primary btn-sm" id="btn-save-store">Lưu thông tin</button>
        </div>
      </div>
      <div class="card" style="max-width:640px;margin-top:16px">
        <div class="card-header"><h3>📱 Mã QR Chuyển khoản</h3></div>
        <div class="card-body">
          <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px">
            Upload ảnh chứa mã QR → bấm "Xử lý ảnh" để tách QR và thông tin ngân hàng.
          </p>
          <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
            <!-- Upload box -->
            <div>
              <label style="font-size:0.8rem;font-weight:600;color:#555;margin-bottom:4px;display:block">Ảnh gốc</label>
              <div id="qr-preview-box" style="width:140px;height:140px;border:2px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;flex-shrink:0;background:var(--background);transition:0.2s" title="Click để upload">
                <img id="qr-preview-img" src="" alt="" style="display:none;max-width:100%;max-height:100%;object-fit:contain;">
                <span id="qr-preview-text" style="color:#aaa;font-size:0.8rem;text-align:center">📷<br>Click để upload</span>
                <input type="file" accept="image/*" id="qr-upload-input" style="display:none">
              </div>
            </div>
            <!-- Cropped QR result -->
            <div>
              <label style="font-size:0.8rem;font-weight:600;color:#555;margin-bottom:4px;display:block">QR Code (đã tách)</label>
              <div id="qr-cropped-box" style="width:140px;height:140px;border:2px solid var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;background:#f9f9f9">
                <img id="qr-cropped-img" src="" alt="" style="display:none;max-width:100%;max-height:100%;object-fit:contain;">
                <span id="qr-cropped-text" style="color:#ccc;font-size:0.75rem;text-align:center">Chưa xử lý</span>
              </div>
            </div>
            <!-- Decoded info - editable -->
            <div style="flex:1;min-width:180px">
              <label style="font-size:0.8rem;font-weight:600;color:#555;margin-bottom:4px;display:block">Thông tin chuyển khoản ✏️</label>
              <textarea id="qr-decoded-info" style="width:100%;min-height:140px;border:2px solid var(--border);border-radius:8px;padding:10px;font-size:0.82rem;color:#333;background:#fff;resize:vertical;font-family:inherit;line-height:1.7" placeholder="Ngân hàng: Techcombank&#10;Số TK: 9942625986&#10;Tên: NGUYEN NGOC QUANG">${localStorage.getItem('khs_qr_info')||''}</textarea>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" id="btn-upload-qr">📷 Chọn ảnh</button>
            <button class="btn btn-primary btn-sm" id="btn-process-qr" style="background:#F59E0B;border-color:#F59E0B" disabled>⚡ Xử lý ảnh</button>
            <button class="btn btn-primary btn-sm" id="btn-save-cropped-qr" style="background:#10B981;border-color:#10B981" disabled>💾 Lưu QR đã tách</button>
            <button class="btn btn-secondary btn-sm" id="btn-clear-qr">🗑 Xóa</button>
          </div>
        </div>
      </div>
      <div class="card" style="max-width:900px;margin-top:16px">
        <div class="card-header" style="display:flex;gap:0;padding:0;border-bottom:2px solid #E5E7EB">
          <button class="settings-tab active" id="tab-users" style="padding:12px 24px;border:0;background:none;font-weight:600;color:#6B7280;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px">Tài khoản người dùng</button>
          <button class="settings-tab" id="tab-roles" style="padding:12px 24px;border:0;background:none;font-weight:600;color:#6B7280;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px">Quản lý vai trò</button>
        </div>
        <div class="card-body" id="settings-user-role-body"></div>
      </div>
      <div class="card" style="max-width:900px;margin-top:16px">
        <div class="card-header"><h3>ℹ️ Thông tin</h3></div>
        <div class="card-body">
          <p style="color:var(--text-secondary);font-size:0.85rem">
            <strong>QLBH Kiều Hương Store</strong> v2.0<br>
            © 2026 Kiều Hương Store. Powered by Antigravity AI
          </p>
        </div>
      </div>
    `;
    document.getElementById('btn-save-api').addEventListener('click', () => this.saveApiUrl());
    document.getElementById('btn-sync-data').addEventListener('click', () => this.syncData());
    document.getElementById('btn-save-store').addEventListener('click', () => {
      localStorage.setItem('khs_store_name', document.getElementById('set-store-name').value);
      localStorage.setItem('khs_store_addr', document.getElementById('set-store-addr').value);
      localStorage.setItem('khs_store_phone', document.getElementById('set-store-phone').value);
      this.toast('success', 'Đã lưu thông tin cửa hàng!');
    });

    // User/Role tabs
    const switchTab = (tab) => {
      document.querySelectorAll('.settings-tab').forEach(t => { t.classList.remove('active'); t.style.borderBottomColor = 'transparent'; t.style.color = '#6B7280'; });
      document.getElementById('tab-'+tab).classList.add('active');
      document.getElementById('tab-'+tab).style.borderBottomColor = '#1A73E8';
      document.getElementById('tab-'+tab).style.color = '#1A73E8';
      if(tab === 'users') this.renderUsersTab();
      else this.renderRolesTab();
    };
    document.getElementById('tab-users').addEventListener('click', () => switchTab('users'));
    document.getElementById('tab-roles').addEventListener('click', () => switchTab('roles'));
    switchTab('users');

    // QR upload handlers
    const qrInput = document.getElementById('qr-upload-input');
    let qrOriginalDataUrl = null;
    document.getElementById('qr-preview-box').addEventListener('click', () => qrInput.click());
    document.getElementById('btn-upload-qr').addEventListener('click', () => qrInput.click());
    qrInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        qrOriginalDataUrl = ev.target.result;
        document.getElementById('qr-preview-img').src = qrOriginalDataUrl;
        document.getElementById('qr-preview-img').style.display = 'block';
        document.getElementById('qr-preview-text').style.display = 'none';
        document.getElementById('btn-process-qr').disabled = false;
        // Reset results
        document.getElementById('qr-cropped-img').style.display = 'none';
        document.getElementById('qr-cropped-text').textContent = 'Bấm "Xử lý ảnh"';
        document.getElementById('btn-save-cropped-qr').disabled = true;
      };
      reader.readAsDataURL(file);
    });
    // Process QR — detect, crop, decode
    document.getElementById('btn-process-qr').addEventListener('click', async () => {
      if (!qrOriginalDataUrl) { this.toast('error', 'Chưa có ảnh!'); return; }
      const btnP = document.getElementById('btn-process-qr');
      btnP.textContent = '⏳ Đang xử lý...'; btnP.disabled = true;
      try {
        const img = new Image();
        img.src = qrOriginalDataUrl;
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qrResult = jsQR(imageData.data, canvas.width, canvas.height);
        if (!qrResult) {
          this.toast('error', 'Không tìm thấy mã QR trong ảnh!');
          document.getElementById('qr-decoded-info').value = '❌ Không tìm thấy QR trong ảnh';
          btnP.textContent = '⚡ Xử lý ảnh'; btnP.disabled = false; return;
        }
        // Crop QR
        const pts = qrResult.location;
        const allX = [pts.topLeftCorner.x, pts.topRightCorner.x, pts.bottomLeftCorner.x, pts.bottomRightCorner.x];
        const allY = [pts.topLeftCorner.y, pts.topRightCorner.y, pts.bottomLeftCorner.y, pts.bottomRightCorner.y];
        const pad = 20;
        const x = Math.max(0, Math.min(...allX) - pad);
        const y = Math.max(0, Math.min(...allY) - pad);
        const x2 = Math.min(canvas.width, Math.max(...allX) + pad);
        const y2 = Math.min(canvas.height, Math.max(...allY) + pad);
        const w = x2 - x, h = y2 - y;
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = w; cropCanvas.height = h;
        cropCanvas.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
        const croppedUrl = cropCanvas.toDataURL('image/png');
        document.getElementById('qr-cropped-img').src = croppedUrl;
        document.getElementById('qr-cropped-img').style.display = 'block';
        document.getElementById('qr-cropped-text').style.display = 'none';
        document.getElementById('btn-save-cropped-qr').disabled = false;
        // Build plain text info
        const rawValue = qrResult.data || '';
        let lines = [];
        if (rawValue) {
          const parsed = this.parseQRData(rawValue);
          if (parsed) {
            if (parsed.bankName) lines.push('Ngân hàng: ' + parsed.bankName);
            else if (parsed.bankBin) lines.push('Mã NH: ' + parsed.bankBin);
            if (parsed.accountNo) lines.push('Số TK: ' + parsed.accountNo);
            if (parsed.accountName) lines.push('Tên: ' + parsed.accountName);
            if (parsed.amount) lines.push('Số tiền: ' + new Intl.NumberFormat('vi-VN').format(parsed.amount) + 'đ');
            if (parsed.description) lines.push('Nội dung: ' + parsed.description);
          }
        }
        // Keep existing name if already typed
        const ta = document.getElementById('qr-decoded-info');
        const oldLines = ta.value.split('\n');
        const oldName = oldLines.find(l => l.startsWith('Tên:'));
        if (!lines.find(l => l.startsWith('Tên:')) && oldName) lines.push(oldName);
        if (!lines.find(l => l.startsWith('Tên:'))) lines.push('Tên: ');
        ta.value = lines.join('\n');
        this.toast('success', '✅ Đã tách QR thành công!');
      } catch (err) {
        console.error('QR process error:', err);
        this.toast('error', 'Lỗi xử lý: ' + err.message);
      }
      document.getElementById('btn-process-qr').textContent = '⚡ Xử lý ảnh';
      document.getElementById('btn-process-qr').disabled = false;
    });
    // Save cropped QR + info text
    document.getElementById('btn-save-cropped-qr').addEventListener('click', async () => {
      const src = document.getElementById('qr-cropped-img').src;
      if (!src) return;
      await this.saveConfigValue('pos_qr_image', src);
      localStorage.setItem('khs_qr_info', document.getElementById('qr-decoded-info').value);
      this.toast('success', '💾 Đã lưu QR + thông tin vào hóa đơn!');
    });
    // Clear all
    document.getElementById('btn-clear-qr').addEventListener('click', async () => {
      document.getElementById('qr-preview-img').src = ''; document.getElementById('qr-preview-img').style.display = 'none';
      document.getElementById('qr-preview-text').style.display = '';
      document.getElementById('qr-cropped-img').src = ''; document.getElementById('qr-cropped-img').style.display = 'none';
      document.getElementById('qr-cropped-text').textContent = 'Chưa xử lý'; document.getElementById('qr-cropped-text').style.display = '';
      document.getElementById('qr-decoded-info').value = '';
      document.getElementById('btn-process-qr').disabled = true;
      document.getElementById('btn-save-cropped-qr').disabled = true;
      qrOriginalDataUrl = null;
      await this.saveConfigValue('pos_qr_image', '');
      localStorage.removeItem('khs_qr_info');
      this.toast('success', '🗑 Đã xóa tất cả!');
    });
    // Load existing saved QR
    this.getConfigValue('pos_qr_image').then(saved => {
      if (saved) {
        document.getElementById('qr-cropped-img').src = saved;
        document.getElementById('qr-cropped-img').style.display = 'block';
        document.getElementById('qr-cropped-text').style.display = 'none';
      }
    });
  },

  // Parse VietQR EMVCo TLV format
  parseQRData(raw) {
    const BANKS = {'970407':'Techcombank','970436':'Vietcombank','970418':'BIDV','970415':'Vietinbank','970422':'MB Bank','970423':'TPBank','970432':'VPBank','970416':'ACB','970403':'Sacombank','970448':'OCB','970437':'HDBank','970441':'VIB','970443':'SHB','970431':'Eximbank','970426':'MSB','970454':'Viet Capital Bank','970449':'LienVietPostBank','970425':'ABBank'};
    try {
      // Parse top-level TLV
      const parseTLV = (str) => {
        const map = {};
        let i = 0;
        while (i < str.length - 3) {
          const id = str.substring(i, i + 2);
          const len = parseInt(str.substring(i + 2, i + 4));
          if (isNaN(len) || len < 0 || i + 4 + len > str.length) break;
          map[id] = str.substring(i + 4, i + 4 + len);
          i += 4 + len;
        }
        return map;
      };
      const tlv = parseTLV(raw);
      const result = {};
      // Field 38: VietQR Merchant Account Info
      if (tlv['38']) {
        const f38 = parseTLV(tlv['38']);
        // f38['00'] = GUID (A000000727)
        // f38['01'] = nested TLV: 00=bankBIN, 01=accountNo
        // f38['02'] = service code (QRIBFTTA)
        if (f38['01']) {
          const beneficiary = parseTLV(f38['01']);
          result.bankBin = beneficiary['00'] || '';
          result.accountNo = beneficiary['01'] || '';
        }
        result.serviceCode = f38['02'] || '';
      }
      // Field 54: Amount
      if (tlv['54']) result.amount = parseInt(tlv['54']);
      // Field 59: Merchant/Account Name
      if (tlv['59']) result.accountName = tlv['59'];
      // Field 58: Country
      if (tlv['58']) result.country = tlv['58'];
      // Field 62: Additional Data
      if (tlv['62']) {
        const f62 = parseTLV(tlv['62']);
        if (f62['08']) result.description = f62['08'];
      }
      // Lookup bank name
      if (result.bankBin && BANKS[result.bankBin]) {
        result.bankName = BANKS[result.bankBin];
      }
      return (result.bankBin || result.accountNo || result.amount) ? result : null;
    } catch (e) { return null; }
  },

  // Permission definitions
  PERMISSION_MODULES: [
    { group: 'Tổng quan', perms: [{ key: 'dashboard', label: 'Xem tổng quan' }] },
    { group: 'Hàng hóa', perms: [{ key: 'products.view', label: 'Xem danh sách' }, { key: 'products.edit', label: 'Thêm/Sửa/Xóa' }] },
    { group: 'Kho hàng', perms: [{ key: 'inventory', label: 'Kiểm kho' }] },
    { group: 'Đơn hàng', perms: [{ key: 'orders.view', label: 'Xem đơn hàng' }, { key: 'orders.create', label: 'Bán hàng (POS)' }, { key: 'orders.return', label: 'Trả hàng' }] },
    { group: 'Khách hàng', perms: [{ key: 'customers.view', label: 'Xem khách hàng' }, { key: 'customers.edit', label: 'Thêm/Sửa/Xóa' }] },
    { group: 'Báo cáo', perms: [{ key: 'reports', label: 'Xem báo cáo' }] },
    { group: 'Thiết lập', perms: [{ key: 'settings', label: 'Cài đặt chung' }, { key: 'settings.users', label: 'Quản lý người dùng' }] }
  ],

  renderUsersTab() {
    const body = document.getElementById('settings-user-role-body');
    body.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-primary btn-sm" id="btn-add-user">+ Tạo tài khoản</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Tên hiển thị</th><th>Tên đăng nhập</th><th>Điện thoại</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>${this.users.length ? this.users.map(u => `<tr>
          <td style="font-weight:600">${u.displayName}${u.username===this.user?.username?' <span style="color:#1A73E8;font-size:0.7rem">Tôi</span>':''}</td>
          <td>${u.username}</td>
          <td>${u.phone||'—'}</td>
          <td><span style="background:${u.role==='Admin'?'#DBEAFE':'#F3F4F6'};color:${u.role==='Admin'?'#1E40AF':'#374151'};padding:2px 8px;border-radius:4px;font-size:0.78rem">${u.role}</span></td>
          <td><span style="color:${u.status==='active'?'#059669':'#DC2626'}">${u.status==='active'?'Đang hoạt động':'Ngừng'}</span></td>
          <td><div class="table-actions">
            <button class="btn-icon edit-u" data-u="${u.username}" title="Sửa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            ${u.username!=='admin'?`<button class="btn-icon danger del-u" data-u="${u.username}" title="Xóa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>`:''}
          </div></td>
        </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:#9CA3AF;padding:20px">Chưa có tài khoản</td></tr>'}</tbody>
      </table>
    `;
    document.getElementById('btn-add-user').addEventListener('click', () => this.userModal());
    document.querySelectorAll('.edit-u').forEach(b => b.addEventListener('click', () => this.userModal(b.dataset.u)));
    document.querySelectorAll('.del-u').forEach(b => b.addEventListener('click', async () => {
      if(!confirm('Xóa tài khoản ' + b.dataset.u + '?')) return;
      const url = localStorage.getItem('khs_api_url');
      if(url) await fetch(url, { method:'POST', headers:{'Content-Type':'text/plain'}, body: JSON.stringify({ action:'deleteUser', username: b.dataset.u }) });
      this.users = this.users.filter(u => u.username !== b.dataset.u);
      this.toast('success', 'Đã xóa!');
      this.renderUsersTab();
    }));
  },

  userModal(username) {
    const u = username ? this.users.find(x => x.username === username) : null;
    document.getElementById('modal-title').textContent = u ? 'Sửa tài khoản' : 'Tạo tài khoản mới';
    document.getElementById('modal-body').innerHTML = `
      <form class="modal-form" id="uf">
        <div class="form-row">
          <div class="form-group"><label>Tên đăng nhập</label><input class="form-control" id="uf-user" value="${u?.username||''}" ${u?'readonly style="opacity:0.6"':''} placeholder="username" required></div>
          <div class="form-group"><label>Mật khẩu${u?' (để trống = giữ cũ)':''}</label><input class="form-control" id="uf-pass" type="password" placeholder="${u?'Không đổi':'Nhập mật khẩu'}" ${u?'':'required'}></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Tên hiển thị</label><input class="form-control" id="uf-name" value="${u?.displayName||''}" placeholder="Tên nhân viên" required></div>
          <div class="form-group"><label>SĐT</label><input class="form-control" id="uf-phone" value="${u?.phone||''}" placeholder="0912345678"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Vai trò</label>
            <select class="form-control" id="uf-role">
              ${this.roles.map(r => `<option value="${r.name}" ${u?.role===r.name?'selected':''}>${r.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Trạng thái</label>
            <select class="form-control" id="uf-status">
              <option value="active" ${(!u||u?.status==='active')?'selected':''}>Đang hoạt động</option>
              <option value="inactive" ${u?.status==='inactive'?'selected':''}>Ngừng hoạt động</option>
            </select>
          </div>
        </div>
      </form>
    `;
    document.getElementById('modal-footer').innerHTML = `<button class="btn btn-secondary" id="m-cancel">Hủy</button><button class="btn btn-primary" id="m-save">${u?'Cập nhật':'Tạo'}</button>`;
    this.openModal();
    document.getElementById('m-cancel').addEventListener('click', () => this.closeModal());
    document.getElementById('m-save').addEventListener('click', async () => {
      const d = {
        username: document.getElementById('uf-user').value.trim(),
        displayName: document.getElementById('uf-name').value.trim(),
        phone: document.getElementById('uf-phone').value.trim(),
        role: document.getElementById('uf-role').value,
        status: document.getElementById('uf-status').value
      };
      const pass = document.getElementById('uf-pass').value;
      if(!d.username || !d.displayName) { this.toast('error','Vui lòng nhập đầy đủ!'); return; }
      if(!u && !pass) { this.toast('error','Vui lòng nhập mật khẩu!'); return; }
      if(pass) d.password = pass;
      const url = localStorage.getItem('khs_api_url');
      if(url) {
        const res = await fetch(url, { method:'POST', headers:{'Content-Type':'text/plain'}, body: JSON.stringify({ action: u?'updateUser':'addUser', ...d }) }).then(r=>r.json());
        if(!res.success) { this.toast('error', res.error); return; }
      }
      if(u) Object.assign(u, d);
      else this.users.push(d);
      this.toast('success', u?'Đã cập nhật!':'Đã tạo tài khoản!');
      this.closeModal();
      this.renderUsersTab();
    });
  },

  renderRolesTab() {
    const body = document.getElementById('settings-user-role-body');
    body.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-primary btn-sm" id="btn-add-role">+ Tạo vai trò</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Vai trò</th><th>Mô tả</th><th>Tài khoản</th><th>Thao tác</th></tr></thead>
        <tbody>${this.roles.map(r => {
          const usersWithRole = this.users.filter(u => u.role === r.name);
          const permCount = r.permissions['*'] ? 'Tất cả quyền' : Object.keys(r.permissions).filter(k => r.permissions[k]).length + ' quyền';
          return `<tr>
            <td style="font-weight:600">${r.name}</td>
            <td style="color:#6B7280;font-size:0.83rem">${permCount}</td>
            <td>${usersWithRole.length ? usersWithRole.map(u=>u.displayName).join(', ') : '<span style="color:#9CA3AF">Chưa có</span>'}</td>
            <td><div class="table-actions">
              <button class="btn-icon edit-r" data-r="${r.name}" title="Sửa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
              ${r.name!=='Admin'?`<button class="btn-icon danger del-r" data-r="${r.name}" title="Xóa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>`:''}
            </div></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    `;
    document.getElementById('btn-add-role').addEventListener('click', () => this.roleModal());
    document.querySelectorAll('.edit-r').forEach(b => b.addEventListener('click', () => this.roleModal(b.dataset.r)));
    document.querySelectorAll('.del-r').forEach(b => b.addEventListener('click', async () => {
      if(!confirm('Xóa vai trò ' + b.dataset.r + '?')) return;
      const url = localStorage.getItem('khs_api_url');
      if(url) await fetch(url, { method:'POST', headers:{'Content-Type':'text/plain'}, body: JSON.stringify({ action:'deleteRole', name: b.dataset.r }) });
      this.roles = this.roles.filter(r => r.name !== b.dataset.r);
      this.toast('success', 'Đã xóa!');
      this.renderRolesTab();
    }));
  },

  roleModal(roleName) {
    const r = roleName ? this.roles.find(x => x.name === roleName) : null;
    const perms = r?.permissions || {};
    const isAdmin = r?.name === 'Admin';
    document.getElementById('modal-title').textContent = r ? 'Sửa vai trò: ' + r.name : 'Tạo vai trò mới';
    document.getElementById('modal-body').innerHTML = `
      <form class="modal-form" id="rf">
        <div class="form-row">
          <div class="form-group"><label>Tên vai trò</label><input class="form-control" id="rf-name" value="${r?.name||''}" ${r?'readonly style="opacity:0.6"':''} placeholder="VD: Nhân viên bán hàng" required></div>
        </div>
        ${isAdmin ? '<div style="padding:16px;background:#DBEAFE;border-radius:8px;color:#1E40AF;font-weight:600">⭐ Admin có tất cả quyền — không thể chỉnh sửa</div>' : `
          <div style="margin-top:8px">
            ${this.PERMISSION_MODULES.map(mod => `
              <div style="margin-bottom:12px">
                <div style="font-weight:700;font-size:0.85rem;color:#374151;margin-bottom:6px;padding:4px 0;border-bottom:1px solid #E5E7EB">${mod.group}</div>
                <div style="display:flex;flex-wrap:wrap;gap:8px 24px">
                  ${mod.perms.map(p => `<label style="display:flex;align-items:center;gap:6px;font-size:0.83rem;cursor:pointer">
                    <input type="checkbox" class="rf-perm" data-key="${p.key}" ${perms[p.key]?'checked':''} style="accent-color:#1A73E8"> ${p.label}
                  </label>`).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </form>
    `;
    document.getElementById('modal-footer').innerHTML = `<button class="btn btn-secondary" id="m-cancel">Hủy</button>${isAdmin?'':`<button class="btn btn-primary" id="m-save">${r?'Cập nhật':'Tạo vai trò'}</button>`}`;
    this.openModal();
    document.getElementById('m-cancel').addEventListener('click', () => this.closeModal());
    if(!isAdmin) {
      document.getElementById('m-save').addEventListener('click', async () => {
        const name = document.getElementById('rf-name').value.trim();
        if(!name) { this.toast('error','Nhập tên vai trò!'); return; }
        const permissions = {};
        document.querySelectorAll('.rf-perm').forEach(cb => { if(cb.checked) permissions[cb.dataset.key] = true; });
        const url = localStorage.getItem('khs_api_url');
        if(url) {
          const res = await fetch(url, { method:'POST', headers:{'Content-Type':'text/plain'}, body: JSON.stringify({ action: r?'updateRole':'addRole', name, permissions }) }).then(r=>r.json());
          if(!res.success) { this.toast('error', res.error); return; }
        }
        if(r) r.permissions = permissions;
        else this.roles.push({ name, permissions });
        this.toast('success', r?'Đã cập nhật!':'Đã tạo vai trò!');
        this.closeModal();
        this.renderRolesTab();
      });
    }
  },

  async saveApiUrl() {
    const url = document.getElementById('set-api-url').value.trim();
    if (!url) { this.toast('error', 'Vui lòng nhập URL!'); return; }
    const status = document.getElementById('api-status');
    status.textContent = '⏳ Đang kiểm tra...';
    try {
      const res = await fetch(url + '?action=getProducts');
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('khs_api_url', url);
        this.saveConfigValue('api_url', url); // Backup to IndexedDB
        status.textContent = `🟢 Kết nối thành công! (${data.data?.length || 0} sản phẩm)`;
        this.toast('success', 'Kết nối Google Sheets thành công!');
      } else {
        status.textContent = '🔴 Lỗi: ' + (data.error || 'Unknown');
        this.toast('error', 'Không thể kết nối: ' + (data.error || ''));
      }
    } catch (e) {
      status.textContent = '🔴 Lỗi kết nối';
      this.toast('error', 'Không thể kết nối. Kiểm tra lại URL!');
    }
  },

  async syncData() {
    const url = localStorage.getItem('khs_api_url');
    if (!url) { this.toast('warning', 'Chưa kết nối API! Vào Cài đặt để thiết lập.'); return; }
    this.toast('info', '🔄 Đang đồng bộ dữ liệu...');
    try {
      const [pRes, cRes, oRes] = await Promise.all([
        fetch(url + '?action=getProducts').then(r => r.json()),
        fetch(url + '?action=getCustomers').then(r => r.json()),
        fetch(url + '?action=getOrders').then(r => r.json())
      ]);
      if (pRes.success && pRes.data?.length) this.products = pRes.data;
      if (cRes.success && cRes.data?.length) this.customers = cRes.data;
      if (oRes.success && oRes.data?.length) this.orders = oRes.data;
      this.toast('success', `✅ Đồng bộ xong: ${this.products.length} SP, ${this.customers.length} KH, ${this.orders.length} đơn`);
      this.handleRoute();
    } catch (e) {
      this.toast('error', 'Lỗi đồng bộ: ' + e.message);
    }
  },

  // ═════════ MODAL & TOAST ═════════
  openModal() { document.getElementById('modal-overlay').style.display = 'flex'; document.body.style.overflow = 'hidden'; },
  closeModal() { document.getElementById('modal-overlay').style.display = 'none'; document.body.style.overflow = ''; },
  toast(type, msg) {
    const c = document.getElementById('toast-container');
    // Remove all existing toasts immediately
    c.querySelectorAll('.toast').forEach(old => old.remove());
    const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span>${icons[type]||''}</span><span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(40px)'; t.style.transition='0.3s'; setTimeout(()=>t.remove(),300); }, 3000);
  },

  // ── Config Backup (IndexedDB) ──
  async saveConfigValue(key, value) {
    try {
      const db = await this._openImgDB();
      const tx = db.transaction('config', 'readwrite');
      tx.objectStore('config').put(value, key);
    } catch(e) { console.warn('Config save error:', e); }
  },

  async getConfigValue(key) {
    try {
      const db = await this._openImgDB();
      return new Promise(resolve => {
        const tx = db.transaction('config', 'readonly');
        const req = tx.objectStore('config').get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch(e) { return null; }
  },

  // ── Product Image Storage (IndexedDB + Google Sheets Cloud) ──
  _imgDB: null,
  _imgSynced: false,
  async _openImgDB() {
    if (this._imgDB) return this._imgDB;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('khs_product_images', 2);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
        if (!db.objectStoreNames.contains('config')) db.createObjectStore('config');
      };
      req.onsuccess = () => { this._imgDB = req.result; resolve(req.result); };
      req.onerror = () => reject(req.error);
    });
  },

  // Nén ảnh → 100×100 JPEG (~5-15KB)
  compressImage(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 100;
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        // Crop center
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2, sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  },

  async saveProductImage(productId, dataUrl) {
    try {
      // Nén trước
      const compressed = await this.compressImage(dataUrl);
      // Lưu IndexedDB (instant)
      const db = await this._openImgDB();
      const tx = db.transaction('images', 'readwrite');
      tx.objectStore('images').put(compressed, productId);
      // Upload lên Google Sheets (background)
      const url = localStorage.getItem('khs_api_url');
      if (url) {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action: 'saveImage', sku: productId, base64: compressed })
        }).catch(e => console.warn('Cloud save image failed:', e));
      }
      this.toast('success', 'Đã lưu ảnh sản phẩm!');
    } catch(e) { console.error('Save image error:', e); }
  },

  async getProductImage(productId) {
    try {
      const db = await this._openImgDB();
      return new Promise((resolve) => {
        const tx = db.transaction('images', 'readonly');
        const req = tx.objectStore('images').get(productId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch(e) { return null; }
  },

  // Sync ảnh từ cloud → IndexedDB (chạy 1 lần khi init)
  async syncImagesFromCloud() {
    if (this._imgSynced) return;
    const url = localStorage.getItem('khs_api_url');
    if (!url) return;
    try {
      const res = await fetch(url + '?action=getImages');
      const json = await res.json();
      if (!json.success || !json.data) return;
      const cloudImages = json.data; // { sku: base64, ... }
      const db = await this._openImgDB();
      const tx = db.transaction('images', 'readwrite');
      const store = tx.objectStore('images');
      for (const [sku, base64] of Object.entries(cloudImages)) {
        store.put(base64, sku);
      }
      this._imgSynced = true;
      console.log(`☁️ Synced ${Object.keys(cloudImages).length} ảnh từ cloud`);
      // Reload images on page
      this.loadAllProductImages();
    } catch(e) { console.warn('Image sync failed:', e); }
  },

  async loadAllProductImages() {
    const defaultImg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="8" fill="#f0f4ff"/><path d="M16 32l6-8 4 5 6-7 6 10H10z" fill="#c5d5f7"/><circle cx="18" cy="18" r="3" fill="#a0b8e8"/></svg>');
    for (const p of this.products) {
      const saved = await this.getProductImage(p.id);
      const src = saved || defaultImg;
      const img = document.getElementById('pimg-' + p.id);
      if (img) img.src = src;
      // Mobile card image
      const mImg = document.getElementById('pimg-m-' + p.id);
      if (mImg) mImg.src = src;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
  initColumnResize();
});

// ── Column Resize ──
function initColumnResize() {
  function addResizeHandles() {
    document.querySelectorAll('.data-table').forEach(table => {
      if (table.dataset.resizable) return;
      // Skip tables inside modals (batch table, etc.)
      if (table.closest('.modal-body')) return;
      table.dataset.resizable = 'true';

      const ths = table.querySelectorAll('thead th');
      ths.forEach(th => {
        if (th.querySelector('.col-resize')) return;
        const handle = document.createElement('div');
        handle.className = 'col-resize';
        th.appendChild(handle);

        let startX, startW;
        handle.addEventListener('mousedown', e => {
          e.preventDefault();
          startX = e.pageX;
          startW = th.offsetWidth;
          handle.classList.add('active');
          
          const onMove = ev => {
            const diff = ev.pageX - startX;
            const newW = Math.max(50, startW + diff);
            th.style.width = newW + 'px';
          };
          const onUp = () => {
            handle.classList.remove('active');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      });
    });
  }

  // Run on initial load and after page changes
  addResizeHandles();
  const observer = new MutationObserver(() => {
    setTimeout(addResizeHandles, 100);
  });
  observer.observe(document.getElementById('page-container'), { childList: true, subtree: true });
}
