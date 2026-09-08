/**
 * ═══════════════════════════════════════════════════════════════
 * QLBH Kiều Hương Store — Google Apps Script Backend API
 * ═══════════════════════════════════════════════════════════════
 * 
 * CẤU TRÚC SHEETS THỰC TẾ:
 * 
 * Sheet "Sản phẩm" (columns A-K):
 *   A: Loại hàng | B: Nhóm hàng(3 Cấp) | C: Mã hàng | D: Mã vạch
 *   E: Tên hàng | F: Thương hiệu | G: Giá bán | H: Giá vốn
 *   I: Tồn kho | J: KH đặt | K: Dự kiến hết hàng
 *
 * Sheet "Khách hàng" (columns A-R):
 *   A: Loại khách | B: Chi nhánh tạo | C: Mã khách hàng
 *   D: Tên khách hàng | E: Điện thoại | F: Địa chỉ
 *   G-R: Khu vực, Phường, Công ty, MST, CMND, DOB, Giới tính...
 *
 * Sheet "Đơn hàng" — TỰ TẠO
 * Sheet "Chi tiết đơn" — TỰ TẠO
 */

const SS_ID = '1iC3fiarqZF9bzbk5K-XXRqGXxWEUW-_G5444GMi72Ts';
const TIKTOK_SS_ID = '1nZ6dc4s03QwAVUEL8lk4hj3rlkPZf3AGYj9VvNVaeNY';
const TIKTOK_SHEET_NAME = 'Doanh Thu Tiktok 2 2026';

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  let result;
  try {
    switch (action) {
      case 'getProducts':  result = getProducts(); break;
      case 'getCustomers': result = getCustomers(); break;
      case 'getOrders':    result = getOrders({
        from: e.parameter.from || '',
        to: e.parameter.to || '',
        limit: e.parameter.limit || ''
      }); break;
      case 'getReturns':   result = getReturns(); break;
      case 'getStats':     result = getStats(); break;
      case 'getUsers':     result = getUsers(); break;
      case 'getRoles':     result = getRoles(); break;
      case 'getBatches':   result = getBatches(); break;
      case 'getImages':    result = getProductImages({
        sku: e.parameter.sku || '',
        versionOnly: e.parameter.versionOnly || ''
      }); break;
      case 'getNotifications': result = getNotifications(); break;
      case 'getConfig': result = getStoreConfig(); break;
      case 'auth':         result = authenticate(e.parameter.user, e.parameter.pass); break;
      default: result = { success: true, message: 'QLBH Kiều Hương API v2.0' };
    }
  } catch (err) {
    result = { success: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let result;
  try {
    const data = JSON.parse(e.postData.contents);
    switch (data.action) {
      case 'createOrder':    result = createOrder(data); break;
      case 'addProduct':     result = addProduct(data); break;
      case 'updateProduct':  result = updateProduct(data); break;
      case 'deleteProduct':  result = deleteProduct(data); break;
      case 'addCustomer':    result = addCustomer(data); break;
      case 'updateCustomer': result = updateCustomer(data); break;
      case 'deleteCustomer': result = deleteCustomer(data); break;
      case 'returnOrder':    result = handleReturnOrder(data); break;
      case 'addUser':        result = addUser(data); break;
      case 'updateUser':     result = updateUser(data); break;
      case 'deleteUser':     result = deleteUser(data); break;
      case 'addRole':        result = addRole(data); break;
      case 'updateRole':     result = updateRole(data); break;
      case 'deleteRole':     result = deleteRole(data); break;
      case 'addBatch':       result = addBatch(data); break;
      case 'updateBatch':    result = updateBatch(data); break;
      case 'deleteBatch':    result = deleteBatch(data); break;
      case 'initBatches':    result = initBatches(); break;
      case 'saveImage':      result = saveProductImage(data); break;
      case 'deleteImage':    result = deleteProductImage(data); break;
      case 'saveConfig':     result = saveStoreConfig(data); break;
      case 'checkCartStock': result = checkCartStock(data); break;
      case 'confirmTikTokOrder': result = confirmTikTokOrder(data); break;
      case 'cancelTikTokOrder':  result = cancelTikTokOrder(data);  break;
      case 'syncSpecificTikTok': result = syncSpecificTikTokOrders(data); break;
      case 'fixItemNames':       result = fixItemNames(); break;
      default: result = { success: false, error: 'Unknown action' };
    }
  } catch (err) {
    result = { success: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Helper ──
function getSheet(name) {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === 'Đơn hàng') {
      sheet.appendRow(['Mã đơn','Ngày tạo','Mã KH','Tên KH','SĐT','Địa chỉ','Tổng tiền','Giảm giá','Thành tiền','PT thanh toán','Trạng thái','Ghi chú','Người tạo']);
    } else if (name === 'Chi tiết đơn') {
      sheet.appendRow(['Mã đơn','Mã SP','Tên SP','Số lượng','Đơn giá','Thành tiền']);
    }
  }
  return sheet;
}

function parseNum(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  return parseFloat(String(v).replace(/,/g, '')) || 0;
}

function formatImportDateTime(inputDate, fallbackDate) {
  var now = fallbackDate || new Date();
  var timePart = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'HH:mm');
  var s = String(inputDate || '').trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    var iso = m[1] + '-' + m[2] + '-' + m[3] + 'T' + timePart + ':00+07:00';
    return Utilities.formatDate(new Date(iso), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
  }
  var d = s ? new Date(s) : now;
  if (isNaN(d.getTime())) d = now;
  d.setHours(parseNum(timePart.split(':')[0]), parseNum(timePart.split(':')[1]));
  return Utilities.formatDate(d, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
}

// Ghi 1 dòng vào "Chi tiết đơn" — tên SP lấy từ skuToName map trước khi gọi hàm này
function appendItemRow(sheet, rowData) {
  sheet.appendRow(rowData);
}

// ── Tên header cột "Sản phẩm" — đổi tên header trong Sheet thì sửa ở đây ──
const PROD_COL = {
  TYPE:     'Loại hàng',
  CATEGORY: 'Nhóm hàng(3 Cấp)',
  SKU:      'Mã hàng',
  BARCODE:  'Mã vạch',
  NAME:     'Tên hàng',
  BRAND:    'Thương hiệu',
  SELL:     'Giá bán',
  COST:     'Giá vốn',
  STOCK:    'Tồn kho',
  ORD:      'KH đặt',
  EXP:      'Dự kiến hết hàng'
};

// Xây map { tênHeader: indexCột } từ dòng header
function buildColMap(headerRow) {
  var map = {};
  for (var i = 0; i < headerRow.length; i++) {
    var h = String(headerRow[i]).trim();
    if (h) map[h] = i;
  }
  return map;
}

// ═══════════════════════════════════════
// PRODUCTS — đọc theo tên header, không phụ thuộc vị trí cột
// ═══════════════════════════════════════
function getProducts() {
  const sheet = getSheet('Sản phẩm');
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };

  const cm = buildColMap(data[0]);
  const products = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const sku = String(r[cm[PROD_COL.SKU]] || '').trim();
    if (!sku) continue;
    products.push({
      id: sku,
      sku: sku,
      name: String(r[cm[PROD_COL.NAME]] || '').trim(),
      category: String(cm[PROD_COL.CATEGORY] !== undefined ? r[cm[PROD_COL.CATEGORY]] : '').trim(),
      sellPrice: parseNum(r[cm[PROD_COL.SELL]]),
      costPrice: parseNum(r[cm[PROD_COL.COST]]),
      stock: parseNum(r[cm[PROD_COL.STOCK]]),
      unit: 'hộp',
      brand: String(cm[PROD_COL.BRAND] !== undefined ? r[cm[PROD_COL.BRAND]] : '').trim(),
      rowIndex: i + 1
    });
  }
  return { success: true, data: products };
}

function addProduct(data) {
  const sheet = getSheet('Sản phẩm');
  const allData = sheet.getDataRange().getValues();
  const cm = buildColMap(allData[0]);
  const sku = String(data.sku || '').trim();
  const stock = parseNum(data.stock);
  const cost = parseNum(data.costPrice);

  // Kiểm tra trùng SKU
  if (sku) {
    for (let i = 1; i < allData.length; i++) {
      if (String(allData[i][cm[PROD_COL.SKU]]).trim() === sku) {
        return { success: false, error: 'Mã hàng (SKU) "' + sku + '" đã tồn tại! Vui lòng dùng mã khác.' };
      }
    }
  }

  // Xây dòng mới theo thứ tự header hiện tại của sheet
  const row = new Array(allData[0].length).fill('');
  function setCol(colName, value) { if (cm[colName] !== undefined) row[cm[colName]] = value; }
  setCol(PROD_COL.TYPE,     'Hàng hóa');
  setCol(PROD_COL.CATEGORY, data.category || '');
  setCol(PROD_COL.SKU,      sku);
  setCol(PROD_COL.NAME,     data.name || '');
  setCol(PROD_COL.BRAND,    data.brand || '');
  setCol(PROD_COL.SELL,     data.sellPrice || 0);
  setCol(PROD_COL.COST,     cost);
  setCol(PROD_COL.STOCK,    stock);
  setCol(PROD_COL.ORD,      0);
  setCol(PROD_COL.EXP,      '--');
  sheet.appendRow(row);
  
  // Tự tạo lô đầu tiên nếu có tồn kho
  if (sku && stock > 0) {
    const now = new Date();
    const timeStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
    const batchSheet = getBatchSheet();
    const batchId = 'LOT-INIT-' + sku;
    batchSheet.appendRow([
      batchId, sku, data.name || '', stock, stock, cost,
      timeStr, data.importedBy || 'Hệ thống', 'Lô khởi tạo khi thêm SP', '', parseNum(data.sellPrice)
    ]);
  }
  
  // Ghi thông báo
  addNotificationRow('product_add', '➕ Thêm SP: ' + (data.name || sku), data.importedBy || 'Admin', sku);

  return { success: true, message: 'Đã thêm sản phẩm' };
}

function updateProduct(data) {
  const sheet = getSheet('Sản phẩm');
  const allData = sheet.getDataRange().getValues();
  const cm = buildColMap(allData[0]);
  const searchSku = data.oldSku || data.sku;
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][cm[PROD_COL.SKU]]).trim() === searchSku) {
      const row = i + 1;
      if (data.newSku !== undefined)    sheet.getRange(row, cm[PROD_COL.SKU] + 1).setValue(data.newSku);
      if (data.name !== undefined)      sheet.getRange(row, cm[PROD_COL.NAME] + 1).setValue(data.name);
      if (data.category !== undefined && cm[PROD_COL.CATEGORY] !== undefined)
        sheet.getRange(row, cm[PROD_COL.CATEGORY] + 1).setValue(data.category);
      if (data.sellPrice !== undefined) sheet.getRange(row, cm[PROD_COL.SELL] + 1).setValue(data.sellPrice);
      if (data.costPrice !== undefined) sheet.getRange(row, cm[PROD_COL.COST] + 1).setValue(data.costPrice);
      
      // ── BƯỚC 1: Đồng bộ SKU + tên + giá sang sheet Lô hàng TRƯỚC ──
      const finalSku = data.newSku || searchSku;
      try {
        var batchSheet = getBatchSheet();
        var batchData = batchSheet.getDataRange().getValues();
        for (let b = 1; b < batchData.length; b++) {
          if (String(batchData[b][1]).trim() === searchSku || String(batchData[b][1]).trim() === finalSku) {
            if (data.newSku) batchSheet.getRange(b + 1, 2).setValue(data.newSku);
            if (data.name) batchSheet.getRange(b + 1, 3).setValue(data.name);
            if (data.sellPrice !== undefined) batchSheet.getRange(b + 1, 11).setValue(parseNum(data.sellPrice));
            // Sync giá vốn khi SP chỉ có ≤1 lô (chưa bị khóa)
            if (data.costPrice !== undefined && !data._hasBatch) batchSheet.getRange(b + 1, 6).setValue(parseNum(data.costPrice));
          }
        }
      } catch(e) {}
      
      // ── BƯỚC 2: Tồn kho — tạo lô điều chỉnh nếu thay đổi (dùng SKU đã đổi) ──
      if (data.stock !== undefined) {
        const sku = finalSku;
        // Re-read sau khi đã rename
        var batchSheet2 = getBatchSheet();
        var batchData2 = batchSheet2.getDataRange().getValues();
        var currentBatchStock = 0;
        for (var bi = 1; bi < batchData2.length; bi++) {
          if (String(batchData2[bi][1]).trim() === sku) currentBatchStock += parseNum(batchData2[bi][4]);
        }
        var newStock = parseNum(data.stock);
        var diff = newStock - currentBatchStock;
        if (diff > 0) {
          var now2 = new Date();
          var adjTime = Utilities.formatDate(now2, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
          var adjCost = parseNum(data.costPrice || allData[i][cm[PROD_COL.COST]]);
          batchSheet2.appendRow([
            'LOT-ADJ-' + sku + '-' + Utilities.formatDate(now2, 'Asia/Ho_Chi_Minh', 'ddMMyyyyHHmm'),
            sku, data.name || allData[i][cm[PROD_COL.NAME]], diff, diff, adjCost,
            adjTime, 'Hệ thống', 'Điều chỉnh tồn kho +' + diff
          ]);
        } else if (diff < 0) {
          deductBatchesFIFO(sku, Math.abs(diff));
        }
        if (diff !== 0) syncProductFromBatches(sku);
      }
      
      // Ghi thông báo
      var changes = [];
      if (data.name !== undefined) changes.push('tên');
      if (data.sellPrice !== undefined) changes.push('giá bán');
      if (data.costPrice !== undefined) changes.push('giá vốn');
      if (data.stock !== undefined) changes.push('tồn kho');
      if (data.category !== undefined) changes.push('nhóm');
      if (changes.length) addNotificationRow('product', '✏️ Sửa SP: ' + (data.name || searchSku) + ' (' + changes.join(', ') + ')', '', searchSku);

      return { success: true, message: 'Đã cập nhật' };
    }
  }
  return { success: false, error: 'Không tìm thấy sản phẩm' };
}

