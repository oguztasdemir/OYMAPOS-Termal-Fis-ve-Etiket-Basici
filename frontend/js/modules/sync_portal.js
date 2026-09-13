// ==========================================================================
// TOPLU ÜRÜN & FİYAT AKTARIM PORTALI (SYNC_PORTAL.JS)
// ==========================================================================

let comparisonData = null;
let currentFilter = 'all';
let searchQuery = '';

// İNTERAKTİF EXCEL TABLO VERİ MODELİ
// İNTERAKTİF EXCEL TABLO VERİ MODELİ
const DEFAULT_COLUMNS = [
  { id: 'barcode', title: 'BARKOD', width: '180px', type: 'barcode' },
  { id: 'title', title: 'ÜRÜN ADI (MALINCINSI)', width: 'auto', type: 'title' },
  { id: 'price', title: 'SATIŞ FİYATI', width: '140px', type: 'price' },
  { id: 'stock_code', title: 'STOK KODU', width: '140px', type: 'text' },
  { id: 'col_5', title: 'KDV / EK BİLGİ', width: '130px', type: 'text' }
];

let gridColumns = [...DEFAULT_COLUMNS];
let gridRows = [];

// En az 40 satırlık Excel ızgarası garanti edilir
const MIN_EMPTY_ROWS = 40;

function ensureExcelGridRows() {
  while (gridRows.length < MIN_EMPTY_ROWS) {
    const emptyRow = {};
    gridColumns.forEach(c => emptyRow[c.id] = '');
    gridRows.push(emptyRow);
  }
}

let gridCurrentPage = 1;
const GRID_PAGE_SIZE = 100;
let saveStorageTimeout = null;

function saveSyncPortalStorage() {
  if (saveStorageTimeout) clearTimeout(saveStorageTimeout);
  saveStorageTimeout = setTimeout(() => {
    try {
      localStorage.setItem('sync_portal_columns', JSON.stringify(gridColumns));
      // Performans ve kota aşımını önlemek için localStorage'a en fazla ilk 300 dolu satırı kaydet
      const filledRows = gridRows.filter(row => Object.values(row).some(v => v && String(v).trim()));
      const rowsToSave = filledRows.slice(0, 300);
      localStorage.setItem('sync_portal_rows', JSON.stringify(rowsToSave));
      if (comparisonData) {
        // Karşılaştırma verisini de kota aşılmasını önleyerek sakla
        try {
          localStorage.setItem('sync_portal_comparison', JSON.stringify(comparisonData));
        } catch (err) {}
      } else {
        localStorage.removeItem('sync_portal_comparison');
      }
    } catch (e) {}
  }, 400);
}

function loadSyncPortalStorage() {
  try {
    const savedCols = localStorage.getItem('sync_portal_columns');
    const savedRows = localStorage.getItem('sync_portal_rows');
    const savedComp = localStorage.getItem('sync_portal_comparison');

    if (savedCols) {
      const parsedCols = JSON.parse(savedCols);
      if (Array.isArray(parsedCols) && parsedCols.length > 0) gridColumns = parsedCols;
    }
    if (savedRows) {
      const parsedRows = JSON.parse(savedRows);
      if (Array.isArray(parsedRows) && parsedRows.length > 0) {
        gridRows = parsedRows;
      }
    }
    ensureExcelGridRows();

    if (savedComp) {
      const parsedComp = JSON.parse(savedComp);
      if (parsedComp && parsedComp.items) {
        comparisonData = parsedComp;
        setTimeout(() => {
          renderComparisonView();
        }, 50);
      }
    }
  } catch (e) {
    ensureExcelGridRows();
  }
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '⚠️' : 'ℹ️'}</span> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// SAYFA DEĞİŞTİRME (1. ADIM EXCEL TABLOSU)
function changeGridPage(newPage) {
  const totalPages = Math.max(1, Math.ceil(gridRows.length / GRID_PAGE_SIZE));
  const targetPage = Math.max(1, Math.min(newPage, totalPages));
  if (targetPage !== gridCurrentPage) {
    gridCurrentPage = targetPage;
    renderExcelGrid();
    const wrapper = document.getElementById('excelSheetWrapper');
    if (wrapper) wrapper.scrollTop = 0;
  }
}

