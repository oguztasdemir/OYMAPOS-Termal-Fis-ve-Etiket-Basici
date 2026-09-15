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
// Zoom seviyesini localStorage'dan yükle (Varsayılan 1.0)
let currentZoomLevel = parseFloat(localStorage.getItem('oymapos_camera_zoom') || '1.0');
if (isNaN(currentZoomLevel) || currentZoomLevel < 1.0) currentZoomLevel = 1.0;

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
 * 🎯 BARKOD GEÇERLİLİK KONTROLÜ
 */
function validateBarcodeChecksum(barcode) {
  if (!barcode) return false;
  const b = String(barcode).trim();
  if (b.length < 2) return false;
  return true;
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
 * 🔍 Kamera Zoom Kontrolü (Donanım Seviyesi + Fallback & Hafızada Tutma)
 */
async function setCameraZoom(zoomVal) {
  currentZoomLevel = parseFloat(zoomVal) || 1.0;
  try {
    localStorage.setItem('oymapos_camera_zoom', currentZoomLevel.toString());
  } catch(e) {}
  
  // UI Butonlarını Güncelle
  document.querySelectorAll('.fs-btn-zoom').forEach(b => b.classList.remove('active'));
  const activeBtnId = currentZoomLevel === 1.0 ? 'btn-zoom-1x' : (currentZoomLevel === 1.5 ? 'btn-zoom-15x' : (currentZoomLevel === 2.0 ? 'btn-zoom-2x' : 'btn-zoom-3x'));
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
        const targetZ = Math.min(Math.max(currentZoomLevel, minZ), maxZ);
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
    videoElem.style.transform = currentZoomLevel > 1.0 ? `scale(${currentZoomLevel})` : "none";
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

let barcodeCandidateBuffer = { text: '', count: 0, lastTime: 0 };

/**
 * 📷 Tam Ekran Canlı Kamerayı Aç (Hibrit ZXing + BarcodeDetector + OpenCV Backend - OYMAPOS 1-1)
 */
async function openFullscreenCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (location.protocol === 'http:') {
      const httpsPort = location.port ? (parseInt(location.port) + 1) : 8001;
      const ok = confirm("🔒 Canlı video kamera için Apple/Chrome güvenlik kuralı gereği HTTPS bağlantısı gereklidir.\n\nHTTPS canlı kamera sayfasına geçmek istiyor musunuz?");
      if (ok) {
        location.href = `https://${location.hostname}:${httpsPort}/mobile`;
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
  setCameraZoom(currentZoomLevel);

  // 1. ZXING & MEDIADEVICES (OYMAPOS STANDART)
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
        zxingReader = new ZXing.BrowserMultiFormatReader(hints, 30);
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
        // Kamera başladığında kullanıcının hafızadaki zoom seviyesini uygula
        setCameraZoom(currentZoomLevel);
      }

      // Donanım BarcodeDetector ve Sunucu Hibrit Çözücüyü Başlat
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
      const httpsPort = location.port ? (parseInt(location.port) + 1) : 8001;
      const ok = confirm("🔒 Canlı video kamera için Apple/Chrome güvenlik kuralı gereği HTTPS bağlantısı gereklidir.\n\nHTTPS canlı kamera sayfasına geçmek istiyor musunuz?");
      if (ok) {
        location.href = `https://${location.hostname}:${httpsPort}/mobile`;
      }
    } else {
      showToast("⚠️ Kamera izni verilmedi. Lütfen tarayıcı ayarlarından kamera iznini onaylayın.", "error");
    }
  }
}

/**
 * 📷 30 FPS Canlı Barkod Algılama Motoru (OYMAPOS 1-1 Hibrit: Donanım + ZXing Canvas + OpenCV)
 */