function deleteProduct(data) {
  const sheet = getSheet('Sản phẩm');
  const allData = sheet.getDataRange().getValues();
  const cm = buildColMap(allData[0]);
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][cm[PROD_COL.SKU]]).trim() === data.sku) {
      sheet.deleteRow(i + 1);
      // Zero hết tồn kho lô — giữ lại lịch sử để phục vụ trả hàng
      try {
        const batchSheet = getBatchSheet();
        const batchData = batchSheet.getDataRange().getValues();
        for (let b = 1; b < batchData.length; b++) {
          if (String(batchData[b][1]).trim() === data.sku && parseNum(batchData[b][4]) > 0) {
            batchSheet.getRange(b + 1, 5).setValue(0);
            batchSheet.getRange(b + 1, 9).setValue('SP đã xóa - giữ lịch sử');
          }
        }
      } catch(e) {}
      // Ghi thông báo
      addNotificationRow('product_del', '🗑️ Xóa SP: ' + String(allData[i][cm[PROD_COL.NAME]]) + ' (' + data.sku + ')', '', data.sku);

      return { success: true, message: 'Đã xóa SP (lô hàng giữ lại lịch sử)' };
    }
  }
  return { success: false, error: 'Không tìm thấy' };
}

// ═══════════════════════════════════════
// PRODUCT IMAGES — Sheet "Ảnh SP" (A=SKU, B=Base64, C=UpdatedAt)
// ═══════════════════════════════════════
function getImageSheet() {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName('Ảnh SP');
  if (!sheet) {
    sheet = ss.insertSheet('Ảnh SP');
    sheet.appendRow(['SKU', 'Base64', 'UpdatedAt']);
  } else if (String(sheet.getRange(1, 3).getValue() || '').trim() !== 'UpdatedAt') {
    sheet.getRange(1, 3).setValue('UpdatedAt');
  }
  return sheet;
}

function getProductImageVersion_(base64, updatedAt) {
  if (updatedAt instanceof Date && !isNaN(updatedAt.getTime())) {
    return Utilities.formatDate(updatedAt, 'Asia/Ho_Chi_Minh', "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
  }
  const savedVersion = String(updatedAt || '').trim();
  if (savedVersion) return savedVersion;
  if (!base64) return '';
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(base64),
    Utilities.Charset.UTF_8
  );
  return 'sha256-' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
}

function getQrInfoForImageResponse_() {
  try {
    const config = getStoreConfig();
    return String((config.data && config.data.qr_info) || '');
  } catch (e) {
    return '';
  }
}

function getProductImages(options) {
  options = options || {};
  const requestedSku = String(options.sku || '').trim();
  const versionOnly = String(options.versionOnly || '').toLowerCase() === 'true' || String(options.versionOnly || '') === '1';
  const sheet = getImageSheet();
  const data = sheet.getDataRange().getValues();
  const images = {};
  const versions = {};
  for (let i = 1; i < data.length; i++) {
    const sku = String(data[i][0] || '').trim();
    if (!sku || !data[i][1] || (requestedSku && sku !== requestedSku)) continue;
    images[sku] = data[i][1];
    versions[sku] = getProductImageVersion_(data[i][1], data[i][2]);
    if (requestedSku) break;
  }

  if (requestedSku) {
    const exists = Object.prototype.hasOwnProperty.call(images, requestedSku);
    const meta = {
      sku: requestedSku,
      exists: exists,
      version: exists ? versions[requestedSku] : ''
    };
    if (requestedSku === '__QR_CODE__') meta.qrInfo = getQrInfoForImageResponse_();
    if (versionOnly) return { success: true, data: meta };
    return { success: true, data: images, meta: meta };
  }

  const qrExists = Object.prototype.hasOwnProperty.call(images, '__QR_CODE__');
  return {
    success: true,
    data: images,
    meta: {
      versions: versions,
      qr: {
        sku: '__QR_CODE__',
        exists: qrExists,
        version: qrExists ? versions.__QR_CODE__ : '',
        qrInfo: getQrInfoForImageResponse_()
      }
    }
  };
}

function saveProductImage(data) {
  const sheet = getImageSheet();
  const sku = String(data.sku || '').trim();
  if (!sku || !data.base64) return { success: false, error: 'Thiếu SKU hoặc ảnh' };

  const updatedAt = new Date();
  const version = getProductImageVersion_(data.base64, updatedAt);
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]).trim() === sku) {
      sheet.getRange(i + 1, 2, 1, 2).setValues([[data.base64, updatedAt]]);
      return { success: true, message: 'Đã cập nhật ảnh', version: version };
    }
  }
  sheet.appendRow([sku, data.base64, updatedAt]);
  return { success: true, message: 'Đã lưu ảnh', version: version };
}

function deleteProductImage(data) {
  const sheet = getImageSheet();
  const sku = String(data.sku || '').trim();
  if (!sku) return { success: false, error: 'Thiếu SKU' };
  
  const allData = sheet.getDataRange().getValues();
  for (let i = allData.length - 1; i >= 1; i--) {
    if (String(allData[i][0]).trim() === sku) {
      sheet.deleteRow(i + 1);
    }
  }
  return { success: true, message: 'Đã xóa ảnh', exists: false, version: '' };
}

// ═══════════════════════════════════════
// CUSTOMERS — Mapping theo sheet "Khách hàng"
// Cols: A=Loại KH, B=Chi nhánh, C=Mã KH, D=Tên KH, E=SĐT, F=Địa chỉ
// ═══════════════════════════════════════
function getCustomers() {
  const sheet = getSheet('Khách hàng');
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };

  // Build spending stats from Đơn hàng sheet
  const spendMap = {};
  const lastOrderMap = {};
  try {
    const orderSheet = getSheet('Đơn hàng');
    const orderData = orderSheet.getDataRange().getValues();
    for (let i = 1; i < orderData.length; i++) {
      const r = orderData[i];
      const status = String(r[10] || '').trim();
      if (status !== 'completed') continue;
      const custId = String(r[2] || '').trim();
      if (!custId) continue;
      const finalTotal = parseNum(r[8]);
      spendMap[custId] = (spendMap[custId] || 0) + finalTotal;
      // createdAt is column B (index 1)
      const dateVal = r[1];
      const dateStr = dateVal instanceof Date
        ? (String(dateVal.getDate()).padStart(2,'0') + '/' + String(dateVal.getMonth()+1).padStart(2,'0') + '/' + dateVal.getFullYear())
        : String(dateVal);
      if (!lastOrderMap[custId] || dateStr > lastOrderMap[custId]) {
        lastOrderMap[custId] = dateStr;
      }
    }
  } catch(e) { /* Đơn hàng sheet might not exist yet */ }

  const customers = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const id = String(r[2] || '').trim();
    if (!id) continue;
    customers.push({
      id: id,
      name: String(r[3] || '').trim(),
      phone: String(r[4] || '').trim(),
      address: String(r[5] || '').trim(),
      totalSpent: spendMap[id] || 0,
      lastOrder: lastOrderMap[id] || '',
      rowIndex: i + 1
    });
  }
  return { success: true, data: customers };
}

function addCustomer(data) {
  const sheet = getSheet('Khách hàng');
  const lastRow = sheet.getLastRow();
  const newId = data.id || ('KH' + String(lastRow).padStart(6, '0'));
  sheet.appendRow([
    'Cá nhân', 'Chi nhánh trung tâm',
    newId, data.name || '', data.phone || '', data.address || '',
    '', '', '', '', '', '', '', '', '', '', '', 'App'
  ]);
  addNotificationRow('customer_add', '👤 Thêm KH: ' + (data.name || newId) + (data.phone ? ' - ' + data.phone : ''), '', newId);

  return { success: true, id: newId, message: 'Đã thêm khách hàng' };
}

function updateCustomer(data) {
  const sheet = getSheet('Khách hàng');
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][2]).trim() === data.id) {
      const row = i + 1;
      if (data.name)    sheet.getRange(row, 4).setValue(data.name);
      if (data.phone)   sheet.getRange(row, 5).setValue(data.phone);
      if (data.address) sheet.getRange(row, 6).setValue(data.address);
      var changes = [];
      if (data.name) changes.push('tên');
      if (data.phone) changes.push('SĐT');
      if (data.address) changes.push('địa chỉ');
      addNotificationRow('customer', '✏️ Sửa KH: ' + (data.name || data.id) + ' (' + changes.join(', ') + ')', '', data.id);

      return { success: true, message: 'Đã cập nhật' };
    }
  }
  return { success: false, error: 'Không tìm thấy KH' };
}

function deleteCustomer(data) {
  const sheet = getSheet('Khách hàng');
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][2]).trim() === data.id) {
      sheet.deleteRow(i + 1);
      addNotificationRow('customer_del', '🗑️ Xóa KH: ' + String(allData[i][3]) + ' (' + data.id + ')', '', data.id);

      return { success: true, message: 'Đã xóa khách hàng' };
    }
  }
  return { success: false, error: 'Không tìm thấy KH' };
}

// ═══════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════
function parseOrderFilterDate_(value, endOfDay) {
  if (value instanceof Date) return value;
  const text = String(value || '').trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(+match[1], +match[2] - 1, +match[3], endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  }
  match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    return new Date(+match[3], +match[2] - 1, +match[1], endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  }
  return null;
}

function getOrders(options) {
  options = options || {};
  const sheet = getSheet('Đơn hàng');
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };

  const fromDate = parseOrderFilterDate_(options.from, false);
  const toDate = parseOrderFilterDate_(options.to, true);
  const limit = Math.max(0, parseInt(options.limit, 10) || 0);
  let selectedRows = [];
  for (let i = 1; i < data.length; i++) {
    const orderDate = parseOrderFilterDate_(data[i][1], false);
    if (fromDate && (!orderDate || orderDate < fromDate)) continue;
    if (toDate && (!orderDate || orderDate > toDate)) continue;
    selectedRows.push(data[i]);
  }
  const matchingCount = selectedRows.length;
  if (limit && selectedRows.length > limit) selectedRows = selectedRows.slice(-limit);

  const selectedIds = new Set(selectedRows.map(row => String(row[0])));
  const itemsByOrder = {};
  if (selectedIds.size) {
    const itemSheet = getSheet('Chi tiết đơn');
    const itemData = itemSheet.getDataRange().getValues();
    // Scan the detail sheet once. The old implementation scanned every item
    // again for every order, which became extremely slow after ~10k orders.
    for (let j = 1; j < itemData.length; j++) {
      const orderId = String(itemData[j][0]);
      if (!selectedIds.has(orderId)) continue;
      if (!itemsByOrder[orderId]) itemsByOrder[orderId] = [];
      itemsByOrder[orderId].push({
        sku: itemData[j][1],
        name: itemData[j][2],
        qty: itemData[j][3],
        price: itemData[j][4],
        costPrice: itemData[j][6] || 0
      });
    }
  }

  const orders = [];
  for (let i = 0; i < selectedRows.length; i++) {
    const r = selectedRows[i];
    const orderId = String(r[0]);
    orders.push({
      id: orderId,
      createdAt: r[1] instanceof Date
        ? (String(r[1].getDate()).padStart(2,'0') + '/' + String(r[1].getMonth()+1).padStart(2,'0') + '/' + r[1].getFullYear() + ' ' + String(r[1].getHours()).padStart(2,'0') + ':' + String(r[1].getMinutes()).padStart(2,'0'))
        : String(r[1]),
      customerId: String(r[2]),
      customerName: String(r[3]),
      customerPhone: String(r[4]),
      total: parseNum(r[6]),
      discount: parseNum(r[7]),
      finalTotal: parseNum(r[8]),
      payment: String(r[9]),
      status: String(r[10]) || 'completed',
      note: String(r[11]),
      createdBy: String(r[12]),
      items: itemsByOrder[orderId] || []
    });
  }
  return {
    success: true,
    data: orders.reverse(),
    meta: {
      from: options.from || '',
      to: options.to || '',
      limit: limit,
      matchingCount: matchingCount,
      returnedCount: orders.length,
      hasMore: !!limit && matchingCount > orders.length
    }
  };
}

function getCreateOrderRequestId_(data) {
  return String((data && (data.clientRequestId || data.requestId || data.localOrderId)) || '').trim();
}

function getCreateOrderRequestKey_(requestId) {
  return 'ORDER_REQ_' + requestId;
}

function getHashedRequestKey_(prefix, requestId) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(requestId || ''),
    Utilities.Charset.UTF_8
  );
  return prefix + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
}

function findExistingOrderByCreateRequest_(requestId) {
  if (!requestId) return '';
  try {
    return PropertiesService.getScriptProperties().getProperty(getCreateOrderRequestKey_(requestId)) || '';
  } catch(e) {
    return '';
  }
}

function saveCreateOrderRequest_(requestId, orderId) {
  if (!requestId || !orderId) return;
  try {
    PropertiesService.getScriptProperties().setProperty(getCreateOrderRequestKey_(requestId), String(orderId));
  } catch(e) {}
}

function normalizeCreateOrderItems_(items) {
  var normalized = [];
  if (!Array.isArray(items)) return normalized;
  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};
    var sku = String(item.sku || item.id || '').trim();
    var qty = parseNum(item.qty);
    var price = parseNum(item.price);
    var name = String(item.name || sku).trim();
    if (!sku || qty <= 0) continue;
    normalized.push({
      sku: sku,
      name: name || sku,
      qty: qty,
      price: price
    });
  }
  return normalized;
}

