// ==========================================================================
// OYMAPOS - DİNAMİK EXCEL SPREADSHEET ÇALIŞMA MASASI (A..Z, AA..ZZ SINIRSIZ SÜTUN)
// ==========================================================================

let numCols = 26; // Başlangıçta A'dan Z'ye 26 sütun
let gridData = []; // Array of arrays: [ [cellA, cellB, cellC...], ... ]
let activeCell = { r: 0, c: 0 };

function getExcelColName(colIdx) {
  let name = '';
  let n = colIdx;
  while (n >= 0) {
    name = String.fromCharCode((n % 26) + 65) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

function saveQuickGridToStorage() {
  try {
    const filled = gridData.filter(r => r.some(c => c && c.trim().length > 0));
    if (filled.length > 0) {
      localStorage.setItem('quick_update_grid_data', JSON.stringify(gridData));
      localStorage.setItem('quick_update_grid_cols', String(numCols));
    } else {
      localStorage.removeItem('quick_update_grid_data');
      localStorage.removeItem('quick_update_grid_cols');
    }
  } catch (e) {}
}

function loadQuickGridFromStorage() {
  try {
    const saved = localStorage.getItem('quick_update_grid_data');
    const savedCols = localStorage.getItem('quick_update_grid_cols');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        gridData = parsed;
        if (savedCols) numCols = Math.max(numCols, parseInt(savedCols, 10) || 26);
        return true;
      }
    }
  } catch (e) {}
  return false;
}

function initExcelGrid(minRows = 100, minCols = 26) {
  numCols = Math.max(numCols, minCols);
  
  if (gridData.length === 0) {
    const hasRestored = loadQuickGridFromStorage();
    if (!hasRestored) {
      gridData = [];
      for (let i = 0; i < minRows; i++) {
        gridData.push(new Array(numCols).fill(''));
      }
    }
  }

  renderExcelThead();
  renderExcelGrid();
  updateGridStats();
}

function ensureCols(requiredCols) {
  if (requiredCols > numCols) {
    const oldNum = numCols;
    numCols = requiredCols;
    gridData.forEach(row => {
      while (row.length < numCols) {
        row.push('');
      }
    });
    renderExcelThead();
  }
}

function renderExcelThead() {
  const thead = document.getElementById('excelGridThead');
  if (!thead) return;

  let html = `
    <tr style="background: #1e293b; position: sticky; top: 0; z-index: 10; border-bottom: 2px solid #3b82f6; user-select: none;">
      <th style="width: 48px; min-width: 48px; background: #0f172a; border-right: 1px solid #334155; border-bottom: 1px solid #334155; text-align: center; color: #64748b; font-weight: 700; font-size: 11px; position: sticky; left: 0; z-index: 12;">#</th>
  `;

  for (let c = 0; c < numCols; c++) {
    const colName = getExcelColName(c);
    html += `
      <th style="width: 140px; min-width: 140px; border-right: 1px solid #334155; padding: 7px 10px; text-align: center; color: #93c5fd; font-weight: 800; font-family: 'JetBrains Mono', monospace; font-size: 12.5px;">
        ${colName}
      </th>
    `;
  }

  html += `</tr>`;
  thead.innerHTML = html;

  // Tablo genişliğini sütun sayısına göre dinamik ayarla
  const table = document.getElementById('excelSpreadsheetTable');
  if (table) {
    table.style.minWidth = `${48 + numCols * 140}px`;
  }
}

function renderExcelGrid() {
  const tbody = document.getElementById('excelGridTbody');
  if (!tbody) return;

  let html = '';
  gridData.forEach((row, rIdx) => {
    html += `<tr data-row="${rIdx}" style="border-bottom: 1px solid #1e293b; background: ${rIdx % 2 === 0 ? '#0b1120' : '#070c18'};">`;
    
    // Excel Satır Numarası (Sticky)
    html += `
      <td style="background: #0f172a; border-right: 1px solid #334155; text-align: center; color: #64748b; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; user-select: none; padding: 5px; position: sticky; left: 0; z-index: 2;">
        ${rIdx + 1}
      </td>
    `;

    // Sütunlar 0'dan numCols-1'e
    for (let cIdx = 0; cIdx < numCols; cIdx++) {
      const val = row[cIdx] || '';
      html += `
        <td 
          data-row="${rIdx}" 
          data-col="${cIdx}" 
          contenteditable="true" 
          spellcheck="false"
          onfocus="onCellFocus(${rIdx}, ${cIdx})"
          onblur="onCellBlur(${rIdx}, ${cIdx}, this.innerText)"
          onkeydown="onCellKeyDown(event, ${rIdx}, ${cIdx})"
          style="border-right: 1px solid #1e293b; padding: 6px 10px; color: #f1f5f9; font-size: 13px; outline: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 140px; max-width: 320px;"
        >${escapeHtml(val)}</td>
      `;
    }

    html += `</tr>`;
  });

  tbody.innerHTML = html;
}

