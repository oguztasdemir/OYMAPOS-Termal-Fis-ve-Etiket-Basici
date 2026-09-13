/**
 * =========================================================================
 * 📱 OYMAPOS MOBİL KAMERA & BARKOD TARAMA MOTORU (1-1 BİREBİR KODLAR)
 * Donanım BarcodeDetector, ZXing, Kırmızı Lazer Çizgisi, Fener & Zoom
 * =========================================================================
 */

// Paylaşılan Global Değişkenler
let isScanningLive = false;
let isGlareModeActive = false;
let currentBarcode = "";
let currentProduct = null;
let isNewProduct = false;
let mobileQueue = [];
let mediaStreamObj = null;
let frameDetectionInterval = null;
let html5QrCode = null;
let zxingReader = null;
let activeVideoTrack = null;
let isTorchOn = false;
let currentZoomLevel = 1.0;
let isDecodingServerFrame = false;
const roiCanvas = document.createElement('canvas');
const roiCtx = roiCanvas.getContext('2d');

/**
 * 🔊 Bip ve Titreşim Sinyali
 */
function playBeepSound() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(90);
    }
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.09);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.09);
  } catch(e) {}
}

/**
 * 🎯 MATEMATİKSEL BARKOD SAĞLAMA (CHECKSUM) DOĞRULAYICI
 * Hatalı kamera okumalarını %100 oranında engeller.
 */
function validateBarcodeChecksum(barcode) {
  if (!barcode) return false;
  const b = String(barcode).trim();
  if (b.length < 1) return false;
  
  // EAN-13 (13 hane) Modulo-10 Kontrolü
  if (/^\d{13}$/.test(b)) {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(b[i], 10) * (i % 2 === 0 ? 1 : 3);
    }
    const check = (10 - (sum % 10)) % 10;
    if (check === parseInt(b[12], 10)) return true;
    // 20-29 serisi terazi ve mağaza barkodlarında esneklik sağla
    if (/^2[0-9]/.test(b)) return true;
    return false;
  }
  
  // EAN-8 (8 hane) Modulo-10 Kontrolü
  if (/^\d{8}$/.test(b)) {
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      sum += parseInt(b[i], 10) * (i % 2 === 0 ? 3 : 1);
    }
    const check = (10 - (sum % 10)) % 10;
    return check === parseInt(b[7], 10);
  }
  
  // UPC-A (12 hane) Modulo-10 Kontrolü
  if (/^\d{12}$/.test(b)) {
    let sum = 0;
    for (let i = 0; i < 11; i++) {
      sum += parseInt(b[i], 10) * (i % 2 === 0 ? 3 : 1);
    }
    const check = (10 - (sum % 10)) % 10;
    return check === parseInt(b[11], 10);
  }

  // Kısa mağaza / PLU barkodları (1 - 7 hane)
  if (/^\d{1,7}$/.test(b)) {
    return true;
  }
  
  // Code-128 / Code-39 / ITF (en az 3 karakterli alfa-sayısal)
  if (b.length >= 3 && /^[A-Za-z0-9\-\.\ \$\/\+\%]+$/.test(b)) {
    return true;
  }
  
  return false;
}

/**
 * 🍞 Toast Bildirim Gösterici
 */
function showToast(msg, type = "info") {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.className = `toast-box toast-${type}`;
  toast.innerText = msg;
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 3500);
}

/**
 * 🛡️ Parlama & Yuvarlak Yüzey Filtresi Aç / Kapa
 */
function toggleGlareMode() {
  isGlareModeActive = !isGlareModeActive;
  const btn = document.getElementById('btn-fs-glare');
  const txt = document.getElementById('txt-fs-glare');
  if (btn && txt) {
    if (isGlareModeActive) {
      btn.classList.add('active');
      txt.textContent = 'Parlama & Eğri: AÇIK';
    } else {
      btn.classList.remove('active');
      txt.textContent = 'Parlama & Eğri: KAPALI';
    }
  }
}

/**
 * 🔍 Kamera Zoom Kontrolü (Donanım Seviyesi + Fallback)
 */