function getInventorySnapshotForSkus_(skus) {
  var wanted = {};
  for (var i = 0; i < skus.length; i++) {
    var normalizedSku = String(skus[i] || '').trim();
    if (normalizedSku) wanted[normalizedSku] = true;
  }

  var batchSheet = getBatchSheet();
  var batchData = batchSheet.getDataRange().getValues();
  var stocks = {};
  var hasBatchRows = {};
  var batchRowsBySku = {};
  Object.keys(wanted).forEach(function(sku) {
    stocks[sku] = 0;
    batchRowsBySku[sku] = [];
  });

  for (var b = 1; b < batchData.length; b++) {
    var batchSku = String(batchData[b][1] || '').trim();
    if (!wanted[batchSku]) continue;
    hasBatchRows[batchSku] = true;
    stocks[batchSku] += parseNum(batchData[b][4]);
    batchRowsBySku[batchSku].push({
      index: b,
      cost: parseNum(batchData[b][5]),
      effectiveDate: batchData[b][9] || batchData[b][6]
    });
  }

  var prodSheet = getSheet('Sản phẩm');
  var prodData = prodSheet.getDataRange().getValues();
  var prodCm = buildColMap(prodData[0] || []);
  var productBySku = {};
  for (var p = 1; p < prodData.length; p++) {
    var productSku = String(prodData[p][prodCm[PROD_COL.SKU]] || '').trim();
    if (!wanted[productSku]) continue;
    productBySku[productSku] = {
      index: p,
      stock: parseNum(prodData[p][prodCm[PROD_COL.STOCK]]),
      cost: parseNum(prodData[p][prodCm[PROD_COL.COST]])
    };
    // Sản phẩm cũ chưa có lô vẫn lấy tồn trực tiếp từ sheet Sản phẩm.
    if (!hasBatchRows[productSku]) stocks[productSku] = productBySku[productSku].stock;
  }

  return {
    stocks: stocks,
    hasBatchRows: hasBatchRows,
    batchRowsBySku: batchRowsBySku,
    batchSheet: batchSheet,
    batchData: batchData,
    prodSheet: prodSheet,
    prodData: prodData,
    prodCm: prodCm,
    productBySku: productBySku
  };
}

function validateStockWithSnapshot_(items, snapshot) {
  var neededBySku = {};
  var nameBySku = {};
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    neededBySku[item.sku] = (neededBySku[item.sku] || 0) + parseNum(item.qty);
    if (!nameBySku[item.sku]) nameBySku[item.sku] = item.name || item.sku;
  }

  var errors = [];
  for (var sku in neededBySku) {
    var needed = neededBySku[sku];
    var available = parseNum(snapshot.stocks[sku]);
    if (available <= 0) {
      errors.push((nameBySku[sku] || sku) + ' hết hàng');
    } else if (needed > available) {
      errors.push((nameBySku[sku] || sku) + ' còn ' + available + ', đặt ' + needed);
    }
  }

  if (errors.length) {
    return {
      success: false,
      error: 'Không đủ tồn kho: ' + errors.join('; '),
      stocks: snapshot.stocks,
      checkedAt: new Date().toISOString()
    };
  }
  return { success: true, stocks: snapshot.stocks, checkedAt: new Date().toISOString() };
}

function validateCreateOrderStock_(items) {
  var skus = [];
  var seen = {};
  for (var i = 0; i < items.length; i++) {
    var sku = String(items[i] && items[i].sku || '').trim();
    if (sku && !seen[sku]) { seen[sku] = true; skus.push(sku); }
  }
  return validateStockWithSnapshot_(items, getInventorySnapshotForSkus_(skus));
}

// Kiểm tra nhanh chỉ các SKU trong giỏ. Đây là số liệu tham khảo trước khi
// thanh toán; createOrder/confirmTikTokOrder vẫn kiểm tra lại bên trong lock.
function checkCartStock(data) {
  var items = normalizeCreateOrderItems_(data && data.items);
  if (!items.length) return { success: false, error: 'Không có sản phẩm hợp lệ để kiểm tra kho' };
  return validateCreateOrderStock_(items);
}

function parseBatchEffectiveDate_(value) {
  if (value instanceof Date) return value.getTime();
  var s = String(value || '');
  var m = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2})/);
  if (m) return new Date(m[3], m[2] - 1, m[1], m[4], m[5]).getTime();
  return new Date(s).getTime() || 0;
}

// Chuẩn bị phép trừ FIFO trong bộ nhớ. Mỗi đơn chỉ đọc Lô hàng và Sản phẩm
// một lần, sau đó commit mỗi cột bằng một lần setValues().
function buildInventoryDeductionPlan_(items) {
  var skus = [];
  var seen = {};
  for (var i = 0; i < items.length; i++) {
    var itemSku = String(items[i] && items[i].sku || '').trim();
    if (itemSku && !seen[itemSku]) { seen[itemSku] = true; skus.push(itemSku); }
  }

  var snapshot = getInventorySnapshotForSkus_(skus);
  var validation = validateStockWithSnapshot_(items, snapshot);
  if (!validation.success) return validation;

  Object.keys(snapshot.batchRowsBySku).forEach(function(sku) {
    snapshot.batchRowsBySku[sku].sort(function(a, b) {
      return parseBatchEffectiveDate_(a.effectiveDate) - parseBatchEffectiveDate_(b.effectiveDate);
    });
  });

  var itemCosts = [];
  var touchedBatch = false;
  var touchedProduct = false;
  var touchedSkus = {};

  for (var itemIndex = 0; itemIndex < items.length; itemIndex++) {
    var item = items[itemIndex];
    var sku = String(item.sku || '').trim();
    var qty = parseNum(item.qty);
    var remaining = qty;
    var fifoCost = 0;
    var product = snapshot.productBySku[sku];

    if (snapshot.hasBatchRows[sku]) {
      var rows = snapshot.batchRowsBySku[sku] || [];
      for (var r = 0; r < rows.length && remaining > 0; r++) {
        var rowInfo = rows[r];
        var available = parseNum(snapshot.batchData[rowInfo.index][4]);
        if (available <= 0) continue;
        var deduct = Math.min(remaining, available);
        fifoCost += deduct * rowInfo.cost;
        snapshot.batchData[rowInfo.index][4] = available - deduct;
        remaining -= deduct;
        touchedBatch = true;
      }
    } else if (product) {
      product.stock -= qty;
      snapshot.prodData[product.index][snapshot.prodCm[PROD_COL.STOCK]] = product.stock;
      fifoCost = product.cost * qty;
      remaining = 0;
      touchedProduct = true;
    }

    if (remaining > 0) {
      return {
        success: false,
        error: 'Không đủ tồn kho: ' + (item.name || sku) + ' thiếu ' + remaining,
        stocks: snapshot.stocks,
        checkedAt: new Date().toISOString()
      };
    }
    if (fifoCost === 0 && product && product.cost > 0) fifoCost = product.cost * qty;
    itemCosts.push(fifoCost);
    touchedSkus[sku] = true;
  }

  Object.keys(touchedSkus).forEach(function(sku) {
    var product = snapshot.productBySku[sku];
    if (snapshot.hasBatchRows[sku]) {
      var totalQty = 0;
      var totalCost = 0;
      var rows = snapshot.batchRowsBySku[sku] || [];
      for (var r = 0; r < rows.length; r++) {
        var remain = parseNum(snapshot.batchData[rows[r].index][4]);
        if (remain > 0) {
          totalQty += remain;
          totalCost += remain * rows[r].cost;
        }
      }
      snapshot.stocks[sku] = totalQty;
      if (product) {
        product.stock = totalQty;
        product.cost = totalQty > 0 ? Math.round(totalCost / totalQty) : 0;
        snapshot.prodData[product.index][snapshot.prodCm[PROD_COL.STOCK]] = product.stock;
        snapshot.prodData[product.index][snapshot.prodCm[PROD_COL.COST]] = product.cost;
        touchedProduct = true;
      }
    } else if (product) {
      snapshot.stocks[sku] = product.stock;
    }
  });

  return {
    success: true,
    itemCosts: itemCosts,
    stocks: snapshot.stocks,
    checkedAt: new Date().toISOString(),
    snapshot: snapshot,
    touchedBatch: touchedBatch,
    touchedProduct: touchedProduct
  };
}

function commitInventoryDeductionPlan_(plan) {
  var snapshot = plan.snapshot;
  if (plan.touchedBatch && snapshot.batchData.length > 1) {
    snapshot.batchSheet.getRange(2, 5, snapshot.batchData.length - 1, 1)
      .setValues(snapshot.batchData.slice(1).map(function(row) { return [row[4]]; }));
  }
  if (plan.touchedProduct && snapshot.prodData.length > 1) {
    var rowCount = snapshot.prodData.length - 1;
    var stockIndex = snapshot.prodCm[PROD_COL.STOCK];
    var costIndex = snapshot.prodCm[PROD_COL.COST];
    snapshot.prodSheet.getRange(2, stockIndex + 1, rowCount, 1)
      .setValues(snapshot.prodData.slice(1).map(function(row) { return [row[stockIndex]]; }));
    snapshot.prodSheet.getRange(2, costIndex + 1, rowCount, 1)
      .setValues(snapshot.prodData.slice(1).map(function(row) { return [row[costIndex]]; }));
  }
}

function createOrder(data) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    return createOrderLocked_(data || {});
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function createOrderLocked_(data) {
  const orderSheet = getSheet('Đơn hàng');
  const itemSheet = getSheet('Chi tiết đơn');

  const requestId = getCreateOrderRequestId_(data);
  const existingOrderId = findExistingOrderByCreateRequest_(requestId);
  if (existingOrderId) {
    return {
      success: true,
      duplicate: true,
      orderId: existingOrderId,
      message: 'Đơn đã được ghi trước đó ' + existingOrderId
    };
  }

  const orderItems = normalizeCreateOrderItems_(data.items);
  if (orderItems.length === 0) {
    return { success: false, error: 'Không có sản phẩm hợp lệ' };
  }

  const inventoryPlan = buildInventoryDeductionPlan_(orderItems);
  if (!inventoryPlan.success) return inventoryPlan;

  const now = new Date();
  const dateStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  const timeStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
  const orderId = 'DH' + dateStr + String(orderSheet.getLastRow()).padStart(3, '0');

  // Column N: Thuế flag
  var taxCol = '';
  if (data.payment === 'Thuế Sàn') taxCol = 'Thuế Sàn';
  else if (data.tax) taxCol = 'Thuế';

  var taxRevenue = parseNum(data.taxRevenue);
  if (data.tax && taxRevenue <= 0) {
    return { success: false, error: 'Thiếu doanh thu tính thuế' };
  }

  orderSheet.appendRow([
    orderId, timeStr,
    data.customerId || '', data.customerName || 'Khách lẻ', data.customerPhone || '', data.customerAddress || '',
    data.total || 0, data.discount || 0, data.finalTotal || 0,
    data.payment || 'Tiền mặt', 'completed', data.note || '', data.createdBy || 'Admin',
    taxCol
  ]);

  // Giữ số 0 đầu SĐT — format cột E dòng vừa ghi thành text
  var lastRow = orderSheet.getLastRow();
  orderSheet.getRange(lastRow, 5).setNumberFormat('@').setValue(data.customerPhone || '');

  // Nếu có Thuế → copy sang sheet "Thuế"
  if (data.tax) {
    const ss = SpreadsheetApp.openById(SS_ID);
    let taxSheet = ss.getSheetByName('Thuế');
    if (taxSheet) {
      // Thuế.A=Ngày (ĐH.B), Thuế.B=Tên KH + PT thanh toán (ĐH.D + ĐH.J), Thuế.C=Thành tiền (ĐH.I), Thuế.D=Mã đơn (ĐH.A)
      var taxDate = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy');
      taxSheet.appendRow([
        taxDate,
        (data.customerName || 'Khách lẻ') + ' - ' + (data.payment || 'Tiền mặt'),
        taxRevenue,
        orderId
      ]);
    }
  }

  // Commit tồn kho theo lô một lượt và ghi toàn bộ chi tiết bằng một setValues.
  commitInventoryDeductionPlan_(inventoryPlan);
  const detailRows = orderItems.map(function(item, index) {
    return [orderId, item.sku || '', item.name, item.qty, item.price, item.qty * item.price, inventoryPlan.itemCosts[index] || 0];
  });
  if (detailRows.length) {
    itemSheet.getRange(itemSheet.getLastRow() + 1, 1, detailRows.length, 7).setValues(detailRows);
  }

  // Ghi thông báo
  addNotificationRow('order', '🛒 Đơn mới ' + orderId + ' - ' + (data.customerName || 'Khách lẻ') + ' - ' + fmtMoney(data.finalTotal || 0), data.createdBy || 'Admin', orderId);

  saveCreateOrderRequest_(requestId, orderId);

  return {
    success: true,
    orderId: orderId,
    stocks: inventoryPlan.stocks,
    checkedAt: inventoryPlan.checkedAt,
    message: 'Đã tạo đơn hàng ' + orderId
  };
}

// ═══════════════════════════════════════
// BATCHES — Quản lý lô hàng
// Sheet "Lô hàng": A=Mã lô, B=SKU, C=Tên hàng, D=SL nhập, E=SL còn, F=Giá nhập, G=Ngày nhập, H=Người nhập, I=Ghi chú
// ═══════════════════════════════════════