function onCellFocus(rIdx, cIdx) {
  activeCell = { r: rIdx, c: cIdx };
  const colLetter = getExcelColName(cIdx);
  const labelEl = document.getElementById('excelActiveCellLabel');
  const formulaInput = document.getElementById('excelFormulaInput');
  
  if (labelEl) labelEl.textContent = `${colLetter}${rIdx + 1}`;
  if (formulaInput) {
    formulaInput.value = gridData[rIdx]?.[cIdx] || '';
  }

  // Satır vurgusu
  document.querySelectorAll('#excelGridTbody tr').forEach((tr, idx) => {
    tr.style.backgroundColor = (idx === rIdx) ? 'rgba(59, 130, 246, 0.14)' : (idx % 2 === 0 ? '#0b1120' : '#070c18');
  });
}

function onCellBlur(rIdx, cIdx, text) {
  if (gridData[rIdx]) {
    gridData[rIdx][cIdx] = text.trim();
  }
  updateGridStats();
}

function onFormulaBarInput(val) {
  const { r, c } = activeCell;
  if (gridData[r]) {
    gridData[r][c] = val;
    const cell = document.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
    if (cell) cell.innerText = val;
    updateGridStats();
  }
}

function onCellKeyDown(e, rIdx, cIdx) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const nextRow = rIdx + 1;
    if (nextRow >= gridData.length) {
      addGridRow();
    }
    setTimeout(() => {
      const nextCell = document.querySelector(`td[data-row="${nextRow}"][data-col="${cIdx}"]`);
      if (nextCell) nextCell.focus();
    }, 20);
  } else if (e.key === 'Tab') {
    if (cIdx + 1 >= numCols) {
      ensureCols(numCols + 5);
      renderExcelGrid();
    }
  } else if (e.key === 'ArrowDown') {
    const nextCell = document.querySelector(`td[data-row="${rIdx + 1}"][data-col="${cIdx}"]`);
    if (nextCell) { e.preventDefault(); nextCell.focus(); }
  } else if (e.key === 'ArrowUp' && rIdx > 0) {
    const prevCell = document.querySelector(`td[data-row="${rIdx - 1}"][data-col="${cIdx}"]`);
    if (prevCell) { e.preventDefault(); prevCell.focus(); }
  }
}

function addGridRow(count = 1) {
  for (let i = 0; i < count; i++) {
    gridData.push(new Array(numCols).fill(''));
  }
  renderExcelGrid();
  updateGridStats();
}

function clearGridData(silent = false) {
  gridData = [];
  numCols = 26;
  activeCell = { r: 0, c: 0 };
  localStorage.removeItem('quick_update_grid_data');
  localStorage.removeItem('quick_update_grid_cols');
  initExcelGrid(100, 26);
  if (!silent) {
    showToast('Excel tablosu temizlendi.', 'info');
  }
}

function updateGridStats() {
  saveQuickGridToStorage();
  const filledRows = gridData.filter(row => row.some(cell => cell && cell.trim().length > 0)).length;
  const badge = document.getElementById('quickPriceUpdateCountBadge');
  const statsEl = document.getElementById('quickPriceUpdateStatsText');

  if (badge) {
    badge.textContent = `${filledRows} Dolu Satır (${gridData.length} Satır, ${numCols} Sütun)`;
  }

  if (statsEl) {
    if (filledRows > 0) {
      statsEl.innerHTML = `<span style="color: #38bdf8; font-weight: 700;">✓ ${filledRows} satır veri hazır.</span> Otomatik sütun eşleştirme (Barkod, Ürün Adı, Fiyat vb.) ile sisteme aktarılacaktır.`;
    } else {
      statsEl.innerHTML = `<span>💡</span> <strong>İpucu:</strong> Excel'deki verinizi seçip <kbd style="background:#1e293b; color:#38bdf8; padding:1px 5px; border-radius:3px;">Ctrl + C</kbd> ile kopyalayın, ardından tablodaki herhangi bir hücreye tıklayıp <kbd style="background:#1e293b; color:#38bdf8; padding:1px 5px; border-radius:3px;">Ctrl + V</kbd> yapın.`;
    }
  }
}

