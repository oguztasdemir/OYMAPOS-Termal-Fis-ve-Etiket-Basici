// ==========================================================================
// UI MOTORU VE ETKİLEŞİMLER - ui.js
// ==========================================================================

// Global HTML Escape Güvenlik Yardımcısı
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Global Türkçe Tarih Ayrıştırma ve Formatlayıcı (ISO, SQL datetime, DD.MM.YYYY vb. tam destekli)
function parseFlexibleDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
  const s = String(dateStr).trim();
  if (!s) return null;

  // DD.MM.YYYY veya DD.MM.YYYY HH:MM:SS formatı
  if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(s)) {
    const parts = s.split(/\s+/);
    const dateParts = parts[0].split('.');
    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const year = parseInt(dateParts[2], 10);
    let hour = 0, min = 0, sec = 0;
    if (parts[1]) {
      const timeParts = parts[1].split(':');
      hour = parseInt(timeParts[0] || 0, 10);
      min = parseInt(timeParts[1] || 0, 10);
      sec = parseInt(timeParts[2] || 0, 10);
    }
    const d = new Date(year, month, day, hour, min, sec);
    return isNaN(d.getTime()) ? null : d;
  }

  // ISO / SQL format: YYYY-MM-DD HH:MM:SS veya YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const parts = s.split(/\s+/);
    const dateParts = parts[0].split('-');
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);
    let hour = 0, min = 0, sec = 0;
    if (parts[1]) {
      const timeParts = parts[1].split(':');
      hour = parseInt(timeParts[0] || 0, 10);
      min = parseInt(timeParts[1] || 0, 10);
      sec = parseInt(timeParts[2] || 0, 10);
    }
    const d = new Date(year, month, day, hour, min, sec);
    return isNaN(d.getTime()) ? null : d;
  }

  // Standart JS new Date parse denemesi
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  } catch (e) {}

  return null;
}

function getTodayTrDate() {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const m = months[today.getMonth()];
  const y = today.getFullYear();
  return `${d} ${m} ${y}`;
}

function formatTrDate(dateStr, includeTime = false) {
  if (!dateStr || String(dateStr).trim() === '') {
    return '-';
  }
  const dt = parseFlexibleDate(dateStr);
  if (!dt) {
    const str = String(dateStr).trim();
    if (/^\d{2}\.\d{2}\.\d{4}/.test(str)) return str.slice(0, 10);
    return str || '-';
  }

  const d = String(dt.getDate()).padStart(2, '0');
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const m = months[dt.getMonth()];
  const y = dt.getFullYear();
  const dateFormatted = `${d} ${m} ${y}`;

  if (includeTime) {
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    return `${dateFormatted} ${hh}:${mm}`;
  }
  return dateFormatted;
}

// 1. SESLİ GERİ BİLDİRİM (Web Audio API)
class SoundFeedback {
  static playSuccess() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      // Tarayıcı izin vermezse sessizce geç
    }
  }

  static playWarning() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(330, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) {}
  }
}

// 2. TOAST BİLDİRİM SİSTEMİ
function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  if (type === 'success') {
    SoundFeedback.playSuccess();
  } else if (type === 'error') {
    SoundFeedback.playWarning();
  }

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

// 3. SAYI SAYACI ANİMASYONU (Count-Up)
function animateCount(element, target, duration = 600) {
  if (!element) return;
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    const current = Math.floor(easeProgress * (target - start) + start);

    element.textContent = current.toLocaleString('tr-TR');

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = target.toLocaleString('tr-TR');
    }
  }
  requestAnimationFrame(update);
}

// 4. MODAL YÖNETİCİSİ
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

/**
 * Modern Uygulama İçi Onay Modalı (Browser confirm() yerine)
 */
