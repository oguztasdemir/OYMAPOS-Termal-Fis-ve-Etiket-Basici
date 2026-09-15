// ==========================================================================
// REST API İSTEMCİSİ - api.js
// ==========================================================================

const API = {
  // 1. Ağ & QR & Bağlı Cihazlar
  async getNetworkInfo() {
    const res = await fetch('/api/network/info');
    return await res.json();
  },

  async getConnectedDevices() {
    const res = await fetch('/api/network/devices');
    return await res.json();
  },

  async getDeviceData(deviceId) {
    const res = await fetch(`/api/network/devices/${encodeURIComponent(deviceId)}/data`);
    return await res.json();
  },

  async registerDevice(deviceData = {}) {
    const res = await fetch('/api/network/register-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deviceData)
    });
    return await res.json();
  },

  // 2. Yazıcı İşlemleri
  async getPrinters() {
    const res = await fetch('/api/printers');
    return await res.json();
  },

  async getPrinterStatus() {
    const res = await fetch('/api/printer/status');
    return await res.json();
  },

  async getPrintHistory(limit = 50) {
    const res = await fetch(`/api/printer/history?limit=${limit}`);
    return await res.json();
  },

  async savePrinterSettings(settings) {
    const res = await fetch('/api/printer/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    return await res.json();
  },

  async testPrint() {
    const res = await fetch('/api/printer/test', { method: 'POST' });
    return await res.json();
  },

  async purgePrinterQueue() {
    const res = await fetch('/api/printer/purge', { method: 'POST' });
    return await res.json();
  },

  // 3. Ürün İşlemleri
  async getProducts(query = '', onlyNew = false, onlyDiff = false, limit = 0, onlyBlacklist = false) {
    const newParam = onlyNew ? '&only_new=true' : '';
    const diffParam = onlyDiff ? '&only_diff=true' : '';
    const blParam = onlyBlacklist ? '&only_blacklist=true' : '';
    const limitParam = limit > 0 ? `&limit=${limit}` : '';
    const res = await fetch(`/api/products?q=${encodeURIComponent(query)}${limitParam}${newParam}${diffParam}${blParam}`);
    return await res.json();
  },

  async searchProducts(query = '', limit = 0, onlyNew = false, onlyDiff = false, onlyBlacklist = false) {
    const newParam = onlyNew ? '&only_new=true' : '';
    const diffParam = onlyDiff ? '&only_diff=true' : '';
    const blParam = onlyBlacklist ? '&only_blacklist=true' : '';
    const limitParam = limit > 0 ? `&limit=${limit}` : '';
    const res = await fetch(`/api/products?q=${encodeURIComponent(query)}${limitParam}${newParam}${diffParam}${blParam}`);
    return await res.json();
  },

  async getProduct(barcode) {
    const res = await fetch(`/api/products/${encodeURIComponent(barcode)}`);
    return await res.json();
  },

  async updateProduct(barcode, data) {
    const res = await fetch(`/api/products/${encodeURIComponent(barcode)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async getProductHistory(barcode) {
    const res = await fetch(`/api/products/${encodeURIComponent(barcode)}/history`);
    return await res.json();
  },

  async revertProductHistory(historyId) {
    const res = await fetch(`/api/products/history/${encodeURIComponent(historyId)}/revert`, {
      method: 'POST'
    });
    return await res.json();
  },

  async syncLabelPrices() {
    const res = await fetch('/api/products/sync-label-prices', { method: 'POST' });
    return await res.json();
  },

  async confirmProductPrinted(barcode) {
    const res = await fetch(`/api/products/${encodeURIComponent(barcode)}/confirm-printed`, { method: 'POST' });
    return await res.json();
  },

  async toggleBlacklist(barcode) {
    const res = await fetch(`/api/products/${encodeURIComponent(barcode)}/toggle-blacklist`, { method: 'POST' });
    return await res.json();
  },

  async batchBlacklist(barcodes, action = 'add') {
    const res = await fetch('/api/products/batch-blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcodes, action })
    });
    return await res.json();
  },

  // 4. Baskı İşlemleri
  getSelectedPrinter() {
    const sel = document.getElementById('topbarPrinterSelect');
    if (sel && sel.value) return sel.value;
    const settingsSel = document.getElementById('printerSelect');
    if (settingsSel && settingsSel.value) return settingsSel.value;
    return localStorage.getItem('selected_printer') || null;
  },

  async printSingle(productData, copies = 1, targetPrinter = null) {
    const printer = targetPrinter || this.getSelectedPrinter();
    const payload = { ...productData, copies };
    if (printer) payload.printer = printer;
    const res = await fetch('/api/print/single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  },

  async printBatch(products, copies = 1, targetPrinter = null) {
    const printer = targetPrinter || this.getSelectedPrinter();
    const payload = { products, copies };
    if (printer) payload.printer = printer;
    const res = await fetch('/api/print/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  },

  async mobileScan(barcode, autoPrint = true, copies = 1, targetPrinter = null) {
    const printer = targetPrinter || this.getSelectedPrinter();
    const payload = { barcode, auto_print: autoPrint, copies };
    if (printer) payload.printer = printer;
    const res = await fetch('/api/print/mobile_scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  },

  // 5. kasa_aktarim Senkronizasyon (Stok, Fiyat Değişimi & Yeni Ürünler)
  async previewkasa_aktarim(file, deviceName = '') {
    const formData = new FormData();
    formData.append('file', file);
    if (deviceName && deviceName.trim()) {
      formData.append('device_name', deviceName.trim());
    }
    const res = await fetch('/api/kasa_aktarim/preview', {
      method: 'POST',
      body: formData
    });
    return await res.json();
  },

  async confirmkasa_aktarimSync(items, sourceName = '', deviceName = '') {
    const res = await fetch('/api/kasa_aktarim/confirm-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items,
        source_name: sourceName,
        device_name: deviceName
      })
    });
    return await res.json();
  },

  async uploadkasa_aktarim(file, deviceName = '') {
    const formData = new FormData();
    formData.append('file', file);
    if (deviceName && deviceName.trim()) {
      formData.append('device_name', deviceName.trim());
    }
    const res = await fetch('/api/kasa_aktarim/upload', {
      method: 'POST',
      body: formData
    });
    return await res.json();
  },

  async getPriceChanges(unprintedOnly = false) {
    const res = await fetch(`/api/kasa_aktarim/changes?unprinted=${unprintedOnly}`);
    return await res.json();
  },

  async printPriceChanges() {
    const res = await fetch('/api/kasa_aktarim/print_changes', { method: 'POST' });
    return await res.json();
  },

  async getNewProducts(unprintedOnly = false) {
    const res = await fetch(`/api/kasa_aktarim/new-products?unprinted=${unprintedOnly}`);
    return await res.json();
  },

  async printNewProducts() {
    const res = await fetch('/api/kasa_aktarim/print_new_products', { method: 'POST' });
    return await res.json();
  },

  async getSyncHistory(limit = 50) {
    const res = await fetch(`/api/kasa_aktarim/sync-history?limit=${limit}`);
    return await res.json();
  },

  async rollbackSync(syncId) {
    const res = await fetch(`/api/kasa_aktarim/sync/${encodeURIComponent(syncId)}/rollback`, {
      method: 'POST'
    });
    return await res.json();
  },

  // 6. Etiket Şablonları & Varsayılan Yönetimi
  async getTemplates() {
    const res = await fetch('/api/templates');
    return await res.json();
  },

  async saveTemplate(tplData) {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tplData)
    });
    return await res.json();
  },

  async newTemplate(name, baseId = null) {
    const res = await fetch('/api/templates/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, base_id: baseId })
    });
    return await res.json();
  },

  async setDefaultTemplate(templateId) {
    const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}/set-default`, {
      method: 'POST'
    });
    return await res.json();
  },

  async deleteTemplate(templateId) {
    const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}`, {
      method: 'DELETE'
    });
    return await res.json();
  },

  // 7. Sistem, Yedekleme & Kapatma
  async restoreSystem(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/system/restore', {
      method: 'POST',
      body: formData
    });
    return await res.json();
  },

  async shutdownServer() {
    const res = await fetch('/api/system/shutdown', { method: 'POST' });
    return await res.json();
  }
};
