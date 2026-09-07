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
  document: {
    addEventListener() {},
    getElementById() { return null; }
  },
  navigator: { onLine: true },
  location: { hash: '', reload() {} },
  MutationObserver: class { observe() {} }
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'js/app.js' });
const App = vm.runInContext('App', sandbox);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function testTransactionCompletion() {
  const stored = new Map();
  App._openImgDB = async () => ({
    transaction() {
      const tx = {
        error: null,
        objectStore() {
          return {
            clear() { stored.clear(); },
            put(value, key) { stored.set(key, value); }
          };
        }
      };
      setTimeout(() => tx.oncomplete?.(), 20);
      return tx;
    }
  });
  let settled = false;
  const write = App._replaceProductImagesLocal({ SKU1: 'data:image/png;base64,one' }).then(() => { settled = true; });
  await delay(2);
  assert.equal(settled, false, 'image write must wait for IndexedDB transaction completion');
  await write;
  assert.equal(stored.get('SKU1'), 'data:image/png;base64,one');
}

function installMemoryStores() {
  const images = new Map();
  const config = new Map();
  App._qrFreshPromise = null;
  App._imageSyncPromise = null;
  App._imgSynced = false;
  App.getProductImage = async key => images.get(key) ?? null;
  App._putProductImageLocal = async (key, value) => { images.set(key, value); return value; };
  App._deleteProductImageLocal = async key => { images.delete(key); };
  App._replaceProductImagesLocal = async values => {
    images.clear();
    Object.entries(values).forEach(([key, value]) => images.set(key, value));
  };
  App.getConfigValue = async key => config.has(key) ? config.get(key) : null;
  App.saveConfigValue = async (key, value) => { config.set(key, value); };
  return { images, config };
}

async function testFullSyncAwaitsWriteAndReloads() {
  const { images } = installMemoryStores();
  let writeDone = false;
  let avatarReloadedAfterWrite = false;
  App._replaceProductImagesLocal = async values => {
    await delay(15);
    Object.entries(values).forEach(([key, value]) => images.set(key, value));
    writeDone = true;
  };
  App.reloadImagesFromLocal = async () => { avatarReloadedAfterWrite = writeDone; };
  App.fetchApiJson = async () => ({
    success: true,
    data: { avatar_admin: 'data:image/jpeg;base64,avatar', __QR_CODE__: 'data:image/jpeg;base64,qr' },
    meta: { qr: { sku: '__QR_CODE__', exists: true, version: 'v1', qrInfo: 'NH TEST' } }
  });
  await App.syncImagesFromCloud({ force: true });
  assert.equal(avatarReloadedAfterWrite, true);
  assert.equal(images.get('avatar_admin'), 'data:image/jpeg;base64,avatar');
}

async function testVersionMatchUsesCache() {
  const { images, config } = installMemoryStores();
  images.set('__QR_CODE__', 'data:image/jpeg;base64,cached');
  config.set('qr_image_version', 'v2');
  let calls = 0;
  App.fetchApiJson = async () => {
    calls++;
    return { success: true, data: { sku: '__QR_CODE__', exists: true, version: 'v2', qrInfo: 'QR INFO 2' } };
  };
  const result = await App.ensureQrFresh();
  assert.equal(calls, 1);
  assert.equal(result.verified, true);
  assert.equal(result.image, 'data:image/jpeg;base64,cached');
  assert.equal(storage.get('khs_qr_info'), 'QR INFO 2');
}

async function testVersionMismatchDownloadsOnlyQr() {
  const { images, config } = installMemoryStores();
  images.set('__QR_CODE__', 'data:image/jpeg;base64,old');
  config.set('qr_image_version', 'old-version');
  const responses = [
    { success: true, data: { sku: '__QR_CODE__', exists: true, version: 'new-version', qrInfo: 'NEW INFO' } },
    { success: true, data: { __QR_CODE__: 'data:image/jpeg;base64,new' }, meta: { sku: '__QR_CODE__', exists: true, version: 'new-version', qrInfo: 'NEW INFO' } }
  ];
  App.fetchApiJson = async () => responses.shift();
  const result = await App.ensureQrFresh();
  assert.equal(result.image, 'data:image/jpeg;base64,new');
  assert.equal(images.get('__QR_CODE__'), 'data:image/jpeg;base64,new');
  assert.equal(config.get('qr_image_version'), 'new-version');
}

async function testRemoteDeleteRemovesLocalQr() {
  const { images, config } = installMemoryStores();
  images.set('__QR_CODE__', 'data:image/jpeg;base64,stale');
  App.fetchApiJson = async () => ({
    success: true,
    data: { sku: '__QR_CODE__', exists: false, version: '', qrInfo: '' }
  });
  const result = await App.ensureQrFresh();
  assert.equal(result.verified, true);
  assert.equal(result.exists, false);
  assert.equal(images.has('__QR_CODE__'), false);
  assert.equal(config.get('qr_image_exists'), false);
}

async function testLegacyBackendCompatibility() {
  const { images } = installMemoryStores();
  let calls = 0;
  App.fetchApiJson = async () => {
    calls++;
    return { success: true, data: { SKU1: 'data:image/jpeg;base64,product', __QR_CODE__: 'data:image/jpeg;base64,legacy-qr' } };
  };
  const result = await App.ensureQrFresh();
  assert.equal(calls, 1);
  assert.equal(result.verified, true);
  assert.equal(result.image, 'data:image/jpeg;base64,legacy-qr');
  assert.equal(images.get('__QR_CODE__'), 'data:image/jpeg;base64,legacy-qr');
}

async function testFailureNeverReturnsStaleQr() {
  const { images } = installMemoryStores();
  images.set('__QR_CODE__', 'data:image/jpeg;base64,must-not-be-used');
  App.fetchApiJson = async () => { throw new Error('network failed'); };
  const result = await App.ensureQrFresh();
  assert.equal(result.verified, false);
  assert.equal(result.image, null);
  assert.equal(images.get('__QR_CODE__'), 'data:image/jpeg;base64,must-not-be-used', 'cache may remain, but must not be returned');
}

(async () => {
  await testTransactionCompletion();
  await testFullSyncAwaitsWriteAndReloads();
  await testVersionMatchUsesCache();
  await testVersionMismatchDownloadsOnlyQr();
  await testRemoteDeleteRemovesLocalQr();
  await testLegacyBackendCompatibility();
  await testFailureNeverReturnsStaleQr();
  console.log('image sync tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
