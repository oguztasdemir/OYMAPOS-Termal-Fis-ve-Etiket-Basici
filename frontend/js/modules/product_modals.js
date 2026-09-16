// ==========================================================================
// OYMAPOS - MODAL PENCERELERİ (ÖNİZLEME, GEÇMİŞ, DÜZENLEME) MODÜLÜ
// ==========================================================================

// 1. TEKLİ ETİKET ÖNİZLEME MODALI
function openLabelPreviewModal(barcode) {
  const prod = cachedProductsList.find(p => p.barcode === barcode) || {
    barcode: barcode,
    title: "ÖRNEK ÜRÜN",
    price: 25.0,
    brand: "MARKET",
    origin: "TURKIYE"
  };

  currentModalProduct = prod;

  const smartLines = (typeof formatSmartTitleLines === 'function')
    ? formatSmartTitleLines(prod.title || 'ÜRÜN ADI', 26)
    : { line1: fullTitle, line2: '' };

  const title1El = document.getElementById('modal-lbl-title-1');
  const title2El = document.getElementById('modal-lbl-title-2');
  const brandEl = document.getElementById('modal-lbl-brand');
  const originEl = document.getElementById('modal-lbl-origin');
  const dateEl = document.getElementById('modal-lbl-date');
  const priceEl = document.getElementById('modal-lbl-price');
  const modal = document.getElementById('modal-label-preview');

  if (title1El) {
    title1El.textContent = smartLines.line1;
    title1El.style.width = '100%';
    title1El.style.display = 'block';
    if (!smartLines.line2 && smartLines.line1.length <= 22) {
      title1El.style.fontSize = '14px';
    } else {
      title1El.style.fontSize = '12.5px';
    }
  }
  if (title2El) {
    if (smartLines.line2) {
      title2El.textContent = smartLines.line2;
      title2El.style.display = 'block';
    } else {
      title2El.textContent = '';
      title2El.style.display = 'none';
    }
  }
  const marketName = localStorage.getItem('market_name') || document.getElementById('marketName')?.value || 'YARENLER';
  if (brandEl) brandEl.textContent = marketName.toUpperCase();
  if (originEl) originEl.textContent = (prod.origin || 'TÜRKİYE').toUpperCase();
  if (dateEl) dateEl.textContent = formatTrDate(prod.price_updated_at || prod.updated_at || prod.created_at || new Date().toISOString());
  
  const priceVal = (typeof prod.price === 'number') ? prod.price : Number(prod.price || 0);
  if (priceEl) priceEl.textContent = `${priceVal.toFixed(2)} TL`.replace('.', ',');

  renderBarcodeSvg("#modal-barcode-svg", prod.barcode);

  const scaleBadge = document.getElementById('modal-scale-badge');
  if (scaleBadge) {
    if (prod.is_scale_product) {
      scaleBadge.style.display = 'block';
      scaleBadge.textContent = `⚖️ Terazi Ürünü: ${prod.scale_summary || 'Gramajlı Satış'}`;
    } else {
      scaleBadge.style.display = 'none';
    }
  }

  loadModalPriceHistory(prod.barcode);

  if (modal) {
    modal.style.display = 'flex';
  }
}

async function loadModalPriceHistory(barcode) {
  const historyList = document.getElementById('modal-history-list');
  const countEl = document.getElementById('modal-history-count');
  if (!historyList) return;
  historyList.innerHTML = '<div style="color:var(--text-muted); font-size:11px;">Fiyat geçmişi yükleniyor...</div>';

  try {
    const res = await API.getProductHistory(barcode);
    const data = res.data || {};
    const history = data.history || [];
    if (countEl) countEl.textContent = `${history.length} Değişim`;

    if (history.length === 0) {
      historyList.innerHTML = '<div style="color:var(--text-muted); font-size:11px;">Bu ürün için kayıtlı fiyat değişimi bulunmuyor.</div>';
      return;
    }

    historyList.innerHTML = '';
    history.forEach(h => {
      const item = document.createElement('div');
      const diffColor = h.diff_amount > 0 ? '#ef4444' : '#10b981';
      const diffSign = h.diff_amount > 0 ? '+' : '';
      item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.3); padding:4px 8px; border-radius:4px; font-size:11px;';
      item.innerHTML = `
        <span style="color:#94a3b8;">📅 ${h.changed_at}</span>
        <span style="text-decoration:line-through; color:#64748b;">₺ ${Number(h.old_price).toFixed(2)}</span>
        <span style="font-weight:700; color:#fff;">➔ ₺ ${Number(h.new_price).toFixed(2)}</span>
        <span style="color:${diffColor}; font-weight:700;">${diffSign}${h.diff_amount} TL (%${h.diff_percent})</span>
      `;
      historyList.appendChild(item);
    });
  } catch (err) {
    historyList.innerHTML = '<div style="color:var(--text-muted); font-size:11px;">Fiyat geçmişi alınamadı.</div>';
  }
}

