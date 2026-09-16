// ==========================================================================
// OYMAPOS - ANA UYGULAMA BAŞLATICI, SEKME VE KISAYOL YÖNETİCİSİ
// ==========================================================================

let activeTab = 'tab-search';

// BAŞLATICI VE OLAY DİNLEYİCİLERİ
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initShortcuts();
  loadNetworkInfo();
  loadPrinters();
  loadTemplates();
  restoreSavedState();
  
  // Eğer doğrudan ürün sekmesindeyse yükle (F5 durumunda), ana sayfadaysa arka planda donma yapmaması için geciktir / geçişe bırak
  if (activeTab === 'tab-search') {
    searchProducts('');
  }
  
  loadPriceChanges();
  loadNewProducts();
  loadSyncHistory();
  initkasa_aktarimDropzone();
  initStudioDragAndDrop();
  if (typeof initMarketRadarModule === 'function') {
    initMarketRadarModule();
  }

  // Canlı Yazıcı Durumunu Kontrol Et ve Periyodik Yenile
  if (typeof updateTopbarPrinterStatus === 'function') {
    updateTopbarPrinterStatus();
    setInterval(updateTopbarPrinterStatus, 6000);
  }

  const toggleBtn = document.getElementById('sidebarToggleBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      toggleSidebar();
    });
  }

  // İlk SVG barkod çizimini çalıştır
  setTimeout(() => {
    renderBarcodeSvg("#editor-barcode-svg", "8690504114925");
    updateHomeDashboardInfo();
    initDeviceRoleBadge();
  }, 200);
});

function initDeviceRoleBadge() {
  const btnShutdown = document.getElementById('btnTopShutdown');
  const isGuest = document.body.dataset.isGuest === 'true';

  // Misafir terminalde ana sunucuyu kapat butonunu gizle
  if (isGuest && btnShutdown) {
    btnShutdown.style.display = 'none';
  }
}

// 1. KLAVYE KISAYOLLARI & GLOBAL DONANIM BARKOD OKUYUCU DİNLEYİCİSİ (OYMAPOS 1-1)
let barcodeScanBuffer = '';
let barcodeScanLastTime = 0;
let lastFoundPriceCheckProduct = null;

function initShortcuts() {
  // A. Donanım Seviyesi Lazer / USB Barkod Okuyucu Dinleyicisi (HID Keystroke Stream)
  // Kullanıcı nerede olursa olsun, okuyucu bip yaptığında (~50ms aralıkla tuşlar + Enter) anında yakalanır!
  window.addEventListener('keydown', async (e) => {
    const currentTime = Date.now();
    const timeDiff = currentTime - barcodeScanLastTime;
    barcodeScanLastTime = currentTime;

    // F2 Tuşu -> OYMAPOS 1-1 Ürün Fiyat & Stok Sorgula [F2]
    if (e.key === 'F2') {
      e.preventDefault();
      e.stopPropagation();
      openPosPriceCheckModal();
      return;
    }

    // Modal Açıkken Enter (Yazdır) veya Escape (Kapat)
    const labelModal = document.getElementById('modal-label-preview');
    if (labelModal && labelModal.style.display === 'flex') {
      if (e.key === 'Enter') {
        e.preventDefault();
        printFromModal();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLabelPreviewModal();
        return;
      }
    }

    const priceCheckModal = document.getElementById('modal-pos-price-check');
    if (priceCheckModal && (priceCheckModal.style.display === 'flex' || priceCheckModal.classList.contains('active'))) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePosPriceCheckModal();
        return;
      }
    }

    // Ctrl + K veya / -> Arama Kutusuna Odaklan
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && document.activeElement.tagName !== 'INPUT')) {
      e.preventDefault();
      const searchInput = document.getElementById('productSearchInput');
      if (searchInput) {
        document.querySelector('[data-tab="tab-search"]')?.click();
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    // Ctrl + S -> Yazıcı Ayarlarını Kaydet
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      savePrinterSettings();
      return;
    }

    // Escape -> Arama Temizle
    if (e.key === 'Escape') {
      const searchInput = document.getElementById('productSearchInput');
      if (searchInput && document.activeElement === searchInput) {
        searchInput.value = '';
        searchProducts('');
      }
      return;
    }

    // Donanım Barkod Okuyucu Karakter Akışı Tespiti:
    // Standart insan yazım hızı tuş başına >100ms'dir. Barkod okuyucular ise 0-60ms arasında ardı ardına yollar.
    const isTargetInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    const isPriceCheckOpen = priceCheckModal && (priceCheckModal.style.display === 'flex' || priceCheckModal.classList.contains('active'));

    if (e.key === 'Enter') {
      if (barcodeScanBuffer.length >= 3) {
        const scannedCode = barcodeScanBuffer.trim();
        barcodeScanBuffer = '';
        
        // Eğer Fiyat Gör açık değilse veya aktif bir inputta değilsek doğrudan Fiyat Gör aç ve ürünü getir!
        if (!isPriceCheckOpen && (!isTargetInput || e.target.id === 'productSearchInput')) {
          e.preventDefault();
          if (typeof SoundFeedback !== 'undefined') SoundFeedback.playSuccess();
          openPosPriceCheckModal(scannedCode);
          return;
        }
      }
      barcodeScanBuffer = '';
      return;
    }

    // Normal basılabilir karakterleri ara belleğe al
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (timeDiff > 120) {
        barcodeScanBuffer = ''; // Önceki yavaş giriş insan yazımıdır, sıfırla
      }
      barcodeScanBuffer += e.key;
    }
  }, true);
}