function startContinuousBarcodeEngine(videoElem) {
  if (frameDetectionInterval) clearInterval(frameDetectionInterval);
  if (!videoElem) return;

  frameDetectionInterval = setInterval(async () => {
    if (!isScanningLive || videoElem.readyState < 2) return;

    // 1. İstemci Donanım BarcodeDetector (0ms gecikme - Chrome / Android / Safari son sürümler)
    if ('BarcodeDetector' in window) {
      try {
        const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'itf'] });
        const barcodes = await detector.detect(videoElem);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue && isScanningLive) {
          const raw = barcodes[0].rawValue.trim();
          if (validateBarcodeChecksum(raw)) {
            onLiveBarcodeDetected(raw);
            return;
          }
        }
      } catch(e) {}
    }

    // 2. İstemci Tarafı ZXing Canvas Çözücü (Tarayıcıda anında çalışır)
    if (typeof ZXing !== 'undefined' && zxingReader && isScanningLive) {
      try {
        const vw = videoElem.videoWidth || 1280;
        const vh = videoElem.videoHeight || 720;
        roiCanvas.width = 800;
        roiCanvas.height = 450;
        roiCtx.drawImage(videoElem, 0, 0, vw, vh, 0, 0, 800, 450);

        try {
          const lumSource = new ZXing.HTMLCanvasElementLuminanceSource(roiCanvas);
          const binBitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lumSource));
          const zxResult = zxingReader.decodeBitmap(binBitmap);
          if (zxResult && zxResult.getText() && isScanningLive) {
            const raw = zxResult.getText().trim();
            if (validateBarcodeChecksum(raw)) {
              onLiveBarcodeDetected(raw);
              return;
            }
          }
        } catch(e) {}
      } catch(e) {}
    }

    // 3. OpenCV + PyZBar Sunucu Hibrit Çözücü (Parlama, Eğim, Bozuk Etiket Filtresi)
    if (!isDecodingServerFrame && isScanningLive) {
      isDecodingServerFrame = true;
      try {
        const vw = videoElem.videoWidth || 1280;
        const vh = videoElem.videoHeight || 720;
        
        roiCanvas.width = 720;
        roiCanvas.height = 405;
        roiCtx.drawImage(videoElem, 0, 0, vw, vh, 0, 0, 720, 405);

        if (isGlareModeActive) {
          const imgData = roiCtx.getImageData(0, 0, 720, 405);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            const lum = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
            if (lum > 225) {
              d[i] = 190;
              d[i+1] = 190;
              d[i+2] = 190;
            }
          }
          roiCtx.putImageData(imgData, 0, 0);
        }

        const b64 = roiCanvas.toDataURL('image/jpeg', 0.82);
        const res = await fetch('/api/scanner/decode-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: b64, glare_mode: isGlareModeActive })
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
  }, 30);
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
 * 🔴 Barkod Algılandığında Tetiklenen Olay (Anında Hızlı Algılama)
 */
