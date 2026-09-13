// =========================================================================
// 📊 GÜNLÜK FİYAT DEĞİŞİM RAPORLARI MODÜLÜ
// =========================================================================

let currentReportDate = "";

async function initPriceReportsModule() {
  await loadAvailableReportDates();
}

/**
 * Sistemde fiyat değişimi bulunan tarihleri yükle
 */
async function loadAvailableReportDates() {
  const container = document.getElementById('reportDatePills');
  const datePicker = document.getElementById('reportDatePicker');
  
  try {
    const res = await fetch('/api/reports/price-changes/dates');
    const data = await res.json();
    
    if (data.status === 'success' && data.data && data.data.dates) {
      const dates = data.data.dates;
      if (dates.length === 0) {
        if (container) container.innerHTML = '<span style="font-size:12px; color:var(--text-muted);">Henüz kayıtlı bir fiyat değişimi bulunamadı.</span>';
        return;
      }

      // En güncel tarihi seçili yap
      const latestDate = dates[0];
      if (datePicker && !datePicker.value) {
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

  const tbody = document.getElementById('priceReportTableBody');
  const statDate = document.getElementById('rep-stat-date');
  const statTotal = document.getElementById('rep-stat-total');
  const statInc = document.getElementById('rep-stat-inc');
  const statDec = document.getElementById('rep-stat-dec');

  if (statDate) statDate.textContent = dateStr;
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding:25px; text-align:center; color:var(--text-muted);">
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
    const res = await fetch(`/api/reports/price-changes?date=${encodeURIComponent(dateStr)}`);
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
              <td colspan="7" style="padding:35px; text-align:center; color:var(--text-muted); font-size:13px;">
                ℹ️ <strong>${dateStr}</strong> tarihinde herhangi bir fiyat değişimi kaydı bulunmuyor.
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

          return `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04); transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
              <td style="padding:10px 14px; text-align:center; color:var(--text-muted); font-weight:700;">#${idx + 1}</td>
              <td style="padding:10px 14px; font-family:'JetBrains Mono',monospace; font-weight:700; color:var(--primary);">${item.barcode}</td>
              <td style="padding:10px 14px; font-weight:700; color:var(--text-main);">${item.title}</td>
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
          <td colspan="7" style="padding:25px; text-align:center; color:#ef4444;">
            ❌ Fiyat değişimleri yüklenemedi: ${err.message}
          </td>
        </tr>
      `;
    }
  }
}

/**
 * Seçili tarihin PDF raporunu yeni sekmede aç / indir
 */
function downloadSelectedDateReportPdf() {
  const datePicker = document.getElementById('reportDatePicker');
  const d = (datePicker && datePicker.value) ? datePicker.value : currentReportDate;
  if (!d) {
    alert("Lütfen önce bir tarih seçin.");
    return;
  }
  const url = `/api/reports/price-changes/pdf?date=${encodeURIComponent(d)}`;
  window.open(url, '_blank');
}

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
