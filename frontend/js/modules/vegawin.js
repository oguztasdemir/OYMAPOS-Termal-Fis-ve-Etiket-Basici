// ==========================================================================
// OYMAPOS - kasa_aktarim DOSYA AKTARIMI, DEĞİŞİKLİK VE CİHAZ VERİ MASASI
// ==========================================================================

let cachedConnectedDevicesList = [];
let activeSelectedDeviceId = '';
let cachedSelectedDeviceData = null;

function initkasa_aktarimDropzone() {
  const dz = document.getElementById('vegaDropzone');
  if (!dz) return;

  ['dragenter', 'dragover'].forEach(eName => {
    dz.addEventListener(eName, e => { e.preventDefault(); dz.style.borderColor = '#6366f1'; });
  });
  ['dragleave', 'drop'].forEach(eName => {
    dz.addEventListener(eName, e => { e.preventDefault(); dz.style.borderColor = ''; });
  });

  dz.addEventListener('drop', e => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadkasa_aktarimFile(e.dataTransfer.files[0]);
    }
  });
}

function handleVegaFileSelect(files) {
  if (files && files.length > 0) {
    uploadkasa_aktarimFile(files[0]);
  }
}

async function uploadkasa_aktarimFile(file) {
  const progress = document.getElementById('vegaUploadProgress');
  const statusTxt = document.getElementById('vegaUploadStatus');

  if (progress) progress.style.display = 'block';
  if (statusTxt) statusTxt.textContent = 'kasa_aktarim dosyası yükleniyor ve işleniyor...';

  try {
    const res = await API.uploadkasa_aktarim(file);
    const data = res.data || res;
    if (progress) progress.style.display = 'none';

    if (res.status === 'success' || data.total_received !== undefined) {
      showToast(`Aktarım Başarılı! (${data.total_received || 0} Ürün, ${data.new_products || 0} Yeni, ${data.price_changes_count || 0} Fiyat Değişimi)`, 'success');
      searchProducts('');
      loadPriceChanges();
      loadNewProducts();
    } else {
      showToast('Hata: ' + (res.message || 'Dosya işlenemedi.'), 'error');
    }
  } catch (err) {
    if (progress) progress.style.display = 'none';
    showToast('Sunucu iletişim hatası: ' + err.message, 'error');
  }
}

function switchSyncView(viewType) {
  const tabChanges = document.getElementById('tabChangesToggle');
  const tabNew = document.getElementById('tabNewProdsToggle');
  const viewChanges = document.getElementById('syncChangesView');
  const viewNew = document.getElementById('syncNewProdsView');

  if (viewType === 'changes') {
    if (tabChanges) tabChanges.classList.add('active');
    if (tabNew) tabNew.classList.remove('active');
    if (viewChanges) viewChanges.style.display = 'block';
    if (viewNew) viewNew.style.display = 'none';
  } else {
    if (tabChanges) tabChanges.classList.remove('active');
    if (tabNew) tabNew.classList.add('active');
    if (viewChanges) viewChanges.style.display = 'none';
    if (viewNew) viewNew.style.display = 'block';
  }
}

async function loadPriceChanges() {
  try {
    const res = await API.getPriceChanges(true);
    const data = res.data || res;
    if (res.status === 'success' || data.changes) {
      renderChangesTable(data.changes || []);
      const count = data.count !== undefined ? data.count : (data.changes ? data.changes.length : 0);
      const countEl = document.getElementById('pendingChangesCount');
      const homeDiffEl = document.getElementById('homeInfoDiffStock');
      if (countEl && typeof animateCount === 'function') animateCount(countEl, count);
      if (homeDiffEl) homeDiffEl.textContent = count > 0 ? `${count} Değişim Var` : 'Tümü Güncel';
      const printAllBtn = document.getElementById('printAllChangesBtn');
      if (printAllBtn) printAllBtn.style.display = count > 0 ? 'inline-flex' : 'none';
    }
  } catch (err) {
    console.error('Fiyat değişimleri yüklenemedi:', err);
  }
}