function onLiveBarcodeDetected(decodedText) {
  if (!decodedText || !isScanningLive) return;
  const raw = String(decodedText).trim();

  if (!validateBarcodeChecksum(raw)) {
    return;
  }

  // Anında tetikle ve kamerayı kapatıp ürünü ekrana getir
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
 * 📅 Tarih Formatlayıcı
 */
function formatDateTime(dtStr) {
  if (!dtStr) return 'Yok / Henüz Yok';
  try {
    const s = String(dtStr).trim();
    if (!s) return 'Yok / Henüz Yok';
    const d = new Date(s);
    if (!isNaN(d.getTime()) && s.length >= 10) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day}.${month}.${year} ${hours}:${minutes}`;
    }
    return s.substring(0, 19);
  } catch(e) {
    return String(dtStr);
  }
}

/**
 * 🔎 Barkod Sorgulama & Ekrana Getirme (OYMAPOS Standart)
 */
async function lookupBarcode(barcode) {
  barcode = (barcode || '').trim();
  if (!barcode) return;

  // 1. Eğer ürün basım listesinde zaten varsa kullanıcıyı uyar
  const existingQueueItem = mobileQueue.find(x => x.barcode === barcode);
  if (existingQueueItem) {
    const ok = confirm(
      `⚠️ Bu ürün zaten basım listesinde mevcut!\n\n` +
      `Ürün: ${existingQueueItem.title}\n` +
      `Mevcut Liste Değeri: ₺ ${Number(existingQueueItem.price || 0).toFixed(2)}\n\n` +
      `Yine de bu ürün açılsın / güncellensin mi?`
    );
    if (!ok) {
      return;
    }
  }

  currentBarcode = barcode;
  const emptyState = document.getElementById('empty-state');
  const addedCard = document.getElementById('added-success-card');
  const productCard = document.getElementById('product-card');
  const txtBarcode = document.getElementById('txt-barcode');
  const badge = document.getElementById('badge-status');
  const inpTitle = document.getElementById('inp-title');
  const inpPrice = document.getElementById('inp-price');
  const txtPriceDate = document.getElementById('txt-price-updated-at');
  const txtPrintDate = document.getElementById('txt-last-printed-at');

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
      if (inpPrice) inpPrice.value = posPrice.toFixed(2);

      // Tarih alanlarını göster
      const priceDateStr = p.price_updated_at || p.updated_at || p.created_at;
      const printDateStr = p.last_printed_at;

      if (txtPriceDate) txtPriceDate.textContent = formatDateTime(priceDateStr);
      if (txtPrintDate) txtPrintDate.textContent = printDateStr ? formatDateTime(printDateStr) : 'Henüz Basılmadı';

      if (badge) {
        badge.className = "product-status-pill found";
        badge.innerText = "✓ Kayıtlı Ürün";
      }

      showToast(`✓ "${p.title}" getirildi.`, "success");
    } else {
      isNewProduct = true;
      currentProduct = { barcode: barcode, price: 0, title: '' };
      if (inpTitle) inpTitle.value = "";
      if (inpPrice) inpPrice.value = "";

      if (txtPriceDate) txtPriceDate.textContent = 'Yeni Kayıt';
      if (txtPrintDate) txtPrintDate.textContent = 'Yok';

      if (badge) {
        badge.className = "product-status-pill new";
        badge.innerText = "➕ Yeni Ürün";
      }
      showToast("Ürün kayıtlı değil. Bilgilerini yazıp listeye ekleyin.", "info");
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
      if (!printers.includes(chosen)) {
        chosen = printers[0];
        sel.value = chosen;
      }
    }

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
 * ➕ Basım Listesine Ekle (OYMAPOS 1-1 Kuyruk)
 */
async function addItemToQueue() {
  const title = (document.getElementById('inp-title')?.value || '').trim();
  const price = parseFloat(document.getElementById('inp-price')?.value) || 0;

  if (!title) {
    showToast("Lütfen Ürün Adı girin!", "error");
    return;
  }

  // Eğer yeni ürünse veya fiyat değiştiyse sunucuya kaydet
  try {
    await fetch(`/api/products/${encodeURIComponent(currentBarcode || '8690000000000')}`, {
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
  } catch(e) {}

  const existingIdx = mobileQueue.findIndex(x => x.barcode === currentBarcode);
  if (existingIdx !== -1) {
    mobileQueue[existingIdx].title = title;
    mobileQueue[existingIdx].price = price;
    // Güncellenen ürünü en üste taşı
    const item = mobileQueue.splice(existingIdx, 1)[0];
    mobileQueue.unshift(item);
    showToast(`✓ "${title}" güncellendi.`, "success");
  } else {
    mobileQueue.unshift({
      barcode: currentBarcode || "8690000000000",
      title: title,
      price: price,
      copies: 1
    });
    showToast(`➕ "${title}" basım listesine eklendi!`, "success");
  }

  saveQueueToStorage();
  if (navigator.vibrate) navigator.vibrate([60, 40, 60]);

  // Kart durumunu güncelle
  const prodCard = document.getElementById('product-card');
  if (prodCard) prodCard.style.display = 'none';
  if (document.getElementById('empty-state')) document.getElementById('empty-state').style.display = 'none';

  const successCard = document.getElementById('added-success-card');
  const successTitle = document.getElementById('added-success-title');
  const successDesc = document.getElementById('added-success-desc');
  const badgeCountText = document.getElementById('added-badge-count-text');

  if (successTitle) successTitle.innerText = `"${title}" başarıyla listeye eklendi!`;
  if (successDesc) successDesc.innerHTML = `<strong>Barkod:</strong> ${currentBarcode || '-'} &nbsp;|&nbsp; <strong>Fiyat:</strong> ₺ ${price.toFixed(2)}`;
  if (badgeCountText) badgeCountText.innerText = `Listeyi Gör (${mobileQueue.length})`;
  if (successCard) successCard.style.display = 'flex';

  const manualInp = document.getElementById('inp-manual-barcode');
  if (manualInp) manualInp.value = '';
  currentBarcode = '';
}

/**
 * 📷 Sıradaki Okutmaya Hazırlan
 */
function prepareForNextScan() {
  if (document.getElementById('empty-state')) document.getElementById('empty-state').style.display = 'none';
  if (document.getElementById('product-card')) document.getElementById('product-card').style.display = 'none';
  if (document.getElementById('added-success-card')) document.getElementById('added-success-card').style.display = 'none';
  const manualInp = document.getElementById('inp-manual-barcode');
  if (manualInp) manualInp.value = '';
  currentBarcode = '';
  openFullscreenCamera();
}

window.prepareForNextScan = prepareForNextScan;

function switchMobileTab(tabName) {
  const secScan = document.getElementById('section-scan');
  const secQueue = document.getElementById('section-queue');
  const secChanges = document.getElementById('section-changes');
  const btnScan = document.getElementById('tab-btn-scan');
  const btnQueue = document.getElementById('tab-btn-queue');
  const btnChanges = document.getElementById('tab-btn-changes');

  if (tabName === 'scan') {
    if (secScan) secScan.style.display = 'flex';
    if (secQueue) secQueue.style.display = 'none';
    if (secChanges) secChanges.style.display = 'none';
    if (btnScan) btnScan.classList.add('active');
    if (btnQueue) btnQueue.classList.remove('active');
    if (btnChanges) btnChanges.classList.remove('active');
  } else if (tabName === 'queue') {
    if (secScan) secScan.style.display = 'none';
    if (secQueue) secQueue.style.display = 'flex';
    if (secChanges) secChanges.style.display = 'none';
    if (btnScan) btnScan.classList.remove('active');
    if (btnQueue) btnQueue.classList.add('active');
    if (btnChanges) btnChanges.classList.remove('active');
    renderQueueList();
  } else if (tabName === 'changes') {
    if (secScan) secScan.style.display = 'none';
    if (secQueue) secQueue.style.display = 'none';
    if (secChanges) secChanges.style.display = 'flex';
    if (btnScan) btnScan.classList.remove('active');
    if (btnQueue) btnQueue.classList.remove('active');
    if (btnChanges) btnChanges.classList.add('active');
    loadReportDates();
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
    const pVal = Number(item.price || 0).toFixed(2);
    html += `
      <div class="queue-card" onclick="openProductEditFromQueue(${idx})" style="cursor:pointer;" title="Detayları açmak ve düzenlemek için dokunun">
        <div class="queue-card-top">
          <span class="queue-card-title">${item.title}</span>
          <button class="btn-remove-item" onclick="event.stopPropagation(); removeItemFromQueue(${idx})">🗑️ Kaldır</button>
        </div>
        <div class="queue-card-bottom">
          <span class="queue-barcode">${item.barcode}</span>
          <div style="display:flex; align-items:center; gap:6px;" onclick="event.stopPropagation()">
            <span style="font-size:12px; color:#38bdf8; font-weight:800;">₺</span>
            <input type="number" step="0.01" class="queue-price-inp" value="${pVal}" 
                   onclick="this.select()" 
                   onchange="updateQueuePrice(${idx}, this.value)">
          </div>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

async function updateQueuePrice(idx, val) {
  if (mobileQueue[idx]) {
    const newP = parseFloat(val) || 0;
    mobileQueue[idx].price = newP;
    saveQueueToStorage();
    
    // Veritabanını da güncelle
    try {
      await fetch(`/api/products/${encodeURIComponent(mobileQueue[idx].barcode)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: mobileQueue[idx].title,
          price: newP,
          device_name: "Mobil Reyon Terminali"
        })
      });
    } catch(e) {}
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
      const printedCount = mobileQueue.length;
      showToast(`✓ ${printedCount} etiket başarıyla basıldı!`, "success");
      mobileQueue = [];
      saveQueueToStorage();
      renderQueueList();

      // Yazdırma sonrası onay ve bilgilendirme hatırlatıcısı
      setTimeout(async () => {
        try {
          const todayStr = new Date().toISOString().split('T')[0];
          const repRes = await fetch(`/api/reports/price-changes?date=${todayStr}&source_filter=all`);
          const repData = await repRes.json();
          const todayCount = repData.data?.total_count || 0;
          
          if (todayCount > 0) {
            alert(
              `🔔 HATIRLATMA & BİLGİLENDİRME:\n\n` +
              `Bugün fiyatı değişen toplam ${todayCount} adet ürününüz bulunmaktadır.\n\n` +
              `Lütfen bu ürünlerin raflardaki etiket fiyatlarını kontrol edip düzeltiniz.`
            );
          }
        } catch(e) {}
      }, 1200);

      setTimeout(() => switchMobileTab('scan'), 1000);
    } else {
      showToast("⚠️ Yazdırma hatası: " + data.message, "error");
    }
  } catch(e) {
    showToast("⚠️ Hata: " + e.message, "error");
  }
}

/**
 * =========================================================================
 * 📊 FİYATI DEĞİŞEN ÜRÜNLER RAPORU (MOBİL)
 * =========================================================================
 */
let availableReportDates = [];
let currentReportDate = "";
let currentReportSource = "all"; // Varsayılan: Tümü

function handleMobileReportDateChange(targetDate) {
  currentReportDate = targetDate;
  const selSource = document.getElementById('sel-report-source');
  if (selSource) currentReportSource = selSource.value;
  loadMobilePriceChanges(currentReportDate, currentReportSource);
}

function handleMobileReportSourceChange(source) {
  currentReportSource = source || "all";
  const selDate = document.getElementById('sel-report-date');
  const targetDate = selDate?.value || currentReportDate;
  loadMobilePriceChanges(targetDate, currentReportSource);
}

async function loadReportDates() {
  const selDate = document.getElementById('sel-report-date');
  const selSource = document.getElementById('sel-report-source');
  if (selSource) {
    currentReportSource = selSource.value || currentReportSource;
  }
  if (!selDate) return;
  
  try {
    const res = await fetch(`/api/reports/price-changes/dates?source_filter=${encodeURIComponent(currentReportSource)}`);
    const resData = await res.json();
    const dates = resData.data?.dates || [];
    availableReportDates = dates;

    const todayStr = new Date().toISOString().split('T')[0];
    if (!dates.includes(todayStr)) {
      dates.unshift(todayStr);
    }

    selDate.innerHTML = '';
    dates.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d === todayStr ? `Bugün (${d})` : d;
      selDate.appendChild(opt);
    });

    currentReportDate = selDate.value || todayStr;
    await loadMobilePriceChanges(currentReportDate, currentReportSource);
  } catch(e) {
    console.error("Rapor tarihleri yüklenemedi:", e);
    const todayStr = new Date().toISOString().split('T')[0];
    selDate.innerHTML = `<option value="${todayStr}">Bugün (${todayStr})</option>`;
    currentReportDate = todayStr;
    await loadMobilePriceChanges(currentReportDate, currentReportSource);
  }
}

async function loadMobilePriceChanges(targetDate, targetSource) {
  const selSource = document.getElementById('sel-report-source');
  currentReportSource = targetSource || (selSource?.value || currentReportSource);
  currentReportDate = targetDate || currentReportDate;

  const container = document.getElementById('report-items-container');
  const summaryText = document.getElementById('report-summary-text');
  const emptyState = document.getElementById('report-empty-state');
  if (!container) return;

  if (summaryText) summaryText.textContent = `${currentReportDate} için ürünler yükleniyor...`;
  container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Yükleniyor...</div>';
  if (emptyState) emptyState.style.display = 'none';

  try {
    const res = await fetch(`/api/reports/price-changes?date=${encodeURIComponent(currentReportDate)}&source_filter=${encodeURIComponent(currentReportSource)}`);
    const data = await res.json();

    if (data.status === 'success') {
      const items = data.data?.items || [];
      const count = items.length;
      
      const filterLabels = {
        'all': '🌐 Tümü (Mobil + Masaüstü)',
        'mobile': '📱 Sadece Mobil QR Değişimleri',
        'desktop': '💻 Sadece Masaüstü Tekil Değişimleri'
      };
      const activeLabel = filterLabels[currentReportSource] || 'Fiyat Değişimleri';

      if (summaryText) {
        summaryText.innerHTML = `📅 <b>${currentReportDate}</b> &nbsp;|&nbsp; <span>${activeLabel}</span>: <b>${count}</b> Adet`;
      }

      if (count === 0) {
        container.innerHTML = '';
        if (emptyState) {
          emptyState.style.display = 'flex';
          const emptyDesc = emptyState.querySelector('.empty-desc');
          if (emptyDesc) {
            emptyDesc.textContent = currentReportSource === 'mobile'
              ? 'Seçilen tarihte mobilden QR okutularak fiyatı değiştirilen ürün bulunmuyor.'
              : (currentReportSource === 'desktop'
                ? 'Seçilen tarihte masaüstünde tekil olarak fiyatı değiştirilen ürün bulunmuyor.'
                : 'Seçilen tarihte herhangi bir fiyat değişimi kaydı bulunmuyor.');
          }
        }
        return;
      }

      if (emptyState) emptyState.style.display = 'none';
      window.currentReportItemsMap = items;
      let html = '';
      items.forEach((item, idx) => {
        const diffAmt = Number(item.diff_amount) || 0;
        const diffStr = diffAmt > 0 ? `+${diffAmt.toFixed(2)} TL` : `${diffAmt.toFixed(2)} TL`;
        const diffBadgeClass = diffAmt > 0 ? 'diff-up' : (diffAmt < 0 ? 'diff-down' : '');
        const oldP = Number(item.old_price) || 0;
        const newP = Number(item.new_price) || 0;

        const isMob = (item.source_type === 'mobile');
        const sourceBadge = isMob 
          ? '<span style="font-size:10px; background:rgba(2,132,199,0.18); color:#38bdf8; padding:2px 6px; border-radius:4px; font-weight:700; border:1px solid rgba(2,132,199,0.3);">📱 Mobil QR</span>'
          : '<span style="font-size:10px; background:rgba(99,102,241,0.18); color:#a5b4fc; padding:2px 6px; border-radius:4px; font-weight:700; border:1px solid rgba(99,102,241,0.3);">💻 Masaüstü</span>';

        html += `
          <div class="report-item-card">
            <div class="report-item-header">
              <div class="report-item-title">${idx + 1}. ${item.title}</div>
              <div style="display:flex; align-items:center; gap:6px;">
                ${sourceBadge}
                <span class="report-item-barcode">${item.barcode}</span>
              </div>
            </div>
            <div class="report-item-prices">
              <div class="price-col">
                <span class="price-label">Eski Fiyat</span>
                <span class="price-val-old">${oldP.toFixed(2)} TL</span>
              </div>
              <div class="price-col" style="text-align:center;">
                <span class="price-label">Fark</span>
                <span class="price-diff-badge ${diffBadgeClass}">${diffStr}</span>
              </div>
              <div class="price-col" style="text-align:right;">
                <span class="price-label">Yeni Fiyat</span>
                <span class="price-val-new">${newP.toFixed(2)} TL</span>
              </div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
              <span style="font-size:11px; color:#64748b;">🕒 ${item.time || ''}</span>
              <button class="btn-action-camera" style="padding:6px 14px; font-size:12px; border-radius:8px; font-weight:800; background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%);" onclick="openBarcodeDisplayModalByIndex(${idx})">
                <span>🏷️</span>
                <span>Barkodu Aç</span>
              </button>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;
    } else {
      if (summaryText) summaryText.textContent = "Veriler alınırken hata oluştu.";
      container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
    }
  } catch(e) {
    if (summaryText) summaryText.textContent = "Bağlantı hatası: " + e.message;
    container.innerHTML = '';
    if (emptyState) emptyState.style.display = 'flex';
  }
}

/**
 * 🏷️ Değişenler Listesinden Index Üzerinden Detay & Düzenleme Modalı Açma
 */
function openBarcodeDisplayModalByIndex(index) {
  if (!window.currentReportItemsMap || !window.currentReportItemsMap[index]) return;
  const item = window.currentReportItemsMap[index];
  openBarcodeDisplayModal(item.barcode, item.title, item.old_price, item.new_price);
}

/**
 * 📋 Basım Listesinden (Queue) Detay & Düzenleme Modalı Açma
 */
function openProductEditFromQueue(index) {
  if (!mobileQueue || !mobileQueue[index]) return;
  const item = mobileQueue[index];
  openBarcodeDisplayModal(item.barcode, item.title, null, item.price);
}

let activeModalBarcode = null;

/**
 * 🏷️ Tekil Ürün Detay & Düzenleme Modalını Ekranda Açma
 */
function openBarcodeDisplayModal(barcode, title, oldPrice, newPrice) {
  const modal = document.getElementById('barcode-display-modal');
  const barcodeNumEl = document.getElementById('modal-barcode-num');
  const titleInp = document.getElementById('modal-edit-title');
  const priceInp = document.getElementById('modal-edit-price');
  const oldPriceRow = document.getElementById('modal-barcode-old-price-row');
  const oldPriceEl = document.getElementById('modal-barcode-old-price');
  const svgEl = document.getElementById('modal-barcode-svg');

  if (!modal) return;
  activeModalBarcode = barcode;

  // 1. Form Değerlerini Doldur
  if (barcodeNumEl) barcodeNumEl.textContent = barcode || '-';
  if (titleInp) titleInp.value = title || '';
  if (priceInp) priceInp.value = (Number(newPrice || 0)).toFixed(2);

  if (oldPrice !== null && oldPrice !== undefined && oldPriceRow && oldPriceEl) {
    oldPriceRow.style.display = 'flex';
    oldPriceEl.textContent = `${Number(oldPrice).toFixed(2)} TL`;
  } else if (oldPriceRow) {
    oldPriceRow.style.display = 'none';
  }

  // 2. Modalı hemen görünür yap
  modal.style.display = 'flex';
  modal.classList.add('active');

  // 3. Barkod SVG'sini çiz
  if (svgEl) {
    try {
      const cleanCode = String(barcode || '').trim();
      if (cleanCode && typeof JsBarcode === 'function') {
        const isEan13 = /^\d{13}$/.test(cleanCode);
        const isEan8 = /^\d{8}$/.test(cleanCode);
        const format = isEan13 ? "EAN13" : (isEan8 ? "EAN8" : "CODE128");
        
        try {
          JsBarcode(svgEl, cleanCode, {
            format: format,
            lineColor: "#000000",
            width: 2.2,
            height: 65,
            displayValue: true,
            fontSize: 14,
            font: "JetBrains Mono",
            textMargin: 4,
            margin: 4
          });
        } catch (innerErr) {
          JsBarcode(svgEl, cleanCode, {
            format: "CODE128",
            lineColor: "#000000",
            width: 2.2,
            height: 65,
            displayValue: true,
            fontSize: 14,
            font: "JetBrains Mono",
            textMargin: 4,
            margin: 4
          });
        }
      }
    } catch (e) {
      console.warn("JsBarcode çizim hatası:", e);
    }
  }

  try {
    playBeepSound();
  } catch(e) {}
}

/**
 * 💾 Modal İçerisinden Ürün Adı ve Fiyat Güncellemesini Kaydet
 */
async function saveModalProductEdit() {
  if (!activeModalBarcode) return;
  const newTitle = (document.getElementById('modal-edit-title')?.value || '').trim();
  const newPrice = parseFloat(document.getElementById('modal-edit-price')?.value) || 0;

  if (!newTitle) {
    showToast("Ürün adı boş olamaz!", "error");
    return;
  }

  showToast("Güncelleniyor...", "info");

  try {
    // 1. Veritabanına kaydet
    const res = await fetch(`/api/products/${encodeURIComponent(activeModalBarcode)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle,
        price: newPrice,
        device_name: "Mobil Reyon Terminali"
      })
    });
    const data = await res.json();

    if (data.status === 'success') {
      // 2. Basım listesinde (Queue) varsa orayı da güncelle
      const qIdx = mobileQueue.findIndex(x => x.barcode === activeModalBarcode);
      if (qIdx !== -1) {
        mobileQueue[qIdx].title = newTitle;
        mobileQueue[qIdx].price = newPrice;
        saveQueueToStorage();
        renderQueueList();
      }

      // 3. Fiyat Gör sekmesinde aktifse orayı güncelle
      if (currentBarcode === activeModalBarcode) {
        const inpTitle = document.getElementById('inp-title');
        const inpPrice = document.getElementById('inp-price');
        if (inpTitle) inpTitle.value = newTitle;
        if (inpPrice) inpPrice.value = newPrice.toFixed(2);
      }

      // 4. Değişenler listesindeyse raporu tazele
      const secChanges = document.getElementById('section-changes');
      if (secChanges && secChanges.style.display !== 'none') {
        const selDate = document.getElementById('sel-report-date');
        const selSource = document.getElementById('sel-report-source');
        loadMobilePriceChanges(selDate?.value, selSource?.value);
      }

      showToast(`✓ "${newTitle}" başarıyla güncellendi (₺${newPrice.toFixed(2)})`, "success");
      closeBarcodeDisplayModal();
    } else {
      showToast("Güncelleme hatası: " + (data.message || 'Hata oluştu'), "error");
    }
  } catch(e) {
    showToast("Bağlantı hatası: " + e.message, "error");
  }
}

function closeBarcodeDisplayModal() {
  const modal = document.getElementById('barcode-display-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
  activeModalBarcode = null;
}

async function downloadMobileReportPdf() {
  const selDate = document.getElementById('sel-report-date');
  const selSource = document.getElementById('sel-report-source');
  const targetDate = (selDate && selDate.value) ? selDate.value : currentReportDate;
  const targetSource = (selSource && selSource.value) ? selSource.value : currentReportSource;

  if (!targetDate) {
    showToast("Lütfen bir tarih seçin.", "error");
    return;
  }

  showToast("PDF hazırlanıyor...", "info");
  const url = `/api/reports/price-changes/pdf?date=${encodeURIComponent(targetDate)}&source_filter=${encodeURIComponent(targetSource)}`;

  try {
    // iOS Safari / iPhone paylaşım desteği: fetch ile blob al, navigator.share ile paylaş
    if (navigator.share && navigator.canShare) {
      const response = await fetch(url);
      if (!response.ok) throw new Error('PDF alınamadı: ' + response.status);
      const blob = await response.blob();
      const fileName = `fiyat-raporu-${targetDate}.pdf`;
      const file = new File([blob], fileName, { type: 'application/pdf' });

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Fiyat Değişim Raporu - ${targetDate}`,
          text: `${targetDate} tarihli fiyat değişim raporu`,
          files: [file]
        });
        // Paylaşım başarılı ise onay yönelt
        await _promptMobileReportConfirm(targetDate, targetSource);
        return;
      }
    }

    // iOS Safari'de dosya paylaşımı desteklenmiyorsa veya diğer tarayıcılarda
    // Blob ile güvenilir indirme linkini aç
    const response = await fetch(url);
    if (!response.ok) throw new Error('PDF alınamadı: ' + response.status);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `fiyat-raporu-${targetDate}.pdf`;
    a.target = '_blank'; // iOS için önce yeni sekme, PDF görüntüleyici açılır
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 2000);

  } catch (err) {
    // Fetch veya paylaşım hatasında son çare: doğrudan URL'yi aç
    showToast("PDF hazırlanamadı, doğrudan açılıyor...", "warning");
    window.open(url, '_blank');
  }

  // Kısa bir bekleme sonrası onay yönelt
  setTimeout(() => _promptMobileReportConfirm(targetDate, targetSource), 1500);
}

