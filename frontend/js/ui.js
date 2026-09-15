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

// 5. SUNUCU KAPATMA DİYALOĞU
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
