// =========================================================================
// 🕵️ PİYASA FİYAT RADARI & 45 GÜNLÜK UYUYAN ÜRÜNLER MODÜLÜ
// =========================================================================

let marketRadarProducts = [];
let marketCurrentDays = 45;
let marketActiveFilter = 'all';
let marketScanPollingInterval = null;
let marketSortColumn = 'diff_percent';
let marketSortDirection = 'desc';

/**
 * Ürünün bugüne göre tam gün farkını tam sayı olarak döndürür
 */
function getItemElapsedDays(item) {
  const rawDateStr = item.price_updated_at || item.updated_at || item.created_at || '';
  const targetDate = parseClientDate(rawDateStr);
  if (targetDate) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
    return Math.max(0, Math.floor((startOfToday - startOfTarget) / (1000 * 60 * 60 * 24)));
  }
  if (item.days_since_update !== undefined && item.days_since_update !== null) {
    return parseInt(item.days_since_update, 10) || 9999;
  }
  return 9999;
}

/**
 * Tablo sütun başlığına tıklandığında A-Z / Z-A veya Artan / Azalan sıralama yapar
 */
function handleMarketTableSort(colKey) {
  if (marketSortColumn === colKey) {
    marketSortDirection = (marketSortDirection === 'asc') ? 'desc' : 'asc';
  } else {
    marketSortColumn = colKey;
    if (colKey === 'title' || colKey === 'barcode') {
      marketSortDirection = 'asc';
    } else {
      marketSortDirection = 'desc'; // İlk tıklamada en çoktan aza (en yüksek gün / fiyat / zarar)
    }
  }
  updateSortHeaderIcons();
  renderMarketRadarTable();
}

/**
 * Tablo başlığındaki sıralama ikonlarını günceller (A-Z, Z-A, ▲, ▼, ⇅)
 */
function updateSortHeaderIcons() {
  const sortKeys = ['barcode', 'title', 'days_since_update', 'current_price', 'market_price', 'diff_percent'];
  sortKeys.forEach(key => {
    const iconEl = document.getElementById(`sortIcon_${key}`);
    const thEl = iconEl ? iconEl.closest('th') : null;
    if (!iconEl) return;

    if (marketSortColumn === key) {
      if (key === 'title' || key === 'barcode') {
        iconEl.innerHTML = marketSortDirection === 'asc' ? '<span style="color:#38bdf8; font-weight:800;">▲ A-Z</span>' : '<span style="color:#38bdf8; font-weight:800;">▼ Z-A</span>';
      } else if (key === 'days_since_update') {
        iconEl.innerHTML = marketSortDirection === 'desc' ? '<span style="color:#38bdf8; font-weight:800;">▼ Çoktan Aza</span>' : '<span style="color:#38bdf8; font-weight:800;">▲ Azdan Çoka</span>';
      } else if (key === 'diff_percent') {
        iconEl.innerHTML = marketSortDirection === 'desc' ? '<span style="color:#38bdf8; font-weight:800;">▼ En Çok Ucuz</span>' : '<span style="color:#38bdf8; font-weight:800;">▲ En Az Ucuz</span>';
      } else {
        iconEl.innerHTML = marketSortDirection === 'desc' ? '<span style="color:#38bdf8; font-weight:800;">▼ Azalan</span>' : '<span style="color:#38bdf8; font-weight:800;">▲ Artan</span>';
      }
      if (thEl) thEl.style.color = '#38bdf8';
    } else {
      iconEl.innerHTML = '⇅';
      iconEl.style.color = '#64748b';
      if (thEl) thEl.style.color = '#94a3b8';
    }
  });
}

/**
 * DD.MM.YYYY, YYYY-MM-DD veya ISO tarih metinlerini Date nesnesine çevirir
 */
function parseClientDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s) return null;

  // DD.MM.YYYY veya DD.MM.YYYY HH:MM:SS
  const ddmmyyyyMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (ddmmyyyyMatch) {
    const day = parseInt(ddmmyyyyMatch[1], 10);
    const month = parseInt(ddmmyyyyMatch[2], 10) - 1;
    const year = parseInt(ddmmyyyyMatch[3], 10);
    const hour = parseInt(ddmmyyyyMatch[4] || '0', 10);
    const minute = parseInt(ddmmyyyyMatch[5] || '0', 10);
    const second = parseInt(ddmmyyyyMatch[6] || '0', 10);
    return new Date(year, month, day, hour, minute, second);
  }

  // YYYY-MM-DD veya YYYY-MM-DD HH:MM:SS
  const yyyymmddMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (yyyymmddMatch) {
    const year = parseInt(yyyymmddMatch[1], 10);
    const month = parseInt(yyyymmddMatch[2], 10) - 1;
    const day = parseInt(yyyymmddMatch[3], 10);
    const hour = parseInt(yyyymmddMatch[4] || '0', 10);
    const minute = parseInt(yyyymmddMatch[5] || '0', 10);
    const second = parseInt(yyyymmddMatch[6] || '0', 10);
    return new Date(year, month, day, hour, minute, second);
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Bugünün tarihine göre tam geçen gün sayısını hesaplar ve estetik HTML üretir
 */
function formatDaysElapsedDisplay(rawDateStr, serverDays) {
  const targetDate = parseClientDate(rawDateStr);
  let daysAgo = (serverDays !== undefined && serverDays !== null) ? parseInt(serverDays, 10) : null;

  if (targetDate) {
    const now = new Date();
    // Saat/dakika farkından bağımsız saf gün farkı
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
    const diffDays = Math.max(0, Math.floor((startOfToday - startOfTarget) / (1000 * 60 * 60 * 24)));
    daysAgo = diffDays;
  }

  if (daysAgo === null || daysAgo === undefined || isNaN(daysAgo)) {
    daysAgo = 999;
  }

  // Tarih etiketi
  let dateFormatted = '';
  if (targetDate) {
    const d = String(targetDate.getDate()).padStart(2, '0');
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const y = targetDate.getFullYear();
    dateFormatted = `${d}.${m}.${y}`;
  } else if (rawDateStr) {
    dateFormatted = String(rawDateStr).substring(0, 10);
  } else {
    dateFormatted = 'Kayıt Yok';
  }

  if (daysAgo >= 999 || !rawDateStr) {
    return `
      <div style="font-weight: 800; color: #f43f5e; font-size: 13px;">1+ Yıldan Fazla</div>
      <div style="font-size: 10.5px; color: #64748b;">📅 ${dateFormatted}</div>
    `;
  }

  let subText = '';
  let color = '#10b981'; // yeşil

  if (daysAgo >= 365) {
    color = '#f43f5e'; // kırmızı
    const years = (daysAgo / 365.25).toFixed(1);
    subText = `📅 ${dateFormatted} (~${years} Yıl Önce)`;
  } else if (daysAgo >= 30) {
    color = '#f59e0b'; // turuncu
    const months = Math.floor(daysAgo / 30.4);
    subText = `📅 ${dateFormatted} (${months > 0 ? months + ' Ay' : daysAgo + ' Gün'} Önce)`;
  } else {
    color = '#10b981';
    subText = `📅 ${dateFormatted}`;
  }

  return `
    <div style="font-weight: 800; color: ${color}; font-size: 13px;">${daysAgo} Gün Önce</div>
    <div style="font-size: 10.5px; color: #94a3b8; font-weight: 600; margin-top: 1px;">${subText}</div>
  `;
}

async function initMarketRadarModule() {
  await loadMarketRadarData();
  checkScanStatusPeriodically();
}

/**
 * 45+ Günlük ürünleri ve piyasa kıyaslama verilerini API'den yükler
 */
async function loadMarketRadarData() {
  const tbody = document.getElementById('marketRadarTableBody');
  const daysSelect = document.getElementById('marketDaysSelect');
  if (daysSelect) {
    marketCurrentDays = parseInt(daysSelect.value, 10) || 45;
  }

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px; color: #94a3b8;">
          <div style="font-size: 24px; animation: spin 1.5s linear infinite; display: inline-block;">⏳</div>
          <div style="margin-top: 8px;">Son ${marketCurrentDays} gündür değişmeyen ürünler ve piyasa verileri yükleniyor...</div>
        </td>
      </tr>
    `;
  }

  try {
    const res = await fetch(`/api/market-radar/stagnant-products?days=${marketCurrentDays}`);
    const data = await res.json();

    if (data.status === 'success' && data.data) {
      marketRadarProducts = data.data.products || [];
      const summary = data.data.summary || {};

      updateMarketSummaryCards(summary);
      updateSidebarRadarBadge(summary.cheaper_count || 0);
      renderMarketRadarTable();
    } else {
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; padding: 30px; color: #f43f5e;">
              ❌ Veriler alınamadı: ${data.message || 'Bilinmeyen hata'}
            </td>
          </tr>
        `;
      }
    }
  } catch (err) {
    console.error("Market radar verisi yüklenirken hata:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 30px; color: #f43f5e;">
            ❌ Sunucu bağlantı hatası: ${err.message}
          </td>
        </tr>
      `;
    }
  }
}

/**
 * Özet metrik kartlarını günceller
 */
function updateMarketSummaryCards(summary) {
  const statTotal = document.getElementById('statTotalStagnant');
  const statCheaper = document.getElementById('statCheaperCount');
  const statNormal = document.getElementById('statNormalCount');
  const statAvgLoss = document.getElementById('statAvgLossPercent');
  const thresholdLabel = document.getElementById('statThresholdLabel');

  if (statTotal) statTotal.textContent = (summary.total_stagnant !== undefined) ? summary.total_stagnant : '-';
  if (statCheaper) statCheaper.textContent = summary.cheaper_count || 0;
  if (statNormal) statNormal.textContent = summary.normal_count || 0;
  if (statAvgLoss) statAvgLoss.textContent = `%${summary.avg_loss_percent || 0}`;
  if (thresholdLabel) thresholdLabel.textContent = `${marketCurrentDays}+ gündür değişmemiş`;
}

/**
 * Sol menüdeki rozet sayısını günceller
 */
function updateSidebarRadarBadge(cheaperCount) {
  const badge = document.getElementById('sidebarMarketRadarBadge');
  if (badge) {
    if (cheaperCount > 0) {
      badge.textContent = cheaperCount > 99 ? '99+' : cheaperCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}

/**
 * Gün eşiği değiştiğinde tetiklenir
 */
function handleMarketDaysChange(val) {
  marketCurrentDays = parseInt(val, 10) || 45;
  loadMarketRadarData();
}

/**
 * Filtre sekmesini değiştirir (all, cheaper, normal, not_scanned)
 */
function setMarketTableFilter(filterKey, btnEl) {
  marketActiveFilter = filterKey;
  
  document.querySelectorAll('.market-filter-btn').forEach(btn => {
    btn.classList.remove('active', 'btn-primary');
    btn.classList.add('btn-secondary');
  });

  if (btnEl) {
    btnEl.classList.add('active', 'btn-primary');
    btnEl.classList.remove('btn-secondary');
  }

  renderMarketRadarTable();
}

/**
 * Lokal filtreleme ve arama yaparak tabloyu render eder
 */
function renderMarketRadarTable() {
  const tbody = document.getElementById('marketRadarTableBody');
  const searchInput = document.getElementById('marketSearchInput');
  const summaryCount = document.getElementById('marketTableSummaryCount');
  if (!tbody) return;

  const query = (searchInput ? searchInput.value : '').toLowerCase().trim();

  let filtered = marketRadarProducts.filter(item => {
    // Filtre kriteri
    if (marketActiveFilter === 'scanned') {
      if (!item.market_price || item.market_price <= 0) return false;
    } else if (marketActiveFilter === 'cheaper') {
      if (!item.market_price || item.market_price <= item.current_price) return false;
    } else if (marketActiveFilter === 'normal') {
      if (!item.market_price || item.current_price < item.market_price) return false;
    } else if (marketActiveFilter === 'not_scanned') {
      if (item.market_price && item.market_price > 0) return false;
    }

    // Arama sorgusu
    if (query) {
      const matchTitle = (item.title || '').toLowerCase().includes(query);
      const matchBarcode = (item.barcode || '').toLowerCase().includes(query);
      const matchBrand = (item.brand || '').toLowerCase().includes(query);
      return matchTitle || matchBarcode || matchBrand;
    }
    return true;
  });

  if (summaryCount) {
    summaryCount.textContent = `Toplam ${filtered.length} ürün listeleniyor (Kriter: ${marketCurrentDays}+ gün)`;
  }

  // 🔄 TEK TIKLA SÜTUN SIRALAMA (A-Z, Z-A, Min-Max, Max-Min)
  filtered.sort((a, b) => {
    let res = 0;
    if (marketSortColumn === 'barcode') {
      res = String(a.barcode || '').localeCompare(String(b.barcode || ''), 'tr', { numeric: true });
    } else if (marketSortColumn === 'title') {
      res = String(a.title || '').localeCompare(String(b.title || ''), 'tr');
    } else if (marketSortColumn === 'days_since_update') {
      const dA = getItemElapsedDays(a);
      const dB = getItemElapsedDays(b);
      res = dA - dB;
    } else if (marketSortColumn === 'current_price') {
      res = (parseFloat(a.current_price) || 0) - (parseFloat(b.current_price) || 0);
    } else if (marketSortColumn === 'market_price') {
      res = (parseFloat(a.market_price) || 0) - (parseFloat(b.market_price) || 0);
    } else if (marketSortColumn === 'diff_percent') {
      res = (parseFloat(a.diff_percent) || 0) - (parseFloat(b.diff_percent) || 0);
    }
    return marketSortDirection === 'asc' ? res : -res;
  });

  updateSortHeaderIcons();

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px; color: #94a3b8; font-size: 13px;">
          🔍 Seçili filtre veya arama kriterine uygun ürün bulunamadı.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((item, idx) => {
    const ourPrice = parseFloat(item.current_price || 0);
    const marketPrice = parseFloat(item.market_price || 0);
    const hasAudit = marketPrice > 0;
    
    // Marka Rozeti
    const brandStr = String(item.brand || '').trim();
    const isNumericBrand = !brandStr || /^\d+$/.test(brandStr) || brandStr === String(item.barcode).trim() || brandStr === String(item.stock_code).trim();
    const brandBadge = (!isNumericBrand) ? `<div style="margin-top: 3px;"><span style="background: rgba(2,132,199,0.15); color: #38bdf8; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight:700; border: 1px solid rgba(2,132,199,0.3); display: inline-block;">${brandStr}</span></div>` : '';

    // Fiyat Farkı Hesaplaması
    let diffBadge = `<span class="badge" style="background: rgba(255,255,255,0.06); color: #94a3b8; font-size: 11px;">Taranmadı</span>`;
    let isCheaper = false;

    if (hasAudit) {
      const diffAmt = marketPrice - ourPrice;
      const diffPct = ourPrice > 0 ? ((diffAmt / ourPrice) * 100).toFixed(1) : 0;

      if (diffAmt > 0.5) {
        isCheaper = true;
        diffBadge = `
          <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
            <span class="badge" style="background: rgba(244, 63, 94, 0.2); color: #f43f5e; border: 1px solid rgba(244, 63, 94, 0.4); font-size: 11.5px; font-weight: 800;">
              🔴 %${diffPct} Ucuz Kaldı!
            </span>
            <span style="font-size: 10.5px; color: #f43f5e; font-weight: 700;">(-${diffAmt.toFixed(2)} ₺ Zarar Riski)</span>
          </div>
        `;
      } else if (diffAmt < -0.5) {
        diffBadge = `
          <span class="badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-size: 11px; font-weight: 700;">
            🔵 %${Math.abs(diffPct)} Piyasadan Yüksek
          </span>
        `;
      } else {
        diffBadge = `
          <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 11px; font-weight: 700;">
            🟢 Piyasa ile Uyumlu
          </span>
        `;
      }
    }

    // Bulunan veya Doğrudan Rüyam Market Ürün/Arama Linki
    const cleanSearchTerm = encodeURIComponent(item.barcode || item.title);
    let sourcesHtml = '';

    if (item.sources_list && item.sources_list.length > 0) {
      sourcesHtml = item.sources_list.slice(0, 1).map(s => {
        const sName = typeof s === 'object' ? (s.name || 'Rüyam Market') : String(s);
        let sUrl = (typeof s === 'object' && s.url) ? s.url : `https://www.ruyammarket.com/arama?q=${cleanSearchTerm}`;
        if (!sUrl.includes('ruyammarket.com')) {
          sUrl = `https://www.ruyammarket.com/arama?q=${cleanSearchTerm}`;
        }
        return `
          <a href="${sUrl}" target="_blank" rel="noopener noreferrer" 
             style="font-size: 10.5px; background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); padding: 2px 7px; border-radius: 4px; text-decoration: none; display: inline-flex; align-items: center; gap: 3px; font-weight: 700; transition: transform 0.1s, background 0.1s;"
             onmouseover="this.style.background='rgba(56,189,248,0.25)'; this.style.transform='scale(1.05)';"
             onmouseout="this.style.background='rgba(56,189,248,0.12)'; this.style.transform='scale(1)';"
             title="Rüyam Market ürün sayfasına git">
            🔗 Rüyam Market
          </a>
        `;
      }).join(' ');
    } else {
      // Taranmadıysa veya bulunamadıysa hızlı Rüyam Market arama linki
      sourcesHtml = `
        <div style="display: inline-flex; gap: 4px; flex-wrap: wrap;">
          <a href="https://www.ruyammarket.com/arama?q=${cleanSearchTerm}" target="_blank" rel="noopener noreferrer" style="font-size: 10.5px; background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); padding: 2px 7px; border-radius: 4px; text-decoration: none; font-weight: 700;" title="Rüyam Market'te Canlı Ara">🔗 Rüyam Market</a>
        </div>
      `;
    }

    // Son Güncelleme Formatı & Gün Hesaplama
    const rawDateStr = item.price_updated_at || item.updated_at || item.created_at || '';
    const daysDisplayHtml = formatDaysElapsedDisplay(rawDateStr, item.days_since_update);

    return `
      <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.04); background: ${isCheaper ? 'rgba(244, 63, 94, 0.04)' : 'transparent'}; transition: background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='${isCheaper ? 'rgba(244, 63, 94, 0.04)' : 'transparent'}'">
        <td style="padding: 10px 12px; text-align: center;">
          <input type="checkbox" class="market-row-checkbox" data-barcode="${item.barcode}" data-market-price="${marketPrice}" data-our-price="${ourPrice}" data-title="${encodeURIComponent(item.title)}" style="cursor: pointer;">
        </td>
        <td style="padding: 10px 12px; width: 140px;">
          <div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; color: #cbd5e1; letter-spacing: 0.3px;">
            ${item.barcode}
          </div>
          ${brandBadge}
        </td>
        <td style="padding: 10px 12px;">
          <div style="font-weight: 800; color: #f8fafc; font-size: 13px; line-height: 1.4;">
            ${item.title}
          </div>
        </td>
        <td style="padding: 10px 12px; width: 145px;">
          ${daysDisplayHtml}
        </td>
        <td style="padding: 10px 12px; text-align: right; width: 120px;">
          <div style="font-weight: 800; font-size: 14px; color: #f8fafc; font-family: 'JetBrains Mono', monospace;">
            ${ourPrice.toFixed(2)} ₺
          </div>
        </td>
        <td style="padding: 10px 12px; text-align: right; width: 160px;">
          ${hasAudit ? `
            <div style="font-weight: 800; font-size: 14px; color: #38bdf8; font-family: 'JetBrains Mono', monospace;">
              ${marketPrice.toFixed(2)} ₺
            </div>
            <div style="display: flex; gap: 4px; justify-content: flex-end; margin-top: 4px; flex-wrap: wrap;">
              ${sourcesHtml}
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
              <button class="btn btn-secondary btn-sm" onclick="scanSingleProduct('${item.barcode}')" style="font-size: 11px; padding: 3px 8px; border-color: rgba(56,189,248,0.3); color: #38bdf8; font-weight:700;">
                🔍 Fiyatı Bul
              </button>
              <div style="display: flex; gap: 3px; justify-content: flex-end; margin-top: 2px;">
                ${sourcesHtml}
              </div>
            </div>
          `}
        </td>
        <td style="padding: 10px 12px; text-align: center; width: 160px;">
          ${diffBadge}
        </td>
        <td style="padding: 10px 12px; text-align: center; width: 130px;">
          <div style="display: flex; gap: 6px; justify-content: center; align-items: center;">
            ${hasAudit && isCheaper ? `
              <button class="btn btn-success btn-sm" onclick="applySingleMarketPrice('${item.barcode}', ${marketPrice})" title="Fiyatı ${marketPrice.toFixed(2)} ₺ yap" style="padding: 4px 8px; font-size: 11.5px; font-weight: 700;">
                ⚡ Eşitle
              </button>
            ` : ''}
            <button class="btn btn-secondary btn-sm" onclick="quickEditItemPrice('${item.barcode}', ${ourPrice})" title="Yeni Fiyat Gir" style="padding: 4px 8px; font-size: 11px;">
              ✏️
            </button>
            <button class="btn btn-secondary btn-sm" onclick="sendSingleToPrintQueue('${item.barcode}', '${encodeURIComponent(item.title)}', ${ourPrice})" title="Etiket Masasına Gönder" style="padding: 4px 8px; font-size: 11px; color: #a78bfa;">
              🖨️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterMarketTableLocally() {
  renderMarketRadarTable();
}

function toggleMarketSelectAll(checked) {
  document.querySelectorAll('.market-row-checkbox').forEach(cb => {
    cb.checked = checked;
  });
}

/**
 * Arka planda internet taramasını başlatır veya durdurur
 */
async function toggleMarketScan() {
  const btn = document.getElementById('btnStartMarketScan');
  const btnText = document.getElementById('scanBtnText');
  const btnIcon = document.getElementById('scanBtnIcon');

  try {
    const statusRes = await fetch('/api/market-radar/scan-status');
    const statusData = await statusRes.json();
    const isRunning = statusData.data && statusData.data.is_running;

    if (isRunning) {
      // Durdur
      const res = await fetch('/api/market-radar/stop-scan', { method: 'POST' });
      const data = await res.json();
      if (typeof showToast === 'function') showToast(data.message || 'Tarama durduruluyor...', 'info');
      if (btnText) btnText.textContent = "Rüyam Market Fiyatlarını Tara";
      if (btnIcon) btnIcon.textContent = "▶️";
      if (btn) btn.className = "btn btn-primary";
    } else {
      // Başlat
      const res = await fetch('/api/market-radar/start-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: marketCurrentDays })
      });
      const data = await res.json();
      if (data.status === 'success') {
        if (typeof showToast === 'function') showToast(data.message || 'Piyasa taraması başlatıldı!', 'success');
        if (btnText) btnText.textContent = "Taramayı Durdur";
        if (btnIcon) btnIcon.textContent = "⏹️";
        if (btn) btn.className = "btn btn-danger";
        startScanStatusPolling();
      } else {
        if (typeof showToast === 'function') showToast(data.message || 'Tarama başlatılamadı.', 'warning');
      }
    }
  } catch (err) {
    console.error("Tarama butonu hatası:", err);
    if (typeof showToast === 'function') showToast("Sunucu hatası: " + err.message, 'error');
  }
}

/**
 * Tarama durumunu periyodik sorgulayan fonksiyon
 */
function startScanStatusPolling() {
  const progressContainer = document.getElementById('marketScanProgressContainer');
  if (progressContainer) progressContainer.style.display = 'block';

  if (marketScanPollingInterval) clearInterval(marketScanPollingInterval);

  marketScanPollingInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/market-radar/scan-status');
      const data = await res.json();
      if (data.status === 'success' && data.data) {
        const isRunning = data.data.is_running;
        const prog = data.data.progress || {};

        const total = prog.total || 0;
        const completed = prog.completed || 0;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

        const progressBar = document.getElementById('scanProgressBar');
        const ratioText = document.getElementById('scanProgressRatio');
        const statusText = document.getElementById('scanProgressStatusText');
        const currProd = document.getElementById('scanCurrentProductTitle');
        const foundCount = document.getElementById('scanFoundCount');
        const cheaperCount = document.getElementById('scanCheaperCount');

        if (progressBar) progressBar.style.width = `${pct}%`;
        if (ratioText) ratioText.textContent = `${completed} / ${total} (%${pct})`;
        if (statusText) statusText.textContent = prog.status_text || 'Taranıyor...';
        if (currProd) currProd.textContent = prog.current_title || '-';
        if (foundCount) foundCount.textContent = prog.found || 0;
        if (cheaperCount) cheaperCount.textContent = prog.cheaper_than_market || 0;

        if (!isRunning) {
          clearInterval(marketScanPollingInterval);
          marketScanPollingInterval = null;
          
          const btnText = document.getElementById('scanBtnText');
          const btnIcon = document.getElementById('scanBtnIcon');
          const btn = document.getElementById('btnStartMarketScan');
          if (btnText) btnText.textContent = "Rüyam Market Fiyatlarını Tara";
          if (btnIcon) btnIcon.textContent = "▶️";
          if (btn) btn.className = "btn btn-primary";

          if (typeof showToast === 'function') {
            showToast(`✅ Tarama tamamlandı! Bulunan: ${prog.found}, Piyasadan Ucuz Kalan: ${prog.cheaper_than_market}`, 'success');
          }
          await loadMarketRadarData();
        }
      }
    } catch (e) {
      console.warn("Scan status polling hatası:", e);
    }
  }, 1200);
}

function checkScanStatusPeriodically() {
  fetch('/api/market-radar/scan-status').then(r => r.json()).then(data => {
    if (data.data && data.data.is_running) {
      const btnText = document.getElementById('scanBtnText');
      const btnIcon = document.getElementById('scanBtnIcon');
      const btn = document.getElementById('btnStartMarketScan');
      if (btnText) btnText.textContent = "Taramayı Durdur";
      if (btnIcon) btnIcon.textContent = "⏹️";
      if (btn) btn.className = "btn btn-danger";
      startScanStatusPolling();
    }
  }).catch(() => {});
}

/**
 * Tek bir ürün için internet fiyatını canlı sorgular
 */
async function scanSingleProduct(barcode) {
  if (typeof showToast === 'function') showToast(`Barkod (${barcode}) internette taranıyor...`, 'info');
  
  try {
    const res = await fetch('/api/market-radar/scan-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode: barcode })
    });
    const data = await res.json();
    
    if (data.status === 'success' && data.data) {
      if (typeof showToast === 'function') {
        showToast(`✅ ${data.data.title}: Piyasa Fiyatı ${data.data.market_price} ₺ bulundu!`, 'success');
      }
      await loadMarketRadarData();
    } else {
      if (typeof showToast === 'function') {
        showToast(`ℹ️ ${data.message || 'Ürün için kaynak linklerinden fiyat kontrol edebilirsiniz.'}`, 'info');
      }
      await loadMarketRadarData();
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast("Arama hatası: " + err.message, 'error');
  }
}

/**
 * Tek bir ürünün fiyatını bulunan piyasa fiyatına eşitler
 */
async function applySingleMarketPrice(barcode, price) {
  try {
    const res = await fetch('/api/market-radar/apply-price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode: barcode, new_price: price, reason: "Piyasa Radarı Eşitleme" })
    });
    const data = await res.json();
    if (data.status === 'success') {
      if (typeof showToast === 'function') showToast(`✅ Fiyat ${price.toFixed(2)} ₺ olarak güncellendi.`, 'success');
      await loadMarketRadarData();
    } else {
      if (typeof showToast === 'function') showToast("Hata: " + data.message, 'error');
    }
  } catch (e) {
    if (typeof showToast === 'function') showToast("Bağlantı hatası: " + e.message, 'error');
  }
}

/**
 * Hızlı manuel fiyat girişi prompt modalı
 */
function quickEditItemPrice(barcode, currentPrice) {
  const val = prompt(`Barkod: ${barcode}\nMevcut Fiyat: ${currentPrice} ₺\n\nYeni Satış Fiyatını Giriniz (TL):`, currentPrice);
  if (val !== null && val.trim() !== '') {
    const newPrice = parseFloat(val.replace(',', '.'));
    if (!isNaN(newPrice) && newPrice > 0) {
      applySingleMarketPrice(barcode, newPrice);
    } else {
      if (typeof showToast === 'function') showToast("Geçersiz fiyat girdiniz.", 'warning');
    }
  }
}

/**
 * Seçilen veya piyasadan ucuz olan tüm ürünlerin fiyatını topluca eşitler
 */
async function bulkApplySelectedMarketPrices() {
  const checkboxes = Array.from(document.querySelectorAll('.market-row-checkbox:checked'));
  let itemsToUpdate = [];

  if (checkboxes.length > 0) {
    checkboxes.forEach(cb => {
      const barcode = cb.getAttribute('data-barcode');
      const marketPrice = parseFloat(cb.getAttribute('data-market-price') || 0);
      if (barcode && marketPrice > 0) {
        itemsToUpdate.push({ barcode: barcode, new_price: marketPrice });
      }
    });
  } else {
    // Seçim yoksa piyasadan ucuz olan tüm ürünleri sor
    const cheaperItems = marketRadarProducts.filter(p => p.market_price && parseFloat(p.market_price) > parseFloat(p.current_price));
    if (cheaperItems.length === 0) {
      if (typeof showToast === 'function') showToast("Piyasadan ucuz kalmış taranmış ürün bulunmuyor. Lütfen önce tarama yapın veya ürün seçin.", 'info');
      return;
    }
    
    const ok = confirm(`Piyasadan ucuz kalan ${cheaperItems.length} adet ürünün satış fiyatını bulunan internet piyasa fiyatlarına eşitlemek istiyor musunuz?`);
    if (!ok) return;

    itemsToUpdate = cheaperItems.map(p => ({ barcode: p.barcode, new_price: parseFloat(p.market_price) }));
  }

  if (itemsToUpdate.length === 0) {
    if (typeof showToast === 'function') showToast("Güncellenebilecek geçerli piyasa fiyatı olan ürün seçilmedi.", 'warning');
    return;
  }

  try {
    const res = await fetch('/api/market-radar/bulk-apply-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: itemsToUpdate })
    });
    const data = await res.json();
    if (data.status === 'success') {
      if (typeof showToast === 'function') showToast(`🎉 ${data.data.updated_count} ürünün fiyatı güncellendi!`, 'success');
      await loadMarketRadarData();
    } else {
      if (typeof showToast === 'function') showToast("Hata: " + data.message, 'error');
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast("Bağlantı hatası: " + err.message, 'error');
  }
}

/**
 * Tek bir ürünü etiket masasına ekler
 */
function sendSingleToPrintQueue(barcode, encodedTitle, price) {
  const title = decodeURIComponent(encodedTitle);
  if (typeof addToPrintTable === 'function') {
    addToPrintTable({ barcode: barcode, title: title, price: price });
    if (typeof showToast === 'function') showToast(`🏷️ "${title}" etiket masasına eklendi.`, 'success');
  } else if (typeof addProductToPrintQueueDirect === 'function') {
    addProductToPrintQueueDirect({ barcode: barcode, title: title, price: price });
  } else {
    if (typeof showToast === 'function') showToast(`"${title}" etiket için hazırlandı.`, 'info');
  }
  if (typeof switchTab === 'function') {
    switchTab('tab-search');
  }
}

/**
 * Seçili ürünleri Etiket Masasına (tab-search) aktarır
 */
function sendSelectedToPrintDesk() {
  const checkboxes = Array.from(document.querySelectorAll('.market-row-checkbox:checked'));
  if (checkboxes.length === 0) {
    if (typeof showToast === 'function') showToast("Lütfen etiket masasına göndermek için en az bir ürün seçin.", 'warning');
    return;
  }

  let addedCount = 0;
  checkboxes.forEach(cb => {
    const barcode = cb.getAttribute('data-barcode');
    const title = decodeURIComponent(cb.getAttribute('data-title') || '');
    const price = parseFloat(cb.getAttribute('data-our-price') || 0);

    if (typeof addToPrintTable === 'function') {
      addToPrintTable({ barcode: barcode, title: title, price: price });
      addedCount++;
    } else if (typeof addProductToPrintQueueDirect === 'function') {
      addProductToPrintQueueDirect({ barcode: barcode, title: title, price: price });
      addedCount++;
    }
  });

  if (typeof showToast === 'function') showToast(`🏷️ ${addedCount} ürün Etiket Masasına eklendi.`, 'success');
  if (typeof switchTab === 'function') {
    switchTab('tab-search');
  }
}

/**
 * Tarama önbelleğini temizler
 */
async function clearMarketAuditCache() {
  const ok = confirm("Piyasa fiyat taraması önbelleğini sıfırlamak istediğinize emin misiniz? (Ürün veritabanınız silinmez, sadece tarama kayıtları temizlenir)");
  if (!ok) return;

  try {
    const res = await fetch('/api/market-radar/clear-audits', { method: 'POST' });
    const data = await res.json();
    if (data.status === 'success') {
      if (typeof showToast === 'function') showToast("✅ Tarama önbelleği temizlendi.", 'success');
      await loadMarketRadarData();
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast("Hata: " + err.message, 'error');
  }
}