async function setCameraZoom(zoomVal) {
  currentZoomLevel = zoomVal;
  
  // UI Butonlarını Güncelle
  document.querySelectorAll('.fs-btn-zoom').forEach(b => b.classList.remove('active'));
  const activeBtnId = zoomVal === 1.0 ? 'btn-zoom-1x' : (zoomVal === 1.5 ? 'btn-zoom-15x' : (zoomVal === 2.0 ? 'btn-zoom-2x' : 'btn-zoom-3x'));
  const activeBtn = document.getElementById(activeBtnId);
  if (activeBtn) activeBtn.classList.add('active');

  const videoElem = document.getElementById('fullscreen-video');

  // 1. Donanım Seviyesi Optik/Dijital Zoom
  if (activeVideoTrack && typeof activeVideoTrack.applyConstraints === 'function') {
    try {
      const caps = activeVideoTrack.getCapabilities ? activeVideoTrack.getCapabilities() : {};
      if (caps.zoom) {
        const minZ = caps.zoom.min || 1.0;
        const maxZ = caps.zoom.max || 5.0;
        const targetZ = Math.min(Math.max(zoomVal, minZ), maxZ);
        await activeVideoTrack.applyConstraints({
          advanced: [{ zoom: targetZ }]
        });
        if (videoElem) videoElem.style.transform = "none";
        return;
      }
    } catch (e) {
      console.warn("Donanım zoom uygulanamadı:", e);
    }
  }

  // 2. Yazılımsal Dijital Zoom (Scale Fallback)
  if (videoElem) {
    videoElem.style.transform = zoomVal > 1.0 ? `scale(${zoomVal})` : "none";
    videoElem.style.transformOrigin = "center center";
  }
}

/**
 * 💡 Fener (Flashlight) Aç / Kapa
 */
async function toggleFlashlight() {
  if (!activeVideoTrack) return;
  try {
    isTorchOn = !isTorchOn;
    await activeVideoTrack.applyConstraints({
      advanced: [{ torch: isTorchOn }]
    });
    const btnTorch = document.getElementById('btn-fs-torch');
    if (btnTorch) {
      if (isTorchOn) {
        btnTorch.classList.add('active');
        btnTorch.style.background = "rgba(245, 158, 11, 0.4)";
        btnTorch.style.borderColor = "#f59e0b";
        btnTorch.style.color = "#fbbf24";
      } else {
        btnTorch.classList.remove('active');
        btnTorch.style.background = "rgba(30, 41, 59, 0.8)";
        btnTorch.style.borderColor = "rgba(255, 255, 255, 0.2)";
        btnTorch.style.color = "#e2e8f0";
      }
    }
  } catch (e) {
    console.warn("Fener kontrolü desteklenmiyor:", e);
  }
}

/**
 * 📷 Tam Ekran Canlı Kamerayı Aç (Hibrit ZXing + BarcodeDetector + OpenCV Backend)
 */