function getBatchSheet() {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName('Lô hàng');
  if (!sheet) {
    sheet = ss.insertSheet('Lô hàng');
    sheet.appendRow(['Mã lô', 'Mã hàng', 'Tên hàng', 'SL nhập', 'SL còn', 'Giá nhập', 'Ngày nhập', 'Người nhập', 'Ghi chú']);
    sheet.getRange(1, 1, 1, 9).setBackground('#1A73E8').setFontColor('#fff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getBatches() {
  const sheet = getBatchSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };
  const batches = [];
  var fmtDt = function(v) {
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
    return String(v || '');
  };
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    batches.push({
      id: String(r[0]),
      sku: String(r[1]).trim(),
      name: String(r[2]),
      qtyImported: parseNum(r[3]),
      qtyRemaining: parseNum(r[4]),
      costPrice: parseNum(r[5]),
      importDate: fmtDt(r[6]),
      importedBy: String(r[7]),
      note: String(r[8]),
      updatedAt: r[9] ? fmtDt(r[9]) : ''
    });
  }
  return { success: true, data: batches };
}

function addBatch(data) {
  const sheet = getBatchSheet();
  const now = new Date();
  const timeStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
  
  // Custom batch ID hoặc tự tạo
  let baseBatchId = data.customBatchId || ('LOT-' + Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'ddMMyyyy') + '-' + String(sheet.getLastRow()).padStart(3, '0'));
  
  // Đảm bảo mã lô UNIQUE — thêm số thứ tự nếu trùng
  const allData = sheet.getDataRange().getValues();
  const existingIds = new Set();
  for (let i = 1; i < allData.length; i++) existingIds.add(String(allData[i][0]).trim());
  let batchId = baseBatchId;
  let counter = 1;
  while (existingIds.has(batchId)) {
    batchId = baseBatchId + '-' + String(counter).padStart(2, '0');
    counter++;
  }
  
  // Custom import date -> format DD/MM/YYYY HH:mm in VN timezone.
  var importDate = data.importDate ? formatImportDateTime(data.importDate, now) : timeStr;

  const sku = String(data.sku || '').trim();
  const qty = parseNum(data.qty);
  const cost = parseNum(data.costPrice);

  if (!sku || qty <= 0) return { success: false, error: 'SKU và số lượng không hợp lệ' };

  sheet.appendRow([
    batchId, sku, data.name || '', qty, qty, cost,
    importDate, data.importedBy || 'Admin', data.note || '', '', parseNum(data.sellPrice)
  ]);

  // Cập nhật sheet Sản phẩm: tồn kho + giá vốn TB
  syncProductFromBatches(sku);

  // Ghi thông báo
  addNotificationRow('batch', '📦 Nhập lô ' + batchId + ' - ' + (data.name || sku) + ' (' + qty + ' SP)', data.importedBy || 'Admin', batchId);

  return { success: true, batchId: batchId, message: 'Đã nhập kho lô ' + batchId };
}

function formatBatchDateTime_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
  return String(value || '');
}

function updateBatch(data) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    return updateBatchLocked_(data || {});
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function updateBatchLocked_(data) {
  const sheet = getBatchSheet();
  const allData = sheet.getDataRange().getValues();
  const batchId = String(data.batchId || '').trim();

  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]).trim() !== batchId) continue;

    const row = i + 1;
    const batchRow = allData[i];
    const sku = String(batchRow[1] || '').trim();
    const expected = data.expectedBatch;
    if (expected && (
      parseNum(expected.qtyRemaining) !== parseNum(batchRow[4]) ||
      parseNum(expected.costPrice) !== parseNum(batchRow[5]) ||
      String(expected.note || '') !== String(batchRow[8] || '') ||
      String(expected.updatedAt || '') !== formatBatchDateTime_(batchRow[9])
    )) {
      return {
        success: false,
        conflict: true,
        error: 'Lô này đã được thiết bị khác cập nhật. Vui lòng mở lại dữ liệu mới rồi sửa tiếp.'
      };
    }

    const newQty = data.qtyRemaining !== undefined ? parseNum(data.qtyRemaining) : parseNum(batchRow[4]);
    const newCost = data.costPrice !== undefined ? parseNum(data.costPrice) : parseNum(batchRow[5]);
    if (newQty < 0) return { success: false, error: 'Số lượng còn không được âm' };
    if (newCost < 0) return { success: false, error: 'Giá nhập không được âm' };

    const updatedAt = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
    batchRow[4] = newQty;
    batchRow[5] = newCost;
    if (data.note !== undefined) batchRow[8] = data.note;
    batchRow[9] = updatedAt;

    // Tính tồn và giá vốn bình quân từ dữ liệu lô đã đọc, không đọc lại sheet.
    let totalQty = 0;
    let totalCost = 0;
    for (let b = 1; b < allData.length; b++) {
      if (String(allData[b][1] || '').trim() !== sku) continue;
      const remain = parseNum(allData[b][4]);
      const cost = parseNum(allData[b][5]);
      if (remain > 0) {
        totalQty += remain;
        totalCost += remain * cost;
      }
    }
    const avgCost = totalQty > 0 ? Math.round(totalCost / totalQty) : 0;

    // Đọc Sản phẩm một lần và chuẩn bị Tồn kho + Giá vốn.
    const prodSheet = getSheet('Sản phẩm');
    const prodData = prodSheet.getDataRange().getValues();
    const prodCm = buildColMap(prodData[0] || []);
    let productResult = null;
    let productWrite = null;
    for (let p = 1; p < prodData.length; p++) {
      if (String(prodData[p][prodCm[PROD_COL.SKU]] || '').trim() !== sku) continue;
      const costIndex = prodCm[PROD_COL.COST];
      const stockIndex = prodCm[PROD_COL.STOCK];
      if (costIndex === undefined || stockIndex === undefined) {
        return { success: false, error: 'Sheet Sản phẩm thiếu cột Giá vốn hoặc Tồn kho' };
      }
      const startIndex = Math.min(costIndex, stockIndex);
      const endIndex = Math.max(costIndex, stockIndex);
      const values = prodData[p].slice(startIndex, endIndex + 1);
      values[costIndex - startIndex] = avgCost;
      values[stockIndex - startIndex] = totalQty;
      productWrite = { row: p + 1, column: startIndex + 1, values: values };
      productResult = {
        id: sku,
        sku: sku,
        name: String(prodData[p][prodCm[PROD_COL.NAME]] || '').trim(),
        costPrice: avgCost,
        stock: totalQty
      };
      break;
    }
    if (!productWrite) return { success: false, error: 'Không tìm thấy sản phẩm ' + sku + ' để cập nhật tồn kho' };

    // Hai lần ghi cần thiết trên hai sheet; LockService giữ nguyên thứ tự xử lý.
    sheet.getRange(row, 5, 1, 6).setValues([batchRow.slice(4, 10)]);
    prodSheet.getRange(productWrite.row, productWrite.column, 1, productWrite.values.length).setValues([productWrite.values]);

    addNotificationRow('batch', '✏️ Sửa lô ' + batchId + ' - ' + String(batchRow[2] || ''), '', batchId);

    return {
      success: true,
      message: 'Đã cập nhật lô ' + batchId,
      batch: {
        id: batchId,
        sku: sku,
        name: String(batchRow[2] || ''),
        qtyImported: parseNum(batchRow[3]),
        qtyRemaining: newQty,
        costPrice: newCost,
        importDate: formatBatchDateTime_(batchRow[6]),
        importedBy: String(batchRow[7] || ''),
        note: String(batchRow[8] || ''),
        updatedAt: updatedAt
      },
      product: productResult
    };
  }
  return { success: false, error: 'Không tìm thấy lô' };
}

function deleteBatch(data) {
  const sheet = getBatchSheet();
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]).trim() === String(data.batchId).trim()) {
      const remaining = parseNum(allData[i][4]);
      if (remaining > 0) return { success: false, error: 'Không thể xóa lô còn hàng (' + remaining + ' SP)' };
      const sku = String(allData[i][1]).trim();
      sheet.deleteRow(i + 1);
      syncProductFromBatches(sku);
      return { success: true, message: 'Đã xóa lô ' + data.batchId };
    }
  }
  return { success: false, error: 'Không tìm thấy lô' };
}

// Khởi tạo lô cho tất cả SP đang có tồn kho (chạy 1 lần)
function initBatches() {
  const prodSheet = getSheet('Sản phẩm');
  const prodData = prodSheet.getDataRange().getValues();
  const batchSheet = getBatchSheet();
  const batchData = batchSheet.getDataRange().getValues();

  // Lấy danh sách SKU đã có lô
  const existingSkus = new Set();
  for (let i = 1; i < batchData.length; i++) {
    existingSkus.add(String(batchData[i][1]).trim());
  }

  const now = new Date();
  const timeStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
  let count = 0;

  const prodCm = buildColMap(prodData[0]);
  for (let i = 1; i < prodData.length; i++) {
    const sku = String(prodData[i][prodCm[PROD_COL.SKU]]).trim();
    const stock = parseNum(prodData[i][prodCm[PROD_COL.STOCK]]);
    const cost = parseNum(prodData[i][prodCm[PROD_COL.COST]]);
    if (!sku || stock <= 0 || existingSkus.has(sku)) continue;

    const batchId = 'LOT-INIT-' + String(count + 1).padStart(3, '0');
    batchSheet.appendRow([
      batchId, sku, String(prodData[i][prodCm[PROD_COL.NAME]]), stock, stock, cost,
      timeStr, 'Hệ thống', 'Lô khởi tạo từ tồn kho cũ'
    ]);
    count++;
  }

  return { success: true, message: 'Đã khởi tạo ' + count + ' lô hàng' };
}

// Trừ kho theo FIFO — lô cũ nhất trước
function deductBatchesFIFO(sku, qty) {
  const sheet = getBatchSheet();
  const data = sheet.getDataRange().getValues();
  let remaining = qty;
  let totalFifoCost = 0;

  // Lọc lô của SKU này
  var skuBatches = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() !== String(sku).trim()) continue;
    if (parseNum(data[i][4]) <= 0) continue;
    // Ngày hiệu lực FIFO: nếu đã sửa (cột J) → dùng ngày sửa, chưa sửa → dùng ngày nhập (cột G)
    var effectiveDate = data[i][9] || data[i][6];
    skuBatches.push({ row: i + 1, remain: parseNum(data[i][4]), cost: parseNum(data[i][5]), effectiveDate: effectiveDate });
  }
  // Sort theo ngày hiệu lực — lô cũ (chưa sửa) trừ trước, lô mới sửa trừ sau
  skuBatches.sort(function(a, b) {
    var parse = function(v) {
      if (v instanceof Date) return v.getTime();
      var s = String(v || '');
      // DD/MM/YYYY HH:mm
      var m = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2})/);
      if (m) return new Date(m[3], m[2]-1, m[1], m[4], m[5]).getTime();
      // YYYY-MM-DD
      return new Date(s).getTime() || 0;
    };
    return parse(a.effectiveDate) - parse(b.effectiveDate);
  });

  for (var k = 0; k < skuBatches.length && remaining > 0; k++) {
    var lot = skuBatches[k];
    var deduct = Math.min(remaining, lot.remain);
    totalFifoCost += deduct * lot.cost;
    sheet.getRange(lot.row, 5).setValue(lot.remain - deduct);
    remaining -= deduct;
  }

  // Cập nhật tổng tồn kho trong Sản phẩm
  syncProductFromBatches(sku);

  // Fallback: nếu không có lô nào → lấy giá vốn từ sheet Sản phẩm
  if (totalFifoCost === 0 && qty > 0) {
    try {
      const prodSheet = getSheet('Sản phẩm');
      const prodData = prodSheet.getDataRange().getValues();
      const prodCm = buildColMap(prodData[0]);
      for (let p = 1; p < prodData.length; p++) {
        if (String(prodData[p][prodCm[PROD_COL.SKU]]).trim() === String(sku).trim()) {
          const fallbackCost = parseNum(prodData[p][prodCm[PROD_COL.COST]]);
          if (fallbackCost > 0) totalFifoCost = fallbackCost * qty;
          break;
        }
      }
    } catch(e) { /* ignore */ }
  }

  return totalFifoCost; // Trả về tổng giá vốn FIFO (hoặc fallback từ SP)
}

// Tính lại tồn kho + giá vốn TB từ các lô còn hàng → cập nhật sheet Sản phẩm
function syncProductFromBatches(sku) {
  const batchSheet = getBatchSheet();
  const batchData = batchSheet.getDataRange().getValues();

  let totalQty = 0, totalCost = 0;
  for (let i = 1; i < batchData.length; i++) {
    if (String(batchData[i][1]).trim() !== String(sku).trim()) continue;
    const rem = parseNum(batchData[i][4]);
    const cost = parseNum(batchData[i][5]);
    if (rem > 0) {
      totalQty += rem;
      totalCost += rem * cost;
    }
  }

  const avgCost = totalQty > 0 ? Math.round(totalCost / totalQty) : 0;

  // Cập nhật sheet Sản phẩm
  const prodSheet = getSheet('Sản phẩm');
  const prodData = prodSheet.getDataRange().getValues();
  const prodCm = buildColMap(prodData[0]);
  for (let i = 1; i < prodData.length; i++) {
    if (String(prodData[i][prodCm[PROD_COL.SKU]]).trim() === String(sku).trim()) {
      prodSheet.getRange(i + 1, prodCm[PROD_COL.STOCK] + 1).setValue(totalQty);
      prodSheet.getRange(i + 1, prodCm[PROD_COL.COST] + 1).setValue(avgCost);
      break;
    }
  }
}

// ═══════════════════════════════════════
// RETURNS — Trả hàng
// ═══════════════════════════════════════
function getOrderStatusForReturn(orderId) {
  const orderSheet = getSheet('Đơn hàng');
  const rows = orderSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === String(orderId || '').trim()) {
      return String(rows[i][10] || '').trim();
    }
  }
  return null;
}

function handleReturnOrder(data) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    return handleReturnOrderLocked_(data);
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function makeReturnItemKey_(sku, name, price) {
  return [
    String(sku || '').trim(),
    String(name || '').trim(),
    String(parseNum(price))
  ].join('|');
}

