// ==========================================================================
// OYMAPOS - ÜRÜNLER & EXCEL BASKI TABLOSU MODÜLÜ
// ==========================================================================

let currentFilter = 'all'; // 'all', 'diff', 'new'
let cachedProductsList = [];
let currentModalProduct = null;

function cleanProductTitle(title) {
  if (!title) return '';
  let s = String(title).trim();
  s = s.replace(/^[-\-_.:\s*#]+/, '');
  s = s.replace(/[\-_.:\s]+$/, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s || String(title).trim();
}

/**
 * Akıllı Başlık Satır Bölücü:
 * "600 GR", "1 LT", "250 ML" gibi miktar/gramaj ifadelerinin bölünmesini (örn: 600 üstte, GR altta) engeller.
 * Eğer ikinci satıra sadece 1-3 karakter veya yalnız bir birim kalıyorsa, önceki sayıyı da aşağı alır.
 */
function formatSmartTitleLines(fullTitle, maxLine1Chars = 28) {
  if (!fullTitle) return { line1: '', line2: '' };
  const text = cleanProductTitle(fullTitle).trim().toUpperCase();

  // Tek satıra sığıyorsa bölme
  if (text.length <= maxLine1Chars) {
    return { line1: text, line2: '' };
  }

  const words = text.split(/\s+/);
  if (words.length <= 1) {
    return { line1: text, line2: '' };
  }

  const unitWords = ['GR', 'GRAM', 'KG', 'LT', 'LITRE', 'LİTRE', 'ML', 'CL', 'ADET', 'LI', 'LU', 'LÜ', 'PAKET', 'PK'];

  let t1Words = [];
  let t2Words = [];
  let currentLen = 0;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (t2Words.length === 0 && (currentLen === 0 || currentLen + 1 + w.length <= maxLine1Chars)) {
      t1Words.push(w);
      currentLen += (currentLen === 0 ? w.length : 1 + w.length);
    } else {
      t2Words.push(w);
    }
  }

  // Eğer 2. satır yalnız bir birimle başlıyorsa (örn: ["GR"] veya ["LT"]) ve 1. satırın sonunda sayı varsa (örn: "600")
  // veya 2. satır çok kısaysa (1-3 karakter), 1. satırdaki son kelimeyi (sayıyı) 2. satırın başına al!
  if (t2Words.length > 0 && t1Words.length > 1) {
    const firstT2 = t2Words[0].replace(/[^A-ZÇĞİÖŞÜ]/g, '');
    const lastT1 = t1Words[t1Words.length - 1];
    const isFirstT2Unit = unitWords.includes(firstT2) || t2Words.join(' ').length <= 3;
    const isLastT1Number = /^\d+([.,]\d+)?('?(L[İIÜU]|Lİ|LI|LU|LÜ))?$/.test(lastT1) || /^\d+$/.test(lastT1);

    if (isFirstT2Unit || isLastT1Number) {
      const moved = t1Words.pop();
      t2Words.unshift(moved);
    }
  }

  const line1 = t1Words.join(' ');
  const line2 = t2Words.join(' ');
  return { line1, line2 };
}

function renderBarcodeSvg(target, barcode) {
  try {
    if (!barcode) return;
    const cleanCode = String(barcode).trim();
    if (typeof JsBarcode === 'function') {
      const isEan13 = /^\d{13}$/.test(cleanCode);
      JsBarcode(target, cleanCode, {
        format: isEan13 ? "EAN13" : "CODE128",
        lineColor: "#000",
        width: 1.15,
        height: 22,
        displayValue: true,
        fontSize: 9,
        font: "Inter",
        textMargin: 1,
        margin: 0
      });
    }
  } catch (err) {
    console.warn("Barkod SVG çizim hatası:", err);
  }
}

function toggleFilter(filterType) {
  currentFilter = filterType;
  const btnAll = document.getElementById('filterAllBtn');
  const btnDiff = document.getElementById('filterDiffBtn');
  const btnNew = document.getElementById('filterNewBtn');
  const btnBl = document.getElementById('filterBlacklistBtn');
  
  if (btnAll) btnAll.classList.toggle('active', filterType === 'all');
  if (btnDiff) btnDiff.classList.toggle('active', filterType === 'diff');
  if (btnNew) btnNew.classList.toggle('active', filterType === 'new');
  if (btnBl) btnBl.classList.toggle('active', filterType === 'blacklist');

  const input = document.getElementById('productSearchInput');
  searchProducts(input ? input.value : '');
}

function toggleNewOnlyFilter(isNew) {
  toggleFilter(isNew ? 'new' : 'all');
}

let searchTimeout = null;
function handleSearchInput(e) {
  clearTimeout(searchTimeout);
  const q = e.target.value;
  localStorage.setItem('search_query', q);
  searchTimeout = setTimeout(() => {
    searchProducts(q);
  }, 180);
}

function handleSearchKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    clearTimeout(searchTimeout);
    const q = (e.target.value || '').trim();
    if (!q) return;

    API.getProduct(q).then((res) => {
      const prod = (res && res.data && res.data.product) ? res.data.product : null;
      if (prod) {
        if (typeof SoundFeedback !== 'undefined') SoundFeedback.playSuccess();
        openPosPriceCheckModal(prod.barcode);
      } else {
        searchProducts(q).then(() => {
          if (cachedProductsList && cachedProductsList.length > 0) {
            const exact = cachedProductsList.find(p => String(p.barcode) === q);
            const targetProd = exact || (cachedProductsList.length === 1 ? cachedProductsList[0] : null);
            if (targetProd) {
              openPosPriceCheckModal(targetProd.barcode);
            }
          } else {
            openPosPriceCheckModal(q);
          }
        });
      }
    }).catch(() => {
      searchProducts(q);
    });
  }
}

async function searchProducts(query) {
  try {
    const res = await API.searchProducts(
      query,
      0,
      currentFilter === 'new',
      currentFilter === 'diff',
      currentFilter === 'blacklist'
    );
    const data = res.data || res;
    if (res.status === 'success' || data.products) {
      cachedProductsList = data.products || [];
      renderProductsTable(cachedProductsList);
      
      const counts = data.counts || {};
      const countEl = document.getElementById('totalProductsCount');
      if (countEl && typeof animateCount === 'function') {
        animateCount(countEl, counts.total !== undefined ? counts.total : (data.total || cachedProductsList.length));
      } else if (countEl) {
        countEl.textContent = (counts.total !== undefined ? counts.total : (data.total || cachedProductsList.length)).toLocaleString('tr-TR');
      }

      const diffCountEl = document.getElementById('diffProductsCount');
      if (diffCountEl) {
        if (typeof animateCount === 'function' && counts.diff !== undefined) {
          animateCount(diffCountEl, counts.diff);
        } else {
          diffCountEl.textContent = (counts.diff !== undefined ? counts.diff : 0).toLocaleString('tr-TR');
        }
      }

      const newCountEl = document.getElementById('newProductsCount');
      if (newCountEl) {
        if (typeof animateCount === 'function' && counts.new !== undefined) {
          animateCount(newCountEl, counts.new);
        } else {
          newCountEl.textContent = (counts.new !== undefined ? counts.new : 0).toLocaleString('tr-TR');
        }
      }

      const blCountEl = document.getElementById('blacklistProductsCount');
      const blTabCountEl = document.getElementById('blacklistTabCount');
      const blVal = counts.blacklist !== undefined ? counts.blacklist : 0;
      if (blCountEl) {
        if (typeof animateCount === 'function') animateCount(blCountEl, blVal);
        else blCountEl.textContent = blVal.toLocaleString('tr-TR');
      }
      if (blTabCountEl) {
        if (typeof animateCount === 'function') animateCount(blTabCountEl, blVal);
        else blTabCountEl.textContent = blVal.toLocaleString('tr-TR');
      }

      if (typeof updateHomeDashboardInfo === 'function') {
        updateHomeDashboardInfo();
      }
    }
  } catch (err) {
    console.error('Ürünler aranamadı:', err);
  }
}

async function syncAllLabelPrices() {
  if (!confirm("Tüm ürünlerin etiket (raf) fiyatlarını kasa satış fiyatına eşitlemek istediğinize emin misiniz?")) {
    return;
  }
  try {
    const res = await API.syncLabelPrices();
    if (res.status === 'success') {
      showToast(res.message || 'Tüm etiket fiyatları satış fiyatına eşitlendi!', 'success');
      searchProducts(document.getElementById('productSearchInput')?.value || '');
    } else {
      showToast(res.message || 'İşlem gerçekleştirilemedi.', 'error');
    }
  } catch (err) {
    showToast('Etiket fiyatları eşitlenemedi.', 'error');
  }
}

async function markProductAsPrintedManual(barcode, btnElement) {
  try {
    const res = await API.confirmProductPrinted(barcode);
    if (res.status === 'success') {
      showToast('Etiket basıldı olarak onaylandı ve raf fiyatı eşitlendi.', 'success');
      const prod = (res.data && res.data.product) || res.data || {};
      const nowStr = (res.data && res.data.last_printed_at) || new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const printedPrice = prod.price !== undefined ? Number(prod.price).toFixed(2) : null;

      const labelPriceCell = document.getElementById(`label-price-cell-${barcode}`);
      if (labelPriceCell && printedPrice) {
        labelPriceCell.innerHTML = `<span style="color:#93c5fd; font-weight:700; font-family:var(--font-mono); font-size:13px;">₺ ${printedPrice}</span>`;
      }

      const printDateCell = document.getElementById(`print-date-cell-${barcode}`);
      if (printDateCell) {
        printDateCell.innerHTML = `
          <div class="print-date-badge" style="display:inline-flex; align-items:center; gap:4px; font-size:11px; color:#38bdf8; background:rgba(2,132,199,0.12); padding:3px 8px; border-radius:6px; border:1px solid rgba(2,132,199,0.25);">
            <span>🖨️</span><span>${nowStr}</span>
          </div>
        `;
      }

      const statusCell = document.getElementById(`status-cell-${barcode}`);
      if (statusCell) {
        statusCell.innerHTML = `<span class="badge" style="background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3); font-size:10.5px; padding:3px 8px; border-radius:6px; font-weight:700;">✅ Etiket Güncel</span>`;
      }

      const row = document.getElementById(`row-${barcode}`);
      if (row) {
        row.classList.remove('row-price-mismatch');
      }

      if (btnElement) {
        btnElement.style.opacity = '0.5';
        btnElement.title = 'Zaten etiket güncel';
      }
    } else {
      showToast('Onaylanamadı: ' + res.message, 'error');
    }
  } catch (err) {
    showToast('Bağlantı hatası: ' + err.message, 'error');
  }
}

async function toggleProductBlacklist(barcode, btnElement, event) {
  if (event) {
    event.stopPropagation();
  }
  try {
    const res = await API.toggleBlacklist(barcode);
    if (res.status === 'success') {
      const isBlacklisted = res.data && res.data.is_blacklisted;
      showToast(res.message || (isBlacklisted ? 'Ürün kara listeye eklendi.' : 'Ürün kara listeden çıkarıldı.'), isBlacklisted ? 'warning' : 'success');
      
      // Buton görünümünü güncelle
      if (btnElement) {
        if (isBlacklisted) {
          btnElement.innerHTML = '🛡️';
          btnElement.title = 'Kara Listeden Çıkar';
          btnElement.style.background = 'rgba(239, 68, 68, 0.25)';
          btnElement.style.color = '#f87171';
          btnElement.style.borderColor = 'rgba(239, 68, 68, 0.5)';
        } else {
          btnElement.innerHTML = '🚫';
          btnElement.title = 'Kara Listeye Ekle (Etiketi ve Ürünü Engelle)';
          btnElement.style.background = '';
          btnElement.style.color = '';
          btnElement.style.borderColor = '';
        }
      }

      // Sayaçları güncelle
      if (res.data && res.data.counts) {
        const blCountEl = document.getElementById('blacklistProductsCount');
        if (blCountEl) {
          blCountEl.textContent = res.data.counts.blacklist.toLocaleString('tr-TR');
        }
      }

      // Cached listede de güncelle
      const prod = cachedProductsList.find(p => String(p.barcode) === String(barcode));
      if (prod) {
        prod.is_blacklisted = isBlacklisted;
      }
    } else {
      showToast('Hata: ' + (res.message || 'İşlem gerçekleştirilemedi.'), 'error');
    }
  } catch (err) {
    showToast('Bağlantı hatası: ' + err.message, 'error');
  }
}

function getTodayTrDate() {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const m = months[today.getMonth()];
  const y = today.getFullYear();
  return `${d} ${m} ${y}`;
}

function formatTrDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') {
    return getTodayTrDate();
  }
  const str = dateStr.trim();
  try {
    const dt = new Date(str);
    if (!isNaN(dt.getTime())) {
      const d = String(dt.getDate()).padStart(2, '0');
      const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
      const m = months[dt.getMonth()];
      const y = dt.getFullYear();
      return `${d} ${m} ${y}`;
    }
  } catch (e) {}
  if (/^\d{2}\.\d{2}\.\d{4}/.test(str)) {
    return str.slice(0, 10);
  }
  return str;
}