function showAppConfirmModal({ title = 'İşlem Onayı', message, confirmText = 'Onayla', cancelText = 'İptal', type = 'warning', icon = '⚠️' }) {
  return new Promise((resolve) => {
    let existing = document.getElementById('appConfirmModalOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'appConfirmModalOverlay';
    overlay.className = 'modal-overlay active';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:99999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); background:rgba(0,0,0,0.75); transition:opacity 0.2s ease;';

    const btnStyle = type === 'danger'
      ? 'background:#dc2626; color:#fff; border:1px solid #b91c1c;'
      : (type === 'success'
        ? 'background:#10b981; color:#fff; border:1px solid #059669;'
        : 'background:linear-gradient(135deg, #0284c7, #0369a1); color:#fff; border:1px solid #0284c7;');

    overlay.innerHTML = `
      <div class="modal" style="max-width: 440px; width: 92%; background: #111726; border: 1.5px solid rgba(255,255,255,0.15); border-radius: 14px; padding: 22px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.8); animation: modalPop 0.18s cubic-bezier(0.16, 1, 0.3, 1);">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">
          <div style="width:40px; height:40px; border-radius:10px; background:rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:center; font-size:20px; border:1px solid rgba(255,255,255,0.1);">
            ${icon}
          </div>
          <div>
            <h3 style="margin:0; font-size:15px; font-weight:800; color:#fff;">${escapeHtml(title)}</h3>
            <span style="font-size:11px; color:#94a3b8;">OymaPOS Otomasyon Sistemi</span>
          </div>
        </div>
        <p style="font-size:13px; color:#cbd5e1; line-height:1.55; margin:0 0 20px 0;">${escapeHtml(message)}</p>
        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button id="appConfirmCancelBtn" class="btn btn-secondary" style="padding:8px 16px; font-size:12px; cursor:pointer;">${escapeHtml(cancelText)}</button>
          <button id="appConfirmOkBtn" class="btn" style="padding:8px 18px; font-size:12px; font-weight:700; cursor:pointer; ${btnStyle}">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cleanup = (result) => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 120);
      resolve(result);
    };

    overlay.querySelector('#appConfirmCancelBtn').onclick = () => cleanup(false);
    overlay.querySelector('#appConfirmOkBtn').onclick = () => cleanup(true);
    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(false);
    };
  });
}

// 5. TOPLU İŞLEM İLERLEME MODALI (PROGRESS MODAL)
function showAppProgressModal({ title = 'Etiketler Yazdırılıyor', total = 0, initialMessage = 'Yazdırma işlemi başlatılıyor...' }) {
  let existing = document.getElementById('appProgressModalOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'appProgressModalOverlay';
  overlay.className = 'modal-overlay active';
  overlay.style.cssText = 'position:fixed; inset:0; z-index:999999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); background:rgba(0,0,0,0.82); transition:opacity 0.2s ease;';

  overlay.innerHTML = `
    <div class="modal" style="max-width: 480px; width: 92%; background: #0f172a; border: 1.5px solid #38bdf8; border-radius: 14px; padding: 24px; box-shadow: 0 25px 60px -10px rgba(0,0,0,0.9), 0 0 25px rgba(56,189,248,0.25); animation: modalPop 0.18s cubic-bezier(0.16, 1, 0.3, 1);">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
        <div style="width:42px; height:42px; border-radius:10px; background:rgba(56,189,248,0.15); border:1px solid rgba(56,189,248,0.4); display:flex; align-items:center; justify-content:center; font-size:22px;">
          🖨️
        </div>
        <div style="flex:1; min-width:0;">
          <h3 style="margin:0; font-size:16px; font-weight:800; color:#fff;">${escapeHtml(title)}</h3>
          <span style="font-size:11.5px; color:#94a3b8;">Yazıcıya etiket aktarım süreci</span>
        </div>
        <div id="appProgressCountBadge" style="font-size:13px; font-weight:800; color:#38bdf8; font-family:'JetBrains Mono', monospace; background:rgba(56,189,248,0.12); padding:4px 10px; border-radius:8px; border:1px solid rgba(56,189,248,0.3);">
          0 / ${total}
        </div>
      </div>

      <!-- İlerleme Çubuğu (Progress Bar) -->
      <div style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:10px; height:14px; overflow:hidden; margin-bottom:14px; position:relative;">
        <div id="appProgressBarFill" style="width:0%; height:100%; background:linear-gradient(90deg, #38bdf8, #10b981); border-radius:8px; transition:width 0.15s ease;"></div>
      </div>

      <!-- Anlık İşlenen Ürün Adı ve Yüzde -->
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
        <div id="appProgressItemText" style="color:#cbd5e1; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:80%;">
          ${escapeHtml(initialMessage)}
        </div>
        <div id="appProgressPercentText" style="color:#10b981; font-weight:800; font-family:'JetBrains Mono', monospace;">
          %0
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  return {
    update(current, currentItemTitle = '') {
      const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
      const countBadge = overlay.querySelector('#appProgressCountBadge');
      const barFill = overlay.querySelector('#appProgressBarFill');
      const itemText = overlay.querySelector('#appProgressItemText');
      const pctText = overlay.querySelector('#appProgressPercentText');

      if (countBadge) countBadge.textContent = `${current} / ${total}`;
      if (barFill) barFill.style.width = `${pct}%`;
      if (pctText) pctText.textContent = `%${pct}`;
      if (itemText && currentItemTitle) itemText.textContent = `Aktarılıyor: ${currentItemTitle}`;
    },
    close() {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 150);
    }
  };
}

// 6. SUNUCU KAPATMA DİYALOĞU
async function confirmShutdown() {
  const ok = await showAppConfirmModal({
    title: "Sunucuyu Kapat",
    message: "Sunucuyu kapatmak ve portu serbest bırakmak istediğinize emin misiniz?",
    confirmText: "Sunucuyu Kapat",
    cancelText: "Vazgeç",
    type: "danger",
    icon: "🛑"
  });
  if (ok) {
    showToast("Sunucu kapatılıyor...", "info");
    try {
      await API.shutdownServer();
      setTimeout(() => {
        document.body.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#090a0f;color:#fff;font-family:sans-serif;">
            <div style="font-size:48px;margin-bottom:16px;">🛑</div>
            <h2>Sunucu Başarıyla Kapatıldı</h2>
            <p style="color:#94a3b8;margin-top:8px;">Terminal ve port serbest bırakıldı. Bu sekmeyi kapatabilirsiniz.</p>
          </div>
        `;
      }, 600);
    } catch (e) {
      showToast("Kapatma isteği gönderildi.", "info");
    }
  }
}