function renderChangesTable(changes) {
  const tbody = document.getElementById('changesTableBody') || document.getElementById('priceChangesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (changes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 24px; text-align: center;">
          <div class="empty-state">
            <div class="empty-state-icon">✨</div>
            <div class="empty-state-title">Bekleyen Fiyat Değişimi Yok</div>
            <div class="empty-state-desc">Tüm etiketler güncel veya yeni dosya yüklenmedi.</div>
          </div>
        </td>
      </tr>`;
    return;
  }

  changes.forEach(c => {
    const tr = document.createElement('tr');
    const diffColor = c.diff_amount > 0 ? '#ef4444' : '#10b981';
    const diffSign = c.diff_amount > 0 ? '+' : '';
    tr.innerHTML = `
      <td class="col-barcode">${c.barcode}</td>
      <td class="col-title">${c.title}</td>
      <td style="color:var(--text-muted); text-decoration:line-through; text-align:right; font-family:var(--font-mono);">₺ ${Number(c.old_price).toFixed(2)}</td>
      <td class="col-price">₺ ${Number(c.new_price).toFixed(2)}</td>
      <td><span style="color:${diffColor}; font-weight:700; font-size:12px;">${diffSign}${c.diff_amount} TL (%${c.diff_percent})</span></td>
      <td class="col-action">
        <button class="btn-excel-print" onclick="printBarcode('${c.barcode}', this)">
          🖨️ Yazdır
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadNewProducts() {
  try {
    const res = await API.getNewProducts(true);
    const data = res.data || res;
    if (res.status === 'success' || data.new_products) {
      renderNewProductsTable(data.new_products || []);
      const count = data.count !== undefined ? data.count : (data.new_products ? data.new_products.length : 0);
      const countEl = document.getElementById('pendingNewProdsCount');
      if (countEl && typeof animateCount === 'function') animateCount(countEl, count);
      const printAllBtn = document.getElementById('printAllNewProdsBtn');
      if (printAllBtn) printAllBtn.style.display = count > 0 ? 'inline-flex' : 'none';
    }
  } catch (err) {
    console.error('Yeni ürünler yüklenemedi:', err);
  }
}

function renderNewProductsTable(newProducts) {
  const tbody = document.getElementById('newProdsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (newProducts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="padding: 24px; text-align: center;">
          <div class="empty-state">
            <div class="empty-state-icon">📦</div>
            <div class="empty-state-title">Bekleyen Yeni Ürün Yok</div>
            <div class="empty-state-desc">Tüm yeni ürün etiketleri basıldı veya henüz yeni ürün eklenmedi.</div>
          </div>
        </td>
      </tr>`;
    return;
  }

  newProducts.forEach(np => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-barcode">${np.barcode}</td>
      <td class="col-title">${np.title} <span class="badge badge-success" style="font-size:10px;">YENİ</span></td>
      <td class="col-price">₺ ${Number(np.price).toFixed(2)}</td>
      <td class="col-action">
        <button class="btn-excel-print" onclick="printBarcode('${np.barcode}', this)">
          🖨️ Yazdır
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function printAllChangedLabels() {
  try {
    showToast('Değişen etiketler basılıyor...', 'info');
    const res = await API.printPriceChanges();
    if (res.status === 'success') {
      showToast(res.message || 'Etiketler başarıyla basıldı.', 'success');
      loadPriceChanges();
    } else {
      showToast('Hata: ' + res.message, 'error');
    }
  } catch (err) {
    showToast('Yazdırma hatası: ' + err.message, 'error');
  }
}

async function printAllNewProdsLabels() {
  try {
    showToast('Yeni ürün etiketleri basılıyor...', 'info');
    const res = await API.printNewProducts();
    if (res.status === 'success') {
      showToast(res.message || 'Yeni ürün etiketleri basıldı.', 'success');
      loadNewProducts();
    } else {
      showToast('Hata: ' + res.message, 'error');
    }
  } catch (err) {
    showToast('Yazdırma hatası: ' + err.message, 'error');
  }
}

async function loadSyncHistory() {
  const tbody = document.getElementById('syncHistoryTableBody');
  if (!tbody) return;

  try {
    const res = await API.getSyncHistory(30);
    const data = res.data || res;
    const history = data.sync_history || [];

    if (!history || history.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center; padding:24px; color:var(--text-muted);">
            Henüz kasa_aktarim aktarımı yapılmadı.
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    history.forEach(item => {
      const isRolledBack = item.status === 'rolled_back';
      const statusBadge = isRolledBack
        ? '<span class="badge" style="background:rgba(239,68,68,0.15); color:#f87171; border:1px solid rgba(239,68,68,0.3); font-weight:700; font-size:10.5px;">↩️ Geri Alındı</span>'
        : '<span class="badge" style="background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3); font-weight:700; font-size:10.5px;">✅ Aktarıldı</span>';

      const actionBtn = isRolledBack
        ? '<span style="font-size:11px; color:var(--text-muted); font-style:italic;">İptal Edildi</span>'
        : `<button class="btn btn-secondary btn-sm" onclick="rollbackSyncItem(${item.id})" style="font-weight:700; font-size:11px; color:#f87171; border-color:rgba(248,113,113,0.35); background:rgba(248,113,113,0.08); padding:4px 8px;" title="Bu aktarımdaki tüm fiyatları geri al">
            ↩️ Aktarımı Geri Al
          </button>`;

      html += `
        <tr>
          <td style="font-family:'JetBrains Mono', monospace; font-weight:800; color:#818cf8; font-size:12px;">#${item.id}</td>
          <td style="font-size:12px; color:#fff; font-weight:600;">${item.timestamp || '-'}</td>
          <td style="font-size:12px; color:#38bdf8; font-weight:700;">📄 ${item.source_file || '-'}</td>
          <td style="font-size:12px; color:#94a3b8;">${item.device_name || 'Kasa Bilgisayarı'}</td>
          <td style="text-align:center; font-weight:800; color:#fff;">${item.total_products || 0}</td>
          <td style="text-align:center; font-weight:800; color:#fbbf24;">${item.price_changes_count || 0}</td>
          <td style="text-align:center; font-weight:800; color:#34d399;">${item.new_products || 0}</td>
          <td style="text-align:center;">${statusBadge}</td>
          <td style="text-align:center;">${actionBtn}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#f87171; padding:16px;">Geçmiş yüklenemedi: ${err.message}</td></tr>`;
  }
}

async function rollbackSyncItem(syncId) {
  if (!confirm(`Bu aktarımı (#${syncId}) geri almak istediğinize emin misiniz?\nBu işlem sonucunda o aktarımda güncellenen tüm fiyatlar eski orijinal fiyatlarına döndürülecektir.`)) {
    return;
  }

  showToast('Aktarım geri alınıyor...', 'info');
  try {
    const res = await API.rollbackSync(syncId);
    if (res.status === 'success') {
      showToast(res.message || 'Aktarım başarıyla geri alındı!', 'success');
      loadSyncHistory();
      loadPriceChanges();
      searchProducts(document.getElementById('productSearchInput')?.value || '');
    } else {
      showToast('Geri alma başarısız: ' + (res.message || 'Hata oluştu'), 'error');
    }
  } catch (err) {
    showToast('Sunucu hatası: ' + err.message, 'error');
  }
}

async function clearAllSyncHistoryConfirm() {
  if (!confirm('Tüm aktarım geçmişi, fiyat değişim logları ve hareket kayıtları tamamen silinecektir.\n\nEmin misiniz?')) {
    return;
  }

  showToast('Tüm aktarım geçmişi temizleniyor...', 'info');
  try {
    const res = await fetch('/api/kasa_aktarim/clear-all-history', { method: 'POST' });
    const json = await res.json();
    if (json.status === 'success') {
      showToast('Tüm aktarım geçmişi başarıyla temizlendi!', 'success');
      loadSyncHistory();
      if (typeof loadPriceChanges === 'function') loadPriceChanges();
      if (typeof loadNewProducts === 'function') loadNewProducts();
    } else {
      showToast('Temizleme hatası: ' + json.message, 'error');
    }
  } catch (err) {
    showToast('Bağlantı hatası: ' + err.message, 'error');
  }
}

async function loadkasa_aktarimDevicesAndData() {
  const select = document.getElementById('kasa_aktarimDeviceSelect');
  if (!select) return;

  try {
    const res = await API.getConnectedDevices();
    const data = res.data || res;
    cachedConnectedDevicesList = data.devices || [];

    select.innerHTML = '';
    if (cachedConnectedDevicesList.length === 0) {
      select.innerHTML = '<option value="">⚪ Bağlı Cihaz Bekleniyor...</option>';
      showDeviceEmptyState('Bağlı Cihaz Bekleniyor', 'Dükkan bilgisayarından web tarayıcısı ile http://' + (document.getElementById('topbarIp')?.textContent || 'IP') + ':8000/sync adresine girdiğinizde cihaz anında burada yeşil olarak bağlanacaktır.');
      return;
    }

    cachedConnectedDevicesList.forEach(dev => {
      const opt = document.createElement('option');
      opt.value = dev.id;
      const statusIcon = dev.is_online ? '🟢' : '⚪';
      const statusText = dev.is_online ? 'Bağlı' : 'Çevrimdışı';
      const hasDataLabel = dev.has_data ? ' [📊 Veri Gönderildi]' : ' [Veri Bekleniyor]';
      opt.textContent = `${statusIcon} ${dev.name} - ${statusText} (${dev.ip})${hasDataLabel}`;
      if (dev.id === activeSelectedDeviceId) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    if (activeSelectedDeviceId) {
      await fetchAndDisplayDeviceData(activeSelectedDeviceId);
    } else {
      if (cachedConnectedDevicesList.length > 0) {
        select.value = cachedConnectedDevicesList[0].id;
        activeSelectedDeviceId = cachedConnectedDevicesList[0].id;
        await fetchAndDisplayDeviceData(activeSelectedDeviceId);
      }
    }
  } catch (err) {
    select.innerHTML = '<option value="">Cihazlar taranamadı</option>';
  }
}

async function onSelectkasa_aktarimDevice(deviceId) {
  activeSelectedDeviceId = deviceId;
  if (!deviceId) {
    showDeviceEmptyState('Cihaz Seçilmedi', 'Verilerini ve gönderdiği güncel fiyatları incelemek için yukarıdan bir dükkan veya kasa bilgisayarı seçin.');
    return;
  }
  await fetchAndDisplayDeviceData(deviceId);
}

async function fetchAndDisplayDeviceData(deviceId) {
  const titleHeader = document.getElementById('selectedDeviceTitleHeader');
  const countBadge = document.getElementById('selectedDeviceCountBadge');
  const selectedDev = cachedConnectedDevicesList.find(d => d.id === deviceId);
  const devName = selectedDev ? selectedDev.name : deviceId;

  if (titleHeader) titleHeader.textContent = `📦 ${devName} Verileri`;

  try {
    const res = await API.getDeviceData(deviceId);
    const data = res.data || res;
    cachedSelectedDeviceData = data;

    if (!data.has_data || !data.items || data.items.length === 0) {
      if (countBadge) countBadge.textContent = 'Henüz Veri Yok';
      showDeviceEmptyState(
        `"${devName}" Cihazından Henüz Veri Gönderilmedi`,
        `Bu dükkan bilgisayarından tarayıcıyı açıp (/sync) <strong>"Verileri İncele ve Gönder"</strong> butonuna bastığınızda o bilgisayarın yerel DB verileri burada listelenecektir.`
      );
      return;
    }

    if (countBadge) countBadge.textContent = `${data.items.length} Ürün Alındı (${data.timestamp || ''})`;
    hideDeviceEmptyState();
    renderDeviceDataRows(data.items);
  } catch (err) {
    showDeviceEmptyState('Veri Okunamadı', err.message);
  }
}

function showDeviceEmptyState(title, desc) {
  const placeholder = document.getElementById('deviceDataEmptyPlaceholder');
  const tableContainer = document.getElementById('deviceDataTableContainer');
  const titleEl = document.getElementById('emptyPlaceholderTitle');
  const descEl = document.getElementById('emptyPlaceholderDesc');

  if (titleEl) titleEl.innerHTML = title;
  if (descEl) descEl.innerHTML = desc;
  if (placeholder) placeholder.style.display = 'block';
  if (tableContainer) tableContainer.style.display = 'none';
}

function hideDeviceEmptyState() {
  const placeholder = document.getElementById('deviceDataEmptyPlaceholder');
  const tableContainer = document.getElementById('deviceDataTableContainer');
  if (placeholder) placeholder.style.display = 'none';
  if (tableContainer) tableContainer.style.display = 'block';
}

function filterDeviceDataTable(query) {
  if (!cachedSelectedDeviceData || !cachedSelectedDeviceData.items) return;
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    renderDeviceDataRows(cachedSelectedDeviceData.items);
    return;
  }
  const filtered = cachedSelectedDeviceData.items.filter(p => {
    const b = (p.barcode || '').toLowerCase();
    const t = (p.title || p.incoming_title || '').toLowerCase();
    return b.includes(q) || t.includes(q);
  });
  renderDeviceDataRows(filtered);
}

function renderDeviceDataRows(items) {
  const tbody = document.getElementById('deviceDataTableBody');
  if (!tbody) return;

  if (!items || items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:32px; color:var(--text-muted);">
          🔍 Arama kriterine uygun ürün bulunamadı.
        </td>
      </tr>
    `;
    return;
  }

  const displayList = items.slice(0, 300);
  let html = '';

  displayList.forEach(item => {
    const barcode = item.barcode || '-';
    const title = cleanProductTitle(item.incoming_title || item.title || '-');
    const oldPrice = item.old_price !== undefined ? item.old_price : (item.main_price !== undefined ? item.main_price : null);
    const newPrice = item.new_price !== undefined ? item.new_price : (item.incoming_price !== undefined ? item.incoming_price : item.price);

    const oldPriceStr = oldPrice !== null ? `${Number(oldPrice).toFixed(2)} TL` : '<span style="color:#64748b;">(Yok)</span>';
    const newPriceStr = newPrice !== null ? `${Number(newPrice).toFixed(2)} TL` : '-';

    let diffHtml = '<span style="color:#64748b;">0,00 TL</span>';
    let statusHtml = '<span class="badge" style="background:rgba(148,163,184,0.12); color:#94a3b8; font-size:10px;">✅ Aynı</span>';

    if (oldPrice !== null && newPrice !== null && Math.abs(Number(oldPrice) - Number(newPrice)) > 0.01) {
      const diff = Number(newPrice) - Number(oldPrice);
      const sign = diff > 0 ? '+' : '';
      const color = diff > 0 ? '#f87171' : '#34d399';
      diffHtml = `<span style="color:${color}; font-weight:700; font-family:'JetBrains Mono', monospace;">${sign}${diff.toFixed(2)} TL</span>`;
      statusHtml = '<span class="badge" style="background:rgba(245,158,11,0.15); color:#fbbf24; font-size:10px; font-weight:700;">⚡ Fiyat Değişti</span>';
    } else if (oldPrice === null) {
      statusHtml = '<span class="badge" style="background:rgba(16,185,129,0.15); color:#34d399; font-size:10px; font-weight:700;">✨ Yeni Ürün</span>';
      diffHtml = `<span style="color:#34d399; font-weight:700;">+${newPriceStr}</span>`;
    }

    html += `
      <tr>
        <td style="font-family:'JetBrains Mono', monospace; font-weight:700; color:#38bdf8; font-size:12px;">
          ${barcode}
        </td>
        <td style="font-weight:600; color:#fff;">
          ${title}
        </td>
        <td style="text-align:right; font-family:'JetBrains Mono', monospace; color:#94a3b8;">
          ${oldPriceStr}
        </td>
        <td style="text-align:right; font-family:'JetBrains Mono', monospace; font-weight:800; color:#fbbf24;">
          ${newPriceStr}
        </td>
        <td style="text-align:right;">
          ${diffHtml}
        </td>
        <td style="text-align:center;">
          ${statusHtml}
        </td>
        <td style="text-align:center;">
          <button class="btn btn-primary btn-sm" onclick="printSingleLabelAction('${barcode}')" style="padding:3px 8px; font-size:11px; font-weight:700;">
            🖨️ Yazdır
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// Otomatik Canlı Yoklama
setInterval(() => {
  const devSelect = document.getElementById('kasa_aktarimDeviceSelect');
  if (devSelect && document.getElementById('tab-kasa_aktarim')?.classList.contains('active')) {
    loadkasa_aktarimDevicesAndData();
  }
}, 5000);