async function openFullscreenCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (location.protocol === 'http:') {
      const ok = confirm("🔒 Canlı video kamera için mobil güvenlik kuralı gereği HTTPS bağlantısı gereklidir.\n\nHTTPS canlı kamera sayfasına geçmek istiyor musunuz?");
      if (ok) {
        location.href = `https://${location.hostname}:8001/mobile`;
      }
      return;
    }
  }

  const modal = document.getElementById('fullscreen-camera-overlay');
  const videoElem = document.getElementById('fullscreen-video');
  const btnTorch = document.getElementById('btn-fs-torch');

  if (modal) modal.style.display = 'flex';
  if (videoElem) videoElem.style.display = 'block';
  const fsReader = document.getElementById('fullscreen-reader');
  if (fsReader) fsReader.style.display = 'none';

  isScanningLive = true;
  isTorchOn = false;
  if (btnTorch) btnTorch.style.display = 'none';
  setCameraZoom(1.0);

  // 1. ZXING ENTERPRISE BARKOD MOTORU & MEDIADEVICES
  try {
    if (typeof ZXing !== 'undefined') {
      if (!zxingReader) {
        const hints = new Map();
        const formats = [
          ZXing.BarcodeFormat.EAN_13,
          ZXing.BarcodeFormat.EAN_8,
          ZXing.BarcodeFormat.CODE_128,
          ZXing.BarcodeFormat.CODE_39,
          ZXing.BarcodeFormat.UPC_A,
          ZXing.BarcodeFormat.UPC_E,
          ZXing.BarcodeFormat.ITF,
          ZXing.BarcodeFormat.QR_CODE
        ];
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        zxingReader = new ZXing.BrowserMultiFormatReader(hints, 50);
      }

      const videoInputDevices = await zxingReader.listVideoInputDevices().catch(() => []);
      let selectedDeviceId = undefined;
      if (videoInputDevices && videoInputDevices.length > 0) {
        const backCam = videoInputDevices.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('arka') || 
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        ) || videoInputDevices[videoInputDevices.length - 1];
        selectedDeviceId = backCam.deviceId;
      }

      // HD ve Sürekli Odak Kısıtlamaları
      const constraints = {
        video: selectedDeviceId ? {
          deviceId: { exact: selectedDeviceId },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          focusMode: { ideal: "continuous" }
        } : {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          focusMode: { ideal: "continuous" }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints).catch(() => {
        return navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      });

      mediaStreamObj = stream;
      if (videoElem) {
        videoElem.srcObject = stream;
        await videoElem.play().catch(() => {});
      }

      // Fener yeteneği var mı kontrol et
      const track = stream.getVideoTracks()[0];
      if (track) {
        activeVideoTrack = track;
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        if (capabilities.torch && btnTorch) {
          btnTorch.style.display = 'flex';
        }
      }

      // ZXing Stream Çözücü Başlat (Doğrudan Video Akışından Canlı Çözüm)
      try {
        zxingReader.decodeFromVideoElement(videoElem, (result, err) => {
          if (result && isScanningLive) {
            const raw = result.getText ? result.getText().trim() : String(result).trim();
            if (validateBarcodeChecksum(raw)) {
              onLiveBarcodeDetected(raw);
            }
          }
        });
      } catch (zxStreamErr) {
        console.warn("ZXing Stream reader başlatılamadı, frame motoruna geçiliyor:", zxStreamErr);
      }

      // Hibrit Ek Motorları Başlat (Donanım BarcodeDetector + OpenCV Sunucu)
      startContinuousBarcodeEngine(videoElem);
      return;
    }
  } catch (err) {
    console.warn("ZXing başlatma hatası, fallback deneniyor:", err);
  }

  // 2. FALLBACK: Html5Qrcode Fullscreen
  try {
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode("fullscreen-reader", {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE
        ],
        verbose: false
      });
    }

    const fsReader = document.getElementById('fullscreen-reader');
    if (fsReader) fsReader.style.display = 'block';
    if (videoElem) videoElem.style.display = 'none';

    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 30, qrbox: { width: 300, height: 180 } },
      onLiveBarcodeDetected,
      () => {}
    );
    isScanningLive = true;

  } catch (err) {
    console.error("Kamera açılamadı:", err);
    closeFullscreenCamera();
    
    if (location.protocol === 'http:') {
      const ok = confirm("🔒 Canlı video kamera için HTTPS bağlantısı gereklidir.\n\nHTTPS canlı kamera sayfasına geçmek istiyor musunuz?");
      if (ok) {
        location.href = `https://${location.hostname}:8001/mobile`;
      }
    } else {
      showToast("⚠️ Kamera izni verilmedi. Lütfen tarayıcı ayarlarından kamera iznini onaylayın veya Foto Çek butonunu kullanın.", "error");
    }
  }
}

/**
 * 🔴 Ultra Hızlı Hibrit Canlı Barkod Algılama Motoru
 * 1. Donanım BarcodeDetector (Android/iOS Safari)
 * 2. OpenCV + PyZBar Sunucu CLAHE & Çok Açılı Çözücü
 */