function parseReturnItems_(value) {
  if (Array.isArray(value)) return value;
  try {
    var parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch(e) {
    return [];
  }
}

function buildReturnOrderCaps_(orderId) {
  var detailSheet = getSheet('Chi tiết đơn');
  var detailData = detailSheet.getDataRange().getValues();
  var caps = {};
  var bySkuName = {};
  for (var i = 1; i < detailData.length; i++) {
    if (String(detailData[i][0]).trim() !== String(orderId).trim()) continue;
    var sku = String(detailData[i][1] || '').trim();
    var name = String(detailData[i][2] || '').trim();
    var qty = parseNum(detailData[i][3]);
    var price = parseNum(detailData[i][4]);
    var key = makeReturnItemKey_(sku, name, price);
    if (!caps[key]) caps[key] = { sku: sku, name: name, price: price, qty: 0 };
    caps[key].qty += qty;

    var skuNameKey = sku + '|' + name;
    if (!bySkuName[skuNameKey]) bySkuName[skuNameKey] = [];
    if (bySkuName[skuNameKey].indexOf(key) === -1) bySkuName[skuNameKey].push(key);
  }
  return { caps: caps, bySkuName: bySkuName };
}

function resolveReturnItemKey_(item, capData) {
  var exactKey = makeReturnItemKey_(item.sku, item.name, item.price);
  if (capData.caps[exactKey]) return exactKey;

  var skuNameKey = String(item.sku || '').trim() + '|' + String(item.name || '').trim();
  var candidates = capData.bySkuName[skuNameKey] || [];
  return candidates.length === 1 ? candidates[0] : exactKey;
}

function getExistingReturnQtyMap_(returnRows, orderId, capData) {
  var returned = {};
  for (var i = 1; i < returnRows.length; i++) {
    if (String(returnRows[i][1] || '').trim() !== String(orderId).trim()) continue;
    var items = parseReturnItems_(returnRows[i][4]);
    for (var j = 0; j < items.length; j++) {
      var item = items[j] || {};
      var key = resolveReturnItemKey_(item, capData);
      returned[key] = (returned[key] || 0) + parseNum(item.qty);
    }
  }
  return returned;
}

function validateReturnItemsForOrder_(orderId, items, returnRows) {
  var capData = buildReturnOrderCaps_(orderId);
  var returned = getExistingReturnQtyMap_(returnRows, orderId, capData);

  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};
    var qty = parseNum(item.qty);
    if (qty <= 0) return { success: false, error: 'Số lượng trả không hợp lệ' };

    var key = resolveReturnItemKey_(item, capData);
    var cap = capData.caps[key];
    if (!cap) {
      return { success: false, error: 'Sản phẩm trả không khớp đơn gốc: ' + (item.name || item.sku || '') };
    }

    var afterReturnQty = (returned[key] || 0) + qty;
    if (afterReturnQty > cap.qty) {
      return {
        success: false,
        error: 'Số lượng trả vượt số lượng mua: ' + cap.name + ' đã trả ' + (returned[key] || 0) + '/' + cap.qty
      };
    }
    returned[key] = afterReturnQty;
  }

  return { success: true };
}

function handleReturnOrderLocked_(data) {
  const ss = SpreadsheetApp.openById(SS_ID);
  const orderId = String(data.orderId || '').trim();
  if (!orderId) return { success: false, error: 'Thiếu mã đơn gốc' };

  const orderStatus = getOrderStatusForReturn(orderId);
  if (orderStatus === null) {
    return { success: false, error: 'Không tìm thấy đơn gốc ' + orderId };
  }
  const normalizedStatus = String(orderStatus || 'completed').trim().toLowerCase();
  if (normalizedStatus !== 'completed') {
    return {
      success: false,
      error: 'Chỉ đơn hoàn thành mới được trả hàng. Trạng thái hiện tại: ' + normalizedStatus
    };
  }
  
  // Tạo sheet "Trả hàng" nếu chưa có
  let returnSheet = ss.getSheetByName('Trả hàng');
  if (!returnSheet) {
    returnSheet = ss.insertSheet('Trả hàng');
    returnSheet.appendRow([
      'Mã trả hàng', 'Mã đơn gốc', 'Khách hàng', 'Mã KH',
      'SP trả', 'Tổng tiền trả', 'Ghi chú', 'Người tạo', 'Ngày tạo'
    ]);
    returnSheet.getRange(1, 1, 1, 9).setBackground('#1A73E8').setFontColor('#fff').setFontWeight('bold');
    returnSheet.setFrozenRows(1);
  }

  const returnId = String(data.returnId || '').trim();
  const returnItems = Array.isArray(data.items) ? data.items : [];
  if (returnItems.length === 0) {
    return { success: false, error: 'Chưa chọn sản phẩm trả' };
  }

  const returnRows = returnSheet.getDataRange().getValues();
  if (returnId) {
    for (var rr = 1; rr < returnRows.length; rr++) {
      if (String(returnRows[rr][0] || '').trim() === returnId) {
        return {
          success: false,
          returnId: returnId,
          duplicate: true,
          error: 'Phiếu trả hàng đã tồn tại, không ghi trùng'
        };
      }
    }
  }

  const validation = validateReturnItemsForOrder_(orderId, returnItems, returnRows);
  if (!validation.success) return validation;

  const dateStr = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');

  // Ghi phiếu trả hàng
  returnSheet.appendRow([
    returnId,
    orderId,
    data.customerName || 'Khách lẻ',
    data.customerId || '',
    JSON.stringify(returnItems),
    data.returnTotal || 0,
    data.note || '',
    data.createdBy || '',
    dateStr
  ]);

  // Cộng lại tồn kho — tạo lô trả hàng + kiểm tra SP đã xóa
  if (returnItems.length) {
    const batchSheet = getBatchSheet();
    const timeStr = dateStr;
    const prodSheet = getSheet('Sản phẩm');
    const prodData = prodSheet.getDataRange().getValues();
    
    returnItems.forEach(item => {
      const sku = String(item.sku).trim();
      
      // Kiểm tra SP còn tồn tại không
      var prodExists = false;
      var prodCm = buildColMap(prodData[0]);
      for (var pi = 1; pi < prodData.length; pi++) {
        if (String(prodData[pi][prodCm[PROD_COL.SKU]]).trim() === sku) { prodExists = true; break; }
      }

      // Khôi phục SP từ Lô hàng nếu đã bị xóa
      if (!prodExists && sku) {
        var batchData = batchSheet.getDataRange().getValues();
        var bName = item.name || '', bCost = 0, bSell = 0;
        for (var bi = 1; bi < batchData.length; bi++) {
          if (String(batchData[bi][1]).trim() === sku) {
            bName = bName || String(batchData[bi][2]);
            bCost = parseNum(batchData[bi][5]) || bCost;
            bSell = parseNum(batchData[bi][10]) || bSell;
          }
        }
        // Tạo lại SP theo header hiện tại
        var newRow = new Array(prodData[0].length).fill('');
        function setCol3(colName, value) { if (prodCm[colName] !== undefined) newRow[prodCm[colName]] = value; }
        setCol3(PROD_COL.TYPE,     'Hàng hóa');
        setCol3(PROD_COL.CATEGORY, 'Dùng ngoài');
        setCol3(PROD_COL.SKU,      sku);
        setCol3(PROD_COL.NAME,     bName);
        setCol3(PROD_COL.SELL,     bSell || item.price || 0);
        setCol3(PROD_COL.COST,     bCost);
        setCol3(PROD_COL.STOCK,    0);
        prodSheet.appendRow(newRow);
      }
      
      // Lấy giá vốn gốc từ Chi tiết đơn hoặc lô hàng
      var returnCost = 0;
      try {
        var detailSheet = getSheet('Chi tiết đơn');
        var detailData = detailSheet.getDataRange().getValues();
        for (var di = 1; di < detailData.length; di++) {
          if (String(detailData[di][0]).trim() === String(data.orderId).trim() &&
              String(detailData[di][1]).trim() === sku) {
            // Cột G = giá vốn FIFO lưu trong đơn
            var storedCost = parseNum(detailData[di][6]);
            if (storedCost > 0) { returnCost = Math.round(storedCost / parseNum(detailData[di][3])); break; }
          }
        }
      } catch(e) {}
      // Fallback: lấy giá vốn từ lô hàng
      if (returnCost <= 0) returnCost = bCost || 0;
      
      const batchId = 'LOT-RTN-' + (returnId || 'X');
      batchSheet.appendRow([
        batchId, sku, item.name || '', item.qty, item.qty,
        returnCost, timeStr, data.createdBy || '', 'Trả hàng từ ' + (data.orderId || ''), '', item.price || 0
      ]);
      syncProductFromBatches(sku);
    });
  }

  // Ghi thông báo
  addNotificationRow('return', '↩️ Trả hàng ' + orderId + ' - ' + fmtMoney(data.returnTotal || 0), data.createdBy || 'Admin', returnId);

  return { success: true, returnId: returnId, message: 'Đã tạo phiếu trả hàng ' + returnId };
}

function getReturns() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheetByName('Trả hàng');
  if (!sheet) return { success: true, data: [] };
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };
  
  const returns = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    let items = [];
    try { items = JSON.parse(r[4] || '[]'); } catch(e) {}
    returns.push({
      id: String(r[0]),
      orderId: String(r[1]),
      customerName: String(r[2]),
      customerId: String(r[3]),
      items: items,
      returnTotal: parseNum(r[5]),
      note: String(r[6]),
      createdBy: String(r[7]),
      createdAt: r[8] instanceof Date
        ? (String(r[8].getDate()).padStart(2,'0') + '/' + String(r[8].getMonth()+1).padStart(2,'0') + '/' + r[8].getFullYear() + ' ' + String(r[8].getHours()).padStart(2,'0') + ':' + String(r[8].getMinutes()).padStart(2,'0'))
        : String(r[8])
    });
  }
  return { success: true, data: returns.reverse() };
}

// ═══════════════════════════════════════
// NOTIFICATIONS — Thông báo đồng bộ
// Sheet "Thông báo": A=ID, B=Type, C=Message, D=CreatedAt, E=CreatedBy, F=RefId
// ═══════════════════════════════════════
function getNotifSheet() {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName('Thông báo');
  if (!sheet) {
    sheet = ss.insertSheet('Thông báo');
    sheet.appendRow(['ID', 'Type', 'Message', 'CreatedAt', 'CreatedBy', 'RefId']);
    sheet.getRange(1, 1, 1, 6).setBackground('#1A73E8').setFontColor('#fff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function addNotificationRow(type, message, createdBy, refId) {
  try {
    const sheet = getNotifSheet();
    const now = new Date();
    const id = 'NTF-' + Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 1000);
    const timeStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
    sheet.appendRow([id, type || '', message || '', timeStr, createdBy || '', refId || '']);
    
    // Giữ tối đa 200 dòng (xóa cũ)
    const rows = sheet.getLastRow();
    if (rows > 201) {
      sheet.deleteRows(2, rows - 201);
    }
  } catch(e) {
    // Không throw lỗi — notification là phụ, không block chức năng chính
  }
}

function getNotifications() {
  const sheet = getNotifSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };
  
  const notifications = [];
  // Lấy 50 dòng gần nhất
  const start = Math.max(1, data.length - 50);
  for (let i = start; i < data.length; i++) {
    const r = data[i];
    notifications.push({
      id: String(r[0]),
      type: String(r[1]),
      message: String(r[2]),
      createdAt: r[3] instanceof Date
        ? Utilities.formatDate(r[3], 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm')
        : String(r[3]),
      createdBy: String(r[4]),
      refId: String(r[5])
    });
  }
  return { success: true, data: notifications.reverse() };
}

function fmtMoney(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

// ═══════════════════════════════════════
// STORE CONFIG — Cấu hình cửa hàng (đồng bộ giữa các thiết bị)
// Sheet "Cấu hình": A=Key, B=Value
// ═══════════════════════════════════════
function getConfigSheet() {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName('Cấu hình');
  if (!sheet) {
    sheet = ss.insertSheet('Cấu hình');
    sheet.appendRow(['Key', 'Value']);
    sheet.getRange(1, 1, 1, 2).setBackground('#1A73E8').setFontColor('#fff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getStoreConfig() {
  const sheet = getConfigSheet();
  const data = sheet.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0] || '').trim();
    if (key) config[key] = String(data[i][1] || '');
  }
  return { success: true, data: config };
}

function saveStoreConfig(data) {
  const sheet = getConfigSheet();
  const key = String(data.key || '').trim();
  const value = data.value !== undefined ? String(data.value) : '';
  if (!key) return { success: false, error: 'Thiếu key' };
  
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]).trim() === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return { success: true, message: 'Đã cập nhật ' + key };
    }
  }
  // Thêm mới
  sheet.appendRow([key, value]);
  return { success: true, message: 'Đã lưu ' + key };
}

