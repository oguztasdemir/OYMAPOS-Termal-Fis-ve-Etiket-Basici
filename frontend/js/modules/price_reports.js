// =========================================================================
// 📊 GÜNLÜK FİYAT DEĞİŞİM RAPORLARI MODÜLÜ
// =========================================================================

let currentReportDate = "";
let currentDesktopReportSource = "all";

async function initPriceReportsModule() {
  await loadAvailableReportDates();
}

function handleDesktopReportSourceChange(source) {
  currentDesktopReportSource = source || "all";
  loadAvailableReportDates();
}

/**
 * Sistemde fiyat değişimi bulunan tarihleri yükle
 */
async function loadAvailableReportDates() {
  const container = document.getElementById('reportDatePills');
  const datePicker = document.getElementById('reportDatePicker');
  const srcSel = document.getElementById('desktopReportSourceSelect');
  if (srcSel) {
    currentDesktopReportSource = srcSel.value || currentDesktopReportSource;
  }
  
  try {
    const res = await fetch(`/api/reports/price-changes/dates?source_filter=${encodeURIComponent(currentDesktopReportSource)}`);
    const data = await res.json();
    
    if (data.status === 'success' && data.data && data.data.dates) {
      const dates = data.data.dates;
      if (dates.length === 0) {
        if (container) container.innerHTML = '<span style="font-size:12px; color:var(--text-muted);">Bu filtre kapsamında kayıtlı bir fiyat değişimi bulunamadı.</span>';
        if (datePicker && !datePicker.value) {
          datePicker.value = new Date().toISOString().split('T')[0];
        }
        await loadPriceReportByDate(datePicker ? datePicker.value : '');
        return;
      }

      // En güncel tarihi seçili yap
      const latestDate = dates[0];
      if (datePicker && (!datePicker.value || !dates.includes(datePicker.value))) {
        datePicker.value = latestDate;
      }

      // Hızlı tarih butonlarını oluştur
      if (container) {
        container.innerHTML = dates.slice(0, 7).map(d => {
          const isAct = (d === (datePicker ? datePicker.value : latestDate));
          return `
            <button class="btn btn-sm ${isAct ? 'btn-primary' : 'btn-secondary'}" 
                    style="padding:4px 10px; font-size:11.5px; font-weight:700; border-radius:6px;"
                    onclick="selectReportDate('${d}')">
              ${d}
            </button>
          `;
        }).join('');
      }

      await loadPriceReportByDate(datePicker ? datePicker.value : latestDate);
    }
  } catch (e) {
    console.error("Rapor tarihleri yüklenirken hata:", e);
  }
}

function selectReportDate(dateStr) {
  const datePicker = document.getElementById('reportDatePicker');
  if (datePicker) datePicker.value = dateStr;
  loadPriceReportByDate(dateStr);
}

/**
 * Seçilen tarihe ait fiyat değişimlerini çek ve tabloya doldur
 */