// TABLOYU EKRANA ÇİZ (SAYFALANMIŞ ULTRA HIZLI RENDER)
function renderExcelGrid() {
  const thead = document.getElementById('gridThead');
  const tbody = document.getElementById('gridTbody');
  if (!thead || !tbody) return;

  ensureExcelGridRows();

  // Excel Sütun Harfleri (A, B, C, D...) ile birlikte başlıklar
  const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];

  let thHtml = `<tr>
    <th style="width: 50px; text-align: center;">#</th>`;
  
  gridColumns.forEach((col, cIdx) => {
    const letter = colLetters[cIdx] || `C${cIdx + 1}`;
    thHtml += `
      <th style="min-width: ${col.width || '130px'};">
        <div class="th-content">
          <div>
            <span style="display: block; font-size: 10px; color: #64748b; font-weight: 800;">${letter}</span>
            <span style="color: #38bdf8; font-weight: 800; font-size: 12.5px;">${col.title}</span>
          </div>
        </div>
      </th>
    `;
  });
  thHtml += `</tr>`;
  thead.innerHTML = thHtml;

  // Sayfalama Hesabı
  const totalRows = gridRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / GRID_PAGE_SIZE));
  if (gridCurrentPage > totalPages) gridCurrentPage = totalPages;

  const startIdx = (gridCurrentPage - 1) * GRID_PAGE_SIZE;
  const endIdx = Math.min(startIdx + GRID_PAGE_SIZE, totalRows);
  const visibleRows = gridRows.slice(startIdx, endIdx);

  // Sadece aktif sayfadaki satırları DOM'a bas (Maksimum 100 satır = Anında 0ms çizim!)
  let tbHtml = '';
  visibleRows.forEach((row, relIdx) => {
    const absIdx = startIdx + relIdx;
    tbHtml += `<tr>
      <td class="row-num-cell">${absIdx + 1}</td>`;

    gridColumns.forEach((col) => {
      const val = row[col.id] !== undefined ? row[col.id] : '';
      let inputClass = 'grid-cell-input';
      if (col.type === 'price') inputClass += ' price-input';
      else if (col.type === 'barcode') inputClass += ' barcode-input';
      else if (col.type === 'title') inputClass += ' title-input';

      tbHtml += `
        <td>
          <input type="text" class="${inputClass}" value="${escapeHtml(val)}" 
            oninput="onCellInput(${absIdx}, '${col.id}', this.value)"
            onkeydown="onCellKeydown(event, ${absIdx}, '${col.id}')"
            data-row="${absIdx}" data-col="${col.id}">
        </td>
      `;
    });

    tbHtml += `</tr>`;
  });

  tbody.innerHTML = tbHtml;

  // Sayfalama Çubuğunu Güncelle
  const pBar = document.getElementById('gridPaginationBar');
  const pText = document.getElementById('gridPageInfoText');
  if (pBar) {
    if (totalRows > GRID_PAGE_SIZE) {
      pBar.style.display = 'inline-flex';
      if (pText) {
        pText.textContent = `Sayfa ${gridCurrentPage} / ${totalPages} (${startIdx + 1} - ${endIdx} / Toplam ${totalRows.toLocaleString('tr-TR')})`;
      }
    } else {
      pBar.style.display = 'none';
    }
  }

  updateGridStats();
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#039;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function onCellInput(rowIdx, colId, value) {
  if (gridRows[rowIdx]) {
    gridRows[rowIdx][colId] = value;
  }
  // Excel gibi son satırlara yaklaşıldığında otomatik sınırsız satır ekle
  if (rowIdx >= gridRows.length - 2) {
    for (let i = 0; i < 20; i++) {
      const emptyRow = {};
      gridColumns.forEach(c => emptyRow[c.id] = '');
      gridRows.push(emptyRow);
    }
  }
  updateGridStatsOnly();
}

// Ok tuşları veya Enter ile hücreler arası Excel gibi gezinme
function onCellKeydown(e, rowIdx, colId) {
  const colIndex = gridColumns.findIndex(c => c.id === colId);
  if (e.key === 'Enter' || e.key === 'ArrowDown') {
    e.preventDefault();
    const nextRow = rowIdx + 1;
    if (nextRow >= gridRows.length) {
      const emptyRow = {};
      gridColumns.forEach(c => emptyRow[c.id] = '');
      gridRows.push(emptyRow);
    }
    // Eğer sayfa sonu aşıldıysa sonraki sayfaya geç
    const targetPage = Math.floor(nextRow / GRID_PAGE_SIZE) + 1;
    if (targetPage !== gridCurrentPage) {
      gridCurrentPage = targetPage;
      renderExcelGrid();
    }
    focusCell(nextRow, colIndex);
  } else if (e.key === 'ArrowUp' && rowIdx > 0) {
    e.preventDefault();
    const prevRow = rowIdx - 1;
    const targetPage = Math.floor(prevRow / GRID_PAGE_SIZE) + 1;
    if (targetPage !== gridCurrentPage) {
      gridCurrentPage = targetPage;
      renderExcelGrid();
    }
    focusCell(prevRow, colIndex);
  } else if (e.key === 'Tab' && !e.shiftKey && colIndex === gridColumns.length - 1) {
    // Son sütundayken Tab'a basarsa bir sonraki satırın ilk sütununa geç
    e.preventDefault();
    const nextRow = rowIdx + 1;
    if (nextRow >= gridRows.length) {
      const emptyRow = {};
      gridColumns.forEach(c => emptyRow[c.id] = '');
      gridRows.push(emptyRow);
    }
    const targetPage = Math.floor(nextRow / GRID_PAGE_SIZE) + 1;
    if (targetPage !== gridCurrentPage) {
      gridCurrentPage = targetPage;
      renderExcelGrid();
    }
    focusCell(nextRow, 0);
  }
}