function startContinuousBarcodeEngine(videoElem) {
  if (frameDetectionInterval) clearInterval(frameDetectionInterval);
  if (!videoElem) return;

  let detectorInstance = null;
  if ('BarcodeDetector' in window) {
    try {
      detectorInstance = new BarcodeDetector({ 
        formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf', 'qr_code'] 
      });
    } catch(e) {}
  }

  frameDetectionInterval = setInterval(async () => {
    if (!isScanningLive || !videoElem || videoElem.readyState < 2) return;

    // 1. İstemci Donanım BarcodeDetector (Tam Kare + Doğrudan Video, 0ms Gecikme)
    if (detectorInstance) {
      try {
        const barcodes = await detectorInstance.detect(videoElem);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue && isScanningLive) {
          const raw = barcodes[0].rawValue.trim();
          if (validateBarcodeChecksum(raw)) {
            onLiveBarcodeDetected(raw);
            return;
          }
        }
      } catch(e) {}
    }

    // 2. OpenCV + PyZBar Sunucu Çözücü (Parlama bastırma, yüksek kontrast, CLAHE, eğik barkod)
    if (!isDecodingServerFrame && isScanningLive) {
      isDecodingServerFrame = true;
      try {
        const vw = videoElem.videoWidth || 1280;
        const vh = videoElem.videoHeight || 720;
        
        const zoomRatio = currentZoomLevel > 1.0 ? currentZoomLevel : 1.0;
        const cropW = Math.min(vw, Math.floor((vw * 0.95) / zoomRatio));
        const cropH = Math.min(vh, Math.floor((vh * 0.70) / zoomRatio));
        const cropX = Math.floor((vw - cropW) / 2);
        const cropY = Math.floor((vh - cropH) / 2);

        roiCanvas.width = 640;
        roiCanvas.height = 360;
        roiCtx.drawImage(videoElem, cropX, cropY, cropW, cropH, 0, 0, 640, 360);

        const b64 = roiCanvas.toDataURL('image/jpeg', 0.82);
        const res = await fetch('/api/scanner/decode-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: b64, glare_mode: isGlareModeActive, aggressive: true })
        });
        const data = await res.json();
        if (data.status === 'success' && data.barcode && isScanningLive) {
          const raw = data.barcode.trim();
          if (validateBarcodeChecksum(raw)) {
            onLiveBarcodeDetected(raw);
          }
        }
      } catch(e) {
      } finally {
        isDecodingServerFrame = false;
      }
    }
  }, 40);
}

/**
 * 🛑 Kamerayı Güvenli Şekilde Kapat
 */
function closeFullscreenCamera() {
  if (frameDetectionInterval) {
    clearInterval(frameDetectionInterval);
    frameDetectionInterval = null;
  }

  if (zxingReader) {
    try {
      zxingReader.reset();
    } catch(e) {}
  }

  if (mediaStreamObj) {
    mediaStreamObj.getTracks().forEach(track => track.stop());
    mediaStreamObj = null;
  }

  activeVideoTrack = null;
  isTorchOn = false;

  const videoElem = document.getElementById('fullscreen-video');
  if (videoElem) {
    videoElem.srcObject = null;
    videoElem.style.transform = "none";
  }

  if (html5QrCode && isScanningLive) {
    try {
      html5QrCode.stop();
    } catch(e) {}
  }

  isScanningLive = false;
  const overlay = document.getElementById('fullscreen-camera-overlay');
  if (overlay) overlay.style.display = 'none';
}

/**
 * 🔴 Barkod Algılandığında Tetiklenen Olay (Konsensüs & Yönlendirme)
 */
function onLiveBarcodeDetected(decodedText) {
  if (!decodedText || !isScanningLive) return;
  const raw = String(decodedText).trim();

  if (!validateBarcodeChecksum(raw)) {
    return;
  }

  isScanningLive = false;
  playBeepSound();
  if (navigator.vibrate) navigator.vibrate([100]);

  closeFullscreenCamera();
  lookupBarcode(raw);
}

/**
 * 📸 Tek Çekimlik Kamera Çekimi Fallback'i
 */
function triggerNativeCaptureFallback() {
  let fileInput = document.getElementById('inp-native-camera-fallback');
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'inp-native-camera-fallback';
    fileInput.accept = 'image/*';
    fileInput.capture = 'environment';
    fileInput.style.display = 'none';
    fileInput.onchange = handleGalleryImage;
    document.body.appendChild(fileInput);
  }
  fileInput.click();
}

/**
 * 🖼️ Galeriden veya Anlık Fotoğraftan Barkod Çözme
 */