async function _promptMobileReportConfirm(targetDate, targetSource) {
  const ok = confirm(
    `🖨️ PDF Raporu Oluşturuldu (${targetDate})!\n\n` +
    `Baskı aldığınız bu ürünlerin sistemdeki etiket raf fiyatlarını güncel satış fiyatlarına eşitlemek ve basıldı olarak onaylamak istiyor musunuz?`
  );
  if (ok) {
    try {
      const res = await fetch('/api/reports/price-changes/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: targetDate, source_filter: targetSource })
      });
      const data = await res.json();
      if (data.status === 'success') {
        const updatedCount = data.data?.updated_count || 0;
        showToast(`✅ ${updatedCount} ürünün etiket fiyatı güncellendi & onaylandı!`, 'success');
        loadMobilePriceChanges(targetDate, targetSource);

        setTimeout(() => {
          alert(
            `🔔 DİKKAT & HATIRLATMA:\n\n` +
            `Bugün fiyatı değişen ${updatedCount} adet ürününüz var, bunların fiyatını düzeltin.`
          );
        }, 400);
      } else {
        showToast("Onaylama hatası: " + (data.message || 'Hata oluştu'), 'error');
      }
    } catch(e) {
      showToast("Bağlantı hatası: " + e.message, 'error');
    }
  }
}

window.loadReportDates = loadReportDates;
window.loadMobilePriceChanges = loadMobilePriceChanges;
window.handleMobileReportDateChange = handleMobileReportDateChange;
window.handleMobileReportSourceChange = handleMobileReportSourceChange;
window.openProductEditFromQueue = openProductEditFromQueue;
window.saveModalProductEdit = saveModalProductEdit;
window.downloadMobileReportPdf = downloadMobileReportPdf;
window.openBarcodeDisplayModal = openBarcodeDisplayModal;
window.openBarcodeDisplayModalByIndex = openBarcodeDisplayModalByIndex;
window.closeBarcodeDisplayModal = closeBarcodeDisplayModal;

// Başlatıcı
document.addEventListener('DOMContentLoaded', () => {
  loadQueueFromStorage();
  updateQueueUI();
  loadMobilePrinters();
  setInterval(loadMobilePrinters, 8000);
});

