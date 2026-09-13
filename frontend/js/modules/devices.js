// ==========================================================================
// OYMAPOS - AĞ VE BAĞLI CİHAZLAR MODÜLÜ
// ==========================================================================

async function loadConnectedDevicesTable() {
  const tbody = document.getElementById('connectedDevicesTableBody');
  const badge = document.getElementById('connectedDevicesCountBadge');
  if (!tbody) return;

  try {
    const res = await API.getConnectedDevices();
    const data = res.data || res;
    const devices = data.devices || [];

    const onlineCount = devices.filter(d => d.is_online).length;
    if (badge) {
      badge.textContent = `${onlineCount} Cihaz Çevrimiçi`;
      badge.className = onlineCount > 0 ? 'badge badge-success' : 'badge badge-secondary';
    }

    if (devices.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; color:var(--text-muted); padding:28px;">
            📡 Henüz ağdan bağlanan bir cihaz tespit edilmedi. (Dükkan PC'sinden <a href="/sync" target="_blank" style="color:#38bdf8; text-decoration:underline;">/sync</a> veya telefondan QR kodu açtığınızda burada görünecektir.)
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    devices.forEach(d => {
      const isOnline = d.is_online;
      const typeLabel = d.type === 'sync_client' ? '💻 Dükkan / Kasa PC' : '📱 Mobil Barkod Okuyucu';
      const statusHtml = isOnline 
        ? '<span class="badge badge-success" style="font-size:10.5px;">🟢 Bağlı / Çevrimiçi</span>'
        : '<span class="badge badge-secondary" style="font-size:10.5px;">⚪ Son Görülme</span>';

      html += `
        <tr>
          <td style="font-weight:700; color:#fff;">
            ${d.name || 'Bilinmeyen Cihaz'}
          </td>
          <td style="color:#38bdf8; font-weight:600; font-size:12px;">
            ${typeLabel}
          </td>
          <td style="font-family:'JetBrains Mono', monospace; color:#cbd5e1; font-size:12px;">
            ${d.ip || '-'}
          </td>
          <td style="font-size:12px; color:var(--text-muted);">
            ${d.last_seen_str || '-'}
          </td>
          <td style="text-align:center;">
            ${statusHtml}
          </td>
          <td style="text-align:center;">
            <button class="btn btn-secondary btn-sm" onclick="showToast('${d.name} seçildi. Bu cihazdan gelen veriler önceliklidir.', 'success')" style="font-size:11px; padding:3px 8px;">
              ✓ Cihazı Seç
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#f87171; padding:16px;">Cihazlar listelenemedi: ${err.message}</td></tr>`;
    }
  }
}

async function loadNetworkInfo() {
  try {
    const res = await API.getNetworkInfo();
    const data = res.data || res;
    if (res.status === 'success' || data.ip) {
      const topbarIp = document.getElementById('topbarIp');
      const mobileUrl = document.getElementById('mobileUrlText');
      const syncUrl = document.getElementById('syncUrlText');
      const qrImg = document.getElementById('qrImage');
      const kasa_aktarimSyncUrlCode = document.getElementById('kasa_aktarimSyncUrlCode');
      const kasa_aktarimSyncUrlLink = document.getElementById('kasa_aktarimSyncUrlLink');

      const url = data.sync_url || `http://${data.ip || window.location.hostname}:8000/sync`;

      if (topbarIp) topbarIp.textContent = data.ip;
      if (mobileUrl) mobileUrl.textContent = data.mobile_url;
      if (syncUrl) syncUrl.textContent = url;
      if (qrImg) qrImg.src = data.qr_image;
      if (kasa_aktarimSyncUrlCode) kasa_aktarimSyncUrlCode.textContent = url;
      if (kasa_aktarimSyncUrlLink) kasa_aktarimSyncUrlLink.href = url;
    }
  } catch (err) {
    console.error('Ağ bilgisi yüklenemedi:', err);
  }
}

function copySyncLinkToClipboard() {
  const codeEl = document.getElementById('kasa_aktarimSyncUrlCode');
  const text = codeEl ? codeEl.textContent.trim() : (window.location.origin + '/sync');
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Bağlantı adresi kopyalandı:\n${text}`, 'success');
  }).catch(() => {
    showToast('Kopyalama başarısız oldu.', 'error');
  });
}