async function clearAndPasteFromClipboard() {
  // Kullanıcı butona basar basmaz sürecin (process) başladığını anında hissettir
  showQuickUpdateProgress('Pano Okunuyor...', 'Pano içeriği taranıyor ve yapıştırma hazırlanıyor...', '📋');
  updateQuickUpdateProgress(0, 100, 'Pano erişimi sağlanıyor...');

  try {
    let clipboardText = '';

    // 1. Önce modern tarayıcı Clipboard API'sini dene
    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        clipboardText = await navigator.clipboard.readText();
      } catch (clipErr) {
        console.warn('Tarayıcı panosuna erişilemedi, sistem API deneniyor:', clipErr);
      }
    }

    // 2. Eğer tarayıcı engellediyse veya boşsa sunucu üzerinden Windows panosunu oku
    if (!clipboardText || !clipboardText.trim()) {
      updateQuickUpdateProgress(20, 100, 'Sistem panosundan veri okunuyor...');
      try {
        const res = await fetch('/api/system/get-clipboard');
        const json = await res.json();
        if (json.status === 'success' && json.data && json.data.clipboard_text) {
          clipboardText = json.data.clipboard_text;
        }
      } catch (apiErr) {
        console.warn('Sistem API panosu okunamadı:', apiErr);
      }
    }

    if (!clipboardText || !clipboardText.trim()) {
      hideQuickUpdateProgress();
      // Tarayıcı ve sistem API erişimi güvenlik nedeniyle bloklandıysa kullanıcıdan doğrudan yapıştırmasını iste
      const manualText = prompt("Tarayıcı panonuzu otomatik okuyamadı.\nLütfen kopyaladığınız veriyi (Ctrl+V) buraya yapıştırıp 'Tamam' butonuna basınız:");
      if (manualText && manualText.trim()) {
        showQuickUpdateProgress('Veri İşleniyor...', 'Girdiğiniz liste ayrıştırılıyor...', '📋');
        await parseAndApplyTextToGrid(manualText, true);
        return;
      }
      showToast('Panoda kopyalanmış veri bulunamadı. Excel veya metin belgenizden satırları kopyalayıp (Ctrl+C) doğrudan tabloya Ctrl+V yapabilirsiniz.', 'warning');
      return;
    }

    updateQuickUpdateProgress(50, 100, 'Pano verisi alındı, tabloya aktarılıyor...');
    await new Promise(r => setTimeout(r, 60));

    // Panoyu temizle ve yapıştır (sıfırdan yapıştır)
    await parseAndApplyTextToGrid(clipboardText, true);

  } catch (err) {
    hideQuickUpdateProgress();
    showToast('Pano yapıştırma hatası: ' + err.message, 'error');
  }
}

function showQuickUpdateProgress(title, subtitle, icon = '📋') {
  const overlay = document.getElementById('quickUpdateProgressOverlay');
  if (!overlay) return;
  const tEl = document.getElementById('quickUpdateProgressTitle');
  const sEl = document.getElementById('quickUpdateProgressSubtitle');
  const iEl = document.getElementById('quickUpdateProgressIcon');
  const fill = document.getElementById('quickUpdateProgressBarFill');
  const count = document.getElementById('quickUpdateProgressCount');
  const percent = document.getElementById('quickUpdateProgressPercent');

  if (tEl) tEl.textContent = title;
  if (sEl) sEl.textContent = subtitle;
  if (iEl) iEl.textContent = icon;
  if (fill) fill.style.width = '0%';
  if (count) count.textContent = '0 / 0 Ürün';
  if (percent) percent.textContent = '%0';

  overlay.style.display = 'flex';
}

function updateQuickUpdateProgress(current, total, statusText = '') {
  const fill = document.getElementById('quickUpdateProgressBarFill');
  const count = document.getElementById('quickUpdateProgressCount');
  const percent = document.getElementById('quickUpdateProgressPercent');
  const sEl = document.getElementById('quickUpdateProgressSubtitle');

  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  if (fill) fill.style.width = `${pct}%`;
  if (count) count.textContent = `${current.toLocaleString('tr-TR')} / ${total.toLocaleString('tr-TR')} Ürün`;
  if (percent) percent.textContent = `%${pct}`;
  if (statusText && sEl) sEl.textContent = statusText;
}