function closeLabelPreviewModal() {
  const modal = document.getElementById('modal-label-preview');
  if (modal) modal.style.display = 'none';
}

async function printFromModal() {
  if (!currentModalProduct) return;
  const copies = parseInt(document.getElementById('modal-print-copies')?.value || '1', 10);
  const btn = document.getElementById('modal-btn-print');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Basılıyor...';
  }

  try {
    const res = await API.printSingle({ barcode: currentModalProduct.barcode }, copies);
    if (res.status === 'success') {
      showToast(`${copies} adet etiket yazıcıya gönderildi!`, 'success');
      closeLabelPreviewModal();
      searchProducts(document.getElementById('productSearchInput')?.value || '');
    } else {
      showToast('Yazdırma hatası: ' + res.message, 'error');
    }
  } catch (err) {
    showToast('Yazıcıya ulaşılamadı: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🖨️ Hemen Yazdır';
    }
  }
}

function openProductInStudio() {
  if (!currentModalProduct) return;
  closeLabelPreviewModal();
  document.querySelector('[data-tab="tab-design"]')?.click();
  loadProductIntoStudio(currentModalProduct);
}

// 2. ÜRÜN DETAYLI DEĞİŞİKLİK GEÇMİŞİ (AUDIT TIMELINE) MODALI
let activeHistoryBarcode = null;