// 1.1. OYMAPOS 1-1 ÜRÜN FİYAT & STOK SORGULA [F2] MODAL KONTROLCÜSÜ
function openPosPriceCheckModal(initialBarcode = '') {
  const modal = document.getElementById('modal-pos-price-check');
  const inp = document.getElementById('pos-price-check-input');
  const resEl = document.getElementById('pos-price-check-result');
  const btnEdit = document.getElementById('btn-edit-checked-product');
  const btnPrint = document.getElementById('btn-print-checked-label');

  lastFoundPriceCheckProduct = null;
  if (btnEdit) btnEdit.style.display = 'none';
  if (btnPrint) btnPrint.style.display = 'none';

  if (resEl) {
    resEl.innerHTML = `
      <div style="font-size: 38px; margin-bottom: 6px;">🏷️</div>
      <div style="font-size: 15px; font-weight: 800; color: #f8fafc;">Barkod Okutun veya Yazın</div>
      <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Okuttuğunuz ürünün adı, satış fiyatı, raf etiketi ve stok durumu büyük puntolarla gösterilir.</div>
    `;
  }

  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }

  const cleanInitial = String(initialBarcode || '').trim();
  if (inp) {
    inp.value = cleanInitial;
    setTimeout(() => {
      inp.focus();
      inp.select();
      if (cleanInitial) {
        executePriceCheckQuery(cleanInitial);
      }
    }, 80);
  }
}

function closePosPriceCheckModal() {
  const modal = document.getElementById('modal-pos-price-check');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
  lastFoundPriceCheckProduct = null;
}

function handlePosPriceCheckKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const inp = document.getElementById('pos-price-check-input');
    const q = (inp?.value || '').trim();
    if (!q) return;

    if (lastFoundPriceCheckProduct && (lastFoundPriceCheckProduct.barcode === q || lastFoundPriceCheckProduct.stock_code === q)) {
      printFromPriceCheck();
      return;
    }

    executePriceCheckQuery(q);
  }
}

function executePosPriceCheck() {
  const inp = document.getElementById('pos-price-check-input');
  const q = (inp?.value || '').trim();
  if (!q) {
    showToast('Lütfen barkod okutun veya yazın.', 'warning');
    if (inp) inp.focus();
    return;
  }
  executePriceCheckQuery(q);
}

