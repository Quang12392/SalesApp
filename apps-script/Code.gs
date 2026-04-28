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
      case 'getOrders':    result = getOrders(); break;
      case 'getReturns':   result = getReturns(); break;
      case 'getStats':     result = getStats(); break;
      case 'getUsers':     result = getUsers(); break;
      case 'getRoles':     result = getRoles(); break;
      case 'getBatches':   result = getBatches(); break;
      case 'getImages':    result = getProductImages(); break;
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
      case 'syncTikTok':         result = syncTikTokOrders(); break;
      case 'confirmTikTokOrder': result = confirmTikTokOrder(data); break;
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

// ═══════════════════════════════════════
// PRODUCTS — Mapping theo sheet "Sản phẩm"
// Cols: A=Loại hàng, B=Nhóm hàng, C=Mã hàng, D=Mã vạch, E=Tên hàng, F=Thương hiệu, G=Giá bán, H=Giá vốn, I=Tồn kho
// ═══════════════════════════════════════
function getProducts() {
  const sheet = getSheet('Sản phẩm');
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };

  const products = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const sku = String(r[2] || '').trim();
    if (!sku) continue;
    products.push({
      id: sku,
      sku: sku,
      name: String(r[4] || '').trim(),
      category: String(r[1] || '').trim(),
      sellPrice: parseNum(r[6]),
      costPrice: parseNum(r[7]),
      stock: parseNum(r[8]),
      unit: 'hộp',
      brand: String(r[5] || '').trim(),
      rowIndex: i + 1
    });
  }
  return { success: true, data: products };
}

function addProduct(data) {
  const sheet = getSheet('Sản phẩm');
  const sku = String(data.sku || '').trim();
  const stock = parseNum(data.stock);
  const cost = parseNum(data.costPrice);
  
  // Kiểm tra trùng SKU
  if (sku) {
    const allData = sheet.getDataRange().getValues();
    for (let i = 1; i < allData.length; i++) {
      if (String(allData[i][2]).trim() === sku) {
        return { success: false, error: 'Mã hàng (SKU) "' + sku + '" đã tồn tại! Vui lòng dùng mã khác.' };
      }
    }
  }
  
  sheet.appendRow([
    'Hàng hóa',
    data.category || '',
    sku,
    '',
    data.name || '',
    data.brand || '',
    data.sellPrice || 0,
    cost,
    stock,
    0, '--'
  ]);
  
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
  const searchSku = data.oldSku || data.sku;
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][2]).trim() === searchSku) {
      const row = i + 1;
      if (data.newSku !== undefined)    sheet.getRange(row, 3).setValue(data.newSku);
      if (data.name !== undefined)      sheet.getRange(row, 5).setValue(data.name);
      if (data.category !== undefined)  sheet.getRange(row, 2).setValue(data.category);
      if (data.sellPrice !== undefined) sheet.getRange(row, 7).setValue(data.sellPrice);
      if (data.costPrice !== undefined) sheet.getRange(row, 8).setValue(data.costPrice);
      
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
          var adjCost = parseNum(data.costPrice || allData[i][7]);
          batchSheet2.appendRow([
            'LOT-ADJ-' + sku + '-' + Utilities.formatDate(now2, 'Asia/Ho_Chi_Minh', 'ddMMyyyyHHmm'),
            sku, data.name || allData[i][4], diff, diff, adjCost,
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
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][2]).trim() === data.sku) {
      sheet.deleteRow(i + 1);
      // Zero hết tồn kho lô — giữ lại lịch sử để phục vụ trả hàng
      try {
        const batchSheet = getBatchSheet();
        const batchData = batchSheet.getDataRange().getValues();
        for (let b = 1; b < batchData.length; b++) {
          if (String(batchData[b][1]).trim() === data.sku && parseNum(batchData[b][4]) > 0) {
            batchSheet.getRange(b + 1, 5).setValue(0); // SL còn = 0
            batchSheet.getRange(b + 1, 9).setValue('SP đã xóa - giữ lịch sử');
          }
        }
      } catch(e) {}
      // Ghi thông báo
      addNotificationRow('product_del', '🗑️ Xóa SP: ' + String(allData[i][4]) + ' (' + data.sku + ')', '', data.sku);

      return { success: true, message: 'Đã xóa SP (lô hàng giữ lại lịch sử)' };
    }
  }
  return { success: false, error: 'Không tìm thấy' };
}