function hideQuickUpdateProgress() {
  const overlay = document.getElementById('quickUpdateProgressOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

/**
 * Verilen metni (TSV / CSV / Tablo) güvenli, donmayan (chunked / non-blocking) bir şekilde grid'e aktarır.
 */
async function parseAndApplyTextToGrid(text, isClearFirst = false) {
  if (!text || !text.trim()) return;

  const rawLines = text.split(/\r?\n/);
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    if (rawLines[i].trim().length > 0) {
      lines.push(rawLines[i]);
    }
  }

  if (lines.length === 0) return;

  showQuickUpdateProgress('Pano Verisi Yapıştırılıyor...', 'Satırlar ayrıştırılıyor ve tabloya işleniyor...', '📋');
  updateQuickUpdateProgress(0, lines.length, `${lines.length} satır hazırlandı...`);

  await new Promise(r => setTimeout(r, 20));

  if (isClearFirst) {
    gridData = [];
    numCols = 26;
    activeCell = { r: 0, c: 0 };
  }

  const startR = isClearFirst ? 0 : (activeCell.r || 0);
  const startC = isClearFirst ? 0 : (activeCell.c || 0);

  // Maksimum gelen sütun sayısını hesapla
  let maxIncomingCols = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let count = (line.match(/\t/g) || []).length + 1;
    if (count === 1 && line.includes(';')) {
      count = (line.match(/;/g) || []).length + 1;
    }
    if (count > maxIncomingCols) maxIncomingCols = count;
  }

  const requiredTotalCols = Math.max(26, startC + maxIncomingCols);
  ensureCols(requiredTotalCols);

  // İhtiyaç kadar satır ekle
  while (gridData.length < startR + lines.length) {
    gridData.push(new Array(numCols).fill(''));
  }

  // Tarayıcı donmasını engellemek için satırları parçalı (async chunk) işle
  const CHUNK_SIZE = 500;
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, lines.length);
    for (let idx = i; idx < end; idx++) {
      const line = lines[idx];
      let cells = line.split('\t');
      if (cells.length === 1 && line.includes(';')) {
        cells = line.split(';');
      }

      const targetRow = startR + idx;
      if (!gridData[targetRow]) {
        gridData[targetRow] = new Array(numCols).fill('');
      }

      for (let c = 0; c < cells.length; c++) {
        const targetCol = startC + c;
        if (targetCol < numCols) {
          gridData[targetRow][targetCol] = (cells[c] || '').trim();
        }
      }
    }

    updateQuickUpdateProgress(end, lines.length, `${end} / ${lines.length} satır tabloya yerleştirildi...`);

    // Event loop'a nefes aldır (UI donmasını önle ve progress bar animasyonunu göster)
    await new Promise(r => setTimeout(r, 10));
  }

  // Minimum 100 satır olsun
  while (gridData.length < 100) {
    gridData.push(new Array(numCols).fill(''));
  }

  updateQuickUpdateProgress(lines.length, lines.length, 'Tablo görünümü hazırlanıyor...');
  await new Promise(r => setTimeout(r, 20));

  renderExcelGrid();
  updateGridStats();
  hideQuickUpdateProgress();
  showToast(`✓ ${lines.length} satır, ${maxIncomingCols} sütun başarıyla yapıştırıldı!`, 'success');
}

function handleGridPaste(e) {
  const clipboardData = e.clipboardData || window.clipboardData;
  if (!clipboardData) return;

  const pastedText = clipboardData.getData('text');
  if (!pastedText || (!pastedText.includes('\t') && !pastedText.includes('\n'))) {
    return; // Düz tek hücre metin yapıştırma
  }

  e.preventDefault();
  parseAndApplyTextToGrid(pastedText, false);
}


let lastCalculatedRawText = '';
let currentPreviewSubTab = 'changes';
let isStep2Unlocked = false;
let currentQuickStep = 1;