function focusCell(rowIdx, colIdx) {
  setTimeout(() => {
    const col = gridColumns[colIdx];
    if (!col) return;
    const input = document.querySelector(`input[data-row="${rowIdx}"][data-col="${col.id}"]`);
    if (input) {
      input.focus();
      input.select();
    }
  }, 10);
}

function updateGridStatsOnly() {
  const badge = document.getElementById('clipboardCountBadge');
  const filledCount = gridRows.filter(row => Object.values(row).some(v => v && String(v).trim())).length;
  if (badge) {
    badge.textContent = `${filledCount.toLocaleString('tr-TR')} Dolu Ürün (${gridColumns.length} Sütun)`;
  }
  saveSyncPortalStorage();
}

function updateGridStats() {
  saveSyncPortalStorage();
  const statsEl = document.getElementById('clipboardStatsText');
  const badge = document.getElementById('clipboardCountBadge');
  const filledCount = gridRows.filter(row => Object.values(row).some(v => v && String(v).trim())).length;
  const colCount = gridColumns.length;

  if (badge) {
    badge.textContent = `${filledCount.toLocaleString('tr-TR')} Dolu Ürün (${colCount} Sütun)`;
  }
  if (statsEl) {
    if (filledCount === 0) {
      statsEl.innerHTML = '<span>ℹ️</span> Excel tablonuzu kopyalayıp <strong>Ctrl + V</strong> ile yapıştırabilir veya doğrudan hücrelere yazabilirsiniz.';
    } else {
      statsEl.innerHTML = `<span style="color: #38bdf8; font-weight: 700;">✓ ${filledCount.toLocaleString('tr-TR')} adet ürün hazır.</span> Sağ üstteki <strong>"Veri Gönder & Karşılaştır"</strong> butonuna tıklayarak ana bilgisayara aktarabilirsiniz.`;
    }
  }
}

// TÜMÜNÜ TEMİZLE
function gridClearAll() {
  gridColumns = [...DEFAULT_COLUMNS];
  gridRows = [];
  gridCurrentPage = 1;
  ensureExcelGridRows();
  renderExcelGrid();
  saveSyncPortalStorage();
  showToast('Excel tablosu temizlendi.', 'info');
}

// PANODAN OTOMATİK OKU VE YAPIŞTIR
async function gridClearAndPaste() {
  try {
    let clipboardText = '';
    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        clipboardText = await navigator.clipboard.readText();
      } catch (e) {}
    }
    if (!clipboardText || !clipboardText.trim()) {
      try {
        const res = await fetch('/api/system/get-clipboard');
        const json = await res.json();
        if (json.status === 'success' && json.data?.clipboard_text) {
          clipboardText = json.data.clipboard_text;
        }
      } catch (e) {}
    }

    if (!clipboardText || !clipboardText.trim()) {
      showToast('Panoda kopyalanmış herhangi bir metin bulunamadı. Lütfen önce Excel\'den kopyalayın.', 'warning');
      return;
    }

    gridRows = [];
    parseAndPopulateGridFromText(clipboardText);
  } catch (err) {
    showToast('Yapıştırma hatası: ' + err.message, 'error');
  }
}

// EVRENSEL PASTE (CTRL+V) DİNLENMESİ
document.addEventListener('paste', function (e) {
  if (e.target && e.target.id === 'tableSearchInput') return;
  if (e.target && e.target.id === 'deviceNameInput') return;

  const clipboardData = e.clipboardData || window.clipboardData;
  if (!clipboardData) return;
  const pastedData = clipboardData.getData('Text');
  if (!pastedData || !pastedData.trim()) return;

  const lines = pastedData.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return;

  const firstLine = lines[0];
  const hasDelim = firstLine.includes('\t') || firstLine.includes(';') || (firstLine.includes(',') && lines.length > 1);

  if (lines.length > 1 || hasDelim) {
    e.preventDefault();
    parseAndPopulateGridFromText(pastedData);
  }
});