async function loadPriceReportByDate(dateStr) {
  if (!dateStr) return;
  currentReportDate = dateStr;
  const srcSel = document.getElementById('desktopReportSourceSelect');
  if (srcSel) {
    currentDesktopReportSource = srcSel.value || currentDesktopReportSource;
  }

  const tbody = document.getElementById('priceReportTableBody');
  const statDate = document.getElementById('rep-stat-date');
  const statTotal = document.getElementById('rep-stat-total');
  const statInc = document.getElementById('rep-stat-inc');
  const statDec = document.getElementById('rep-stat-dec');

  if (statDate) statDate.textContent = dateStr;
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="padding:25px; text-align:center; color:var(--text-muted);">
          ⏳ ${dateStr} tarihli fiyat değişimleri yükleniyor...
        </td>
      </tr>
    `;
  }

  // Buton aktifliklerini güncelle
  const container = document.getElementById('reportDatePills');
  if (container) {
    container.querySelectorAll('button').forEach(btn => {
      if (btn.textContent.trim() === dateStr) {
        btn.className = 'btn btn-sm btn-primary';
      } else {
        btn.className = 'btn btn-sm btn-secondary';
      }
    });
  }

  try {
    const res = await fetch(`/api/reports/price-changes?date=${encodeURIComponent(dateStr)}&source_filter=${encodeURIComponent(currentDesktopReportSource)}`);
    const data = await res.json();

    if (data.status === 'success' && data.data) {
      const items = data.data.items || [];
      
      let incCount = 0;
      let decCount = 0;

      items.forEach(it => {
        if (it.diff_amount > 0) incCount++;
        else if (it.diff_amount < 0) decCount++;
      });

      if (statTotal) statTotal.textContent = items.length;
      if (statInc) statInc.textContent = incCount;
      if (statDec) statDec.textContent = decCount;

      if (items.length === 0) {
        if (tbody) {
          tbody.innerHTML = `
            <tr>
              <td colspan="8" style="padding:35px; text-align:center; color:var(--text-muted); font-size:13px;">
                ℹ️ <strong>${dateStr}</strong> tarihinde seçili filtreye uygun fiyat değişimi kaydı bulunmuyor.
              </td>
            </tr>
          `;
        }
        return;
      }

      if (tbody) {
        tbody.innerHTML = items.map((item, idx) => {
          const diffVal = item.diff_amount;
          const isInc = diffVal > 0;
          const isDec = diffVal < 0;
          const diffStr = isInc ? `+${diffVal.toFixed(2)} TL` : `${diffVal.toFixed(2)} TL`;
          const diffColor = isInc ? '#10b981' : (isDec ? '#ef4444' : 'var(--text-muted)');

          const isMob = (item.source_type === 'mobile');
          const sourceBadge = isMob 
            ? '<span class="badge" style="font-size:10.5px; background:rgba(2,132,199,0.18); color:#38bdf8; border:1px solid rgba(2,132,199,0.3);">📱 Mobil QR</span>'
            : '<span class="badge" style="font-size:10.5px; background:rgba(99,102,241,0.18); color:#a5b4fc; border:1px solid rgba(99,102,241,0.3);">💻 Masaüstü</span>';

          return `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04); transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
              <td style="padding:10px 14px; text-align:center; color:var(--text-muted); font-weight:700;">#${idx + 1}</td>
              <td style="padding:10px 14px; font-family:'JetBrains Mono',monospace; font-weight:700; color:var(--primary);">${item.barcode}</td>
              <td style="padding:10px 14px; font-weight:700; color:var(--text-main);">${item.title}</td>
              <td style="padding:10px 14px; text-align:center;">${sourceBadge}</td>
              <td style="padding:10px 14px; text-align:right; font-weight:700; color:#ef4444;">${item.old_price.toFixed(2)} TL</td>
              <td style="padding:10px 14px; text-align:right; font-weight:800; color:#38bdf8; font-size:14px;">${item.new_price.toFixed(2)} TL</td>
              <td style="padding:10px 14px; text-align:right; font-weight:800; color:${diffColor};">${diffStr}</td>
              <td style="padding:10px 14px; text-align:center; font-size:11.5px; color:var(--text-muted);">${item.time || '-'}</td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error("Rapor çekilirken hata:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="padding:25px; text-align:center; color:#ef4444;">
            ❌ Fiyat değişimleri yüklenemedi: ${err.message}
          </td>
        </tr>
      `;
    }
  }
}

async function downloadSelectedDateReportPdf() {
  const datePicker = document.getElementById('reportDatePicker');
  const srcSel = document.getElementById('desktopReportSourceSelect');
  const d = (datePicker && datePicker.value) ? datePicker.value : currentReportDate;
  const s = (srcSel && srcSel.value) ? srcSel.value : currentDesktopReportSource;

  if (!d) {
    if (typeof showToast === 'function') showToast("Lütfen önce bir tarih seçin.", 'warning');
    else alert("Lütfen önce bir tarih seçin.");
    return;
  }
  const url = `/api/reports/price-changes/pdf?date=${encodeURIComponent(d)}&source_filter=${encodeURIComponent(s)}`;
  window.open(url, '_blank');

  // PDF açıldıktan sonra kullanıcıya onay sorusu yönelt
  setTimeout(async () => {
    let ok = false;
    if (typeof showAppConfirmModal === 'function') {
      ok = await showAppConfirmModal({
        title: "Etiket Fiyatlarını Eşitle & Onayla",
        message: `${d} tarihli raporda basılan ürünlerin raf etiket fiyatlarını yeni satış fiyatlarına eşitlemek ve baskı onayını kaydetmek istiyor musunuz?`,
        confirmText: "✅ Evet, Eşitle & Onayla",
        cancelText: "Vazgeç",
        type: "primary",
        icon: "🖨️"
      });
    } else {
      ok = confirm(`🖨️ PDF Raporu Oluşturuldu (${d})!\n\nBaskı aldığınız bu ürünlerin etiket raf fiyatlarını yeni satış fiyatına eşitlemek ve basıldı olarak onaylamak istiyor musunuz?`);
    }

    if (ok) {
      try {
        const res = await fetch('/api/reports/price-changes/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: d, source_filter: s })
        });
        const data = await res.json();
        if (data.status === 'success') {
          if (typeof showToast === 'function') {
            showToast(`✅ ${data.data?.updated_count || 0} ürünün etiket fiyatı güncellendi ve basıldı olarak onaylandı!`, 'success');
          }
          if (typeof searchProducts === 'function') {
            const inp = document.getElementById('productSearchInput');
            searchProducts(inp ? inp.value : '');
          }
        } else {
          if (typeof showToast === 'function') showToast("Onaylama hatası: " + (data.message || 'Hata oluştu'), 'error');
        }
      } catch(e) {
        if (typeof showToast === 'function') showToast("Bağlantı hatası: " + e.message, 'error');
      }
    }
  }, 1000);
}

window.handleDesktopReportSourceChange = handleDesktopReportSourceChange;
window.downloadSelectedDateReportPdf = downloadSelectedDateReportPdf;
window.selectReportDate = selectReportDate;
window.loadPriceReportByDate = loadPriceReportByDate;
window.initPriceReportsModule = initPriceReportsModule;

// Sekme değiştiğinde ilk kez açılıyorsa yükle
document.addEventListener('DOMContentLoaded', () => {
  const reportTabBtn = document.querySelector('[data-tab="tab-price-reports"]');
  if (reportTabBtn) {
    reportTabBtn.addEventListener('click', () => {
      if (!currentReportDate) {
        initPriceReportsModule();
      }
    });
  }
});