function switchQuickUpdateStep(step) {
  if (step === 2 && !isStep2Unlocked) {
    showToast('Lütfen önce "Verileri Kontrol Et" butonuna tıklayarak verileri doğrulayın.', 'warning');
    return;
  }

  currentQuickStep = step;
  const viewStep1 = document.getElementById('quickUpdateStep1View');
  const viewStep2 = document.getElementById('quickUpdateStep2View');
  const btnNav1 = document.getElementById('btnStep1Nav');
  const btnNav2 = document.getElementById('btnStep2Nav');
  const actions1 = document.getElementById('quickStep1Actions');
  const actions2 = document.getElementById('quickStep2Actions');
  const descText = document.getElementById('quickStepDescText');

  if (step === 1) {
    if (viewStep1) viewStep1.style.display = 'flex';
    if (viewStep2) viewStep2.style.display = 'none';
    if (actions1) actions1.style.display = 'flex';
    if (actions2) actions2.style.display = 'none';
    if (descText) descText.textContent = 'Adım 1: Excel yükleyin veya hücrelere yapıştırıp kontrol edin';

    if (btnNav1) {
      btnNav1.style.border = '1.5px solid #38bdf8';
      btnNav1.style.background = '#1e293b';
      btnNav1.style.color = '#38bdf8';
    }
    if (btnNav2) {
      btnNav2.style.border = '1.5px solid transparent';
      btnNav2.style.background = 'transparent';
      btnNav2.style.color = isStep2Unlocked ? '#94a3b8' : '#64748b';
    }
  } else if (step === 2) {
    if (viewStep1) viewStep1.style.display = 'none';
    if (viewStep2) viewStep2.style.display = 'flex';
    if (actions1) actions1.style.display = 'none';
    if (actions2) actions2.style.display = 'flex';
    if (descText) descText.textContent = 'Adım 2: Fiyat değişimlerini ve yeni ürünleri inceleyin, ardından Veri Gönder ile onaylayın';

    if (btnNav2) {
      btnNav2.style.border = '1.5px solid #10b981';
      btnNav2.style.background = '#1e293b';
      btnNav2.style.color = '#34d399';
    }
    if (btnNav1) {
      btnNav1.style.border = '1.5px solid transparent';
      btnNav1.style.background = 'transparent';
      btnNav1.style.color = '#94a3b8';
    }
  }
}

function unlockStep2() {
  isStep2Unlocked = true;
  const btnNav2 = document.getElementById('btnStep2Nav');
  const badgeIcon = document.getElementById('step2BadgeIcon');
  if (btnNav2) {
    btnNav2.disabled = false;
    btnNav2.style.cursor = 'pointer';
    btnNav2.style.opacity = '1';
    btnNav2.style.color = '#34d399';
  }
  if (badgeIcon) {
    badgeIcon.textContent = '✓';
    badgeIcon.style.background = '#10b981';
    badgeIcon.style.color = '#fff';
  }
}

async function handleExcelFileUpload(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  // Dosya girişini sıfırla ki aynı dosya tekrar seçilebilsin
  event.target.value = '';

  showQuickUpdateProgress('Excel Dosyası Okunuyor...', `${file.name} taranıyor ve ürünler ayrıştırılıyor...`, '📁');
  updateQuickUpdateProgress(10, 100, 'Excel sunucuya yükleniyor...');

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('device_name', 'Ana PC - Excel Masası');
    formData.append('preview_only', 'true');

    const res = await fetch('/api/products/quick-update-excel', {
      method: 'POST',
      body: formData
    });

    const result = await res.json();

    if (result.status !== 'success' || !result.data) {
      hideQuickUpdateProgress();
      showToast('Excel Okuma Hatası: ' + (result.message || 'Dosya okunamadı.'), 'error');
      return;
    }

    const d = result.data;
    lastCalculatedRawText = d.raw_text || '';

    // Tabloya (Grid) aktar
    if (d.raw_text) {
      updateQuickUpdateProgress(70, 100, `${d.total_items} ürün canlı tabloya aktarılıyor...`);
      // Grid'e yapıştırmış gibi uygula
      await parseAndApplyTextToGrid(d.raw_text, false);
    }

    updateQuickUpdateProgress(100, 100, 'Hesaplama raporu hazırlandı!');
    await new Promise(r => setTimeout(r, 200));
    hideQuickUpdateProgress();

    // 2. Kilidi aç ve doğrudan Adım 2 (Veri Gönder & Rapor) ekranına geç
    unlockStep2();
    renderCalculationDataToStep2(d);
    switchQuickUpdateStep(2);

    showToast(`✓ Excel yüklendi! Toplam ${d.total_items} ürün kontrol edildi. Raporu inceleyip onaylayabilirsiniz.`, 'success');
  } catch (err) {
    hideQuickUpdateProgress();
    showToast('Excel yükleme hatası: ' + err.message, 'error');
  }
}

function closeQuickUpdateConfirmModal() {
  switchQuickUpdateStep(1);
}

