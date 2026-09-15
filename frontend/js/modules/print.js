// ==========================================================================
// OYMAPOS - YAZDIRMA & A4 DİZGİ MODÜLÜ
// ==========================================================================

async function printBarcode(barcode, btnElement, currentPrice) {
  try {
    const payload = { barcode: barcode };
    if (currentPrice !== undefined && currentPrice !== null && !isNaN(currentPrice)) {
      payload.price = Number(currentPrice);
    }
    const res = await API.printSingle(payload, 1);
    if (res.status === 'success') {
      showToast(`${barcode} etiket yazıcıya gönderildi!`, 'success');
      
      const prod = (res.data && res.data.product) || {};
      const nowStr = (res.data && res.data.last_printed_at) || new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const printedPrice = prod.price !== undefined ? Number(prod.price).toFixed(2) : (currentPrice !== undefined ? Number(currentPrice).toFixed(2) : null);

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
        const oldText = btnElement.innerHTML;
        btnElement.innerHTML = '✅ Basıldı';
        btnElement.style.background = '#10b981';
        setTimeout(() => {
          btnElement.innerHTML = oldText;
          btnElement.style.background = '';
        }, 1200);
      }
    } else {
      showToast('Yazdırma hatası: ' + res.message, 'error');
    }
  } catch (err) {
    showToast('Yazıcıya ulaşılamadı: ' + err.message, 'error');
  }
}

function printSingleLabelAction(barcode) {
  printBarcode(barcode);
}

function openA4SheetModal() {
  const modal = document.getElementById('modal-a4-sheet');
  if (modal) modal.style.display = 'flex';
}

function closeA4SheetModal() {
  const modal = document.getElementById('modal-a4-sheet');
  if (modal) modal.style.display = 'none';
}

