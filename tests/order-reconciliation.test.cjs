const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const storage = new Map([['khs_api_url', 'https://example.test/api']]);
const sandbox = {
  console,
  URLSearchParams,
  AbortController,
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  },
  window: {},
  document: { addEventListener() {} },
  navigator: {},
  location: { hash: '', reload() {} },
  MutationObserver: class { observe() {} }
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'js/app.js' });
const App = vm.runInContext('App', sandbox);

const order = (id, createdAt) => ({ id, createdAt });
const ids = () => Array.from(App.orders, item => item.id).sort();
const start = new Date(2026, 7, 6);
const end = new Date(2026, 7, 6);

App.orders = [
  order('old-before', '05/08/2026 20:00'),
  order('deleted', '06/08/2026 15:44'),
  order('updated', '06/08/2026 16:00'),
  order('old-after', '07/08/2026 08:00')
];
App.reconcileOrdersForRange([
  order('updated', '06/08/2026 16:30'),
  order('new', '06/08/2026 17:00')
], start, end);
assert.deepEqual(ids(), ['new', 'old-after', 'old-before', 'updated']);
assert.equal(App.orders.find(item => item.id === 'updated').createdAt, '06/08/2026 16:30');

App.orders = [order('outside', '05/08/2026 12:00'), order('stale', '06/08/2026 12:00')];
App.reconcileOrdersForRange([], start, end);
assert.deepEqual(ids(), ['outside']);

App.orders = [order('cached-1', '05/08/2026 12:00'), order('cached-2', '06/08/2026 12:00')];
App.reconcileOrdersForRange([order('sheet-only', '07/08/2026 12:00')], start, end, { replaceAll: true });
assert.deepEqual(ids(), ['sheet-only']);

App.orders = [order('unknown-date', 'khong-co-ngay'), order('stale', '06/08/2026 12:00')];
App.reconcileOrdersForRange([], start, end);
assert.deepEqual(ids(), ['unknown-date']);

(async () => {
  App.orders = [order('keep-on-error', '06/08/2026 12:00')];
  App.orderCoverage = [];
  App._orderRangeRequests = {};
  App.fetchApiJson = async () => { throw new Error('network failed'); };
  await assert.rejects(
    App.ensureOrdersForRange(start, end, { force: true }),
    /network failed/
  );
  assert.deepEqual(ids(), ['keep-on-error']);

  App.orders = [order('cached-old', '05/08/2026 12:00')];
  App.orderCoverage = [];
  App._orderRangeRequests = {};
  App.fetchApiJson = async () => ({ success: true, data: [order('legacy-sheet', '06/08/2026 12:00')] });
  App.saveCacheValue = async () => {};
  await App.ensureOrdersForRange(start, end, { force: true });
  assert.deepEqual(ids(), ['legacy-sheet']);
  assert.equal(App.orderCoverage[0].all, true);

  console.log('order reconciliation tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