// ═══════════════════════════════════════
// PRODUCT IMAGES — Sheet "Ảnh SP" (A=SKU, B=Base64)
// ═══════════════════════════════════════
function getImageSheet() {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName('Ảnh SP');
  if (!sheet) {
    sheet = ss.insertSheet('Ảnh SP');
    sheet.appendRow(['SKU', 'Base64']);
  }
  return sheet;
}

function getProductImages() {
  const sheet = getImageSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: {} };
  const images = {};
  for (let i = 1; i < data.length; i++) {
    const sku = String(data[i][0] || '').trim();
    if (sku && data[i][1]) images[sku] = data[i][1];
  }
  return { success: true, data: images };
}

function saveProductImage(data) {
  const sheet = getImageSheet();
  const sku = String(data.sku || '').trim();
  if (!sku || !data.base64) return { success: false, error: 'Thiếu SKU hoặc ảnh' };
  
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]).trim() === sku) {
      sheet.getRange(i + 1, 2).setValue(data.base64);
      return { success: true, message: 'Đã cập nhật ảnh' };
    }
  }
  sheet.appendRow([sku, data.base64]);
  return { success: true, message: 'Đã lưu ảnh' };
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
  return { success: true, message: 'Đã xóa ảnh' };
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
function getOrders() {
  const sheet = getSheet('Đơn hàng');
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };

  const itemSheet = getSheet('Chi tiết đơn');
  const itemData = itemSheet.getDataRange().getValues();

  const orders = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const orderId = String(r[0]);
    const items = [];
    for (let j = 1; j < itemData.length; j++) {
      if (String(itemData[j][0]) === orderId) {
        items.push({ sku: itemData[j][1], name: itemData[j][2], qty: itemData[j][3], price: itemData[j][4], costPrice: itemData[j][6] || 0 });
      }
    }
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
      items: items
    });
  }
  return { success: true, data: orders.reverse() };
}