async function generateAndPrintA4Sheet() {
  const preset = document.getElementById('a4-sheet-preset-select')?.value || 'a4-24';
  const scope = document.querySelector('input[name="a4-scope"]:checked')?.value || 'filtered';

  closeA4SheetModal();
  showToast('A4 etiket sayfası hazırlanıyor...', 'info');

  try {
    const searchVal = document.getElementById('productSearchInput')?.value || '';
    const onlyDiff = scope === 'diff_only';
    const res = await API.searchProducts(searchVal, 200, false, onlyDiff);
    const products = (res.data && res.data.products) || [];

    if (products.length === 0) {
      showToast('Yazdırılacak ürün bulunamadı.', 'error');
      return;
    }

    let cols = 3, rows = 8, cellW = '70mm', cellH = '37mm';
    if (preset === 'a4-40') {
      cols = 4; rows = 10; cellW = '52.5mm'; cellH = '29.7mm';
    } else if (preset === 'a4-65') {
      cols = 5; rows = 13; cellW = '38mm'; cellH = '21.2mm';
    }

    const marketName = (localStorage.getItem('market_name') || 'YARENLER').toUpperCase();
    const dateStr = new Date().toLocaleDateString('tr-TR');

    const printWin = window.open('', '_blank', 'width=1000,height=800');
    if (!printWin) {
      showToast('Pop-up tarayıcı tarafından engellendi. Lütfen izin verin.', 'error');
      return;
    }

    let itemsHtml = '';
    products.forEach((p, idx) => {
      const priceStr = Number(p.price || 0).toFixed(2).replace('.', ',') + ' TL';
      const cleanTitle = (p.title || '').slice(0, cols === 3 ? 32 : (cols === 4 ? 24 : 18)).toUpperCase();
      
      itemsHtml += `
        <div class="a4-label-cell">
          <div class="a4-lbl-header">
            <span class="a4-lbl-brand">${marketName}</span>
            <span class="a4-lbl-date">${dateStr}</span>
          </div>
          <div class="a4-lbl-title">${cleanTitle}</div>
          <div class="a4-lbl-bottom">
            <div class="a4-lbl-bc">
              <svg id="bc-svg-${idx}" class="barcode-svg"></svg>
            </div>
            <div class="a4-lbl-price">${priceStr}</div>
          </div>
        </div>
      `;
    });

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>A4 Etiket Dizgisi - OYMAPOS</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
        <style>
          @page { size: A4 portrait; margin: 8mm 5mm; }
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
          body { background: #fff; color: #000; padding: 0; }
          .a4-grid {
            display: grid;
            grid-template-columns: repeat(${cols}, 1fr);
            gap: 1.5mm;
            page-break-inside: avoid;
          }
          .a4-label-cell {
            border: 1px dashed #999;
            height: ${cellH};
            padding: 2mm 2.5mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
            background: #fff;
          }
          .a4-lbl-header {
            display: flex;
            justify-content: space-between;
            font-size: 8px;
            font-weight: 800;
            border-bottom: 1px solid #000;
            padding-bottom: 1px;
            text-transform: uppercase;
          }
          .a4-lbl-title {
            font-size: ${cols === 3 ? '11px' : (cols === 4 ? '9px' : '7.5px')};
            font-weight: 900;
            margin: 1.5px 0;
            line-height: 1.15;
            color: #000;
          }
          .a4-lbl-bottom {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: auto;
          }
          .a4-lbl-bc svg {
            max-height: ${cols === 3 ? '22px' : (cols === 4 ? '18px' : '14px')};
            width: auto;
          }
          .a4-lbl-price {
            font-size: ${cols === 3 ? '16px' : (cols === 4 ? '13px' : '10px')};
            font-weight: 900;
            white-space: nowrap;
            letter-spacing: -0.3px;
          }
          @media print {
            .no-print { display: none !important; }
            .a4-label-cell { border-color: #ddd; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="background:#0f172a; color:#fff; padding:12px 20px; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <strong>📄 A4 Çoklu Etiket Dizgisi (${products.length} Ürün)</strong>
            <span style="font-size:12px; color:#94a3b8; margin-left:10px;">${cols} Sütun × ${rows} Satır</span>
          </div>
          <button onclick="window.print()" style="background:#0284c7; color:#fff; font-weight:800; border:none; padding:8px 20px; border-radius:6px; cursor:pointer; font-size:14px;">🖨️ Sayfayı Yazdır (PDF)</button>
        </div>
        <div class="a4-grid">
          ${itemsHtml}
        </div>
        <script>
          window.onload = function() {
            ${products.map((p, idx) => `
              try {
                if ('${p.barcode}') {
                  JsBarcode("#bc-svg-${idx}", "${p.barcode}", { format: "${(p.barcode && p.barcode.length === 13 && !isNaN(p.barcode)) ? 'EAN13' : 'CODE128'}", width: 1.2, height: 25, displayValue: false, margin: 0 });
                }
              } catch(e) {}
            `).join('\n')}
          };
        <\/script>
      </body>
      </html>
    `);
    printWin.document.close();
    showToast(`${products.length} ürün A4 etiket dizgisine aktarıldı!`, 'success');

    // A4 çıktısı alınan ürünlerin etiket fiyatlarını arka planda basıldı olarak onayla
    try {
      const printedBarcodes = products.map(p => p.barcode).filter(Boolean);
      for (const b of printedBarcodes) {
        API.confirmProductPrinted(b).catch(() => {});
      }
      setTimeout(() => {
        if (typeof searchProducts === 'function') {
          searchProducts(document.getElementById('productSearchInput')?.value || '');
        }
      }, 1000);
    } catch(e) {}
  } catch (err) {
    showToast('A4 dizgi hatası: ' + err.message, 'error');
  }
}

// -----------------------------------------------------------------------------
// CANLI YAZICI DURUMU & GEÇMİŞ TABLOSU YÖNETİMİ
// -----------------------------------------------------------------------------

async function updateTopbarPrinterStatus() {
  const pill = document.getElementById('topbarPrinterPill');
  const dot = document.getElementById('topbarPrinterDot');
  const text = document.getElementById('topbarPrinterText');
  const topbarSel = document.getElementById('topbarPrinterSelect');
  if (!pill || !text) return;

  try {
    const res = await API.getPrinters();
    const data = (res && res.data) || {};
    const printers = data.printers || [];
    const printerDetails = data.printer_details || [];
    const activeFromBackend = data.active_printer || (printers[0] || 'Termal Etiket Yazici');
    
    // Kullanıcının localStorage veya seçimindeki aktif yazıcı
    let chosenPrinter = localStorage.getItem('selected_printer') || (topbarSel ? topbarSel.value : null) || activeFromBackend;

    // Topbar açılır menüyü doldur
    if (topbarSel && printers.length > 0) {
      // Sadece liste değiştiğinde veya boşsa yeniden render et
      const currentValues = Array.from(topbarSel.options).map(o => o.value).join(',');
      const newValues = printers.join(',');
      if (currentValues !== newValues) {
        topbarSel.innerHTML = '';
        printers.forEach(p => {
          const detail = printerDetails.find(d => d.name === p);
          const isConn = detail ? detail.connected : false;
          const opt = document.createElement('option');
          opt.value = p;
          opt.textContent = `${isConn ? '🟢' : '🔴'} ${p}`;
          opt.style.background = '#0f172a';
          opt.style.color = '#f8fafc';
          if (p === chosenPrinter) opt.selected = true;
          topbarSel.appendChild(opt);
        });
      } else {
        topbarSel.value = chosenPrinter;
      }
    }

    // Seçili yazıcının anlık bağlantı durumunu al
    const statusRes = await API.getPrinterStatus(chosenPrinter);
    const stData = (statusRes && statusRes.data) || {};
    const isConnected = !!stData.connected;
    const statusText = stData.status_text || (isConnected ? 'Aktif' : 'Bağlı Değil');

    if (isConnected) {
      pill.style.background = 'rgba(16, 185, 129, 0.12)';
      pill.style.borderColor = 'rgba(16, 185, 129, 0.35)';
      pill.style.color = '#34d399';
      if (dot) {
        dot.style.background = '#34d399';
        dot.style.boxShadow = '0 0 8px #34d399';
      }
      text.innerHTML = `<span style="color:#34d399; font-weight:800;">✓ Aktif</span>`;
      pill.title = `Yazıcı Aktif ve Hazır\nModel: ${chosenPrinter}\nPort: ${stData.port || 'USB'}\nKuyruk: ${stData.jobs_in_queue || 0} iş`;
    } else {
      pill.style.background = 'rgba(239, 68, 68, 0.12)';
      pill.style.borderColor = 'rgba(239, 68, 68, 0.35)';
      pill.style.color = '#f87171';
      if (dot) {
        dot.style.background = '#f87171';
        dot.style.boxShadow = '0 0 8px #f87171';
      }
      text.innerHTML = `<span style="color:#f87171; font-weight:800;">⚠️ ${escapeHtml(statusText)}</span>`;
      pill.title = `Yazıcı Bağlantı Sorunu!\nModel: ${chosenPrinter}\nDurum: ${statusText}`;
    }

    // Eğer Yazıcı Geçmişi sekmesi açıksa oradaki istatistikleri de güncelle
    const histNameEl = document.getElementById('histPrinterName');
    const histStatusEl = document.getElementById('histPrinterStatus');
    const histQueueEl = document.getElementById('histPrinterQueue');
    if (histNameEl) histNameEl.textContent = chosenPrinter;
    if (histStatusEl) {
      histStatusEl.innerHTML = isConnected 
        ? `<span style="width:8px; height:8px; border-radius:50%; background:#34d399; display:inline-block;"></span> <span style="color:#34d399;">${escapeHtml(stData.port || 'USB001')} (${escapeHtml(statusText)})</span>`
        : `<span style="width:8px; height:8px; border-radius:50%; background:#f87171; display:inline-block;"></span> <span style="color:#f87171;">${escapeHtml(statusText)}</span>`;
    }
    if (histQueueEl) {
      histQueueEl.textContent = stData.jobs_in_queue || 0;
    }
  } catch (err) {
    if (text) {
      text.innerHTML = `<span style="color:#f87171;">Yazıcı Durumu Alınamadı</span>`;
    }
  }
}

function handleTopbarPrinterChange(newPrinter) {
  if (!newPrinter) return;
  localStorage.setItem('selected_printer', newPrinter);
  const settingsSelect = document.getElementById('printerSelect');
  if (settingsSelect) settingsSelect.value = newPrinter;
  // Arka planda sunucuya aktif varsayılan yazıcı ayarını da kaydet
  API.savePrinterSettings({ printer: newPrinter }).catch(() => {});
  updateTopbarPrinterStatus();
  showToast(`Aktif Yazıcı: "${newPrinter}" olarak seçildi.`, 'info');
}

let selectedHistYear = null;
let selectedHistMonth = null;
let selectedHistDay = null;
let rawAvailableDates = [];

const MONTH_NAMES_TR = {
  "01": "Ocak", "02": "Şubat", "03": "Mart", "04": "Nisan",
  "05": "Mayıs", "06": "Haziran", "07": "Temmuz", "08": "Ağustos",
  "09": "Eylül", "10": "Ekim", "11": "Kasım", "12": "Aralık"
};

function parseHistDateParts(dStr) {
  if (!dStr) return null;
  const clean = String(dStr).trim().split(' ')[0];
  if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length === 3) {
      return { day: parts[0].padStart(2, '0'), month: parts[1].padStart(2, '0'), year: parts[2], raw: `${parts[0].padStart(2, '0')}.${parts[1].padStart(2, '0')}.${parts[2]}` };
    }
  } else if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) { // YYYY-MM-DD
        return { day: parts[2].padStart(2, '0'), month: parts[1].padStart(2, '0'), year: parts[0], raw: `${parts[2].padStart(2, '0')}.${parts[1].padStart(2, '0')}.${parts[0]}` };
      } else { // DD-MM-YYYY
        return { day: parts[0].padStart(2, '0'), month: parts[1].padStart(2, '0'), year: parts[2], raw: `${parts[0].padStart(2, '0')}.${parts[1].padStart(2, '0')}.${parts[2]}` };
      }
    }
  }
  return null;
}

function getActiveHistFilterString() {
  if (selectedHistDay) {
    return selectedHistDay; // "15.09.2026"
  }
  if (selectedHistMonth && selectedHistYear) {
    return `${selectedHistMonth}.${selectedHistYear}`; // "09.2026"
  }
  if (selectedHistYear) {
    return selectedHistYear; // "2026"
  }
  return 'all';
}

function populateHistDateDropdowns(dates) {
  if (dates && Array.isArray(dates) && dates.length > 0) {
    rawAvailableDates = dates;
  }
  const yearSel = document.getElementById('histFilterYear');
  const monthSel = document.getElementById('histFilterMonth');
  const daySel = document.getElementById('histFilterDay');
  if (!yearSel || !monthSel || !daySel) return;

  const parsedDates = (rawAvailableDates || []).map(parseHistDateParts).filter(Boolean);

  if (parsedDates.length === 0) {
    yearSel.innerHTML = '<option value="">Kayıt Yok</option>';
    monthSel.innerHTML = '<option value="">Kayıt Yok</option>';
    daySel.innerHTML = '<option value="">Kayıt Yok</option>';
    return;
  }

  // 1. Sistemde kaydı olan gerçek Yılları Çıkar
  const years = Array.from(new Set(parsedDates.map(p => p.year))).sort().reverse();
  if (!selectedHistYear || !years.includes(selectedHistYear)) {
    selectedHistYear = years[0] || null;
  }

  let yearHtml = '';
  years.forEach(y => {
    yearHtml += `<option value="${y}" ${selectedHistYear === y ? 'selected' : ''}>${y} Yılı</option>`;
  });
  yearSel.innerHTML = yearHtml;

  // 2. Seçili Yıla ait gerçek Ayları Çıkar
  const monthsInYear = Array.from(new Set(
    parsedDates.filter(p => p.year === selectedHistYear).map(p => p.month)
  )).sort().reverse();

  if (!selectedHistMonth || !monthsInYear.includes(selectedHistMonth)) {
    selectedHistMonth = monthsInYear[0] || null;
  }

  let monthHtml = '';
  monthsInYear.forEach(m => {
    const name = MONTH_NAMES_TR[m] || m;
    monthHtml += `<option value="${m}" ${selectedHistMonth === m ? 'selected' : ''}>${name} (${m})</option>`;
  });
  monthSel.innerHTML = monthHtml;

  // 3. Seçili Yıl ve Aya ait gerçek Günleri Çıkar
  const daysInMonth = Array.from(new Set(
    parsedDates
      .filter(p => p.year === selectedHistYear && p.month === selectedHistMonth)
      .map(p => p.raw)
  )).sort((a, b) => {
    const pA = a.split('.').reverse().join('-');
    const pB = b.split('.').reverse().join('-');
    return pB.localeCompare(pA);
  });

  if (!selectedHistDay || !daysInMonth.includes(selectedHistDay)) {
    selectedHistDay = daysInMonth[0] || null;
  }

  let dayHtml = '';
  daysInMonth.forEach(d => {
    const p = parseHistDateParts(d);
    const mName = p ? (MONTH_NAMES_TR[p.month] || p.month) : '';
    const dNum = p ? p.day : d;
    dayHtml += `<option value="${d}" ${selectedHistDay === d ? 'selected' : ''}>${dNum} ${mName}</option>`;
  });
  daySel.innerHTML = dayHtml;
}

async function handleHistYearChange(year) {
  selectedHistYear = year || null;
  selectedHistMonth = null;
  selectedHistDay = null;
  populateHistDateDropdowns(rawAvailableDates);
  await loadPrintHistoryTable();
}

async function handleHistMonthChange(month) {
  selectedHistMonth = month || null;
  selectedHistDay = null;
  populateHistDateDropdowns(rawAvailableDates);
  await loadPrintHistoryTable();
}

async function handleHistDayChange(day) {
  selectedHistDay = day || null;
  if (day) {
    const p = parseHistDateParts(day);
    if (p) {
      selectedHistMonth = p.month;
      selectedHistYear = p.year;
    }
  }
  populateHistDateDropdowns(rawAvailableDates);
  await loadPrintHistoryTable();
}

async function resetPrintHistoryFilters() {
  selectedHistYear = null;
  selectedHistMonth = null;
  selectedHistDay = null;
  await loadPrintHistoryTable();
}

function _updateHistDayStats(history, allHistory = []) {
  const dayCountEl = document.getElementById('histDayTotalPrints');
  const monthPrintsEl = document.getElementById('histMonthPrints');
  
  if (dayCountEl) {
    const totalPrintsCount = history.reduce((sum, item) => sum + (item.copies || 1), 0);
    let filterLabel = 'Tümü';
    if (selectedHistDay) {
      filterLabel = selectedHistDay;
    } else if (selectedHistMonth && selectedHistYear) {
      filterLabel = `${MONTH_NAMES_TR[selectedHistMonth] || selectedHistMonth} ${selectedHistYear}`;
    } else if (selectedHistYear) {
      filterLabel = `${selectedHistYear} Yılı`;
    }
    dayCountEl.textContent = `${totalPrintsCount} Etiket (${history.length} İşlem) [${(filterLabel || 'Tümü').trim()}]`;
  }

  // Bu ay basılan toplam etiket adedini hesapla (Örn: .09.2026)
  if (monthPrintsEl) {
    const now = new Date();
    const currentMonthStr = `.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
    const dataset = (allHistory && allHistory.length > 0) ? allHistory : history;
    const monthItems = dataset.filter(item => {
      const pDate = (item.printed_at || '').split(' ')[0] || '';
      return pDate.endsWith(currentMonthStr) || pDate.includes(currentMonthStr);
    });
    const monthTotalCount = monthItems.reduce((sum, item) => sum + (item.copies || 1), 0);
    const monthName = MONTH_NAMES_TR[String(now.getMonth() + 1).padStart(2, '0')] || '';
    monthPrintsEl.textContent = `${monthTotalCount} Etiket (${monthItems.length} İşlem)`;
  }
}

function _updateHistDayPills(availableDates) {
  const pillsContainer = document.getElementById('printHistoryDatePills');
  if (!pillsContainer) return;
  if (availableDates.length === 0) { pillsContainer.innerHTML = ''; return; }
  let pillsHtml = `<span style="font-size:11px; font-weight:700; color:var(--text-muted);">Son Günler:</span>`;
  availableDates.slice(0, 5).forEach(d => {
    const isActive = (selectedHistDay === d);
    const btnStyle = isActive
      ? 'background: var(--primary); color: #fff; border-color: var(--primary); font-weight:800;'
      : 'background: var(--card-inner); color: var(--text-main); border-color: var(--border-color);';
    pillsHtml += `<button class="btn btn-sm" onclick="handleHistDayChange('${escapeHtml(d)}')" style="${btnStyle} font-size:11px; padding:3px 9px; border-radius:14px; cursor:pointer;" title="${escapeHtml(d)} gününü filtrele">📅 ${escapeHtml(d)}</button>`;
  });
  pillsContainer.innerHTML = pillsHtml;
}

function _buildHistoryTableHtml(history, currentFilter) {
  if (history.length === 0) {
    return `<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">🖨️ ${currentFilter && currentFilter !== 'all' ? `"${currentFilter}" filtresine ait baskı kaydı bulunamadı.` : 'Henüz kayıtlı bir etiket baskısı bulunmuyor.'}</td></tr>`;
  }
  let html = '';
  let currentDayGroup = null;
  let rowIdxInDay = 0;
  history.forEach((item) => {
    const dateTimeParts = (item.printed_at || '').split(' ');
    const itemDate = dateTimeParts[0] || 'Bilinmeyen Tarih';
    const itemTime = dateTimeParts[1] || '';
    if (itemDate !== currentDayGroup) {
      currentDayGroup = itemDate;
      rowIdxInDay = 0;
      const dayItems = history.filter(h => (h.printed_at || '').startsWith(itemDate));
      const dayTotalCopies = dayItems.reduce((acc, h) => acc + (h.copies || 1), 0);
      html += `<tr style="background: rgba(2, 132, 199, 0.12); border-top: 2px solid rgba(56, 189, 248, 0.4); border-bottom: 1px solid rgba(56, 189, 248, 0.2);">
        <td colspan="8" style="padding: 9px 16px; font-weight: 800; color: #38bdf8; font-size: 13px;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:8px;"><span style="font-size:15px;">📅</span><span>${escapeHtml(itemDate)}</span><span style="font-size:11px; font-weight:600; background:rgba(56,189,248,0.2); color:#93c5fd; padding:2px 8px; border-radius:10px;">${dayItems.length} İşlem</span></div>
            <div style="font-size:12px; color:#fbbf24; font-family:var(--font-mono); font-weight:700;">Toplam: ${dayTotalCopies} Adet Etiket</div>
          </div>
        </td></tr>`;
    }
    rowIdxInDay++;
    const isSuccess = item.status === 'success';
    const statusBadge = isSuccess
      ? `<span class="badge" style="background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3); font-size:11px; padding:3px 8px; border-radius:6px; font-weight:700;">✅ Başarılı</span>`
      : `<span class="badge" style="background:rgba(239,68,68,0.15); color:#f87171; border:1px solid rgba(239,68,68,0.3); font-size:11px; padding:3px 8px; border-radius:6px; font-weight:700;" title="${escapeHtml(item.message)}">❌ Hata</span>`;
    const priceStr = (item.price !== null && item.price !== undefined) ? `${Number(item.price).toFixed(2)} TL` : '-';
    html += `<tr>
      <td style="text-align: center; color: var(--text-muted); font-size: 11.5px;">${rowIdxInDay}</td>
      <td style="font-size: 12px; color: #38bdf8; font-family: var(--font-mono); font-weight: 700;"><span style="color:#94a3b8; font-size:11px; margin-right:4px;">🕒</span>${escapeHtml(itemTime || item.printed_at)}</td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: #818cf8; font-size: 12.5px;">${escapeHtml(item.barcode)}</td>
      <td style="font-weight: 700; color: #fff; font-size: 12.5px;">${escapeHtml(item.title)}</td>
      <td style="text-align: right; font-weight: 800; color: #fbbf24; font-family: var(--font-mono);">${escapeHtml(priceStr)}</td>
      <td style="text-align: center; font-weight: 700; color: #cbd5e1;">${item.copies || 1} Adet</td>
      <td style="text-align: center;">${statusBadge}</td>
      <td style="text-align: center;"><button class="btn btn-secondary btn-sm" onclick="reprintFromHistory('${escapeHtml(item.barcode)}', this)" style="padding: 3px 10px; font-size: 11.5px; border-color: rgba(56,189,248,0.4); color: #38bdf8;" title="Bu etiketi tekrar yazdır">🖨️ Tekrar Bas</button></td>
    </tr>`;
  });
  return html;
}

async function loadPrintHistoryTable() {
  const tbody = document.getElementById('printHistoryTableBody');
  if (!tbody) return;

  const isFirstLoad = !selectedHistYear && !selectedHistMonth && !selectedHistDay;
  const currentFilter = isFirstLoad ? 'all' : getActiveHistFilterString();

  try {
    const res = await API.getPrintHistory(300, currentFilter);
    const data = (res && res.data) || {};
    const history = data.history || [];
    let availableDates = data.available_dates || [];

    // Eğer backend available_dates dönmediyse veya boşsa, history içindeki tarihlerden kendimiz çıkaralım
    if ((!availableDates || availableDates.length === 0) && history.length > 0) {
      const dateSet = new Set();
      history.forEach(h => {
        const p = parseHistDateParts(h.printed_at);
        if (p && p.raw) {
          dateSet.add(p.raw);
        }
      });
      availableDates = Array.from(dateSet).sort((a, b) => {
        const pA = a.split('.').reverse().join('-');
        const pB = b.split('.').reverse().join('-');
        return pB.localeCompare(pA);
      });
    }

    // Dropdownları doldur / senkronize et (bu aynı zamanda selectedHistYear/Month/Day'i otomatik set eder)
    populateHistDateDropdowns(availableDates);

    // İlk açılışta en güncel günü seçip sadece o güne ait verileri göster
    if (isFirstLoad && selectedHistDay && availableDates.length > 0) {
      const filteredHistory = history.filter(h => (h.printed_at || '').startsWith(selectedHistDay));
      tbody.innerHTML = _buildHistoryTableHtml(filteredHistory, selectedHistDay);
      _updateHistDayStats(filteredHistory, history);
      _updateHistDayPills(rawAvailableDates.length > 0 ? rawAvailableDates : availableDates);
      return;
    }

    // İstatistik, pill ve tablo güncelle
    _updateHistDayStats(history, history);
    _updateHistDayPills(rawAvailableDates.length > 0 ? rawAvailableDates : availableDates);
    tbody.innerHTML = _buildHistoryTableHtml(history, currentFilter);

  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 30px; color: #f87171;">
          ⚠️ Baskı geçmişi yüklenirken hata oluştu: ${escapeHtml(err.message)}
        </td>
      </tr>
    `;
  }
}

async function reprintFromHistory(barcode, btnElement) {
  if (!barcode || barcode === '-') {
    showToast('Geçerli bir barkod numarası bulunamadı.', 'error');
    return;
  }
  await printBarcode(barcode, btnElement);
  setTimeout(loadPrintHistoryTable, 500);
}

async function purgePrinterQueueAction() {
  if (!confirm("Yazıcı kuyruğundaki tüm bekleyen işleri temizlemek istediğinize emin misiniz?")) {
    return;
  }
  try {
    const res = await API.purgePrinterQueue();
    if (res.status === 'success') {
      showToast(res.message || 'Yazıcı kuyruğu temizlendi.', 'success');
      updateTopbarPrinterStatus();
    } else {
      showToast('Kuyruk temizlenemedi: ' + res.message, 'error');
    }
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  }
}