async function openProductHistoryModal(barcode) {
  activeHistoryBarcode = barcode;
  const modal = document.getElementById('modal-product-history');
  const listEl = document.getElementById('histTimelineList');
  const barEl = document.getElementById('histModalBarcode');
  const titleEl = document.getElementById('histCurrentTitle');
  const priceEl = document.getElementById('histCurrentPrice');

  if (barEl) barEl.textContent = `Barkod: ${barcode}`;
  if (listEl) listEl.innerHTML = '<div style="text-align:center; padding:30px; color:#94a3b8;">⏳ Geçmiş hareketler yükleniyor...</div>';
  if (modal) modal.style.display = 'flex';

  try {
    const res = await API.getProductHistory(barcode);
    const data = res.data || res;
    const prod = data.product || cachedProductsList.find(p => p.barcode === barcode);
    const history = data.history || [];

    if (prod) {
      if (titleEl) titleEl.textContent = prod.title || '-';
      if (priceEl) priceEl.textContent = `${Number(prod.price || 0).toFixed(2)} TL`;
    }

    if (!history || history.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:32px 16px; background:rgba(0,0,0,0.25); border-radius:10px; border:1px dashed rgba(255,255,255,0.1);">
          <div style="font-size:32px; margin-bottom:8px;">🕒</div>
          <div style="font-size:14px; font-weight:700; color:#fff;">Henüz Değişiklik Kaydı Yok</div>
          <div style="font-size:12px; color:#94a3b8; margin-top:4px;">Bu ürün için kaydedilmiş bir fiyat veya isim değişikliği bulunmuyor.</div>
        </div>
      `;
      return;
    }

    let html = '';
    history.forEach((h) => {
      let badgeHtml = '';
      let descHtml = '';
      const eventType = h.event_type || 'price_change';

      if (eventType === 'price_change') {
        badgeHtml = '<span class="badge" style="background:rgba(245,158,11,0.15); color:#fbbf24; border:1px solid rgba(245,158,11,0.3); font-weight:700; font-size:11px;">⚡ Fiyat Değişimi</span>';
        const sign = (h.diff_amount > 0) ? '+' : '';
        const oldP = h.old_price !== null ? Number(h.old_price).toFixed(2) : '-';
        const newP = h.new_price !== null ? Number(h.new_price).toFixed(2) : '-';
        descHtml = `
          <div style="font-size:13px; font-weight:700; color:#fff; display:flex; align-items:center; gap:8px; margin:4px 0;">
            <span style="color:#94a3b8; text-decoration:line-through;">₺ ${oldP}</span>
            <span style="color:#38bdf8;">➔</span>
            <span style="color:#fbbf24; font-size:14px; font-weight:800;">₺ ${newP}</span>
            <span style="font-size:11.5px; color:${h.diff_amount > 0 ? '#f87171' : '#34d399'};">(${sign}${h.diff_amount} TL / %${h.diff_percent})</span>
          </div>
        `;
      } else if (eventType === 'title_change') {
        badgeHtml = '<span class="badge" style="background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.3); font-weight:700; font-size:11px;">📝 İsim Değişimi</span>';
        descHtml = `
          <div style="font-size:12.5px; color:#fff; margin:4px 0;">
            <div style="color:#94a3b8; text-decoration:line-through;">${h.old_title || '-'}</div>
            <div style="color:#34d399; font-weight:700; margin-top:2px;">➔ ${h.new_title || '-'}</div>
          </div>
        `;
      } else if (eventType === 'manual_edit') {
        badgeHtml = '<span class="badge" style="background:rgba(168,85,247,0.15); color:#c084fc; border:1px solid rgba(168,85,247,0.3); font-weight:700; font-size:11px;">✏️ El İle Düzenlendi</span>';
        descHtml = `
          <div style="font-size:12.5px; color:#fff; margin:4px 0;">
            ${h.old_title && h.new_title ? `<div style="color:#94a3b8; text-decoration:line-through;">${h.old_title}</div><div style="color:#c084fc; font-weight:700;">➔ ${h.new_title}</div>` : ''}
            ${h.old_price !== null && h.new_price !== null ? `<div style="color:#fbbf24; font-weight:700; margin-top:2px;">Fiyat: ₺${Number(h.old_price).toFixed(2)} ➔ ₺${Number(h.new_price).toFixed(2)}</div>` : ''}
          </div>
        `;
      } else if (eventType === 'restored') {
        badgeHtml = '<span class="badge" style="background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3); font-weight:700; font-size:11px;">↩️ Geri Yüklendi (Undo)</span>';
        descHtml = `
          <div style="font-size:12.5px; color:#34d399; font-weight:700; margin:4px 0;">
            ${h.details || 'Önceki kayıt durumuna geri döndürüldü.'}
          </div>
        `;
      } else if (eventType === 'created') {
        badgeHtml = '<span class="badge" style="background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3); font-weight:700; font-size:11px;">✨ İlk Kayıt</span>';
        descHtml = `
          <div style="font-size:12.5px; color:#fff; margin:4px 0;">
            <strong>${h.new_title || prod?.title || ''}</strong> (Fiyat: ₺${Number(h.new_price || prod?.price || 0).toFixed(2)})
          </div>
        `;
      } else {
        badgeHtml = `<span class="badge badge-secondary">${eventType}</span>`;
        descHtml = `<div style="font-size:12px; color:#94a3b8; margin:4px 0;">${h.details || '-'}</div>`;
      }

      const hasRevertTarget = (h.old_price !== null && h.old_price !== undefined) || (h.old_title);
      const canRevert = hasRevertTarget && eventType !== 'created' && eventType !== 'restored';

      html += `
        <div style="background:rgba(15,23,42,0.7); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:14px 16px; display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              ${badgeHtml}
              <span style="font-size:11.5px; color:#94a3b8;">📅 ${h.created_at || '-'}</span>
              <span style="font-size:11px; color:#64748b;">• ${h.device_name || h.source || 'Sistem'}</span>
            </div>
            ${descHtml}
            ${h.details && eventType !== 'restored' ? `<div style="font-size:11px; color:#64748b; margin-top:2px;">${h.details}</div>` : ''}
          </div>
          ${canRevert ? `
            <button class="btn btn-secondary btn-sm" onclick="revertHistoryItem(${h.id}, '${barcode}')" style="font-weight:700; font-size:11px; color:#34d399; border-color:rgba(52,211,153,0.4); background:rgba(52,211,153,0.1); white-space:nowrap; padding:6px 10px;" title="Bu tarihteki eski fiyata ve ada geri dön">
              ↩️ Geri Dön
            </button>
          ` : ''}
        </div>
      `;
    });

    listEl.innerHTML = html;
  } catch (err) {
    listEl.innerHTML = `<div style="color:#f87171; text-align:center; padding:20px;">Geçmiş yüklenemedi: ${err.message}</div>`;
  }
}

function closeProductHistoryModal() {
  const modal = document.getElementById('modal-product-history');
  if (modal) modal.style.display = 'none';
  activeHistoryBarcode = null;
}

async function revertHistoryItem(historyId, barcode) {
  if (!confirm('Bu geçmiş kaydındaki eski başlık ve satış fiyatına geri dönmek istediğinize emin misiniz?')) {
    return;
  }

  try {
    const res = await API.revertProductHistory(historyId);
    if (res.status === 'success') {
      showToast(res.message || 'Ürün başarıyla önceki durumuna döndürüldü!', 'success');
      searchProducts(document.getElementById('productSearchInput')?.value || '');
      openProductHistoryModal(barcode);
    } else {
      showToast('Geri alma başarısız: ' + (res.message || 'Hata oluştu'), 'error');
    }
  } catch (err) {
    showToast('Sunucu hatası: ' + err.message, 'error');
  }
}

// 3. HIZLI ÜRÜN DÜZENLEME (INLINE EDIT) MODALI
let activeEditBarcode = null;

function openProductEditModal(barcode) {
  activeEditBarcode = barcode;
  const prod = cachedProductsList.find(p => p.barcode === barcode);
  const modal = document.getElementById('modal-product-edit');
  
  document.getElementById('editModalBarcode').value = barcode;
  const rawTitleEl = document.getElementById('editModalRawTitle');
  if (rawTitleEl) rawTitleEl.value = prod ? (prod.raw_system_title || prod.title || '') : '';
  
  const titleVal = prod ? (prod.title || '') : '';
  const priceVal = prod ? Number(prod.price || 0).toFixed(2) : '0.00';
  const brandVal = prod ? (prod.brand || 'YARENLER') : (localStorage.getItem('market_name') || 'YARENLER');
  
  document.getElementById('editModalTitle').value = titleVal;
  document.getElementById('editModalPrice').value = priceVal;
  document.getElementById('editModalBrand').value = brandVal;

  const priceDateEl = document.getElementById('editModalPriceDate');
  if (priceDateEl) {
    priceDateEl.value = prod ? formatTrDate(prod.price_updated_at || prod.updated_at || prod.created_at) : '-';
  }

  const printDateEl = document.getElementById('editModalPrintDate');
  if (printDateEl) {
    printDateEl.value = (prod && prod.last_printed_at) ? prod.last_printed_at : 'Henüz Basılmadı';
  }

  // Kara liste buton durumunu güncelle
  updateEditModalBlacklistBtnState(prod ? !!prod.is_blacklisted : false);

  // Canlı Önizlemeyi Güncelle
  updateEditModalPreview(prod);

  // Canlı Piyasa Fiyatlarını ve Görselini Sorgula
  fetchMarketRadarLiveInEditModal(barcode, prod ? (prod.title || prod.raw_system_title || '') : '');

  if (modal) modal.style.display = 'flex';
}

let currentEditModalMarketAbortCtrl = null;

async function fetchMarketRadarLiveInEditModal(barcode, title = "") {
  const badgeEl = document.getElementById('editModalMarketBadge');
  const titleEl = document.getElementById('editModalMarketFoundTitle');
  const imgEl = document.getElementById('editModalMarketImg');
  const phEl = document.getElementById('editModalMarketPlaceholder');
  const ruyamBox = document.getElementById('editModalPriceRuyam');
  const migrosBox = document.getElementById('editModalPriceMigros');
  const carrefourLink = document.getElementById('editModalLinkCarrefour');

  if (currentEditModalMarketAbortCtrl) {
    try { currentEditModalMarketAbortCtrl.abort(); } catch(e) {}
  }
  currentEditModalMarketAbortCtrl = new AbortController();

  if (badgeEl) {
    badgeEl.textContent = "⏳ Taranıyor...";
    badgeEl.style.background = "rgba(56, 189, 248, 0.15)";
    badgeEl.style.color = "#38bdf8";
  }
  if (titleEl) titleEl.textContent = "Piyasa fiyatları taranıyor...";
  if (ruyamBox) { ruyamBox.textContent = "..."; ruyamBox.style.color = "#94a3b8"; }
  if (migrosBox) { migrosBox.textContent = "..."; migrosBox.style.color = "#94a3b8"; }
  if (imgEl) {
    imgEl.style.display = "none";
    imgEl.src = "";
  }
  if (phEl) phEl.style.display = "block";

  const safeQ = encodeURIComponent(title || barcode || "");
  if (carrefourLink) {
    carrefourLink.href = `https://www.carrefoursa.com/search/?text=${safeQ}`;
  }

  try {
    const res = await fetch('/api/market-radar/scan-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode: barcode, title: title || "" }),
      signal: currentEditModalMarketAbortCtrl.signal
    });
    const json = await res.json();
    const data = json.data || {};
    const details = data.market_details || {};

    let hasAnyPrice = false;

    // 1. Rüyam Market Fiyatı
    if (details.ruyam && details.ruyam.price && details.ruyam.price > 0) {
      hasAnyPrice = true;
      if (ruyamBox) {
        ruyamBox.textContent = `₺ ${Number(details.ruyam.price).toFixed(2)}`;
        ruyamBox.style.color = "#10b981";
      }
    } else {
      if (ruyamBox) {
        ruyamBox.textContent = "Yok";
        ruyamBox.style.color = "#64748b";
      }
    }

    // 2. Migros Fiyatı
    if (details.migros && details.migros.price && details.migros.price > 0) {
      hasAnyPrice = true;
      if (migrosBox) {
        migrosBox.textContent = `₺ ${Number(details.migros.price).toFixed(2)}`;
        migrosBox.style.color = "#10b981";
      }
    } else {
      if (migrosBox) {
        migrosBox.textContent = "Yok";
        migrosBox.style.color = "#64748b";
      }
    }

    // 3. Ürün Başlığı & Görsel
    const foundTitle = (details.ruyam && details.ruyam.title) || (details.migros && details.migros.title) || (data.sources && data.sources[0]?.title) || title || "Piyasa Ürünü";
    if (titleEl) titleEl.textContent = foundTitle;

    if (data.image_url) {
      if (imgEl) {
        imgEl.src = data.image_url;
        imgEl.style.display = "block";
      }
      if (phEl) phEl.style.display = "none";
    } else {
      if (imgEl) imgEl.style.display = "none";
      if (phEl) phEl.style.display = "block";
    }

    if (badgeEl) {
      if (hasAnyPrice) {
        badgeEl.textContent = "🟢 Piyasa Bulundu";
        badgeEl.style.background = "rgba(16, 185, 129, 0.15)";
        badgeEl.style.color = "#34d399";
      } else {
        badgeEl.textContent = "⚠️ Fiyat Bulunamadı";
        badgeEl.style.background = "rgba(239, 68, 68, 0.15)";
        badgeEl.style.color = "#f87171";
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    if (badgeEl) {
      badgeEl.textContent = "⚠️ Bağlantı Hatası";
      badgeEl.style.background = "rgba(239, 68, 68, 0.15)";
      badgeEl.style.color = "#f87171";
    }
    if (titleEl) titleEl.textContent = "Piyasa fiyatı taranamadı.";
  }
}

function updateEditModalBlacklistBtnState(isBlacklisted) {
  const btn = document.getElementById('editModalBlacklistBtn');
  const icon = document.getElementById('editModalBlacklistIcon');
  const text = document.getElementById('editModalBlacklistText');
  if (!btn) return;

  if (isBlacklisted) {
    if (icon) icon.textContent = '🛡️';
    if (text) text.textContent = 'Kara Listeden Çıkar';
    btn.style.background = 'rgba(239, 68, 68, 0.25)';
    btn.style.color = '#f87171';
    btn.style.borderColor = 'rgba(239, 68, 68, 0.5)';
  } else {
    if (icon) icon.textContent = '🚫';
    if (text) text.textContent = 'Kara Listeye Ekle';
    btn.style.background = '';
    btn.style.color = '';
    btn.style.borderColor = '';
  }
}

function updateEditModalPreview(prodOverride = null) {
  const barcode = activeEditBarcode;
  if (!barcode) return;

  const prod = prodOverride || cachedProductsList.find(p => p.barcode === barcode) || {};

  const inputTitle = document.getElementById('editModalTitle')?.value || prod.title || 'ÜRÜN ADI';
  const inputPrice = parseFloat(document.getElementById('editModalPrice')?.value);
  const inputBrand = document.getElementById('editModalBrand')?.value || prod.brand || 'YARENLER';

  const cleanTitle = (typeof cleanProductTitle === 'function') 
    ? cleanProductTitle(inputTitle).trim().toUpperCase() 
    : inputTitle.trim().toUpperCase();

  const smartLines = (typeof formatSmartTitleLines === 'function')
    ? formatSmartTitleLines(inputTitle, 26)
    : { line1: cleanTitle, line2: '' };

  const title1El = document.getElementById('edit-lbl-title-1');
  const title2El = document.getElementById('edit-lbl-title-2');
  if (title1El) {
    title1El.textContent = smartLines.line1;
    if (!smartLines.line2 && smartLines.line1.length <= 22) {
      title1El.style.fontSize = '13.5px';
    } else {
      title1El.style.fontSize = '12px';
    }
  }
  if (title2El) {
    if (smartLines.line2) {
      title2El.textContent = smartLines.line2;
      title2El.style.display = 'block';
    } else {
      title2El.textContent = '';
      title2El.style.display = 'none';
    }
  }

  const marketName = (localStorage.getItem('market_name') || document.getElementById('marketName')?.value || 'YARENLER').toUpperCase();
  const brandEl = document.getElementById('edit-lbl-brand');
  if (brandEl) brandEl.textContent = marketName;

  const originEl = document.getElementById('edit-lbl-origin');
  if (originEl) originEl.textContent = (prod.origin || 'TÜRKİYE').toUpperCase();

  const dateEl = document.getElementById('edit-lbl-date');
  if (dateEl) dateEl.textContent = (typeof formatTrDate === 'function') 
    ? formatTrDate(prod.price_updated_at || prod.updated_at || prod.created_at || new Date().toISOString())
    : (new Date().toLocaleDateString('tr-TR'));

  const priceEl = document.getElementById('edit-lbl-price');
  if (priceEl) {
    const num = isNaN(inputPrice) ? 0 : inputPrice;
    priceEl.textContent = `${num.toFixed(2)} TL`.replace('.', ',');
  }

  // Barkod SVG çizimi
  if (typeof renderBarcodeSvg === 'function') {
    renderBarcodeSvg('#edit-modal-barcode-svg', barcode);
  }
}

function openHistoryFromEditModal() {
  if (!activeEditBarcode) return;
  openProductHistoryModal(activeEditBarcode);
}

async function toggleBlacklistFromEditModal(btnElement) {
  if (!activeEditBarcode) return;
  const barcode = activeEditBarcode;
  await toggleProductBlacklist(barcode, null, null);
  const prod = cachedProductsList.find(p => p.barcode === barcode);
  if (prod) {
    updateEditModalBlacklistBtnState(!!prod.is_blacklisted);
  }
}

async function printFromEditModal() {
  if (!activeEditBarcode) return;
  const barcode = activeEditBarcode;
  const prod = cachedProductsList.find(p => p.barcode === barcode);
  const price = parseFloat(document.getElementById('editModalPrice')?.value) || (prod ? prod.price : 0);
  
  if (typeof printBarcode === 'function') {
    printBarcode(barcode, null, price);
  } else if (typeof API !== 'undefined' && API.printSingle) {
    try {
      const res = await API.printSingle({ barcode }, 1);
      if (res.status === 'success') {
        showToast('Etiket yazıcıya gönderildi!', 'success');
      } else {
        showToast('Yazdırma hatası: ' + res.message, 'error');
      }
    } catch (e) {
      showToast('Yazıcı hatası: ' + e.message, 'error');
    }
  }
}

function closeProductEditModal() {
  if (currentEditModalMarketAbortCtrl) {
    try { currentEditModalMarketAbortCtrl.abort(); } catch(e) {}
  }
  const modal = document.getElementById('modal-product-edit');
  if (modal) modal.style.display = 'none';
  activeEditBarcode = null;
}

async function saveProductEdit() {
  if (!activeEditBarcode) return;
  const barcode = activeEditBarcode;
  const title = document.getElementById('editModalTitle').value.trim();
  const price = parseFloat(document.getElementById('editModalPrice').value);
  const brand = document.getElementById('editModalBrand').value.trim();

  if (!title) {
    showToast('Ürün adı boş bırakılamaz.', 'error');
    return;
  }
  if (isNaN(price) || price < 0) {
    showToast('Geçerli bir fiyat giriniz.', 'error');
    return;
  }

  const saveBtn = document.getElementById('editModalSaveBtn');
  if (saveBtn) saveBtn.disabled = true;

  try {
    const res = await API.updateProduct(barcode, {
      title: title,
      price: price,
      brand: brand,
      device_name: 'Ana PC Kontrol Masası'
    });

    if (saveBtn) saveBtn.disabled = false;
    if (res.status === 'success') {
      showToast('Ürün başarıyla güncellendi ve geçmişe işlendi!', 'success');
      closeProductEditModal();
      searchProducts(document.getElementById('productSearchInput')?.value || '');
    } else {
      showToast('Güncelleme hatası: ' + (res.message || 'Hata oluştu'), 'error');
    }
  } catch (err) {
    if (saveBtn) saveBtn.disabled = false;
    showToast('Sunucu hatası: ' + err.message, 'error');
  }
}

// ==========================================================================
// 5. KARA LİSTE & FİLTRE YÖNETİMİ MODALI
// ==========================================================================
let currentBlacklistData = {
  words: [],
  barcodes: [],
  min_barcode_length: 3,
  block_negative_prices: true,
  block_zero_prices: true
};

async function openBlacklistModal() {
  const modal = document.getElementById('blacklistModal');
  if (!modal) return;
  modal.style.display = 'flex';

  try {
    const res = await fetch('/api/system/blacklist');
    const json = await res.json();
    if (json.status === 'success' && json.data) {
      currentBlacklistData = json.data;
      renderBlacklistItems();
    }
  } catch (err) {
    console.error('Kara liste yüklenemedi:', err);
  }

  // Kara listedeki kayıtlı tüm ürünleri de yükle
  loadBlacklistedProductsList();
}

async function loadBlacklistedProductsList() {
  const container = document.getElementById('blacklistProductsListContainer');
  const countBadge = document.getElementById('blacklistProductsListCount');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center; padding:12px; color:#94a3b8; font-size:12px;">⏳ Kara listedeki ürünler yükleniyor...</div>';

  try {
    const res = await API.searchProducts('', 0, false, false, true);
    const data = res.data || res;
    const prods = data.products || [];
    if (countBadge) countBadge.textContent = `${prods.length} Ürün`;

    if (prods.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:16px; color:#64748b; font-size:12px;">Kara listeye eklenmiş ürün bulunmuyor.</div>';
      return;
    }

    let html = `
      <table style="width:100%; border-collapse:collapse; font-size:12px; color:#f1f5f9;">
        <thead>
          <tr style="background:#090d16; color:#94a3b8; text-align:left; border-bottom:1px solid #334155;">
            <th style="padding:6px 10px;">Barkod</th>
            <th style="padding:6px 10px;">Ürün Adı</th>
            <th style="padding:6px 10px; text-align:right;">Fiyat</th>
            <th style="padding:6px 10px; text-align:center;">İşlem</th>
          </tr>
        </thead>
        <tbody>
    `;

    prods.forEach(p => {
      const pPrice = Number(p.price || 0).toFixed(2);
      const bEscaped = (p.barcode || '').replace(/'/g, "\\'");
      html += `
        <tr style="border-bottom:1px solid #1e293b;">
          <td style="padding:6px 10px; font-family:monospace; color:#fca5a5; font-weight:700;">${escapeHtml(p.barcode)}</td>
          <td style="padding:6px 10px; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(p.title || p.raw_system_title)}</td>
          <td style="padding:6px 10px; text-align:right; font-weight:700; color:#34d399;">₺ ${pPrice}</td>
          <td style="padding:6px 10px; text-align:center;">
            <button class="btn btn-secondary btn-sm" onclick="removeProductFromBlacklist('${bEscaped}')" style="padding:2px 8px; font-size:11px; color:#34d399; border-color:rgba(52,211,153,0.3); background:rgba(52,211,153,0.1);" title="Kara Listeden Çıkar">
              ✓ Kaldır
            </button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = `<div style="color:#f87171; padding:10px; font-size:12px;">Yükleme hatası: ${e.message}</div>`;
  }
}

async function removeProductFromBlacklist(barcode) {
  await toggleProductBlacklist(barcode, null, null);
  loadBlacklistedProductsList();
  if (typeof searchProducts === 'function') {
    searchProducts(document.getElementById('productSearchInput')?.value || '');
  }
}

function closeBlacklistModal() {
  const modal = document.getElementById('blacklistModal');
  if (modal) modal.style.display = 'none';
}

function renderBlacklistItems() {
  const wordsContainer = document.getElementById('blacklistWordsContainer');
  const barcodesContainer = document.getElementById('blacklistBarcodesContainer');
  const minLenSelect = document.getElementById('minBarcodeLengthSelect');
  const negPriceCheck = document.getElementById('blockNegativePricesCheck');
  const zeroPriceCheck = document.getElementById('blockZeroPricesCheck');
  const cigarettesCheck = document.getElementById('blockCigarettesCheck');
  const scaleCheck = document.getElementById('blockScaleProductsCheck');

  if (minLenSelect) minLenSelect.value = String(currentBlacklistData.min_barcode_length || 3);
  if (negPriceCheck) negPriceCheck.checked = currentBlacklistData.block_negative_prices !== false;
  if (zeroPriceCheck) zeroPriceCheck.checked = currentBlacklistData.block_zero_prices !== false;
  if (cigarettesCheck) cigarettesCheck.checked = currentBlacklistData.block_cigarettes !== false;
  if (scaleCheck) scaleCheck.checked = currentBlacklistData.block_scale_products !== false;

  if (wordsContainer) {
    wordsContainer.innerHTML = '';
    const words = currentBlacklistData.words || [];
    if (words.length === 0) {
      wordsContainer.innerHTML = '<span style="color: #64748b; font-size: 11.5px; padding: 4px;">Engellenen kelime yok.</span>';
    } else {
      words.forEach((w, idx) => {
        const tag = document.createElement('span');
        tag.style.cssText = 'background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.35); font-size: 11.5px; font-weight: 700; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 6px;';
        tag.innerHTML = `<span>${escapeHtml(w)}</span><span onclick="removeBlacklistWord(${idx})" style="cursor: pointer; color: #ef4444; font-weight: 800;" title="Kaldır">✕</span>`;
        wordsContainer.appendChild(tag);
      });
    }
  }

  if (barcodesContainer) {
    barcodesContainer.innerHTML = '';
    const barcodes = currentBlacklistData.barcodes || [];
    if (barcodes.length === 0) {
      barcodesContainer.innerHTML = '<span style="color: #64748b; font-size: 11.5px; padding: 4px;">Engellenen özel barkod yok.</span>';
    } else {
      barcodes.forEach((b, idx) => {
        const tag = document.createElement('span');
        tag.style.cssText = 'background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.35); font-size: 11.5px; font-weight: 700; font-family: monospace; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 6px;';
        tag.innerHTML = `<span>${escapeHtml(b)}</span><span onclick="removeBlacklistBarcode(${idx})" style="cursor: pointer; color: #ef4444; font-weight: 800;" title="Kaldır">✕</span>`;
        barcodesContainer.appendChild(tag);
      });
    }
  }
}

function addBlacklistWord() {
  const input = document.getElementById('newBlacklistWordInput');
  if (!input) return;
  const val = input.value.trim().toUpperCase();
  if (!val) return;
  if (!currentBlacklistData.words) currentBlacklistData.words = [];
  if (!currentBlacklistData.words.includes(val)) {
    currentBlacklistData.words.push(val);
    renderBlacklistItems();
  }
  input.value = '';
}

function removeBlacklistWord(idx) {
  if (currentBlacklistData.words && currentBlacklistData.words[idx] !== undefined) {
    currentBlacklistData.words.splice(idx, 1);
    renderBlacklistItems();
  }
}

function addBlacklistBarcode() {
  const input = document.getElementById('newBlacklistBarcodeInput');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  if (!currentBlacklistData.barcodes) currentBlacklistData.barcodes = [];
  if (!currentBlacklistData.barcodes.includes(val)) {
    currentBlacklistData.barcodes.push(val);
    renderBlacklistItems();
  }
  input.value = '';
}

function removeBlacklistBarcode(idx) {
  if (currentBlacklistData.barcodes && currentBlacklistData.barcodes[idx] !== undefined) {
    currentBlacklistData.barcodes.splice(idx, 1);
    renderBlacklistItems();
  }
}

async function saveAndApplyBlacklist() {
  const minLenSelect = document.getElementById('minBarcodeLengthSelect');
  const negPriceCheck = document.getElementById('blockNegativePricesCheck');
  const zeroPriceCheck = document.getElementById('blockZeroPricesCheck');
  const cigarettesCheck = document.getElementById('blockCigarettesCheck');
  const scaleCheck = document.getElementById('blockScaleProductsCheck');

  currentBlacklistData.min_barcode_length = parseInt(minLenSelect?.value || '3', 10);
  currentBlacklistData.block_negative_prices = !!negPriceCheck?.checked;
  currentBlacklistData.block_zero_prices = !!zeroPriceCheck?.checked;
  currentBlacklistData.block_cigarettes = !!cigarettesCheck?.checked;
  currentBlacklistData.block_scale_products = !!scaleCheck?.checked;

  showToast('Kara liste kaydediliyor...', 'info');

  try {
    const res = await fetch('/api/system/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentBlacklistData)
    });
    const json = await res.json();
    if (json.status === 'success') {
      showToast(json.message || 'Kara liste kuralları uygulandı!', 'success');
      closeBlacklistModal();
      if (typeof searchProducts === 'function') {
        searchProducts(document.getElementById('productSearchInput')?.value || '');
      }
    } else {
      showToast('Hata: ' + (json.message || 'Kara liste kaydedilemedi.'), 'error');
    }
  } catch (err) {
    showToast('Sunucu hatası: ' + err.message, 'error');
  }
}

window.openBlacklistModal = openBlacklistModal;
window.closeBlacklistModal = closeBlacklistModal;
window.addBlacklistWord = addBlacklistWord;
window.removeBlacklistWord = removeBlacklistWord;
window.addBlacklistBarcode = addBlacklistBarcode;
window.removeBlacklistBarcode = removeBlacklistBarcode;
window.saveAndApplyBlacklist = saveAndApplyBlacklist;
window.removeProductFromBlacklist = removeProductFromBlacklist;
window.loadBlacklistedProductsList = loadBlacklistedProductsList;