function createOrder(data) {
  const orderSheet = getSheet('Đơn hàng');
  const itemSheet = getSheet('Chi tiết đơn');

  const now = new Date();
  const dateStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  const timeStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
  const orderId = 'DH' + dateStr + String(orderSheet.getLastRow()).padStart(3, '0');

  // Column N: Thuế flag
  var taxCol = '';
  if (data.payment === 'Thuế Sàn') taxCol = 'Thuế Sàn';
  else if (data.tax) taxCol = 'Thuế';

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
        data.finalTotal || 0,
        orderId
      ]);
    }
  }

  // Thêm chi tiết + trừ tồn kho theo LÔ (FIFO)
  if (data.items && data.items.length > 0) {
    for (const item of data.items) {
      // deductBatchesFIFO trả về tổng giá vốn FIFO chính xác
      const fifoCost = deductBatchesFIFO(item.sku, item.qty);
      itemSheet.appendRow([orderId, item.sku || '', item.name, item.qty, item.price, item.qty * item.price, fifoCost]);
    }
  }

  // Ghi thông báo
  addNotificationRow('order', '🛒 Đơn mới ' + orderId + ' - ' + (data.customerName || 'Khách lẻ') + ' - ' + fmtMoney(data.finalTotal || 0), data.createdBy || 'Admin', orderId);

  return { success: true, orderId: orderId, message: 'Đã tạo đơn hàng ' + orderId };
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
  
  // Custom import date → format DD/MM/YYYY HH:mm
  var importDate = timeStr;
  if (data.importDate) {
    var d = new Date(data.importDate);
    d.setHours(now.getHours(), now.getMinutes());
    importDate = Utilities.formatDate(d, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
  }

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

function updateBatch(data) {
  const sheet = getBatchSheet();
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]).trim() === String(data.batchId).trim()) {
      const row = i + 1;
      const sku = String(allData[i][1]).trim();
      if (data.costPrice !== undefined) sheet.getRange(row, 6).setValue(parseNum(data.costPrice));
      if (data.qtyRemaining !== undefined) sheet.getRange(row, 5).setValue(parseNum(data.qtyRemaining));
      if (data.note !== undefined) sheet.getRange(row, 9).setValue(data.note);
      // Ghi timestamp sửa lần cuối vào cột J
      var now = new Date();
      sheet.getRange(row, 10).setValue(Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm'));
      syncProductFromBatches(sku);
      // Ghi thông báo
      addNotificationRow('batch', '✏️ Sửa lô ' + data.batchId + ' - ' + String(allData[i][2]), '', data.batchId);

      return { success: true, message: 'Đã cập nhật lô ' + data.batchId };
    }
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

  for (let i = 1; i < prodData.length; i++) {
    const sku = String(prodData[i][2]).trim();
    const stock = parseNum(prodData[i][8]);
    const cost = parseNum(prodData[i][7]);
    if (!sku || stock <= 0 || existingSkus.has(sku)) continue;

    const batchId = 'LOT-INIT-' + String(count + 1).padStart(3, '0');
    batchSheet.appendRow([
      batchId, sku, String(prodData[i][4]), stock, stock, cost,
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

  return totalFifoCost; // Trả về tổng giá vốn FIFO
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
  for (let i = 1; i < prodData.length; i++) {
    if (String(prodData[i][2]).trim() === String(sku).trim()) {
      prodSheet.getRange(i + 1, 9).setValue(totalQty);  // Cột I = Tồn kho
      prodSheet.getRange(i + 1, 8).setValue(avgCost);    // Cột H = Giá vốn
      break;
    }
  }
}

// ═══════════════════════════════════════
// RETURNS — Trả hàng
// ═══════════════════════════════════════
function handleReturnOrder(data) {
  const ss = SpreadsheetApp.openById(SS_ID);
  
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

  const dateStr = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');

  // Ghi phiếu trả hàng
  returnSheet.appendRow([
    data.returnId || '',
    data.orderId || '',
    data.customerName || 'Khách lẻ',
    data.customerId || '',
    JSON.stringify(data.items || []),
    data.returnTotal || 0,
    data.note || '',
    data.createdBy || '',
    dateStr
  ]);

  // Cộng lại tồn kho — tạo lô trả hàng + kiểm tra SP đã xóa
  if (data.items) {
    const batchSheet = getBatchSheet();
    const timeStr = dateStr;
    const prodSheet = getSheet('Sản phẩm');
    const prodData = prodSheet.getDataRange().getValues();
    
    data.items.forEach(item => {
      const sku = String(item.sku).trim();
      
      // Kiểm tra SP còn tồn tại không
      var prodExists = false;
      for (var pi = 1; pi < prodData.length; pi++) {
        if (String(prodData[pi][2]).trim() === sku) { prodExists = true; break; }
      }
      
      // Khôi phục SP từ Lô hàng nếu đã bị xóa
      if (!prodExists && sku) {
        // Lấy thông tin từ lô hàng
        var batchData = batchSheet.getDataRange().getValues();
        var bName = item.name || '', bCost = 0, bSell = 0;
        for (var bi = 1; bi < batchData.length; bi++) {
          if (String(batchData[bi][1]).trim() === sku) {
            bName = bName || String(batchData[bi][2]);
            bCost = parseNum(batchData[bi][5]) || bCost;
            bSell = parseNum(batchData[bi][10]) || bSell;
          }
        }
        // Tạo lại SP
        prodSheet.appendRow([
          'Hàng hóa', 'Dùng ngoài', sku, '', bName, '',
          bSell || item.price || 0, bCost, 0
        ]);
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
      
      const batchId = 'LOT-RTN-' + (data.returnId || 'X');
      batchSheet.appendRow([
        batchId, sku, item.name || '', item.qty, item.qty,
        returnCost, timeStr, data.createdBy || '', 'Trả hàng từ ' + (data.orderId || ''), '', item.price || 0
      ]);
      syncProductFromBatches(sku);
    });
  }

  // Ghi thông báo
  addNotificationRow('return', '↩️ Trả hàng ' + (data.orderId || '') + ' - ' + fmtMoney(data.returnTotal || 0), data.createdBy || 'Admin', data.returnId || '');

  return { success: true, returnId: data.returnId, message: 'Đã tạo phiếu trả hàng ' + data.returnId };
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
  
  // Format sheet Sản phẩm — cột G(Giá bán), H(Giá vốn), I(Tồn kho)
  const prodSheet = ss.getSheetByName('Sản phẩm');
  if (prodSheet) {
    const lastRow = prodSheet.getLastRow();
    if (lastRow > 1) {
      // Giá bán (G) & Giá vốn (H) — format tiền
      prodSheet.getRange(2, 7, lastRow - 1, 2).setNumberFormat('#.##0');
      // Tồn kho (I) — format số nguyên
      prodSheet.getRange(2, 9, lastRow - 1, 1).setNumberFormat('#.##0');
      // KH đặt (J)
      prodSheet.getRange(2, 10, lastRow - 1, 1).setNumberFormat('#.##0');
    }
  }
  
  Logger.log('✅ Đã format xong tất cả số sang dấu chấm!');
  return 'Done!';
}

// ═══════════════════════════════════════════════════════════════
// TIKTOK SYNC — Đồng bộ đơn từ TikTok Sheet → SalesApp
// ═══════════════════════════════════════════════════════════════

function syncTikTokOrders() {
  // 1. Đọc bảng Mapping SKU
  const mappingSheet = getSheet('Mapping SKU');
  const mappingData = mappingSheet.getDataRange().getValues();
  const mapping = {}; // skuTikTok -> [{skuApp, name, price, qtyBase}]
  for (let i = 1; i < mappingData.length; i++) {
    const skuTK = String(mappingData[i][0] || '').trim();
    if (!skuTK) continue;
    if (!mapping[skuTK]) mapping[skuTK] = [];
    mapping[skuTK].push({
      skuApp: String(mappingData[i][1] || '').trim(),
      name: String(mappingData[i][2] || '').trim(),
      price: parseNum(mappingData[i][3]),
      qtyBase: parseNum(mappingData[i][4]) || 1
    });
  }

  // 2. Đọc TikTok sheet (chỉ lấy 500 dòng cuối để tránh timeout)
  const tkSS = SpreadsheetApp.openById(TIKTOK_SS_ID);
  const tkSheet = tkSS.getSheetByName(TIKTOK_SHEET_NAME);
  if (!tkSheet) return { success: false, error: 'Không tìm thấy sheet "' + TIKTOK_SHEET_NAME + '"' };
  const lastRow = tkSheet.getLastRow();
  const startRow = Math.max(2, lastRow - 499); // Lấy 500 dòng cuối
  const numRows = lastRow - startRow + 1;
  const numCols = 15; // A-O
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
      status: String(tkData[i][9] || '').trim()        // Col J = Trạng Thái Hàng
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
      if (!mapped) {
        notFoundSkus.push(item.sellerSku);
        orderItems.push({
          sku: item.sellerSku,
          name: item.productName || item.sellerSku,
          qty: item.qty,
          price: item.price
        });
      } else {
        for (const m of mapped) {
          orderItems.push({
            sku: m.skuApp,
            name: m.name,
            qty: item.qty * m.qtyBase,
            price: item.price // Dùng giá TikTok thực tế, không dùng giá mapping
          });
        }
      }
    }

    // Tạo mã đơn TikTok
    const now = new Date();
    const dateStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
    const orderId = 'TK' + dateStr + String(orderSheet.getLastRow() + 1).padStart(4, '0');
    const timeStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy');

    // Ghi vào Đơn hàng:
    // G=Tổng tiền (doanh thu gốc), H=Phí sàn (giảm giá), I=Thành tiền (sau trừ phí)
    orderSheet.appendRow([
      orderId, timeStr,
      '', 'Khách TikTok', '', '',
      totalRevenue, totalFee, totalRevenue - totalFee,
      'Thuế Sàn', 'Chờ đối chiếu', noteKey, 'TikTok Sync',
      'Thuế Sàn'
    ]);

    // Ghi chi tiết đơn (CHƯA trừ tồn kho)
    for (const it of orderItems) {
      itemSheet.appendRow([orderId, it.sku, it.name, it.qty, it.price, it.qty * it.price]);
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

// Xác nhận đơn TikTok → chuyển trạng thái + trừ tồn kho
function confirmTikTokOrder(data) {
  const orderId = String(data.orderId || '').trim();
  if (!orderId) return { success: false, error: 'Thiếu mã đơn' };

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

  // Đọc chi tiết đơn → trừ tồn kho
  const itemSheet = getSheet('Chi tiết đơn');
  const allItems = itemSheet.getDataRange().getValues();
  for (let i = 1; i < allItems.length; i++) {
    if (String(allItems[i][0]).trim() === orderId) {
      const sku = String(allItems[i][1]).trim();
      const qty = parseNum(allItems[i][3]);
      if (sku && qty > 0) {
        deductBatchesFIFO(sku, qty);
      }
    }
  }

  // Cập nhật trạng thái → completed
  orderSheet.getRange(orderRow, 11).setValue('completed');

  return { success: true, message: 'Đã xác nhận đơn ' + orderId + ' và trừ tồn kho' };
}