function switchPreviewSubTab(tabName) {
  currentPreviewSubTab = tabName;
  const btnChanges = document.getElementById('tabBtnPreviewChanges');
  const btnNew = document.getElementById('tabBtnPreviewNew');
  const btnBlacklist = document.getElementById('tabBtnPreviewBlacklist');
  const secChanges = document.getElementById('previewChangesContainer');
  const secNew = document.getElementById('previewNewContainer');
  const secBlacklist = document.getElementById('previewBlacklistContainer');

  // Hepsini sıfırla
  [btnChanges, btnNew, btnBlacklist].forEach(b => {
    if (b) {
      b.style.background = 'transparent';
      b.style.color = '#94a3b8';
      b.style.borderColor = 'transparent';
    }
  });
  if (secChanges) secChanges.style.display = 'none';
  if (secNew) secNew.style.display = 'none';
  if (secBlacklist) secBlacklist.style.display = 'none';

  if (tabName === 'changes') {
    if (btnChanges) {
      btnChanges.style.background = '#1e293b';
      btnChanges.style.color = '#38bdf8';
      btnChanges.style.borderColor = '#38bdf8';
    }
    if (secChanges) secChanges.style.display = 'block';
  } else if (tabName === 'new') {
    if (btnNew) {
      btnNew.style.background = '#1e293b';
      btnNew.style.color = '#34d399';
      btnNew.style.borderColor = '#34d399';
    }
    if (secNew) secNew.style.display = 'block';
  } else {
    if (btnBlacklist) {
      btnBlacklist.style.background = '#1e293b';
      btnBlacklist.style.color = '#f87171';
      btnBlacklist.style.borderColor = '#f87171';
    }
    if (secBlacklist) secBlacklist.style.display = 'block';
  }
}

async function executeQuickPriceUpdate() {
  const filledRows = gridData.filter(row => row.some(c => c && c.trim().length > 0));
  const btn = document.getElementById('btnExecuteQuickPriceUpdate');

  if (filledRows.length === 0) {
    showToast('Lütfen tablodaki hücrelere veri girin veya Excel\'den yükleyin.', 'error');
    return;
  }

  // TSV biçiminde arka plandaki otomatik ayrıştırıcıya gönder
  const tsvLines = filledRows.map(row => row.join('\t'));
  const rawText = tsvLines.join('\n');
  lastCalculatedRawText = rawText;

  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Analiz & Kontrol Yapılıyor...';
  }

  showQuickUpdateProgress('Hesaplamalar Yapılıyor...', `${filledRows.length} satır analiz ediliyor...`, '🔍');
  updateQuickUpdateProgress(Math.floor(filledRows.length * 0.4), filledRows.length, 'Fiyat farkları, yeni ürünler ve kara liste kontrol ediliyor...');

  try {
    const formData = new FormData();
    formData.append('raw_text', rawText);
    formData.append('device_name', 'Ana PC - Excel Güncelleme Masası');
    formData.append('preview_only', 'true');

    const res = await fetch('/api/products/quick-update-clipboard', {
      method: 'POST',
      body: formData
    });
    const result = await res.json();

    updateQuickUpdateProgress(filledRows.length, filledRows.length, 'Hesaplama tamamlandı!');
    await new Promise(r => setTimeout(r, 200));
    hideQuickUpdateProgress();

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }

    if (result.status === 'success' && result.data) {
      const d = result.data;
      // 2. Kilidi aç ve doğrudan Adım 2 (Veri Gönder & Rapor) ekranına aktar
      unlockStep2();
      renderCalculationDataToStep2(d);
      switchQuickUpdateStep(2);
      showToast('✓ Veri kontrolü tamamlandı! Sonuçlar ekrana yüklendi.', 'success');
    } else {
      showToast('Hesaplama Hatası: ' + (result.message || 'İşlem gerçekleştirilemedi.'), 'error');
    }
  } catch (err) {
    hideQuickUpdateProgress();
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
    showToast('Sunucu bağlantı hatası: ' + err.message, 'error');
  }
}