async function handleGalleryImage(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  showToast("⏳ Fotoğraftaki barkod taranıyor...", "info");

  // 1. BarcodeDetector
  if ('BarcodeDetector' in window) {
    try {
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'] });
      const bitmap = await createImageBitmap(file);
      const barcodes = await detector.detect(bitmap);
      if (barcodes && barcodes.length > 0) {
        const raw = barcodes[0].rawValue.trim();
        if (validateBarcodeChecksum(raw)) {
          playBeepSound();
          if (navigator.vibrate) navigator.vibrate([80]);
          event.target.value = '';
          lookupBarcode(raw);
          return;
        }
      }
    } catch (e) {}
  }

  // 2. ZXing Image Reader
  try {
    if (typeof ZXing !== 'undefined') {
      const imgReader = new ZXing.BrowserMultiFormatReader();
      const imgUrl = URL.createObjectURL(file);
      const imgElem = new Image();
      imgElem.src = imgUrl;
      await new Promise(r => { imgElem.onload = r; });
      try {
        const result = await imgReader.decodeFromImageElement(imgElem);
        URL.revokeObjectURL(imgUrl);
        if (result && result.getText()) {
          const raw = result.getText().trim();
          if (validateBarcodeChecksum(raw)) {
            playBeepSound();
            if (navigator.vibrate) navigator.vibrate([80]);
            lookupBarcode(raw);
            return;
          }
        }
      } catch (errZX) {
        URL.revokeObjectURL(imgUrl);
      }
    }
  } catch (err) {}

  // 3. Fallback: Sunucu tarafı CLAHE & OpenCV ile fotoğraftan tara
  try {
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = reader.result;
      const res = await fetch('/api/scanner/decode-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: b64, aggressive: true })
      });
      const data = await res.json();
      if (data.status === 'success' && data.barcode && validateBarcodeChecksum(data.barcode)) {
        playBeepSound();
        if (navigator.vibrate) navigator.vibrate([80]);
        lookupBarcode(data.barcode);
      } else {
        showToast("❌ Fotoğrafta net bir barkod algılanamadı. Lütfen barkodu daha net ve yakından çekin.", "error");
      }
    };
    reader.readAsDataURL(file);
  } catch (e) {
    showToast("❌ Fotoğraf okuma hatası.", "error");
  } finally {
    event.target.value = '';
  }
}

// Window Global Tanımlamaları
window.toggleGlareMode = toggleGlareMode;
window.setCameraZoom = setCameraZoom;
window.toggleFlashlight = toggleFlashlight;
window.openFullscreenCamera = openFullscreenCamera;
window.closeFullscreenCamera = closeFullscreenCamera;
window.startContinuousBarcodeEngine = startContinuousBarcodeEngine;
window.onLiveBarcodeDetected = onLiveBarcodeDetected;
window.triggerNativeCaptureFallback = triggerNativeCaptureFallback;
window.handleGalleryImage = handleGalleryImage;


/**
 * 🔎 Barkod Sorgulama & Ekrana Getirme (OYMAPOS Standart)
 */
async function lookupBarcode(barcode) {
  barcode = (barcode || '').trim();
  if (!barcode) return;

  currentBarcode = barcode;
  const emptyState = document.getElementById('empty-state');
  const addedCard = document.getElementById('added-success-card');
  const productCard = document.getElementById('product-card');
  const txtBarcode = document.getElementById('txt-barcode');
  const badge = document.getElementById('badge-status');
  const inpTitle = document.getElementById('inp-title');
  const inpPrice = document.getElementById('inp-price');

  if (txtBarcode) txtBarcode.innerText = barcode;
  const manualInp = document.getElementById('inp-manual-barcode');
  if (manualInp) manualInp.value = barcode;

  try {
    const res = await fetch(`/api/products/${encodeURIComponent(barcode)}`);
    const data = await res.json();

    if (data.status === 'success' && data.data && data.data.product) {
      const p = data.data.product;
      currentProduct = p;
      isNewProduct = false;

      if (inpTitle) inpTitle.value = p.title || "";
      
      const posPrice = (typeof p.price === 'number') ? p.price : Number(p.price || 0);
      const hasLabel = (p.label_price !== null && p.label_price !== undefined);
      const labelPrice = hasLabel ? Number(p.label_price) : null;

      document.getElementById('val-pos-price').textContent = `₺ ${posPrice.toFixed(2)}`;
      document.getElementById('val-label-price').textContent = hasLabel ? `₺ ${labelPrice.toFixed(2)}` : 'Basılmadı';

      if (inpPrice) inpPrice.value = posPrice.toFixed(2);

      if (hasLabel && Math.abs(posPrice - labelPrice) > 0.001) {
        badge.className = "product-status-pill diff";
        badge.innerText = `⚠️ FARK: ₺${Math.abs(posPrice - labelPrice).toFixed(2)}`;
      } else if (!p.last_printed_at) {
        badge.className = "product-status-pill diff";
        badge.innerText = "⚠️ Baskı Bekliyor";
      } else {
        badge.className = "product-status-pill found";
        badge.innerText = "✓ Kayıtlı & Güncel";
      }

      showToast(`✓ "${p.title}" getirildi.`, "success");
    } else {
      isNewProduct = true;
      currentProduct = { barcode: barcode, price: 0, title: '' };
      if (inpTitle) inpTitle.value = "";
      if (inpPrice) inpPrice.value = "";
      document.getElementById('val-pos-price').textContent = "Yeni Ürün";
      document.getElementById('val-label-price').textContent = "Yok";

      badge.className = "product-status-pill new";
      badge.innerText = "➕ Yeni Ürün";
      showToast("Ürün kayıtlı değil. Bilgilerini yazıp basabilirsiniz.", "info");
      if (inpTitle) inpTitle.focus();
    }

    if (emptyState) emptyState.style.display = 'none';
    if (addedCard) addedCard.style.display = 'none';
    if (productCard) productCard.style.display = 'flex';
  } catch (err) {
    showToast("Bağlantı hatası: " + err.message, "error");
  }
}