function showSyncProgress(title, subtitle, icon = '📋') {
  const overlay = document.getElementById('syncPortalProgressOverlay');
  if (!overlay) return;
  const tEl = document.getElementById('syncPortalProgressTitle');
  const sEl = document.getElementById('syncPortalProgressSubtitle');
  const iEl = document.getElementById('syncPortalProgressIcon');
  const fill = document.getElementById('syncPortalProgressBarFill');
  const count = document.getElementById('syncPortalProgressCount');
  const percent = document.getElementById('syncPortalProgressPercent');

  if (tEl) tEl.textContent = title;
  if (sEl) sEl.textContent = subtitle;
  if (iEl) iEl.textContent = icon;
  if (fill) fill.style.width = '0%';
  if (count) count.textContent = '0 / 0 Ürün';
  if (percent) percent.textContent = '%0';

  overlay.style.display = 'flex';
}

function updateSyncProgress(current, total, statusText = '') {
  const fill = document.getElementById('syncPortalProgressBarFill');
  const count = document.getElementById('syncPortalProgressCount');
  const percent = document.getElementById('syncPortalProgressPercent');
  const sEl = document.getElementById('syncPortalProgressSubtitle');

  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  if (fill) fill.style.width = `${pct}%`;
  if (count) count.textContent = `${current.toLocaleString('tr-TR')} / ${total.toLocaleString('tr-TR')} Ürün`;
  if (percent) percent.textContent = `%${pct}`;
  if (statusText && sEl) sEl.textContent = statusText;
}