let currentSortColumn = null;
let currentSortDirection = 'asc'; // 'asc' veya 'desc'

function sortTable(column) {
  if (currentSortColumn === column) {
    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortColumn = column;
    currentSortDirection = 'asc';
  }

  // Sıralama ikonlarını güncelle
  const icons = ['barcode', 'title', 'price', 'label_price', 'date', 'print_date', 'status'];
  icons.forEach(col => {
    const el = document.getElementById(`sort-icon-${col}`);
    if (el) {
      if (col === currentSortColumn) {
        el.textContent = currentSortDirection === 'asc' ? '▲ (A-Z)' : '▼ (Z-A)';
        el.style.color = '#38bdf8';
        el.style.fontWeight = '800';
      } else {
        el.textContent = '↕️';
        el.style.color = '';
        el.style.fontWeight = '';
      }
    }
  });

  // Ürün listesini sırala
  cachedProductsList.sort((a, b) => {
    let valA, valB;
    if (column === 'barcode') {
      valA = String(a.barcode || '');
      valB = String(b.barcode || '');
      return currentSortDirection === 'asc' ? valA.localeCompare(valB, 'tr', { numeric: true }) : valB.localeCompare(valA, 'tr', { numeric: true });
    } else if (column === 'title') {
      valA = String(a.title || '');
      valB = String(b.title || '');
      return currentSortDirection === 'asc' ? valA.localeCompare(valB, 'tr') : valB.localeCompare(valA, 'tr');
    } else if (column === 'price') {
      valA = Number(a.price || 0);
      valB = Number(b.price || 0);
      return currentSortDirection === 'asc' ? valA - valB : valB - valA;
    } else if (column === 'label_price') {
      valA = (a.label_price !== null && a.label_price !== undefined) ? Number(a.label_price) : -1;
      valB = (b.label_price !== null && b.label_price !== undefined) ? Number(b.label_price) : -1;
      return currentSortDirection === 'asc' ? valA - valB : valB - valA;
    } else if (column === 'date') {
      valA = String(a.price_updated_at || a.updated_at || a.created_at || '');
      valB = String(b.price_updated_at || b.updated_at || b.created_at || '');
      return currentSortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else if (column === 'print_date') {
      valA = String(a.last_printed_at || '');
      valB = String(b.last_printed_at || '');
      return currentSortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else if (column === 'status') {
      const getStatusRank = (p) => {
        const hasL = (p.label_price !== null && p.label_price !== undefined);
        const pP = Number(p.price || 0);
        const lP = Number(p.label_price || 0);
        if (hasL && Math.abs(pP - lP) > 0.001) return 1; // Farklı
        if (!p.last_printed_at) return 2; // Bekliyor
        return 3; // Güncel
      };
      valA = getStatusRank(a);
      valB = getStatusRank(b);
      return currentSortDirection === 'asc' ? valA - valB : valB - valA;
    }
    return 0;
  });

  renderProductsTable(cachedProductsList);
}

let currentProductPage = 1;
const PRODUCTS_PER_PAGE = 100;

function renderProductsTable(products, page = 1) {
  const tbody = document.getElementById('productsTableBody');
  if (!tbody) return;

  if (!products || products.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="padding: 36px 16px; text-align: center;">
          <div class="empty-state">
            <div class="empty-state-icon">📦</div>
            <div class="empty-state-title">Kayıtlı Ürün Bulunamadı</div>
            <div class="empty-state-desc">Arama teriminizi değiştirebilir veya kasa_aktarim sekmesinden ürün dosyanızı yükleyebilirsiniz.</div>
          </div>
        </td>
      </tr>`;
    renderProductsStatusBar(0, 0, 0);
    return;
  }

  currentProductPage = page;
  const totalItems = products.length;
  const totalPages = Math.ceil(totalItems / PRODUCTS_PER_PAGE);
  const startIndex = (page - 1) * PRODUCTS_PER_PAGE;
  const endIndex = Math.min(startIndex + PRODUCTS_PER_PAGE, totalItems);
  const pageProducts = products.slice(startIndex, endIndex);

  const rowsHtml = pageProducts.map((p, idx) => {
    const globalIdx = startIndex + idx + 1;
    const newBadge = p.is_new ? '<span class="badge badge-success" style="font-size:10px; margin-left:8px;">✨ YENİ</span>' : '';
    const posPrice = (typeof p.price === 'number') ? p.price : Number(p.price || 0);
    const posPriceStr = posPrice.toFixed(2);
    const barcodeEscaped = (p.barcode || '').replace(/'/g, "\\'");
    const priceDate = formatTrDate(p.price_updated_at || p.updated_at || p.created_at);

    const hasLabelPrice = (p.label_price !== null && p.label_price !== undefined);
    const labelPrice = hasLabelPrice ? Number(p.label_price) : null;
    const labelPriceStr = hasLabelPrice ? labelPrice.toFixed(2) : '-';

    // Fiyat Farkı Tespiti
    const isMismatch = hasLabelPrice && Math.abs(posPrice - labelPrice) > 0.001;
    const isUnprinted = !p.last_printed_at;

    let labelPriceHtml = '';
    if (hasLabelPrice) {
      if (isMismatch) {
        labelPriceHtml = `<span style="color:#fbbf24; font-weight:800; font-family:var(--font-mono); font-size:13px;">₺ ${labelPriceStr}</span>`;
      } else {
        labelPriceHtml = `<span style="color:#93c5fd; font-weight:700; font-family:var(--font-mono); font-size:13px;">₺ ${labelPriceStr}</span>`;
      }
    } else {
      labelPriceHtml = `<span style="color:var(--text-muted); font-size:11px;">Basılmadı</span>`;
    }

    let printDateHtml = '';
    if (p.last_printed_at) {
      printDateHtml = `
        <div class="print-date-badge" style="display:inline-flex; align-items:center; gap:4px; font-size:11px; color:#38bdf8; background:rgba(2,132,199,0.12); padding:3px 8px; border-radius:6px; border:1px solid rgba(2,132,199,0.25);">
          <span>🖨️</span><span>${p.last_printed_at}</span>
        </div>`;
    } else {
      printDateHtml = `<span style="font-size:11px; color:var(--text-muted); padding:2px 6px;">Henüz basılmadı</span>`;
    }

    let statusHtml = '';
    if (isMismatch) {
      const diffAmt = Math.abs(posPrice - labelPrice).toFixed(2);
      statusHtml = `<span class="badge" style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid rgba(239,68,68,0.4); font-size:10.5px; padding:3px 8px; border-radius:6px; font-weight:700;">⚠️ FARK: ₺${diffAmt}</span>`;
    } else if (isUnprinted) {
      statusHtml = `<span class="badge" style="background:rgba(245,158,11,0.15); color:#fbbf24; border:1px solid rgba(245,158,11,0.3); font-size:10.5px; padding:3px 8px; border-radius:6px; font-weight:700;">⚠️ Baskı Bekliyor</span>`;
    } else {
      statusHtml = `<span class="badge" style="background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3); font-size:10.5px; padding:3px 8px; border-radius:6px; font-weight:700;">✅ Etiket Güncel</span>`;
    }

    const rowClass = isMismatch ? 'row-price-mismatch' : '';
    
    // Yazıcıda çıkacak temizlenmiş ürün ismi
    const printTitle = cleanProductTitle(p.title || p.raw_system_title || '').trim() || (p.title || '');

    const isBl = !!p.is_blacklisted;
    const blBadge = isBl ? '<span class="badge" style="font-size:10px; margin-left:6px; background:rgba(239,68,68,0.25); color:#fca5a5; border:1px solid rgba(239,68,68,0.45);">🛡️ KARA LİSTE</span>' : '';

    return `
      <tr id="row-${barcodeEscaped}" class="${rowClass}" onclick="openProductEditModal('${barcodeEscaped}')" style="cursor: pointer;" title="Düzenlemek için tıklayın">
        <td class="col-idx">${globalIdx}</td>
        <td class="col-barcode" style="font-family:'JetBrains Mono', monospace; font-weight:700; color:#818cf8;" title="${p.barcode || ''}">${p.barcode || ''}</td>
        <td class="col-title" style="font-weight:700; color:#fff;" title="Sistem Kaydı: ${escapeHtml(p.raw_system_title || p.title || '')}">${escapeHtml(printTitle)}${newBadge}${blBadge}</td>
        <td class="col-pos-price" id="pos-price-cell-${barcodeEscaped}">₺ ${posPriceStr}</td>
        <td class="col-label-price" id="label-price-cell-${barcodeEscaped}">${labelPriceHtml}</td>
        <td class="col-price-date">
          <div style="font-size:11.5px; font-weight:700; color:#f8fafc; display:flex; align-items:center; gap:5px;">
            <span style="color:#10b981;">📅</span> <span>${priceDate}</span>
          </div>
        </td>
        <td class="col-print-date" id="print-date-cell-${barcodeEscaped}">${printDateHtml}</td>
        <td class="col-status" id="status-cell-${barcodeEscaped}">${statusHtml}</td>
        <td class="col-action" style="text-align:center;" onclick="event.stopPropagation()">
          <button class="btn-excel-print" onclick="event.stopPropagation(); printBarcode('${barcodeEscaped}', this, ${posPrice})" title="Hızlı Etiket Bas" style="padding: 5px 14px; font-size: 12px;">
            🖨️ Yazdır
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml;
  renderProductsStatusBar(totalItems, page, totalPages);
}

function renderProductsStatusBar(totalItems, page = 1, totalPages = 1) {
  let paginationEl = document.getElementById('productsTablePagination');
  if (!paginationEl) {
    const tableContainer = document.querySelector('#tab-search .table-container');
    if (tableContainer && tableContainer.parentNode) {
      paginationEl = document.createElement('div');
      paginationEl.id = 'productsTablePagination';
      paginationEl.className = 'table-pagination-bar';
      paginationEl.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 16px; background:rgba(15,23,42,0.9); border-top:1px solid var(--border-color); font-size:12.5px; color:var(--text-muted); flex-wrap:wrap; gap:10px; border-radius:0 0 10px 10px;';
      tableContainer.parentNode.appendChild(paginationEl);
    }
  }

  if (!paginationEl) return;

  if (totalItems === 0) {
    paginationEl.innerHTML = '';
    return;
  }

  const startNum = (page - 1) * PRODUCTS_PER_PAGE + 1;
  const endNum = Math.min(page * PRODUCTS_PER_PAGE, totalItems);

  paginationEl.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px;">
      <span>Toplam: <strong style="color:var(--primary); font-size:13px;">${totalItems.toLocaleString('tr-TR')} Ürün</strong></span>
      <span style="color:#64748b;">|</span>
      <span>Gösterilen: <strong style="color:#38bdf8;">${startNum} - ${endNum}</strong> (Sayfa ${page} / ${totalPages})</span>
    </div>
    <div style="display:flex; align-items:center; gap:8px;">
      <button class="btn btn-secondary btn-sm" onclick="goToProductPage(1)" ${page <= 1 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : 'style="cursor:pointer;"'} title="İlk Sayfa">⏮️ İlk</button>
      <button class="btn btn-secondary btn-sm" onclick="goToProductPage(${page - 1})" ${page <= 1 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : 'style="cursor:pointer;"'} title="Önceki Sayfa">◀ Önceki</button>
      <span style="font-weight:700; color:#f8fafc; padding:0 4px;">${page} / ${totalPages}</span>
      <button class="btn btn-secondary btn-sm" onclick="goToProductPage(${page + 1})" ${page >= totalPages ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : 'style="cursor:pointer;"'} title="Sonraki Sayfa">Sonraki ▶</button>
      <button class="btn btn-secondary btn-sm" onclick="goToProductPage(${totalPages})" ${page >= totalPages ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : 'style="cursor:pointer;"'} title="Son Sayfa">Son ⏭️</button>
      <button class="btn btn-secondary btn-sm" onclick="scrollToTableTop()" style="padding:4px 10px; font-weight:700; margin-left:6px;">⬆️ Başa Dön</button>
    </div>
  `;
}

function goToProductPage(page) {
  const totalPages = Math.ceil(cachedProductsList.length / PRODUCTS_PER_PAGE);
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  renderProductsTable(cachedProductsList, page);
  scrollToTableTop();
}

function scrollToTableTop() {
  const container = document.querySelector('#tab-search .table-container');
  if (container) container.scrollTop = 0;
}
