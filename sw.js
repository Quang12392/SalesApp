// Service Worker for QLBH Kieu Huong Store - PWA Offline Support
const CACHE_NAME = 'khs-v191';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/index.css?v=191',
  './js/app.js?v=191',
  './js/pos.js?v=191',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

// CDN resources to cache
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'
];

// Install - cache all static assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await cache.addAll(STATIC_ASSETS);
      // Try CDN assets but don't fail if offline
      for (const url of CDN_ASSETS) {
        try { await cache.add(url); } catch(err) { console.log('CDN cache skip:', url); }
      }
    })
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

// Fetch - Network first, fallback to cache (stale-while-revalidate)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // For API calls (Google Apps Script) - network only, cache response
  if (e.request.url.includes('script.google.com')) {
    e.respondWith(
      fetch(e.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // For local assets - NETWORK FIRST, fallback to cache
  e.respondWith(
    fetch(e.request).then(response => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      }
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
  // Read pending orders from IndexedDB and sync to server
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
            // Remove from pending after success
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