function hideSyncProgress() {
  const overlay = document.getElementById('syncPortalProgressOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

async function parseAndPopulateGridFromText(rawText) {
  const lines = rawText.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return;

  showSyncProgress('Pano Tablosu Yapıştırılıyor...', 'Satırlar ayrıştırılıyor ve tabloya yükleniyor...', '📋');
  updateSyncProgress(0, lines.length, `${lines.length} satır hazırlandı...`);
  await new Promise(r => setTimeout(r, 20));

  const sample = lines.slice(0, 10);
  const tabCount = sample.reduce((acc, l) => acc + (l.split('\t').length - 1), 0);
  const semiCount = sample.reduce((acc, l) => acc + (l.split(';').length - 1), 0);
  const commaCount = sample.reduce((acc, l) => acc + (l.split(',').length - 1), 0);

  let delim = '\t';
  if (semiCount > tabCount && semiCount > commaCount) delim = ';';
  else if (commaCount > tabCount && commaCount > semiCount) delim = ',';

  const splitRows = lines.map(line => line.split(delim).map(c => c.trim()));
  if (splitRows.length === 0) {
    hideSyncProgress();
    return;
  }

  const firstRow = splitRows[0];
  const firstRowLower = firstRow.map(c => c.toLowerCase());
  const hasHeaders = firstRowLower.some(c => 
    c.includes('barkod') || c.includes('barcode') || c.includes('fiyat') || c.includes('satis') || c.includes('urun') || c.includes('malin') || c.includes('stok')
  );

  let headers = [];
  let dataRows = [];

  if (hasHeaders) {
    headers = firstRow;
    dataRows = splitRows.slice(1);
  } else {
    headers = firstRow.map((_, i) => {
      if (i === 0) return 'BARKOD';
      if (i === 1) return 'ÜRÜN ADI';
      if (i === 2) return 'SATIŞ FİYATI';
      if (i === 3) return 'STOK KODU';
      return `SÜTUN ${i + 1}`;
    });
    dataRows = splitRows;
  }

  gridColumns = headers.map((h, i) => {
    const hLower = h.toLowerCase();
    let colType = 'text';
    if (hLower.includes('barkod') || hLower.includes('barcode') || hLower.includes('ean')) colType = 'barcode';
    else if (hLower.includes('fiyat') || hLower.includes('price') || hLower.includes('satis') || hLower.includes('tutar')) colType = 'price';
    else if (hLower.includes('urun') || hLower.includes('ürün') || hLower.includes('malin') || hLower.includes('ad') || hLower.includes('title')) colType = 'title';

    return {
      id: 'col_' + i,
      title: h.toUpperCase(),
      width: colType === 'title' ? 'auto' : (colType === 'barcode' ? '170px' : '140px'),
      type: colType
    };
  });

  const parsedRows = [];
  const CHUNK_SIZE = 1500;
  for (let i = 0; i < dataRows.length; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, dataRows.length);
    for (let idx = i; idx < end; idx++) {
      const rowVals = dataRows[idx];
      const rowObj = {};
      gridColumns.forEach((col, cIdx) => {
        rowObj[col.id] = rowVals[cIdx] !== undefined ? rowVals[cIdx] : '';
      });
      parsedRows.push(rowObj);
    }
    if (dataRows.length > 2000) {
      updateSyncProgress(end, dataRows.length, `${end.toLocaleString('tr-TR')} / ${dataRows.length.toLocaleString('tr-TR')} ürün işlendi...`);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  gridRows = parsedRows;
  gridCurrentPage = 1;
  updateSyncProgress(dataRows.length, dataRows.length, 'Tablo render ediliyor...');
  await new Promise(r => setTimeout(r, 10));

  renderExcelGrid();
  hideSyncProgress();
  showToast(`Excel'den ${gridRows.length.toLocaleString('tr-TR')} satır ve ${gridColumns.length} sütun başarıyla yapıştırıldı!`, 'success');
}

// TABLODAKİ VERİLERİ GÖNDER & KARŞILAŞTIR
async function processClipboardData() {
  const filledRows = gridRows.filter(row => Object.values(row).some(v => v && String(v).trim()));
  if (filledRows.length === 0) {
    showToast('Tabloda gönderilecek ürün verisi bulunmuyor. Lütfen Excel verinizi Ctrl+V ile yapıştırın veya hücrelere girin.', 'error');
    return;
  }

  const headerLine = gridColumns.map(c => c.title).join('\t');
  const dataLines = filledRows.map(row => {
    return gridColumns.map(col => row[col.id] || '').join('\t');
  });
  const rawTsv = [headerLine, ...dataLines].join('\n');

  const devName = (document.getElementById('deviceNameInput')?.value || 'Dükkan Kasa Bilgisayarı').trim();
  const btn = document.getElementById('btnProcessClipboard');
  const originalText = btn ? btn.innerHTML : '';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Çözümleniyor...';
  }

  showSyncProgress('Ürünler Gönderiliyor & Karşılaştırılıyor...', `${filledRows.length} ürün ana bilgisayara iletiliyor...`, '🚀');
  updateSyncProgress(0, filledRows.length, 'Sunucuya gönderiliyor...');

  try {
    const formData = new FormData();
    formData.append('raw_text', rawTsv);
    formData.append('device_name', devName);

    updateSyncProgress(Math.floor(gridRows.length * 0.5), gridRows.length, 'Ana PC fiyatları ve isimleri karşılaştırıyor...');

    const res = await fetch('/api/kasa_aktarim/preview-clipboard', {
      method: 'POST',
      body: formData
    });
    const result = await res.json();

    updateSyncProgress(gridRows.length, gridRows.length, 'Karşılaştırma tamamlandı!');
    await new Promise(r => setTimeout(r, 200));
    hideSyncProgress();

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }

    if (result.status === 'success' && result.data) {
      comparisonData = result.data;
      renderComparisonView();
      showToast(`Tablodan ${comparisonData.total_incoming || 0} ürün başarıyla çözümlendi ve karşılaştırıldı!`, 'success');
    } else {
      showToast('Okuma Hatası: ' + (result.message || 'Ürünler ayrıştırılamadı.'), 'error');
    }
  } catch (err) {
    hideSyncProgress();
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
    showToast('Bağlantı hatası: ' + err.message, 'error');
  }
}

// Karşılaştırma Ekranını Doldur
function renderComparisonView() {
  if (!comparisonData) return;

  document.getElementById('stepUploadCard').style.display = 'none';
  document.getElementById('stepComparisonCard').style.display = 'block';
  document.getElementById('stepResultCard').style.display = 'none';

  document.getElementById('previewSourceLabel').textContent = `${comparisonData.source_filename || 'Kopyalanan Tablo'} (${comparisonData.device_name || 'Bu PC'})`;

  document.getElementById('statTotalPreview').textContent = comparisonData.total_incoming || 0;
  if (document.getElementById('statPriceIncreasePreview')) {
    document.getElementById('statPriceIncreasePreview').textContent = comparisonData.price_increases || comparisonData.price_increase_count || 0;
  }
  if (document.getElementById('statPriceDecreasePreview')) {
    document.getElementById('statPriceDecreasePreview').textContent = comparisonData.price_decreases || comparisonData.price_decrease_count || 0;
  }
  document.getElementById('statNewProductPreview').textContent = comparisonData.new_products || comparisonData.new_product_count || 0;
  document.getElementById('statIdenticalPreview').textContent = comparisonData.identical || comparisonData.identical_count || 0;
  if (document.getElementById('statBlacklistedPreview')) {
    document.getElementById('statBlacklistedPreview').textContent = comparisonData.blacklisted_count || (comparisonData.blacklisted_items ? comparisonData.blacklisted_items.length : 0);
  }

  document.getElementById('chipCountAll').textContent = `(${comparisonData.total_incoming || 0})`;
  if (document.getElementById('chipCountIncrease')) {
    document.getElementById('chipCountIncrease').textContent = `(${comparisonData.price_increases || comparisonData.price_increase_count || 0})`;
  }
  if (document.getElementById('chipCountDecrease')) {
    document.getElementById('chipCountDecrease').textContent = `(${comparisonData.price_decreases || comparisonData.price_decrease_count || 0})`;
  }
  document.getElementById('chipCountNew').textContent = `(${comparisonData.new_products || comparisonData.new_product_count || 0})`;
  document.getElementById('chipCountIdentical').textContent = `(${comparisonData.identical || comparisonData.identical_count || 0})`;
  if (document.getElementById('chipCountBlacklisted')) {
    document.getElementById('chipCountBlacklisted').textContent = `(${comparisonData.blacklisted_count || (comparisonData.blacklisted_items ? comparisonData.blacklisted_items.length : 0)})`;
  }

  renderTableRows();
}

function setFilter(filterType) {
  currentFilter = filterType;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`filter-btn-${filterType}`);
  if (activeBtn) activeBtn.classList.add('active');
  renderTableRows();
}