// ═══════════════════════════════════════
// AUTH — Đọc từ sheet Users
// ═══════════════════════════════════════
function authenticate(username, password) {
  const ss = SpreadsheetApp.openById(SS_ID);
  let userSheet = ss.getSheetByName('Users');
  if (!userSheet) {
    // Tạo sheet Users với admin mặc định
    userSheet = ss.insertSheet('Users');
    userSheet.appendRow(['Username', 'Password', 'Tên hiển thị', 'SĐT', 'Vai trò', 'Trạng thái']);
    userSheet.appendRow(['admin', 'admin', 'Kiều Hương', '0393913004', 'Admin', 'active']);
    userSheet.getRange(1, 1, 1, 6).setBackground('#1A73E8').setFontColor('#fff').setFontWeight('bold');
    userSheet.setFrozenRows(1);
  }
  const data = userSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[0]).trim() === username && String(r[1]).trim() === password && String(r[5]).trim() === 'active') {
      // Lấy permissions từ vai trò
      const roleName = String(r[4]).trim();
      let permissions = {};
      if (roleName === 'Admin') {
        permissions = { '*': true };
      } else {
        const roleSheet = ss.getSheetByName('Roles');
        if (roleSheet) {
          const roleData = roleSheet.getDataRange().getValues();
          for (let j = 1; j < roleData.length; j++) {
            if (String(roleData[j][0]).trim() === roleName) {
              try { permissions = JSON.parse(roleData[j][1]); } catch(e) {}
              break;
            }
          }
        }
      }
      return {
        success: true,
        user: {
          username: String(r[0]).trim(),
          displayName: String(r[2]).trim(),
          phone: String(r[3]).trim(),
          role: roleName,
          permissions: permissions
        }
      };
    }
  }
  return { success: false, error: 'Sai tên đăng nhập hoặc mật khẩu' };
}

// ═══════════════════════════════════════
// USERS MANAGEMENT
// ═══════════════════════════════════════
function getUsers() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheetByName('Users');
  if (!sheet) return { success: true, data: [] };
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };
  const users = [];
  for (let i = 1; i < data.length; i++) {
    users.push({
      username: String(data[i][0]).trim(),
      displayName: String(data[i][2]).trim(),
      phone: String(data[i][3]).trim(),
      role: String(data[i][4]).trim(),
      status: String(data[i][5]).trim() || 'active'
    });
  }
  return { success: true, data: users };
}

function addUser(data) {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName('Users');
  if (!sheet) {
    sheet = ss.insertSheet('Users');
    sheet.appendRow(['Username', 'Password', 'Tên hiển thị', 'SĐT', 'Vai trò', 'Trạng thái']);
    sheet.getRange(1, 1, 1, 6).setBackground('#1A73E8').setFontColor('#fff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  // Check duplicate username
  const existing = sheet.getDataRange().getValues();
  for (let i = 1; i < existing.length; i++) {
    if (String(existing[i][0]).trim() === data.username) {
      return { success: false, error: 'Tên đăng nhập đã tồn tại' };
    }
  }
  sheet.appendRow([data.username, data.password, data.displayName || '', data.phone || '', data.role || 'Staff', 'active']);
  return { success: true, message: 'Đã thêm tài khoản' };
}

function updateUser(data) {
  const ss = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheetByName('Users');
  if (!sheet) return { success: false, error: 'Sheet Users không tồn tại' };
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]).trim() === data.username) {
      const row = i + 1;
      if (data.password)    sheet.getRange(row, 2).setValue(data.password);
      if (data.displayName) sheet.getRange(row, 3).setValue(data.displayName);
      if (data.phone !== undefined) sheet.getRange(row, 4).setValue(data.phone);
      if (data.role)        sheet.getRange(row, 5).setValue(data.role);
      if (data.status)      sheet.getRange(row, 6).setValue(data.status);
      return { success: true, message: 'Đã cập nhật' };
    }
  }
  return { success: false, error: 'Không tìm thấy user' };
}

function deleteUser(data) {
  const ss = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheetByName('Users');
  if (!sheet) return { success: false, error: 'Sheet không tồn tại' };
  if (data.username === 'admin') return { success: false, error: 'Không thể xóa admin' };
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]).trim() === data.username) {
      sheet.deleteRow(i + 1);
      return { success: true, message: 'Đã xóa' };
    }
  }
  return { success: false, error: 'Không tìm thấy' };
}

// ═══════════════════════════════════════
// ROLES MANAGEMENT
// ═══════════════════════════════════════
function getRoles() {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName('Roles');
  if (!sheet) {
    sheet = ss.insertSheet('Roles');
    sheet.appendRow(['Tên vai trò', 'Quyền']);
    sheet.appendRow(['Admin', '{"*":true}']);
    sheet.getRange(1, 1, 1, 2).setBackground('#1A73E8').setFontColor('#fff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };
  const roles = [];
  for (let i = 1; i < data.length; i++) {
    let perms = {};
    try { perms = JSON.parse(data[i][1]); } catch(e) {}
    roles.push({ name: String(data[i][0]).trim(), permissions: perms });
  }
  return { success: true, data: roles };
}

function addRole(data) {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName('Roles');
  if (!sheet) {
    sheet = ss.insertSheet('Roles');
    sheet.appendRow(['Tên vai trò', 'Quyền']);
    sheet.getRange(1, 1, 1, 2).setBackground('#1A73E8').setFontColor('#fff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([data.name, JSON.stringify(data.permissions || {})]);
  return { success: true, message: 'Đã tạo vai trò' };
}

function updateRole(data) {
  const ss = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheetByName('Roles');
  if (!sheet) return { success: false, error: 'Sheet Roles không tồn tại' };
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]).trim() === data.name) {
      sheet.getRange(i + 1, 2).setValue(JSON.stringify(data.permissions || {}));
      return { success: true, message: 'Đã cập nhật' };
    }
  }
  return { success: false, error: 'Không tìm thấy vai trò' };
}

function deleteRole(data) {
  const ss = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheetByName('Roles');
  if (!sheet) return { success: false, error: 'Sheet không tồn tại' };
  if (data.name === 'Admin') return { success: false, error: 'Không thể xóa vai trò Admin' };
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]).trim() === data.name) {
      sheet.deleteRow(i + 1);
      return { success: true, message: 'Đã xóa' };
    }
  }
  return { success: false, error: 'Không tìm thấy' };
}

// ═══════════════════════════════════════
// STATS
// ═══════════════════════════════════════
function getStats() {
  const products = getProducts().data || [];
  const customers = getCustomers().data || [];
  const orders = getOrders().data || [];

  const today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy');
  const todayOrders = orders.filter(o => o.createdAt && o.createdAt.includes(today));
  const todayRevenue = todayOrders.reduce((s, o) => s + (o.finalTotal || 0), 0);

  return {
    success: true,
    data: {
      todayRevenue,
      todayOrders: todayOrders.length,
      totalOrders: orders.length,
      totalProducts: products.length,
      totalCustomers: customers.length,
      lowStock: products.filter(p => p.stock > 0 && p.stock <= 3).length,
      outStock: products.filter(p => p.stock <= 0).length
    }
  };
}

// ═══════════════════════════════════════
// FORMAT NUMBERS — Chạy 1 lần để đổi format sang dấu chấm
// Vào Apps Script Editor → chọn hàm formatNumbers → ▶ Run
// ═══════════════════════════════════════
function formatNumbers() {
  const ss = SpreadsheetApp.openById(SS_ID);
  
  // Set locale VN
  ss.setSpreadsheetLocale('vi_VN');
  
  // Format sheet Sản phẩm — đọc theo header, không phụ thuộc vị trí cột
  const prodSheet = ss.getSheetByName('Sản phẩm');
  if (prodSheet) {
    const lastRow = prodSheet.getLastRow();
    if (lastRow > 1) {
      const headers = prodSheet.getRange(1, 1, 1, prodSheet.getLastColumn()).getValues()[0];
      const cm = buildColMap(headers);
      var fmtCol = function(colName, fmt) {
        if (cm[colName] !== undefined) {
          prodSheet.getRange(2, cm[colName] + 1, lastRow - 1, 1).setNumberFormat(fmt);
        }
      };
      fmtCol(PROD_COL.SELL,  '#.##0');
      fmtCol(PROD_COL.COST,  '#.##0');
      fmtCol(PROD_COL.STOCK, '#.##0');
      fmtCol(PROD_COL.ORD,   '#.##0');
    }
  }
  
  Logger.log('✅ Đã format xong tất cả số sang dấu chấm!');
  return 'Done!';
}

// ═══════════════════════════════════════════════════════════════
// TIKTOK SYNC — Đồng bộ đơn từ TikTok Sheet → SalesApp
// ═══════════════════════════════════════════════════════════════

function syncTikTokOrders() {
  // 1. Đọc bảng Mapping SKU (A=SKU TikTok, B=SKU App, C=Tên, D=SL gốc, E=SKU Quà, F=Kiểu giá)
  const mappingSheet = getSheet('Mapping SKU');
  const mappingData = mappingSheet.getDataRange().getValues();
  const mapping = {}; // skuTikTok -> [{skuApp, name, qtyBase, giftSku, priceMode}]
  for (let i = 1; i < mappingData.length; i++) {
    const skuTK = String(mappingData[i][0] || '').trim();
    if (!skuTK) continue;
    if (!mapping[skuTK]) mapping[skuTK] = [];
    mapping[skuTK].push({
      skuApp: String(mappingData[i][1] || '').trim(),
      name: String(mappingData[i][2] || '').trim(),
      qtyBase: parseNum(mappingData[i][3]) || 1,
      giftSku: String(mappingData[i][4] || '').trim(),
      priceMode: String(mappingData[i][5] || '').trim()
    });
  }

  // 2. Build map SKU → tên SP từ sheet "Sản phẩm"
  const prodSheet2 = getSheet('Sản phẩm');
  const prodData2 = prodSheet2.getDataRange().getValues();
  const prodCm2 = buildColMap(prodData2[0]);
  const skuToName = {};
  for (let i = 1; i < prodData2.length; i++) {
    const s = String(prodData2[i][prodCm2[PROD_COL.SKU]] || '').trim();
    const n = String(prodData2[i][prodCm2[PROD_COL.NAME]] || '').trim();
    if (s) skuToName[s] = n;
  }

  // 3. Đọc TikTok sheet (chỉ lấy 500 dòng cuối để tránh timeout)
  const tkSS = SpreadsheetApp.openById(TIKTOK_SS_ID);
  const tkSheet = tkSS.getSheetByName(TIKTOK_SHEET_NAME);
  if (!tkSheet) return { success: false, error: 'Không tìm thấy sheet "' + TIKTOK_SHEET_NAME + '"' };

  const quyUocPrice = {};
  const quSheet = tkSS.getSheetByName('Quy Ước');
  if (quSheet) {
    const quData = quSheet.getDataRange().getValues();
    for (let i = 1; i < quData.length; i++) {
      const sku = String(quData[i][0] || '').trim();
      const price = parseNum(quData[i][2]);
      if (sku && price) quyUocPrice[sku] = price;
    }
  }

  const lastRow = tkSheet.getLastRow();
  const startRow = Math.max(2, lastRow - 499); // Lấy 500 dòng cuối
  const numRows = lastRow - startRow + 1;
  const numCols = 16; // A-P; cột P chứa CAT|MAP cho dòng bot đã mapping
  const tkData = tkSheet.getRange(startRow, 1, numRows, numCols).getValues();

  // 3. Đọc đơn hiện có trong SalesApp để tránh trùng
  const orderSheet = getSheet('Đơn hàng');
  const existingData = orderSheet.getDataRange().getValues();
  const existingTKIds = new Set();
  for (let i = 1; i < existingData.length; i++) {
    const note = String(existingData[i][11] || '').trim(); // Col L = Ghi chú
    if (note.startsWith('TK:')) existingTKIds.add(note);
  }

  // 4. Nhóm đơn TikTok theo Order ID
  const tkOrders = {};
  let curId = '';
  for (let i = 0; i < tkData.length; i++) {
    const cellId = String(tkData[i][0] || '').trim(); // Col A
    if (cellId) curId = cellId;
    if (!curId) continue;
    const sellerSku = String(tkData[i][10] || '').trim(); // Col K
    if (!sellerSku) continue;

    if (!tkOrders[curId]) tkOrders[curId] = { items: [], row: i + 1 };
    tkOrders[curId].items.push({
      sellerSku: sellerSku,
      productName: String(tkData[i][1] || '').trim(), // Col B
      qty: parseNum(tkData[i][2]) || 1,               // Col C
      price: parseNum(tkData[i][3]),                   // Col D = Giá Bán
      revenue: parseNum(tkData[i][4]),                 // Col E = Tổng Doanh Thu
      fee: parseNum(tkData[i][5]),                     // Col F = Tổng Phí Sàn
      afterFee: parseNum(tkData[i][8]),                // Col I = Doanh Thu Trừ Chi Phí
      status: String(tkData[i][9] || '').trim(),       // Col J = Trạng Thái Hàng
      mappingApplied: isBotMappedTikTokRow(tkData[i][15]) // Col P = CAT|MAP
    });
  }

  // 5. Tạo đơn trong SalesApp
  const itemSheet = getSheet('Chi tiết đơn');
  let synced = 0, skipped = 0, noFee = 0;
  const notFoundSkus = [];

  for (const [tkId, order] of Object.entries(tkOrders)) {
    const noteKey = 'TK:' + tkId;
    if (existingTKIds.has(noteKey)) { skipped++; continue; }

    // Tính tổng từ TikTok
    let totalRevenue = 0;  // Tổng Doanh Thu (col E)
    let totalFee = 0;      // Tổng Phí Sàn (col F)
    let totalAfterFee = 0; // Doanh Thu Trừ Chi Phí (col I)
    const orderItems = [];

    for (const item of order.items) {
      totalRevenue += item.revenue || (item.price * item.qty);
      totalFee += item.fee || 0;
      totalAfterFee += item.afterFee || 0;

      const mapped = mapping[item.sellerSku];
      if (item.mappingApplied) {
        // Bot mới đã đổi SKU TikTok -> SKU App, tách bundle/combo và thêm quà.
        // Không mapping lần hai để tránh nhân số lượng hoặc quà tặng.
        orderItems.push({
          sku: item.sellerSku,
          name: skuToName[item.sellerSku] || item.productName || item.sellerSku,
          qty: item.qty,
          price: item.price
        });
      } else if (!mapped) {
        notFoundSkus.push(item.sellerSku);
        orderItems.push({
          sku: item.sellerSku,
          name: item.productName || item.sellerSku,
          qty: item.qty,
          price: item.price
        });
      } else {
        for (const m of mapped) {
          const usePrice = resolveTikTokMappedPrice(item, m, mapped, quyUocPrice);
          orderItems.push({
            sku: m.skuApp,
            name: skuToName[m.skuApp] || m.name,
            qty: item.qty * m.qtyBase,
            price: usePrice
          });
        }
      }
    }

    // Tạo mã đơn TikTok
    const now = new Date();
    const dateStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
    const orderId = 'TK' + dateStr + String(orderSheet.getLastRow() + 1).padStart(4, '0');
    const timeStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
    const finalTotal = totalAfterFee > 0 ? totalAfterFee : (totalRevenue - totalFee);
    const totalDeduction = Math.max(0, totalRevenue - finalTotal);

    // Ghi vào Đơn hàng:
    // G=Tổng tiền (doanh thu gốc), H=Tổng khoản trừ, I=Thành tiền theo cột I TikTok
    orderSheet.appendRow([
      orderId, timeStr,
      '', 'Khách TikTok', '', '',
      totalRevenue, totalDeduction, finalTotal,
      'Thuế Sàn', 'Chờ đối chiếu', noteKey, 'TikTok Sync',
      'Thuế Sàn'
    ]);

    // Ghi chi tiết đơn (CHƯA trừ tồn kho)
    for (const it of orderItems) {
      appendItemRow(itemSheet, [orderId, it.sku, it.name, it.qty, it.price, it.qty * it.price]);
    }

    synced++;
  }

  return {
    success: true,
    synced: synced,
    skipped: skipped,
    noFee: noFee,
    notFound: [...new Set(notFoundSkus)],
    message: 'Đồng bộ ' + synced + ' đơn mới, bỏ qua ' + skipped + ' đơn đã có' +
      (notFoundSkus.length ? '. SKU chưa mapping: ' + [...new Set(notFoundSkus)].join(', ') : '')
  };
}