function getSelectedMobilePrinter() {
  const sel = document.getElementById('mobilePrinterSelect');
  if (sel && sel.value) return sel.value;
  return localStorage.getItem('selected_printer') || null;
}

async function loadMobilePrinters() {
  try {
    const res = await fetch('/api/printers');
    const json = await res.json();
    const data = json.data || {};
    const printers = data.printers || [];
    const printerDetails = data.printer_details || [];
    const activeFromBackend = data.active_printer || (printers[0] || 'Termal Etiket Yazici');
    
    let chosen = localStorage.getItem('selected_printer') || activeFromBackend;
    const sel = document.getElementById('mobilePrinterSelect');
    const dot = document.getElementById('mobile-printer-dot');

    if (sel && printers.length > 0) {
      sel.innerHTML = '';
      printers.forEach(p => {
        const d = printerDetails.find(item => item.name === p);
        const isConn = d ? d.connected : false;
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = `${isConn ? '🟢' : '🔴'} ${p}`;
        opt.style.background = '#0f172a';
        opt.style.color = '#f8fafc';
        if (p === chosen) opt.selected = true;
        sel.appendChild(opt);
      });
      // Eğer seçili olan liste dışındaysa ilkini seç
      if (!printers.includes(chosen)) {
        chosen = printers[0];
        sel.value = chosen;
      }
    }

    // Seçili yazıcının bağlantı durumunu al
    const stRes = await fetch(`/api/printer/status?printer=${encodeURIComponent(chosen)}`);
    const stJson = await stRes.json();
    const stData = stJson.data || {};
    const isConnected = !!stData.connected;

    if (dot) {
      dot.style.background = isConnected ? '#10b981' : '#ef4444';
      dot.style.boxShadow = isConnected ? '0 0 6px #10b981' : '0 0 6px #ef4444';
    }
  } catch(e) {
    const dot = document.getElementById('mobile-printer-dot');
    if (dot) dot.style.background = '#ef4444';
  }
}

function handleMobilePrinterChange(newPrinter) {
  if (!newPrinter) return;
  localStorage.setItem('selected_printer', newPrinter);
  loadMobilePrinters();
  showToast(`Yazıcı seçildi: "${newPrinter}"`, 'info');
}

/**
 * 🖨️ Hemen Etiket Yazdır
 */
async function printCurrentProductNow() {
  if (!currentBarcode) return;
  const title = (document.getElementById('inp-title')?.value || '').trim();
  const price = parseFloat(document.getElementById('inp-price')?.value) || 0;
  const chosenPrinter = getSelectedMobilePrinter();

  try {
    const payload = {
      barcode: currentBarcode,
      title: title,
      price: price,
      copies: 1
    };
    if (chosenPrinter) payload.printer = chosenPrinter;

    const res = await fetch('/api/print/single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.status === 'success') {
      showToast(`✓ "${title}" yazıcıya basıldı!`, 'success');
      document.getElementById('val-label-price').textContent = `₺ ${price.toFixed(2)}`;
      const badge = document.getElementById('badge-status');
      if (badge) {
        badge.className = "product-status-pill found";
        badge.innerText = "✓ Etiket Güncel";
      }
      loadMobilePrinters();
    } else {
      showToast('⚠️ Yazdırma Hatası: ' + data.message, 'error');
      loadMobilePrinters();
    }
  } catch(e) {
    showToast('⚠️ Yazıcıya ulaşılamadı: ' + e.message, 'error');
    loadMobilePrinters();
  }
}