function onSearchTable(query) {
  searchQuery = (query || '').toLowerCase().trim();
  renderTableRows();
}

function formatPrice(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
}

let comparisonCurrentPage = 1;
const COMPARISON_PAGE_SIZE = 100;

function renderTableRows() {
  if (!comparisonData) return;
  const tbody = document.getElementById('diffTableBody');
  
  let sourceItems = [];
  if (currentFilter === 'blacklisted') {
    sourceItems = (comparisonData.blacklisted_items || []).map(bItem => ({
      barcode: bItem.barcode,
      main_title: '<span style="color:#ca8a04;">(Aktarımdan Elendi)</span>',
      incoming_title: bItem.title,
      main_price: null,
      incoming_price: bItem.price,
      diff_amount: 0,
      diff_percent: 0,
      status: 'blacklisted',
      reason: bItem.reason || 'Kara Liste'
    }));
  } else {
    sourceItems = comparisonData.items || [];
  }

  let filtered = sourceItems.filter(item => {
    if (currentFilter !== 'all' && currentFilter !== 'blacklisted') {
      if (currentFilter === 'price_change') {
        if (item.status !== 'price_change' && item.status !== 'price_increase' && item.status !== 'price_decrease') return false;
      } else if (item.status !== currentFilter) {
        return false;
      }
    }
    if (searchQuery) {
      const b = (item.barcode || '').toLowerCase();
      const mt = (item.main_title || '').toLowerCase();
      const it = (item.incoming_title || '').toLowerCase();
      const sc = (item.stock_code || '').toLowerCase();
      const r = (item.reason || '').toLowerCase();
      if (!b.includes(searchQuery) && !mt.includes(searchQuery) && !it.includes(searchQuery) && !sc.includes(searchQuery) && !r.includes(searchQuery)) {
        return false;
      }
    }
    return true;
  });

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / COMPARISON_PAGE_SIZE));
  if (comparisonCurrentPage > totalPages) comparisonCurrentPage = 1;

  const startIndex = (comparisonCurrentPage - 1) * COMPARISON_PAGE_SIZE;
  const pageItems = filtered.slice(startIndex, startIndex + COMPARISON_PAGE_SIZE);

  document.getElementById('tableShowingText').innerHTML = `
    Görüntülenen: <strong>${Math.min(startIndex + 1, totalFiltered)} - ${Math.min(startIndex + pageItems.length, totalFiltered)}</strong> / <strong>${totalFiltered}</strong> ürün (Toplam: ${sourceItems.length})
    ${totalPages > 1 ? `
      <span style="margin-left: 12px; display: inline-flex; gap: 4px; align-items: center;">
        <button class="btn btn-secondary btn-sm" onclick="changeComparisonPage(1)" ${comparisonCurrentPage === 1 ? 'disabled' : ''} style="padding: 2px 6px; font-size: 11px;">⏮</button>
        <button class="btn btn-secondary btn-sm" onclick="changeComparisonPage(${comparisonCurrentPage - 1})" ${comparisonCurrentPage === 1 ? 'disabled' : ''} style="padding: 2px 8px; font-size: 11px;">◀</button>
        <span style="font-size: 11px; font-weight: 700; color: #38bdf8; padding: 0 4px;">Sayfa ${comparisonCurrentPage} / ${totalPages}</span>
        <button class="btn btn-secondary btn-sm" onclick="changeComparisonPage(${comparisonCurrentPage + 1})" ${comparisonCurrentPage >= totalPages ? 'disabled' : ''} style="padding: 2px 8px; font-size: 11px;">▶</button>
        <button class="btn btn-secondary btn-sm" onclick="changeComparisonPage(${totalPages})" ${comparisonCurrentPage >= totalPages ? 'disabled' : ''} style="padding: 2px 6px; font-size: 11px;">⏭</button>
      </span>
    ` : ''}
  `;

  if (pageItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:36px; color:#94a3b8;">
          🔍 Seçilen filtrelere uygun ürün bulunamadı.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  pageItems.forEach(item => {
    let badgeHtml = '';
    let diffHtml = '';
    let mainPriceStr = item.main_price !== null ? formatPrice(item.main_price) : '<span style="color:#64748b;">(Yok)</span>';
    let incomingPriceStr = formatPrice(item.incoming_price);

    if (item.status === 'blacklisted') {
      badgeHtml = `<span class="badge-pill" style="background: rgba(234, 179, 8, 0.18); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.4);">🛡️ Kara Liste</span>`;
      diffHtml = `<span style="color: #facc15; font-size: 11.5px; font-weight: 700;">${escapeHtml(item.reason)}</span>`;
    } else if (item.status === 'price_increase' || (item.status === 'price_change' && item.diff_amount > 0)) {
      badgeHtml = `<span class="badge-pill" style="background: rgba(239, 68, 68, 0.18); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35);">📈 Fiyat Arttı</span>`;
      diffHtml = `<span class="price-diff-up">+${item.diff_amount.toFixed(2)} TL (%+${item.diff_percent})</span>`;
    } else if (item.status === 'price_decrease' || (item.status === 'price_change' && item.diff_amount < 0)) {
      badgeHtml = `<span class="badge-pill" style="background: rgba(56, 189, 248, 0.18); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35);">📉 Fiyat Düştü</span>`;
      diffHtml = `<span class="price-diff-down">${item.diff_amount.toFixed(2)} TL (%${item.diff_percent})</span>`;
    } else if (item.status === 'new_product') {
      badgeHtml = `<span class="badge-pill badge-new-product">✨ Yeni Ürün</span>`;
      diffHtml = `<span class="price-diff-up">+${incomingPriceStr}</span>`;
    } else if (item.status === 'title_change') {
      badgeHtml = `<span class="badge-pill" style="background: rgba(37, 99, 235, 0.15); color: #60a5fa; border: 1px solid rgba(37, 99, 235, 0.3);">📝 İsim Değişti</span>`;
      diffHtml = `<span class="price-diff-zero">0,00 TL</span>`;
    } else {
      badgeHtml = `<span class="badge-pill badge-identical">✅ Birebir Aynı</span>`;
      diffHtml = `<span class="price-diff-zero">0,00 TL</span>`;
    }

    const mainTitle = item.main_title ? item.main_title : '<span style="color:#64748b; font-style:italic;">(Ana sistemde henüz kayıtlı değil)</span>';
    const incomingTitle = item.incoming_title || '-';

    html += `
      <tr>
        <td style="font-family:'JetBrains Mono', monospace; font-weight:700; color:#818cf8; font-size:12px;">
          ${item.barcode || '<span style="color:#64748b;">Barkodsuz</span>'}
        </td>
        <td style="color:${item.main_title ? '#f1f5f9' : '#64748b'}; font-weight:600;">
          ${mainTitle}
        </td>
        <td style="color:#38bdf8; font-weight:700;">
          ${incomingTitle}
        </td>
        <td style="text-align:right; font-family:'JetBrains Mono', monospace; color:#cbd5e1;">
          ${mainPriceStr}
        </td>
        <td style="text-align:right; font-family:'JetBrains Mono', monospace; font-weight:800; color:#fbbf24;">
          ${incomingPriceStr}
        </td>
        <td style="text-align:right;">
          ${diffHtml}
        </td>
        <td style="text-align:center;">
          ${badgeHtml}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function changeComparisonPage(newPage) {
  comparisonCurrentPage = newPage;
  renderTableRows();
  const scrollEl = document.querySelector('.table-scroll');
  if (scrollEl) scrollEl.scrollTop = 0;
}

// Onayla ve Sisteme Aktar
async function commitSync() {
  if (!comparisonData || !comparisonData.parsed_items) return;
  const items = comparisonData.parsed_items;
  const totalItems = items.length;

  const confirmBtns = [document.getElementById('confirmSyncBtn'), document.getElementById('confirmSyncBtnBottom')];
  
  confirmBtns.forEach(btn => {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ Veriler Ana Bilgisayara Aktarılıyor...';
    }
  });

  showSyncProgress('Veriler Ana Bilgisayara Aktarılıyor...', `${totalItems.toLocaleString('tr-TR')} ürün ana sisteme kaydediliyor...`, '🚀');
  updateSyncProgress(0, totalItems, 'Bağlantı kuruluyor ve ürünler paketleniyor...');

  try {
    // Görsel geri bildirim için ilk adım
    await new Promise(r => setTimeout(r, 100));
    updateSyncProgress(Math.floor(totalItems * 0.4), totalItems, `${Math.floor(totalItems * 0.4).toLocaleString('tr-TR')} / ${totalItems.toLocaleString('tr-TR')} ürün ana PC'ye gönderildi...`);

    const res = await API.confirmkasa_aktarimSync(
      comparisonData.parsed_items,
      comparisonData.source_filename || 'Kopyalanan Tablo',
      comparisonData.device_name || 'Dükkan PC'
    );

    const data = res.data || res;

    updateSyncProgress(totalItems, totalItems, 'Tüm ürünler başarıyla işlendi ve veritabanına yazıldı!');
    await new Promise(r => setTimeout(r, 300));
    hideSyncProgress();

    if (res.status === 'success' || data.total_received !== undefined) {
      document.getElementById('stepUploadCard').style.display = 'none';
      document.getElementById('stepComparisonCard').style.display = 'none';
      document.getElementById('stepResultCard').style.display = 'block';

      document.getElementById('resTotal').textContent = data.total_received || comparisonData.total_incoming || 0;
      document.getElementById('resNew').textContent = data.new_products || 0;
      document.getElementById('resChanges').textContent = data.price_changes_count || 0;

      document.getElementById('resultSummaryText').textContent = 
        `${comparisonData.device_name} cihazından aktarılan ${data.total_received || 0} adet ürünün güncel fiyatları ve stok bilgileri başarıyla ana sisteme kaydedildi.`;

      showToast('Ürünler başarıyla ana sisteme aktarıldı!', 'success');
    } else {
      showToast('Hata: ' + (res.message || 'Aktarım başarısız oldu.'), 'error');
      confirmBtns.forEach(btn => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>🚀</span> Onayla & Ana Bilgisayara Aktar';
        }
      });
    }
  } catch (err) {
    hideSyncProgress();
    confirmBtns.forEach(btn => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>🚀</span> Onayla & Ana Bilgisayara Aktar';
      }
    });
    showToast('Bağlantı hatası: ' + err.message, 'error');
  }
}

function resetToUpload() {
  document.getElementById('stepUploadCard').style.display = 'block';
  document.getElementById('stepComparisonCard').style.display = 'none';
  document.getElementById('stepResultCard').style.display = 'none';
  comparisonData = null;
}

// Cihazı Ana Bilgisayara Bağlı Olarak Kaydet ve Canlı Tut
async function registerCurrentDevice() {
  const devName = (document.getElementById('deviceNameInput')?.value || 'Dükkan Kasa Bilgisayarı').trim();
  try {
    await API.registerDevice({
      device_id: 'sync_client_' + window.location.hostname,
      device_name: devName,
      device_type: 'sync_client'
    });
  } catch (e) {}
}

window.addEventListener('DOMContentLoaded', () => {
  loadSyncPortalStorage();
  renderExcelGrid();
  const savedDev = localStorage.getItem('saved_device_name');
  if (savedDev && document.getElementById('deviceNameInput')) {
    document.getElementById('deviceNameInput').value = savedDev;
  }
});

document.getElementById('deviceNameInput')?.addEventListener('input', (e) => {
  localStorage.setItem('saved_device_name', e.target.value);
});

registerCurrentDevice();
setInterval(registerCurrentDevice, 15000);
