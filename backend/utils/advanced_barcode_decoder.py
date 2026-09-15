# -*- coding: utf-8 -*-
"""
Gelişmiş Parlama ve Yuvarlak/Bükük Yüzey Barkod Çözümleme Motoru (OYMAPOS 1-1 Birebir)
- Parlama (Specular Glare / Reflection) Filtreleme (CLAHE, Blackhat, Gamma, Vurgu Bastırma)
- Yuvarlak Yapılar (Yumurta çikolata, silindir, şişe, bükük ambalaj) Düzleştirme & Silindirik De-warp
- Multi-Angle (Çok Açılı) Döndürme & Dilimleme
- PyZBar + OpenCV BarcodeDetector Hibrit Motoru
"""
import cv2
import numpy as np

try:
    from pyzbar import pyzbar
    from pyzbar.pyzbar import ZBarSymbol
    ALLOWED_SYMBOLS = [
        ZBarSymbol.EAN13,
        ZBarSymbol.EAN8,
        ZBarSymbol.UPCA,
        ZBarSymbol.UPCE,
        ZBarSymbol.CODE128,
        ZBarSymbol.CODE39,
        ZBarSymbol.CODE93,
        ZBarSymbol.I25,
        ZBarSymbol.DATABAR,
        ZBarSymbol.DATABAR_EXP,
        ZBarSymbol.CODABAR,
        ZBarSymbol.ISBN10,
        ZBarSymbol.ISBN13,
        ZBarSymbol.QRCODE,
    ]
except ImportError:
    pyzbar = None
    ALLOWED_SYMBOLS = None


def validate_barcode_checksum(barcode_str: str) -> bool:
    """EAN-13, EAN-8, UPC-A, Terazi veya alfa-sayısal barkod sağlama kontrolü."""
    if not barcode_str:
        return False
    s = str(barcode_str).strip()
    
    # EAN-13 Kontrolü
    if len(s) == 13 and s.isdigit():
        digits = [int(c) for c in s]
        checksum = (10 - (sum(digits[i] * (1 if i % 2 == 0 else 3) for i in range(12)) % 10)) % 10
        if digits[12] == checksum:
            return True
        if s[:2] in ("20", "21", "22", "23", "24", "25", "26", "27", "28", "29"):
            return True
        return False
        
    # EAN-8 Kontrolü
    if len(s) == 8 and s.isdigit():
        digits = [int(c) for c in s]
        checksum = (10 - (sum(digits[i] * (3 if i % 2 == 0 else 1) for i in range(7)) % 10)) % 10
        return digits[7] == checksum

    # UPC-A Kontrolü
    if len(s) == 12 and s.isdigit():
        digits = [int(c) for c in s]
        checksum = (10 - (sum(digits[i] * (3 if i % 2 == 0 else 1) for i in range(11)) % 10)) % 10
        return digits[11] == checksum

    # Kısa PLU ve manav kodları (1-7 hane)
    if 1 <= len(s) <= 7 and s.isdigit():
        return True

    # Code-128 / Code-39 / ITF
    if len(s) >= 3 and s.isalnum():
        return True

    return False