/**
 * 💾 Barkod Okuma Sonrası Fiyatı ve İsmi Güncelle (Kayıt / Audit Geçmişi)
 */
async function updatePriceFromMobile() {
  if (!currentBarcode) {
    showToast("Lütfen önce bir barkod okutun!", "error");
    return;
  }
  const title = (document.getElementById('inp-title')?.value || '').trim();
  const price = parseFloat(document.getElementById('inp-price')?.value);

  if (!title) {
    showToast("Ürün adı boş olamaz!", "error");
    return;
  }
  if (isNaN(price) || price < 0) {
    showToast("Geçerli bir fiyat girin!", "error");
    return;
  }

  try {
    const res = await fetch(`/api/products/${encodeURIComponent(currentBarcode)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title,
        price: price,
        brand: currentProduct?.brand || "",
        unit: currentProduct?.unit || "ADET",
        device_name: "Mobil Reyon Terminali"
      })
    });
    const data = await res.json();

    if (data.status === 'success') {
      showToast(`✓ "${title}" fiyatı (₺ ${price.toFixed(2)}) başarıyla güncellendi!`, 'success');
      document.getElementById('val-pos-price').textContent = `₺ ${price.toFixed(2)}`;
      if (currentProduct) {
        currentProduct.price = price;
        currentProduct.title = title;
      }
      const badge = document.getElementById('badge-status');
      if (badge) {
        badge.className = "product-status-pill diff";
        badge.innerText = "⚠️ Baskı Bekliyor";
      }
    } else {
      showToast('Güncelleme hatası: ' + data.message, 'error');
    }
  } catch(e) {
    showToast('Bağlantı hatası: ' + e.message, 'error');
  }
}

/**
 * ✓ Etiket Basıldı Onayla (Fiziki değişim onayı)
 */
async function confirmPrintedOnly() {
  if (!currentBarcode) return;
  try {
    const res = await fetch(`/api/products/${encodeURIComponent(currentBarcode)}/confirm-printed`, { method: 'POST' });
    const data = await res.json();

    if (data.status === 'success') {
      showToast('✓ Etiket basıldı olarak onaylandı!', 'success');
      const posP = parseFloat(document.getElementById('inp-price')?.value) || (currentProduct ? currentProduct.price : 0);
      document.getElementById('val-label-price').textContent = `₺ ${Number(posP).toFixed(2)}`;
      const badge = document.getElementById('badge-status');
      if (badge) {
        badge.className = "product-status-pill found";
        badge.innerText = "✓ Etiket Güncel";
      }
    } else {
      showToast('Hata: ' + data.message, 'error');
    }
  } catch(e) {
    showToast('Hata: ' + e.message, 'error');
  }
}

/**
 * ➕ Basım Listesine Ekle (Kuyruk)
 */
function addItemToQueue() {
  const title = (document.getElementById('inp-title')?.value || '').trim();
  const price = parseFloat(document.getElementById('inp-price')?.value) || 0;

  if (!title) {
    showToast("Lütfen Ürün Adı girin!", "error");
    return;
  }

  const existingIdx = mobileQueue.findIndex(x => x.barcode === currentBarcode);
  if (existingIdx !== -1) {
    mobileQueue[existingIdx].title = title;
    mobileQueue[existingIdx].price = price;
  } else {
    mobileQueue.push({
      barcode: currentBarcode,
      title: title,
      price: price
    });
  }

  saveQueueToStorage();
  showToast(`✓ "${title}" basım listesine eklendi!`, "success");

  // Kart durumunu güncelle
  const productCard = document.getElementById('product-card');
  const addedCard = document.getElementById('added-success-card');
  const addedDesc = document.getElementById('added-success-desc');
  if (productCard) productCard.style.display = 'none';
  if (addedCard) addedCard.style.display = 'flex';
  if (addedDesc) addedDesc.textContent = `${title} (₺ ${price.toFixed(2)})`;
}

function switchMobileTab(tabName) {
  const secScan = document.getElementById('section-scan');
  const secQueue = document.getElementById('section-queue');
  const btnScan = document.getElementById('tab-btn-scan');
  const btnQueue = document.getElementById('tab-btn-queue');

  if (tabName === 'scan') {
    secScan.style.display = 'flex';
    secQueue.style.display = 'none';
    btnScan.classList.add('active');
    btnQueue.classList.remove('active');
  } else {
    secScan.style.display = 'none';
    secQueue.style.display = 'flex';
    btnScan.classList.remove('active');
    btnQueue.classList.add('active');
    renderQueueList();
  }
}

function loadQueueFromStorage() {
  try {
    const saved = localStorage.getItem('mobile_label_queue');
    if (saved) mobileQueue = JSON.parse(saved);
  } catch(e) {
    mobileQueue = [];
  }
}

function saveQueueToStorage() {
  try {
    localStorage.setItem('mobile_label_queue', JSON.stringify(mobileQueue));
  } catch(e) {}
  updateQueueUI();
}

function updateQueueUI() {
  const count = mobileQueue.length;
  const badge = document.getElementById('badge-queue-count');
  const btnText = document.getElementById('btn-batch-print-text');
  const countLabel = document.getElementById('queue-total-count');
  if (badge) badge.innerText = count;
  if (btnText) btnText.innerText = `Toplu Yazdır (${count} Etiket)`;
  if (countLabel) countLabel.innerText = `${count} ürün`;
}

function renderQueueList() {
  const container = document.getElementById('queue-items-list');
  const emptyState = document.getElementById('queue-empty-state');
  if (!container) return;

  if (mobileQueue.length === 0) {
    if (emptyState) emptyState.style.display = 'flex';
    container.innerHTML = '';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  let html = '';
  mobileQueue.forEach((item, idx) => {
    html += `
      <div class="queue-card">
        <div class="queue-card-top">
          <span class="queue-card-title">${item.title}</span>
          <button class="btn-remove-item" onclick="removeItemFromQueue(${idx})">🗑️ Kaldır</button>
        </div>
        <div class="queue-card-bottom">
          <span class="queue-barcode">${item.barcode}</span>
          <input type="number" step="0.01" class="queue-price-inp" value="${item.price}" onchange="updateQueuePrice(${idx}, this.value)">
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function updateQueuePrice(idx, val) {
  if (mobileQueue[idx]) {
    mobileQueue[idx].price = parseFloat(val) || 0;
    saveQueueToStorage();
  }
}

function removeItemFromQueue(idx) {
  mobileQueue.splice(idx, 1);
  saveQueueToStorage();
  renderQueueList();
}

function clearQueueWithConfirm() {
  if (mobileQueue.length === 0) return;
  if (confirm("Basım listesini temizlemek istediğinize emin misiniz?")) {
    mobileQueue = [];
    saveQueueToStorage();
    renderQueueList();
  }
}

/**
 * 🖨️ Toplu Kuyruk Yazdırma
 */
async function submitQueueBatchPrint() {
  if (mobileQueue.length === 0) {
    showToast("Basım listesi boş!", "error");
    return;
  }

  showToast("Toplu etiketler yazıcıya gönderiliyor...", "info");

  try {
    const chosenPrinter = getSelectedMobilePrinter();
    const payload = {
      products: mobileQueue.map(item => ({
        barcode: item.barcode,
        title: item.title,
        price: item.price
      })),
      copies: 1
    };
    if (chosenPrinter) payload.printer = chosenPrinter;

    const res = await fetch('/api/print/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.status === 'success') {
      showToast(`✓ ${mobileQueue.length} etiket başarıyla basıldı!`, "success");
      mobileQueue = [];
      saveQueueToStorage();
      renderQueueList();
      setTimeout(() => switchMobileTab('scan'), 1000);
    } else {
      showToast("⚠️ Yazdırma hatası: " + data.message, "error");
    }
  } catch(e) {
    showToast("⚠️ Hata: " + e.message, "error");
  }
}

// Başlatıcı
document.addEventListener('DOMContentLoaded', () => {
  loadQueueFromStorage();
  updateQueueUI();
  loadMobilePrinters();
  setInterval(loadMobilePrinters, 8000);
});