function normalizeConfirmOrderItems(items) {
  const normalized = [];
  if (!Array.isArray(items)) return normalized;
  for (const item of items) {
    const sku = String(item && item.sku || '').trim();
    const name = String(item && item.name || '').trim();
    const qty = parseNum(item && item.qty);
    const price = parseNum(item && item.price);
    if (!sku || qty <= 0) continue;
    normalized.push({
      sku: sku,
      name: name || sku,
      qty: qty,
      price: price
    });
  }
  return normalized;
}

function deleteOrderItemRows_(sheet, orderId) {
  var values = sheet.getDataRange().getValues();
  var groups = [];
  var start = -1;
  var count = 0;
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0] || '').trim() === orderId) {
      if (start < 0) { start = i + 1; count = 1; }
      else if (i + 1 === start - 1) { start = i + 1; count++; }
      else { groups.push({ start: start, count: count }); start = i + 1; count = 1; }
    }
  }
  if (start >= 0) groups.push({ start: start, count: count });
  groups.forEach(function(group) { sheet.deleteRows(group.start, group.count); });
}

function writeOrderItemCosts_(sheet, rowsToDeduct, costs) {
  var entries = rowsToDeduct.map(function(item, index) {
    return { row: item.row, cost: costs[index] || 0 };
  }).sort(function(a, b) { return a.row - b.row; });
  var groups = [];
  entries.forEach(function(entry) {
    var group = groups[groups.length - 1];
    if (!group || entry.row !== group.start + group.values.length) {
      groups.push({ start: entry.row, values: [[entry.cost]] });
    } else {
      group.values.push([entry.cost]);
    }
  });
  groups.forEach(function(group) {
    sheet.getRange(group.start, 7, group.values.length, 1).setValues(group.values);
  });
}

// Xác nhận đơn TikTok → cập nhật dòng đã sửa (nếu có) + trừ tồn kho
function confirmTikTokOrder(data) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    return confirmTikTokOrderLocked_(data || {});
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function confirmTikTokOrderLocked_(data) {
  const orderId = String(data.orderId || '').trim();
  if (!orderId) return { success: false, error: 'Thiếu mã đơn' };
  const requestId = String(data.clientRequestId || ('tiktok-confirm:' + orderId)).trim();
  const requestKey = getHashedRequestKey_('TIKTOK_CONFIRM_', requestId);
  const previousOrderId = PropertiesService.getScriptProperties().getProperty(requestKey);
  if (previousOrderId) {
    return {
      success: true,
      duplicate: true,
      orderId: previousOrderId,
      message: 'Đơn ' + previousOrderId + ' đã được xác nhận từ trước'
    };
  }

  const orderSheet = getSheet('Đơn hàng');
  const allOrders = orderSheet.getDataRange().getValues();

  // Tìm đơn
  let orderRow = -1;
  for (let i = 1; i < allOrders.length; i++) {
    if (String(allOrders[i][0]).trim() === orderId) { orderRow = i + 1; break; }
  }
  if (orderRow < 0) return { success: false, error: 'Không tìm thấy đơn ' + orderId };

  const currentStatus = String(allOrders[orderRow - 1][10]).trim();
  if (currentStatus !== 'Chờ đối chiếu') {
    return { success: false, error: 'Đơn ' + orderId + ' không ở trạng thái chờ đối chiếu' };
  }

  const itemSheet = getSheet('Chi tiết đơn');
  let rowsToDeduct = [];
  let inventoryPlan;

  if (Array.isArray(data.items)) {
    const updatedItems = normalizeConfirmOrderItems(data.items);
    if (updatedItems.length === 0) return { success: false, error: 'Không có sản phẩm hợp lệ để xác nhận' };
    inventoryPlan = buildInventoryDeductionPlan_(updatedItems);
    if (!inventoryPlan.success) return inventoryPlan;

    const subtotal = data.total !== undefined
      ? parseNum(data.total)
      : updatedItems.reduce(function(sum, item) { return sum + item.qty * item.price; }, 0);
    const discount = data.discount !== undefined ? parseNum(data.discount) : parseNum(allOrders[orderRow - 1][7]);
    const finalTotal = data.finalTotal !== undefined ? parseNum(data.finalTotal) : Math.max(0, subtotal - discount);

    // Ghi lại tổng đơn theo cart đã chỉnh trước khi trừ kho.
    orderSheet.getRange(orderRow, 7).setValue(subtotal);
    orderSheet.getRange(orderRow, 8).setValue(discount);
    orderSheet.getRange(orderRow, 9).setValue(finalTotal);

    // Đơn đang "Chờ đối chiếu" nên chưa trừ kho; thay chi tiết cũ bằng chi tiết đã chỉnh.
    deleteOrderItemRows_(itemSheet, orderId);
    const detailStartRow = itemSheet.getLastRow() + 1;
    const detailRows = updatedItems.map(function(item) {
      return [orderId, item.sku, item.name, item.qty, item.price, item.qty * item.price];
    });
    itemSheet.getRange(detailStartRow, 1, detailRows.length, 6).setValues(detailRows);
    rowsToDeduct = updatedItems.map(function(item, index) {
      return { row: detailStartRow + index, sku: item.sku, qty: item.qty };
    });
  } else {
    const allItems = itemSheet.getDataRange().getValues();
    for (let i = 1; i < allItems.length; i++) {
      if (String(allItems[i][0]).trim() === orderId) {
        rowsToDeduct.push({
          row: i + 1,
          sku: String(allItems[i][1]).trim(),
          qty: parseNum(allItems[i][3])
        });
      }
    }
    inventoryPlan = buildInventoryDeductionPlan_(rowsToDeduct);
    if (!inventoryPlan.success) return inventoryPlan;
  }

  // Trừ tồn kho một lượt + ghi giá vốn FIFO vào cột G.
  commitInventoryDeductionPlan_(inventoryPlan);
  let totalCost = 0;
  for (let itemIndex = 0; itemIndex < rowsToDeduct.length; itemIndex++) {
    const fifoCost = inventoryPlan.itemCosts[itemIndex] || 0;
    totalCost += fifoCost;
  }
  writeOrderItemCosts_(itemSheet, rowsToDeduct, inventoryPlan.itemCosts);

  // Cập nhật trạng thái → completed
  orderSheet.getRange(orderRow, 11).setValue('completed');
  PropertiesService.getScriptProperties().setProperty(requestKey, orderId);

  return {
    success: true,
    orderId: orderId,
    stocks: inventoryPlan.stocks,
    checkedAt: inventoryPlan.checkedAt,
    message: 'Đã xác nhận đơn ' + orderId + ' và trừ tồn kho. Giá vốn: ' + totalCost.toLocaleString() + 'đ'
  };
}

// Hủy đơn TikTok "Chờ đối chiếu" → chuyển trạng thái thành cancelled (không trừ tồn kho)
function cancelTikTokOrder(data) {
  const orderId = String(data.orderId || '').trim();
  if (!orderId) return { success: false, error: 'Thiếu mã đơn' };

  const orderSheet = getSheet('Đơn hàng');
  const allOrders = orderSheet.getDataRange().getValues();

  let orderRow = -1;
  for (let i = 1; i < allOrders.length; i++) {
    if (String(allOrders[i][0]).trim() === orderId) { orderRow = i + 1; break; }
  }
  if (orderRow < 0) return { success: false, error: 'Không tìm thấy đơn ' + orderId };

  const currentStatus = String(allOrders[orderRow - 1][10]).trim();
  if (currentStatus !== 'Chờ đối chiếu') {
    return { success: false, error: 'Đơn ' + orderId + ' không ở trạng thái chờ đối chiếu' };
  }

  orderSheet.getRange(orderRow, 11).setValue('cancelled');
  return { success: true, message: 'Đã hủy đơn ' + orderId };
}

function normalizePriceMode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '_');
}

function isBotMappedTikTokRow(catalogMarker) {
  return /(^|\|)MAP-[A-Za-z0-9_-]+/.test(String(catalogMarker || '').trim());
}

function getTikTokRulePrice(item, quyUocPrice) {
  // Column D "Gia Ban" is the transaction price captured when the bot
  // imported the order. Quy Uoc is only a fallback because it may change
  // before fees are extracted and the order is synced to SalesApp.
  return parseNum(item.price) || parseNum(quyUocPrice[item.sellerSku]);
}

function resolveTikTokMappedPrice(item, mappedItem, mappedList, quyUocPrice) {
  const qtyBase = parseNum(mappedItem.qtyBase) || 1;
  const priceMode = normalizePriceMode(mappedItem.priceMode);

  if (priceMode === 'SPLIT_TIKTOK') {
    const totalSkuPrice = getTikTokRulePrice(item, quyUocPrice);
    return qtyBase > 0 ? totalSkuPrice / qtyBase : totalSkuPrice;
  }

  const isSimple = mappedList.length === 1 && qtyBase === 1;
  return isSimple
    ? (parseNum(item.price) || parseNum(quyUocPrice[mappedItem.skuApp]) || parseNum(quyUocPrice[item.sellerSku]))
    : (parseNum(quyUocPrice[mappedItem.skuApp]) || parseNum(item.price) || parseNum(quyUocPrice[item.sellerSku]));
}

// Đồng bộ các đơn cụ thể từ Chrome Extension → TẠO 1 ĐƠN TỔNG DUY NHẤT
function normalizeTikTokReconcileType(value) {
  const text = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!text) return '';
  if (text.indexOf('bom') !== -1) return 'bomHang';
  if (text.indexOf('thht') !== -1 || (text.indexOf('tra hang') !== -1 && text.indexOf('hoan') !== -1)) return 'refund';
  if (text.indexOf('theo doi') !== -1) return 'watch';
  if (text.indexOf('bo qua') !== -1 || text.indexOf('skip') !== -1 || text.indexOf('ignore') !== -1) return 'ignored';
  return '';
}

function isBlockingTikTokReconcileType(type) {
  return type === 'bomHang' || type === 'refund' || type === 'watch' || type === 'ignored';
}

function getTikTokPushRequestId_(data) {
  var explicitId = String(data && data.clientRequestId || '').trim();
  if (explicitId) return explicitId;
  var orderIds = (data && data.orderIds || []).map(function(id) { return String(id || '').trim(); }).filter(Boolean).sort();
  var feeOnlyIds = (data && data.feeOnlyOrders || []).map(function(item) {
    return String(item && item.orderId || '').trim();
  }).filter(Boolean).sort();
  return 'fee-push:' + orderIds.join(',') + '|fee-only:' + feeOnlyIds.join(',');
}