def unroll_cylinder(gray_img, curvature=0.35):
    """
    Yuvarlak / yumurta / silindir ürünlerdeki bükülmüş barkodu düzlemsel hale açar.
    Inverse cylindrical projection mapping: x' = R * arcsin(x / R)
    """
    h, w = gray_img.shape[:2]
    map_x = np.zeros((h, w), np.float32)
    map_y = np.zeros((h, w), np.float32)
    
    cx = w / 2.0
    r = w / (2.0 * curvature) if curvature > 0 else w
    
    x_indices = np.arange(w, dtype=np.float32)
    dx = (x_indices - cx) / r
    dx = np.clip(dx, -0.98, 0.98)
    unwarped_x = cx + r * np.arcsin(dx)
    
    for y in range(h):
        map_x[y, :] = unwarped_x
        map_y[y, :] = y
        
    return cv2.remap(gray_img, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def remove_glare_and_normalize(gray_img):
    """
    Parlama (parlak beyaz yansımalar ve gölgeler) bastırma ve yerel kontrast eşitleme.
    """
    # 1. CLAHE (Contrast Limited Adaptive Histogram Equalization)
    clahe = cv2.createCLAHE(clipLimit=3.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray_img)

    # 2. Vurgu / Parlama Maskesi ve Bastırma
    _, glare_mask = cv2.threshold(gray_img, 235, 255, cv2.THRESH_BINARY)
    if cv2.countNonZero(glare_mask) > 30:
        blurred = cv2.medianBlur(enhanced, 5)
        enhanced = np.where(glare_mask == 255, blurred, enhanced)

    return enhanced


def try_decode_variants(img_variants, cv_detector=None):
    """Farklı filtrelenmiş varyantlar üzerinde pyzbar ve opencv ile çözüm dener."""
    if cv_detector is None:
        cv_detector = cv2.barcode.BarcodeDetector()

    for var in img_variants:
        if var is None:
            continue

        # 1. PyZBar Motoru (Yüksek doğruluk ve hız)
        try:
            if pyzbar:
                if ALLOWED_SYMBOLS:
                    barcodes = pyzbar.decode(var, symbols=ALLOWED_SYMBOLS)
                else:
                    barcodes = pyzbar.decode(var)
                for bc in barcodes:
                    if bc.data:
                        val = bc.data.decode('utf-8', errors='ignore').strip()
                        if validate_barcode_checksum(val):
                            return val
        except Exception:
            pass

        # 2. OpenCV Barcode Motoru
        try:
            res = cv_detector.detectAndDecode(var)
            if res and res[0]:
                val = str(res[0]).strip()
                if validate_barcode_checksum(val):
                    return val
        except Exception:
            pass

    return None


def decode_advanced_barcode(img_bgr, aggressive_mode=True):
    """
    Parlama, Yuvarlak Yapılar, Düşük Kontrast ve Bükük Barkodları Çok Aşamalı Çözer.
    """
    if img_bgr is None:
        return None

    # Gri tonlamaya çevir
    if len(img_bgr.shape) == 3:
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    else:
        gray = img_bgr

    cv_detector = cv2.barcode.BarcodeDetector()

    # -------------------------------------------------------------
    # 1. AŞAMA: HIZLI GEÇİŞ (Ham Gri + Standart CLAHE)
    # -------------------------------------------------------------
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    gray_clahe = clahe.apply(gray)
    
    quick_result = try_decode_variants([gray, gray_clahe], cv_detector)
    if quick_result:
        return quick_result

    # -------------------------------------------------------------
    # 2. AŞAMA: PARLAMA BASTIRMA & MORFOLOJİK FİLTRELER (Glare / Reflection)
    # -------------------------------------------------------------
    glare_suppressed = remove_glare_and_normalize(gray)
    
    # Blackhat Morfolojisi (Parlak arka plandaki siyah çubukları izole eder)
    kernel_horiz = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 3))
    blackhat_horiz = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, kernel_horiz)
    blackhat_enhanced = cv2.normalize(blackhat_horiz, None, 0, 255, cv2.NORM_MINMAX)

    # Adaptif Eşikleme (Adaptive Gaussian Binarization)
    adaptive_thresh = cv2.adaptiveThreshold(
        glare_suppressed, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 21, 5
    )

    stage2_result = try_decode_variants([glare_suppressed, blackhat_enhanced, adaptive_thresh], cv_detector)
    if stage2_result:
        return stage2_result

    # -------------------------------------------------------------
    # 3. AŞAMA: YUVARLAK / BÜKÜK / YUMURTA ÇİKOLATA SİLİNDİRİK DÜZLEŞTİRME
    # -------------------------------------------------------------
    # Yuvarlak yüzey açma (De-warp)
    unrolled_1 = unroll_cylinder(glare_suppressed, curvature=0.35)
    unrolled_2 = unroll_cylinder(glare_suppressed, curvature=0.55)

    # Yatay Genişletme / Esnetme (Bükük barkodun sıkışmış çubuklarını açar)
    h, w = gray.shape[:2]
    stretched_horiz = cv2.resize(glare_suppressed, (int(w * 1.35), h), interpolation=cv2.INTER_LINEAR)
    stretched_unroll = cv2.resize(unrolled_1, (int(w * 1.35), h), interpolation=cv2.INTER_LINEAR)

    stage3_result = try_decode_variants([unrolled_1, unrolled_2, stretched_horiz, stretched_unroll], cv_detector)
    if stage3_result:
        return stage3_result

    if not aggressive_mode:
        return None

    # -------------------------------------------------------------
    # 4. AŞAMA: ÇOK AÇILI DÖNDÜRME & DİLİMLEME (Multi-Angle Rotation)
    # -------------------------------------------------------------
    angles = [15, -15, 30, -30, 90]
    rotated_variants = []
    center = (w // 2, h // 2)

    for angle in angles:
        rot_mat = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(glare_suppressed, rot_mat, (w, h), borderMode=cv2.BORDER_REPLICATE)
        rotated_variants.append(rotated)

    stage4_result = try_decode_variants(rotated_variants, cv_detector)
    if stage4_result:
        return stage4_result

    # -------------------------------------------------------------
    # 5. AŞAMA: KESKİNLEŞTİRME (Unsharp Mask) & NEGATİF (Invert)
    # -------------------------------------------------------------
    # Unsharp Mask (Bulanık / Odaklanamamış kamera kareleri için)
    gaussian = cv2.GaussianBlur(glare_suppressed, (0, 0), 2.0)
    sharpened = cv2.addWeighted(glare_suppressed, 1.6, gaussian, -0.6, 0)
    
    # Inverted (Siyah ambalaj üzerine beyaz barkodlar)
    inverted = cv2.bitwise_not(glare_suppressed)

    stage5_result = try_decode_variants([sharpened, inverted], cv_detector)
    if stage5_result:
        return stage5_result

    return None