async function executePriceCheckQuery(query) {
  const resEl = document.getElementById('pos-price-check-result');
  const btnEdit = document.getElementById('btn-edit-checked-product');
  const btnPrint = document.getElementById('btn-print-checked-label');
  if (!resEl) return;

  resEl.innerHTML = '<div style="color: #38bdf8; font-size: 14px; font-weight: 700; padding: 20px 0;"><span style="font-size: 24px;">⏳</span> Ürün sorgulanıyor...</div>';

  try {
    const res = await API.getProduct(query);
    const prod = (res && res.data && res.data.product) ? res.data.product : null;

    if (prod) {
      lastFoundPriceCheckProduct = prod;
      if (typeof SoundFeedback !== 'undefined') SoundFeedback.playSuccess();

      const posPrice = Number(prod.price || 0);
      const posPriceStr = posPrice.toFixed(2).replace('.', ',');
      const hasLabel = prod.label_price !== null && prod.label_price !== undefined;
      const labelPriceStr = hasLabel ? Number(prod.label_price).toFixed(2).replace('.', ',') : 'Basılmadı';
      const isMismatch = hasLabel && Math.abs(posPrice - Number(prod.label_price)) > 0.001;

      let statusBadge = '<span style="background:rgba(16,185,129,0.15); color:#34d399; padding:3px 8px; border-radius:6px; font-weight:800; font-size:11px;">✅ Etiket Güncel</span>';
      if (isMismatch) {
        statusBadge = `<span style="background:rgba(239,68,68,0.2); color:#f87171; padding:3px 8px; border-radius:6px; font-weight:800; font-size:11px;">⚠️ FARK: ₺${Math.abs(posPrice - Number(prod.label_price)).toFixed(2)}</span>`;
      } else if (!prod.last_printed_at) {
        statusBadge = '<span style="background:rgba(245,158,11,0.18); color:#fbbf24; padding:3px 8px; border-radius:6px; font-weight:800; font-size:11px;">⚠️ Baskı Bekliyor</span>';
      }

      resEl.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%;">
          <div style="font-size: 16.5px; font-weight: 900; color: #ffffff; letter-spacing: 0.3px; line-height: 1.3; text-align: center;">
            ${escapeHtml(prod.title || 'İSİMSİZ ÜRÜN')}
          </div>
          
          <div style="background: rgba(16,185,129,0.12); border: 2px solid #10b981; border-radius: 12px; padding: 12px 20px; width: 100%; box-sizing: border-box; text-align: center; margin: 4px 0; box-shadow:0 0 20px rgba(16,185,129,0.2);">
            <div style="font-size: 11px; font-weight: 800; color: #34d399; text-transform: uppercase; letter-spacing: 1px;">SATIŞ FİYATI</div>
            <div style="font-size: 42px; font-weight: 900; color: #10b981; font-family: 'Inter', sans-serif; text-shadow: 0 0 16px rgba(16,185,129,0.45); line-height: 1.1; margin: 4px 0;">
              ₺ ${posPriceStr}
            </div>
            ${prod.scale_summary ? `<div style="font-size:12px; color:#38bdf8; font-weight:700; margin-top:2px;">⚖️ ${prod.scale_summary}</div>` : ''}
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; width: 100%; margin-top: 2px;">
            <div style="background: #070d1e; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 8px; text-align: center;">
              <span style="font-size: 10px; color: #64748b; font-weight: 700; display: block;">BARKOD</span>
              <strong style="color: #38bdf8; font-family: monospace; font-size: 12.5px;">${prod.barcode}</strong>
            </div>
            <div style="background: #070d1e; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 8px; text-align: center;">
              <span style="font-size: 10px; color: #64748b; font-weight: 700; display: block;">RAF ETİKETİ</span>
              <strong style="color: #fbbf24; font-size: 12.5px;">₺ ${labelPriceStr}</strong>
            </div>
            <div style="background: #070d1e; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 8px; text-align: center;">
              <span style="font-size: 10px; color: #64748b; font-weight: 700; display: block;">DURUM</span>
              <div style="margin-top:2px;">${statusBadge}</div>
            </div>
          </div>
        </div>
      `;

      if (btnEdit) btnEdit.style.display = 'block';
      if (btnPrint) btnPrint.style.display = 'block';
    } else {
      lastFoundPriceCheckProduct = null;
      if (typeof SoundFeedback !== 'undefined') SoundFeedback.playWarning();
      resEl.innerHTML = `
        <div style="font-size: 36px; margin-bottom: 6px;">❌</div>
        <div style="font-size: 15px; font-weight: 800; color: #f87171;">Ürün Bulunamadı</div>
        <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;"><strong>${escapeHtml(query)}</strong> barkodlu ürün stok veritabanında kayıtlı değil.</div>
        <button class="btn btn-secondary btn-sm" onclick="openProductEditModal('${escapeHtml(query)}'); closePosPriceCheckModal();" style="margin-top: 12px; color: #38bdf8; border-color: rgba(56,189,248,0.4);">
          ➕ Yeni Ürün Olarak Tanımla
        </button>
      `;
      if (btnEdit) btnEdit.style.display = 'none';
      if (btnPrint) btnPrint.style.display = 'none';
    }
  } catch (err) {
    resEl.innerHTML = `<div style="color: #f87171; padding: 20px;">Sorgulama hatası: ${err.message}</div>`;
  }
}

function openEditFromPriceCheck() {
  if (!lastFoundPriceCheckProduct) return;
  const bc = lastFoundPriceCheckProduct.barcode;
  closePosPriceCheckModal();
  if (typeof openProductEditModal === 'function') {
    openProductEditModal(bc);
  }
}

function printFromPriceCheck() {
  if (!lastFoundPriceCheckProduct) return;
  const p = lastFoundPriceCheckProduct;
  if (typeof printBarcode === 'function') {
    printBarcode(p.barcode, null, p.price);
  } else if (typeof openLabelPreviewModal === 'function') {
    openLabelPreviewModal(p.barcode);
  }
  closePosPriceCheckModal();
}

window.openPosPriceCheckModal = openPosPriceCheckModal;
window.closePosPriceCheckModal = closePosPriceCheckModal;
window.handlePosPriceCheckKey = handlePosPriceCheckKey;
window.executePosPriceCheck = executePosPriceCheck;
window.openEditFromPriceCheck = openEditFromPriceCheck;
window.printFromPriceCheck = printFromPriceCheck;

// 2. SEKME YÖNETİMİ
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      switchTab(target);
    });
  });

  const savedTab = localStorage.getItem('active_tab');
  if (savedTab && (document.querySelector(`[data-tab="${savedTab}"]`) || document.getElementById(savedTab))) {
    switchTab(savedTab);
  } else {
    switchTab('tab-home');
  }
}

function switchTab(target) {
  if (!target) return;
  document.querySelectorAll('.tab-btn').forEach(b => {
    if (b.dataset.tab === target) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

  const pane = document.getElementById(target);
  if (pane) pane.classList.add('active');
  activeTab = target;
  localStorage.setItem('active_tab', target);

  const preStyle = document.getElementById('pre-tab-style');
  if (preStyle) preStyle.remove();

  if (target === 'tab-search') {
    if (typeof cachedProductsList === 'undefined' || cachedProductsList.length === 0) {
      if (typeof searchProducts === 'function') {
        const input = document.getElementById('productSearchInput');
        searchProducts(input ? input.value : '');
      }
    }
  }
  if (target === 'tab-design') {
    loadTemplates();
  }
  if (target === 'tab-home') {
    updateHomeDashboardInfo();
  }
  if (target === 'tab-kasa_aktarim') {
    if (typeof loadkasa_aktarimDevicesAndData === 'function') loadkasa_aktarimDevicesAndData();
    loadPriceChanges();
    loadSyncHistory();
  }
  if (target === 'tab-devices') {
    loadNetworkInfo();
    loadConnectedDevicesTable();
  }
  if (target === 'tab-print-history') {
    if (typeof loadPrintHistoryTable === 'function') loadPrintHistoryTable();
    if (typeof updateTopbarPrinterStatus === 'function') updateTopbarPrinterStatus();
  }
  if (target === 'tab-market-radar') {
    if (typeof loadMarketRadarData === 'function') loadMarketRadarData();
  }
}

// 3. DIŞA AKTAR VE KOPYALA
function copyUrl(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent.trim()).then(() => {
    showToast('URL panoya kopyalandı!', 'success');
  });
}

function copyTableToClipboard(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  let text = '';
  table.querySelectorAll('tr').forEach(tr => {
    const row = Array.from(tr.children).map(td => td.innerText.trim()).join('\t');
    text += row + '\n';
  });
  navigator.clipboard.writeText(text).then(() => {
    showToast('Tablo panoya kopyalandı!', 'success');
  });
}

function restoreSavedState() {
  const input = document.getElementById('productSearchInput');
  if (input) input.value = '';
  localStorage.removeItem('search_query');

  const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
  const sidebar = document.getElementById('appSidebar');
  if (sidebar && isCollapsed) {
    sidebar.classList.add('collapsed');
  }
  updateSidebarToggleUI(isCollapsed);

  // Tema yükleme
  const savedTheme = localStorage.getItem('theme_mode') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
  }
  updateThemeIcon();

  updateHomeDashboardInfo();
}

function toggleThemeMode() {
  document.body.classList.toggle('light-theme');
  const isLight = document.body.classList.contains('light-theme');
  localStorage.setItem('theme_mode', isLight ? 'light' : 'dark');
  updateThemeIcon();
  showToast(isLight ? 'Açık tema etkinleştirildi' : 'Koyu tema etkinleştirildi', 'info');
}

function updateThemeIcon() {
  const icon = document.getElementById('themeToggleIcon');
  const btn = document.getElementById('themeToggleBtn');
  const isLight = document.body.classList.contains('light-theme');
  if (icon) icon.textContent = isLight ? '☀️' : '🌙';
  if (btn) btn.title = isLight ? 'Koyu Temaya Geç' : 'Açık Temaya Geç';
}

// 4. SIDEBAR KONTROLÜ
function toggleSidebar(forceState) {
  const sidebar = document.getElementById('appSidebar');
  if (!sidebar) return;

  if (typeof forceState === 'boolean') {
    if (forceState) {
      sidebar.classList.remove('collapsed');
    } else {
      sidebar.classList.add('collapsed');
    }
  } else {
    sidebar.classList.toggle('collapsed');
  }

  const isCollapsed = sidebar.classList.contains('collapsed');
  localStorage.setItem('sidebar_collapsed', isCollapsed ? 'true' : 'false');
  updateSidebarToggleUI(isCollapsed);
}

function updateSidebarToggleUI(isCollapsed) {
  const toggleBtn = document.getElementById('sidebarToggleBtn');
  const topbarToggleText = document.getElementById('topbarSidebarText');
  const topbarToggleIcon = document.getElementById('topbarSidebarIcon');

  if (toggleBtn) {
    toggleBtn.textContent = isCollapsed ? '▶' : '◀';
    toggleBtn.title = isCollapsed ? 'Menüyü Aç' : 'Menüyü Gizle (Tam Ekran)';
  }
  if (topbarToggleIcon) topbarToggleIcon.textContent = isCollapsed ? '☰' : '✕';
  if (topbarToggleText) topbarToggleText.textContent = isCollapsed ? 'Menü' : 'Gizle';
}

function updateHomeDashboardInfo() {
  const countEl = document.getElementById('totalProductsCount');
  const totalCount = countEl && countEl.textContent !== '0' ? countEl.textContent : '4.925';
  
  const homeBadge = document.getElementById('homeBadgeTotalProducts');
  if (homeBadge) homeBadge.textContent = `${totalCount} Ürün`;

  const marketName = localStorage.getItem('market_name') || 'YARENLER';
  const homeMarket = document.getElementById('homeMarketName');
  const topbarMarket = document.getElementById('topbarMarketName');
  if (homeMarket) homeMarket.textContent = marketName;
  if (topbarMarket) topbarMarket.textContent = marketName;

  const printerSelect = document.getElementById('printerSelect');
  const homePrinter = document.getElementById('homeInfoPrinterName');
  if (homePrinter && printerSelect && printerSelect.value) {
    homePrinter.textContent = printerSelect.value;
  }

  const topbarIp = document.getElementById('topbarIp');
  const homeIp = document.getElementById('homeInfoIpAddress');
  if (topbarIp && topbarIp.textContent && topbarIp.textContent !== '127.0.0.1' && !topbarIp.textContent.includes('{{')) {
    if (homeIp) homeIp.textContent = topbarIp.textContent;
  }
}

async function refreshAllData() {
  showToast('Sistem ve stok verileri yenileniyor...', 'info');
  await searchProducts(document.getElementById('productSearchInput')?.value || '');
  await loadPriceChanges();
  await loadNetworkInfo();
  await loadPrinters();
  updateHomeDashboardInfo();
  showToast('Tüm veriler başarıyla güncellendi!', 'success');
}