function renderCalculationDataToStep2(data) {
  const elTotal = document.getElementById('previewTotalCount');
  const elPriceChange = document.getElementById('previewPriceChangeCount');
  const elNew = document.getElementById('previewNewCount');
  const elBlacklist = document.getElementById('previewBlacklistCount');
  const elBanner = document.getElementById('previewSummaryBanner');
  const badgeChanges = document.getElementById('badgeChangesCount');
  const badgeNew = document.getElementById('badgeNewCount');
  const badgeBlacklist = document.getElementById('badgeBlacklistCount');

  const total = data.total_items || 0;
  const priceChangesCount = data.price_changes_count || 0;
  const newProductsCount = data.new_products || 0;
  const blacklistCount = data.blacklisted_count || 0;

  if (elTotal) elTotal.textContent = total;
  if (elPriceChange) elPriceChange.textContent = priceChangesCount;
  if (elNew) elNew.textContent = newProductsCount;
  if (elBlacklist) elBlacklist.textContent = blacklistCount;

  if (badgeChanges) badgeChanges.textContent = priceChangesCount;
  if (badgeNew) badgeNew.textContent = newProductsCount;
  if (badgeBlacklist) badgeBlacklist.textContent = blacklistCount;

  if (elBanner) {
    elBanner.innerHTML = `
      <strong>Analiz Raporu:</strong> Toplam <strong>${total}</strong> kayıt incelendi. 
      <strong style="color:#facc15;">${priceChangesCount}</strong> adet ürünün fiyatı değişti, 
      <strong style="color:#34d399;">${newProductsCount}</strong> adet yeni ürün tespit edildi, 
      <strong style="color:#f87171;">${blacklistCount}</strong> adet ürün kara listede olduğu için elendi.
    `;
  }

  // Fiyat değişimleri tablosunu doldur
  const changesTbody = document.getElementById('previewChangesTableBody');
  if (changesTbody) {
    const changes = data.price_changes || [];
    if (changes.length === 0) {
      changesTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 18px; color:#64748b;">Fiyatı değişen ürün bulunmadı.</td></tr>`;
    } else {
      changesTbody.innerHTML = changes.map(c => {
        const diffAmt = c.diff_amount || 0;
        const diffSign = diffAmt > 0 ? '+' : '';
        const diffColor = diffAmt > 0 ? '#f87171' : '#34d399';
        return `
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 12px; font-family:'JetBrains Mono', monospace; color:#38bdf8; font-weight:700;">${escapeHtml(c.barcode)}</td>
            <td style="padding: 8px 12px; max-width: 300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(c.title || c.raw_system_title)}</td>
            <td style="padding: 8px 12px; text-align: right; color:#94a3b8;">${Number(c.old_price || 0).toFixed(2)} ₺</td>
            <td style="padding: 8px 12px; text-align: right; font-weight:800; color:#fff;">${Number(c.new_price || 0).toFixed(2)} ₺</td>
            <td style="padding: 8px 12px; text-align: right; font-weight:800; color:${diffColor};">${diffSign}${diffAmt.toFixed(2)} ₺ (${diffSign}${c.diff_percent || 0}%)</td>
          </tr>
        `;
      }).join('');
    }
  }

  // Yeni ürünler tablosunu doldur
  const newTbody = document.getElementById('previewNewTableBody');
  if (newTbody) {
    const newItems = data.new_products_list || [];
    if (newItems.length === 0) {
      newTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 18px; color:#64748b;">Yeni eklenecek ürün yok.</td></tr>`;
    } else {
      newTbody.innerHTML = newItems.map(n => {
        return `
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 12px; font-family:'JetBrains Mono', monospace; color:#34d399; font-weight:700;">${escapeHtml(n.barcode)}</td>
            <td style="padding: 8px 12px; max-width: 300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(n.title)}</td>
            <td style="padding: 8px 12px; text-align: right; font-weight:800; color:#fff;">${Number(n.price || 0).toFixed(2)} ₺</td>
            <td style="padding: 8px 12px; color:#94a3b8;">${escapeHtml(n.unit || 'ADET')}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // Kara liste tablosunu doldur
  const blacklistTbody = document.getElementById('previewBlacklistTableBody');
  if (blacklistTbody) {
    const blacklisted = data.blacklisted_items || [];
    if (blacklisted.length === 0) {
      blacklistTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 18px; color:#64748b;">Kara listede ürün tespit edilmedi.</td></tr>`;
    } else {
      blacklistTbody.innerHTML = blacklisted.map(b => {
        return `
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 12px; font-family:'JetBrains Mono', monospace; color:#f87171; font-weight:700;">${escapeHtml(b.barcode || '—')}</td>
            <td style="padding: 8px 12px; max-width: 300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(b.title)}</td>
            <td style="padding: 8px 12px; text-align: right;">${Number(b.price || 0).toFixed(2)} ₺</td>
            <td style="padding: 8px 12px; color:#fbbf24; font-size:12px;">${escapeHtml(b.reason || 'Kara Liste')}</td>
          </tr>
        `;
      }).join('');
    }
  }

  switchPreviewSubTab('changes');
}

// Eski uyumluluk için alias
function showCalculationPreviewModal(data) {
  unlockStep2();
  renderCalculationDataToStep2(data);
  switchQuickUpdateStep(2);
}

async function confirmAndApplyQuickUpdate() {
  if (!lastCalculatedRawText || !lastCalculatedRawText.trim()) {
    showToast('Güncellenecek veri bulunamadı.', 'error');
    return;
  }

  const btnConfirm = document.getElementById('btnConfirmQuickUpdateApply');
  const originalHtml = btnConfirm ? btnConfirm.innerHTML : '';
  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.innerHTML = '<span>⏳</span> Veriler Yazılıyor...';
  }

  closeQuickUpdateConfirmModal();
  showQuickUpdateProgress('Veriler Sisteme Yazılıyor...', 'Ürünler ve fiyatlar veritabanına kaydediliyor...', '💾');
  updateQuickUpdateProgress(50, 100, 'Veritabanına uygulanıyor...');

  try {
    const formData = new FormData();
    formData.append('raw_text', lastCalculatedRawText);
    formData.append('device_name', 'Ana PC - Excel Güncelleme Masası');
    formData.append('preview_only', 'false');

    const res = await fetch('/api/products/quick-update-clipboard', {
      method: 'POST',
      body: formData
    });
    const result = await res.json();

    updateQuickUpdateProgress(100, 100, 'Güncelleme başarıyla tamamlandı!');
    await new Promise(r => setTimeout(r, 250));
    hideQuickUpdateProgress();

    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = originalHtml;
    }

    if (result.status === 'success' && result.data) {
      const d = result.data;
      showToast(
        `✓ ${d.total_items} ürün güncellendi! (${d.price_changes_count} fiyat değişimi, ${d.new_products} yeni ürün, ${d.blacklisted_count || 0} kara liste).`,
        'success'
      );

      if (typeof searchProducts === 'function') {
        searchProducts(document.getElementById('productSearchInput')?.value || '');
      }
      if (typeof loadPriceChanges === 'function') {
        loadPriceChanges();
      }

      setTimeout(() => {
        if (typeof switchTab === 'function') {
          switchTab('tab-search');
        }
      }, 1000);
    } else {
      showToast('Güncelleme Hatası: ' + (result.message || 'İşlem gerçekleştirilemedi.'), 'error');
    }
  } catch (err) {
    hideQuickUpdateProgress();
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = originalHtml;
    }
    showToast('Sunucu bağlantı hatası: ' + err.message, 'error');
  }
}


