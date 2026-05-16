// Service Worker for QLBH Kieu Huong Store - PWA Offline Support
const CACHE_NAME = 'khs-v332';
const STATIC_ASSETS = [
  './index.html',
  './css/index.css?v=332',
  './js/app.js?v=332',
  './js/pos.js?v=332',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

// Install - cache all static assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch - SW chỉ lo sub-resources, không intercept navigation (index.html)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Navigation (F5, link click) → browser tự lo, không qua SW để tránh chậm
  if (e.request.mode === 'navigate') return;
  // Cross-origin (CDN, Fonts, Apps Script) → browser cache lo
  if (!e.request.url.startsWith(self.location.origin)) return;

  // Versioned assets (?v=): cache-first — không bao giờ thay đổi giữa các version
  if (e.request.url.includes('?v=')) {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(response => {
          if (response.ok) caches.open(CACHE_NAME).then(c => c.put(e.request, response.clone()));
          return response;
        })
      )
    );
    return;
  }

  // Manifest, icons: network-first với fallback cache
  e.respondWith(
    fetch(e.request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(c => c.put(e.request, response.clone()));
      return response;
    }).catch(() =>
      caches.match(e.request).then(cached => cached || new Response('Offline', { status: 503 }))
    )
  );
});

// Background sync for pending orders
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-orders') {
    e.waitUntil(syncPendingOrders());
  }
});

async function syncPendingOrders() {
  try {
    const db = await openDB();
    const tx = db.transaction('pendingSync', 'readonly');
    const store = tx.objectStore('pendingSync');
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = async () => {
        const items = request.result;
        for (const item of items) {
          try {
            await fetch(item.url, { method: 'POST', body: JSON.stringify(item.data) });
            const dtx = db.transaction('pendingSync', 'readwrite');
            dtx.objectStore('pendingSync').delete(item.id);
          } catch(err) { /* will retry next sync */ }
        }
        resolve();
      };
      request.onerror = reject;
    });
  } catch(err) { console.log('Sync error:', err); }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('khs_offline', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
      if (!db.objectStoreNames.contains('pendingSync')) db.createObjectStore('pendingSync', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