function syncSpecificTikTokOrders(data) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var requestId = getTikTokPushRequestId_(data || {});
    var requestKey = getHashedRequestKey_('TIKTOK_PUSH_', requestId);
    var existingOrderId = PropertiesService.getScriptProperties().getProperty(requestKey);
    if (existingOrderId) {
      return {
        success: true,
        duplicate: true,
        orderId: existingOrderId,
        message: 'Lượt đẩy này đã tạo đơn ' + existingOrderId + ' từ trước.'
      };
    }

    var result = syncSpecificTikTokOrdersLocked_(data || {});
    if (result && result.success && result.orderId) {
      PropertiesService.getScriptProperties().setProperty(requestKey, result.orderId);
    }
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function syncSpecificTikTokOrdersLocked_(data) {
  const targetOrderIds = (data.orderIds || [])
    .map(id => String(id || '').trim())
    .filter(Boolean);
  const targetOrderSet = new Set(targetOrderIds);
  const feeOnlyOrders = Array.isArray(data.feeOnlyOrders) ? data.feeOnlyOrders : [];
  const feeOnlyOrderFeeMap = {};
  const feeOnlyOrderIds = [];
  for (const item of feeOnlyOrders) {
    const orderId = String(item && item.orderId || '').trim();
    if (!orderId || targetOrderSet.has(orderId)) continue;
    if (feeOnlyOrderIds.indexOf(orderId) === -1) feeOnlyOrderIds.push(orderId);
    const fee = parseNum((item && (item.fee || item.amount || item.feeValue)) || 0);
    if (fee > 0) feeOnlyOrderFeeMap[orderId] = (feeOnlyOrderFeeMap[orderId] || 0) + fee;
  }
  const feeOnlyOrderSet = new Set(feeOnlyOrderIds);
  if (targetOrderIds.length === 0 && feeOnlyOrderIds.length === 0) {
    return { success: false, error: 'Không có danh sách mã đơn' };
  }

  // Đọc Mapping SKU (A=SKU TikTok, B=SKU App, C=Tên, D=SL gốc, E=SKU Quà, F=Kiểu giá)
  const mappingSheet = getSheet('Mapping SKU');
  const mappingData = mappingSheet.getDataRange().getValues();
  const mapping = {};
  for (let i = 1; i < mappingData.length; i++) {
    const skuTK = String(mappingData[i][0] || '').trim();
    if (!skuTK) continue;
    if (!mapping[skuTK]) mapping[skuTK] = [];
    mapping[skuTK].push({
      skuApp: String(mappingData[i][1] || '').trim(),
      name: String(mappingData[i][2] || '').trim(),
      qtyBase: parseNum(mappingData[i][3]) || 1,
      giftSku: String(mappingData[i][4] || '').trim(),
      priceMode: String(mappingData[i][5] || '').trim()
    });
  }

  // Build map SKU → tên SP từ sheet "Sản phẩm"
  const prodSheetS = getSheet('Sản phẩm');
  const prodDataS = prodSheetS.getDataRange().getValues();
  const prodCmS = buildColMap(prodDataS[0]);
  const skuToNameS = {};
  for (let i = 1; i < prodDataS.length; i++) {
    const s = String(prodDataS[i][prodCmS[PROD_COL.SKU]] || '').trim();
    const n = String(prodDataS[i][prodCmS[PROD_COL.NAME]] || '').trim();
    if (s) skuToNameS[s] = n;
  }

  // Đọc dữ liệu từ sheet TikTok
  const tkSS = SpreadsheetApp.openById(TIKTOK_SS_ID);
  const tkSheet = tkSS.getSheetByName(TIKTOK_SHEET_NAME);
  if (!tkSheet) return { success: false, error: 'Không tìm thấy sheet "' + TIKTOK_SHEET_NAME + '"' };

  // Đọc Quy Ước để lấy giá đơn vị theo App SKU
  const quyUocPrice = {};
  const quSheet = tkSS.getSheetByName('Quy Ước');
  if (quSheet) {
    const quData = quSheet.getDataRange().getValues();
    for (let i = 1; i < quData.length; i++) {
      const sku = String(quData[i][0] || '').trim();
      const price = parseNum(quData[i][2]);
      if (sku && price) quyUocPrice[sku] = price;
    }
  }

  const lastRow = tkSheet.getLastRow();
  const startRow = Math.max(2, lastRow - 3000);
  const numRows = lastRow - startRow + 1;
  const tkData = tkSheet.getRange(startRow, 1, numRows, 16).getValues();

  // Thu thập tất cả items từ tất cả đơn, gộp theo sellerSku
  const globalGrouped = {};
  let totalRevenue = 0;
  let totalFee = 0;
  let totalAfterFee = 0;
  let totalFeeOnly = 0;
  const processedOrderIds = [];
  const processedFeeOnlyOrderIds = [];
  const blockedReconcileOrderIds = [];
  const notFoundSkus = [];

  let curId = '';
  let curReconcileType = '';
  for (let i = 0; i < tkData.length; i++) {
    const cellId = String(tkData[i][0] || '').trim(); 
    if (cellId) {
      curId = cellId;
      curReconcileType = normalizeTikTokReconcileType(tkData[i][14]);
    }
    if (!curId) continue;

    const isTargetOrder = targetOrderSet.has(curId);
    const isFeeOnlyOrder = feeOnlyOrderSet.has(curId) && !isTargetOrder;
    if (!isTargetOrder && !isFeeOnlyOrder) continue;

    if (isTargetOrder && isBlockingTikTokReconcileType(curReconcileType)) {
      if (blockedReconcileOrderIds.indexOf(curId) === -1) blockedReconcileOrderIds.push(curId);
      continue;
    }

    const fee = parseNum(tkData[i][5]);
    if (isFeeOnlyOrder) {
      if (fee > 0) {
        totalFee += fee;
        totalFeeOnly += fee;
      }
      if (processedFeeOnlyOrderIds.indexOf(curId) === -1) {
        processedFeeOnlyOrderIds.push(curId);
      }
      continue;
    }
    
    // Bỏ qua đơn hoàn (doanh thu <= 0)
    const revenue = parseNum(tkData[i][4]);
    if (revenue <= 0) continue;
    
    const sellerSku = String(tkData[i][10] || '').trim(); 
    if (!sellerSku) continue;

    if (processedOrderIds.indexOf(curId) === -1) {
      processedOrderIds.push(curId);
    }

    const qty = parseNum(tkData[i][2]) || 1;
    const price = parseNum(tkData[i][3]);
    const afterFee = parseNum(tkData[i][8]);
    const mappingApplied = isBotMappedTikTokRow(tkData[i][15]);

    const groupKey = sellerSku + '|' + price + '|' + (mappingApplied ? 'mapped' : 'legacy');
    if (!globalGrouped[groupKey]) {
      globalGrouped[groupKey] = {
        sellerSku: sellerSku,
        productName: String(tkData[i][1] || '').trim(),
        qty: qty,
        price: price,
        revenue: revenue,
        fee: fee,
        afterFee: afterFee,
        mappingApplied: mappingApplied
      };
    } else {
      globalGrouped[groupKey].qty += qty;
      globalGrouped[groupKey].revenue += revenue;
      globalGrouped[groupKey].fee += fee;
      globalGrouped[groupKey].afterFee += afterFee;
    }
  }

  for (const feeOnlyId of feeOnlyOrderIds) {
    if (processedFeeOnlyOrderIds.indexOf(feeOnlyId) === -1 && feeOnlyOrderFeeMap[feeOnlyId] > 0) {
      totalFee += feeOnlyOrderFeeMap[feeOnlyId];
      totalFeeOnly += feeOnlyOrderFeeMap[feeOnlyId];
      processedFeeOnlyOrderIds.push(feeOnlyId);
    }
  }

  if (processedOrderIds.length === 0 && processedFeeOnlyOrderIds.length === 0) {
    if (blockedReconcileOrderIds.length > 0) {
      return { success: false, error: 'Các đơn đang có Loại đối soát ngoại lệ, không đẩy sang SalesApp: ' + blockedReconcileOrderIds.join(', ') };
    }
    return { success: false, error: 'Không tìm thấy đơn nào trong sheet TikTok' };
  }

  // Tính tổng và tạo danh sách items cho đơn
  const orderItems = [];
  for (const item of Object.values(globalGrouped)) {
    totalRevenue += item.revenue;
    totalFee += item.fee;
    totalAfterFee += item.afterFee || 0;

    const mapped = mapping[item.sellerSku];
    if (item.mappingApplied) {
      orderItems.push({
        sku: item.sellerSku,
        name: skuToNameS[item.sellerSku] || item.productName || item.sellerSku,
        qty: item.qty,
        price: item.price
      });
    } else if (!mapped) {
      notFoundSkus.push(item.sellerSku);
      orderItems.push({
        sku: item.sellerSku,
        name: item.productName || item.sellerSku,
        qty: item.qty,
        price: item.price
      });
    } else {
      for (const m of mapped) {
        // 1:1 đơn giản (qtyBase=1): dùng giá TikTok thực tế (bắt biến động giá)
        // Bundle (qtyBase>1) hoặc Combo (nhiều App SKU): tra giá đơn vị từ Quy Ước
        const usePrice = resolveTikTokMappedPrice(item, m, mapped, quyUocPrice);
        orderItems.push({
          sku: m.skuApp,
          name: skuToNameS[m.skuApp] || m.name,
          qty: item.qty * m.qtyBase,
          price: usePrice
        });
      }
      // Thêm quà tặng nếu có — gift SKU cũng đi qua Mapping để ra đúng App SKU và SL gốc
      const giftSku = mapped[0].giftSku;
      if (giftSku) {
        const giftMapped = mapping[giftSku];
        if (giftMapped) {
          for (const gm of giftMapped) {
            orderItems.push({
              sku: gm.skuApp,
              name: skuToNameS[gm.skuApp] || gm.name,
              qty: item.qty * gm.qtyBase,
              price: 0
            });
          }
        } else {
          orderItems.push({
            sku: giftSku,
            name: skuToNameS[giftSku] || giftSku,
            qty: item.qty,
            price: 0
          });
        }
      }
    }
  }

  // Gộp orderItems theo sku+giá: cùng SKU nhưng khác giá → để riêng (ví dụ BMFOLATE90V 280k vs 275k)
  const finalItems = {};
  for (const it of orderItems) {
    const key = it.sku + '|' + it.price;
    if (!finalItems[key]) {
      finalItems[key] = { ...it };
    } else {
      finalItems[key].qty += it.qty;
    }
  }

  // Tạo 1 đơn tổng duy nhất
  const orderSheet = getSheet('Đơn hàng');
  const itemSheet = getSheet('Chi tiết đơn');
  
  const now = new Date();
  const dateStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  const orderId = 'TK' + dateStr + String(orderSheet.getLastRow() + 1).padStart(4, '0');
  const timeStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
  const allProcessedOrderIds = processedOrderIds.concat(processedFeeOnlyOrderIds);
  const noteKey = 'TK:' + allProcessedOrderIds.join(',');

  // Tìm hoặc tạo khách hàng "Khách TikTok"
  const custSheet = getSheet('Khách hàng');
  const custData = custSheet.getDataRange().getValues();
  let tkCustId = '';
  let tkCustName = 'Khách TikTok';
  for (let c = 1; c < custData.length; c++) {
    const cName = String(custData[c][3] || '').trim().toLowerCase();
    if (cName.includes('tiktok') || cName.includes('khách tiktok')) {
      tkCustId = String(custData[c][2] || '').trim();
      tkCustName = String(custData[c][3] || '').trim();
      break;
    }
  }
  if (!tkCustId) {
    tkCustId = 'KHTK' + String(custSheet.getLastRow()).padStart(4, '0');
    custSheet.appendRow([
      'Cá nhân', 'Chi nhánh trung tâm',
      tkCustId, 'Khách TikTok', '', '',
      '', '', '', '', '', '', '', '', '', '', '', 'TikTok Sync'
    ]);
  }

  const finalTotal = totalAfterFee > 0 ? (totalAfterFee - totalFeeOnly) : (totalRevenue - totalFee);
  const totalDeduction = Math.max(0, totalRevenue - finalTotal);

  orderSheet.appendRow([
    orderId, timeStr,
    tkCustId, tkCustName, '', '',
    totalRevenue, totalDeduction, finalTotal,
    'Thuế Sàn', 'Chờ đối chiếu', noteKey, 'TikTok Sync',
    'Thuế Sàn'
  ]);

  for (const it of Object.values(finalItems)) {
    appendItemRow(itemSheet, [orderId, it.sku, it.name, it.qty, it.price, it.qty * it.price]);
  }

  return {
    success: true,
    orderId: orderId,
    synced: 1,
    skipped: 0,
    orderCount: allProcessedOrderIds.length,
    normalOrderCount: processedOrderIds.length,
    feeOnlyOrderCount: processedFeeOnlyOrderIds.length,
    blockedReconcileCount: blockedReconcileOrderIds.length,
    blockedReconcileOrderIds: blockedReconcileOrderIds,
    itemCount: Object.keys(finalItems).length,
    notFound: [...new Set(notFoundSkus)],
    message: 'Đã tạo 1 đơn tổng từ ' + processedOrderIds.length + ' đơn TikTok'
      + (processedFeeOnlyOrderIds.length ? ', cộng phí ' + processedFeeOnlyOrderIds.length + ' đơn bom hàng' : '')
      + ', ' + Object.keys(finalItems).length + ' sản phẩm.'
  };
}

// Sửa tất cả #ERROR! trong cột Tên SP của "Chi tiết đơn" — chạy 1 lần sau deploy
function fixItemNames() {
  var itemSheet = getSheet('Chi tiết đơn');
  var prodSheet = getSheet('Sản phẩm');
  var prodData = prodSheet.getDataRange().getValues();
  var prodCm = buildColMap(prodData[0]);
  var skuToName = {};
  for (var i = 1; i < prodData.length; i++) {
    var s = String(prodData[i][prodCm[PROD_COL.SKU]] || '').trim();
    var n = String(prodData[i][prodCm[PROD_COL.NAME]] || '').trim();
    if (s) skuToName[s] = n;
  }

  var lastRow = itemSheet.getLastRow();
  if (lastRow < 2) return { success: true, fixed: 0 };

  var skuCol = itemSheet.getRange(2, 2, lastRow - 1, 1).getValues();       // Cột B: Mã SP
  var nameCol = itemSheet.getRange(2, 3, lastRow - 1, 1).getDisplayValues(); // Cột C: Tên SP (hiển thị)

  var fixed = 0;
  for (var r = 0; r < nameCol.length; r++) {
    var displayed = String(nameCol[r][0] || '').trim();
    if (displayed === '#ERROR!' || displayed === '') {
      var sku = String(skuCol[r][0] || '').trim();
      var correctName = skuToName[sku] || sku;
      if (correctName) {
        itemSheet.getRange(r + 2, 3).setValue(correctName);
        fixed++;
      }
    }
  }

  return { success: true, fixed: fixed, message: 'Đã sửa ' + fixed + ' dòng tên sản phẩm.' };
}