function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setupInfiniteScroll() {
  const container = document.getElementById('excelGridScrollContainer');
  if (!container) return;

  container.addEventListener('scroll', () => {
    // Kullanıcı listenin sonuna yaklaştığında (son 300 piksel) otomatik yeni satırlar ekle (Excel gibi sonsuz aşağı inme)
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 300) {
      addGridRowsBatch(50);
    }
  });
}

function addGridRowsBatch(count = 50) {
  const tbody = document.getElementById('excelGridTbody');
  if (!tbody) return;

  const startIdx = gridData.length;
  let html = '';

  for (let i = 0; i < count; i++) {
    const rIdx = startIdx + i;
    const newRow = new Array(numCols).fill('');
    gridData.push(newRow);

    html += `<tr data-row="${rIdx}" style="border-bottom: 1px solid #1e293b; background: ${rIdx % 2 === 0 ? '#0b1120' : '#070c18'};">`;
    html += `
      <td style="background: #0f172a; border-right: 1px solid #334155; text-align: center; color: #64748b; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; user-select: none; padding: 5px; position: sticky; left: 0; z-index: 2;">
        ${rIdx + 1}
      </td>
    `;
    for (let cIdx = 0; cIdx < numCols; cIdx++) {
      html += `
        <td 
          data-row="${rIdx}" 
          data-col="${cIdx}" 
          contenteditable="true" 
          spellcheck="false"
          onfocus="onCellFocus(${rIdx}, ${cIdx})"
          onblur="onCellBlur(${rIdx}, ${cIdx}, this.innerText)"
          onkeydown="onCellKeyDown(event, ${rIdx}, ${cIdx})"
          style="border-right: 1px solid #1e293b; padding: 6px 10px; color: #f1f5f9; font-size: 13px; outline: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 140px; max-width: 320px;"
        ></td>
      `;
    }
    html += `</tr>`;
  }

  tbody.insertAdjacentHTML('beforeend', html);
  updateGridStats();
}

document.addEventListener('DOMContentLoaded', () => {
  initExcelGrid(100, 26);
  setupInfiniteScroll();
});


