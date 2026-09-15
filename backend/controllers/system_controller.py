# -*- coding: utf-8 -*-
"""
⚙️ System Controller
Sistem yedekleme, geri yükleme, sağlık durumu ve sunucu kapatma
"""
import os
import io
import time
import zipfile
import tempfile
import threading
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import StreamingResponse

from backend.config import DB_PATH, SETTINGS_FILE, DATA_DIR
from backend.services.db_service import get_products_count, init_db
from backend.services.db.connection import db_session
from backend.utils.network_utils import get_local_ip
from backend.utils.text_utils import get_blacklist_data, save_blacklist_data, is_invalid_or_blacklisted_product
from backend.utils.response_utils import safe_log, success_response, error_response
from pydantic import BaseModel
from typing import List, Optional

class BlacklistUpdateRequest(BaseModel):
    words: Optional[List[str]] = None
    barcodes: Optional[List[str]] = None
    min_barcode_length: Optional[int] = 3
    block_negative_prices: Optional[bool] = True
    block_zero_prices: Optional[bool] = True
    block_scale_products: Optional[bool] = True
    block_cigarettes: Optional[bool] = True

router = APIRouter(prefix="/api/system", tags=["System"])

@router.get("/blacklist")
async def get_system_blacklist():
    """Kara listedeki kelime ve barkodları döndürür."""
    data = get_blacklist_data()
    return success_response(data=data, message="Kara liste kuralları getirildi.")

@router.post("/blacklist")
async def update_system_blacklist(req: BlacklistUpdateRequest):
    """Kara liste kurallarını günceller ve mevcut veritabanını kara listeye göre temizler."""
    current = get_blacklist_data()
    if req.words is not None:
        current["words"] = [w.strip().upper() for w in req.words if w.strip()]
    if req.barcodes is not None:
        current["barcodes"] = [b.strip() for b in req.barcodes if b.strip()]
    if req.min_barcode_length is not None:
        current["min_barcode_length"] = max(1, req.min_barcode_length)
    if req.block_negative_prices is not None:
        current["block_negative_prices"] = bool(req.block_negative_prices)
    if req.block_zero_prices is not None:
        current["block_zero_prices"] = bool(req.block_zero_prices)
    if req.block_scale_products is not None:
        current["block_scale_products"] = bool(req.block_scale_products)
    if req.block_cigarettes is not None:
        current["block_cigarettes"] = bool(req.block_cigarettes)

    save_blacklist_data(current)

    # Veritabanında eşleşen ürünleri kara liste olarak işaretle
    flagged_count = 0
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT barcode, title, price FROM urunler;")
        rows = cursor.fetchall()
        bl_barcodes = []
        un_barcodes = []
        for r in rows:
            if is_invalid_or_blacklisted_product(r["barcode"], r["title"], r["price"]):
                bl_barcodes.append((r["barcode"],))
            else:
                un_barcodes.append((r["barcode"],))
        if bl_barcodes:
            cursor.executemany("UPDATE urunler SET is_blacklisted = 1 WHERE barcode = ?;", bl_barcodes)
            flagged_count = len(bl_barcodes)
        if un_barcodes:
            cursor.executemany("UPDATE urunler SET is_blacklisted = 0 WHERE barcode = ?;", un_barcodes)
        conn.commit()

    return success_response(
        data={"blacklist": current, "flagged_products_count": flagged_count},
        message=f"Kara liste güncellendi! {flagged_count} ürün kara listeye alındı."
    )


@router.get("/download-installer")
async def download_installer():
    from fastapi.responses import FileResponse
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    standalone_zip = os.path.join(base_dir, "dist", "OYMAPOS_Etiket_Kurulum.zip")
    source_zip = os.path.join(base_dir, "dist", "OYMAPOS_Etiket_Sistemi.zip")
    
    target_path = standalone_zip if os.path.exists(standalone_zip) else source_zip
    if not os.path.exists(target_path):
        return error_response(message="Kurulum paketi bulunamadı.", status_code=404)

    return FileResponse(
        path=target_path,
        media_type="application/x-zip-compressed",
        filename="OYMAPOS_Etiket_Kurulum.zip"
    )

@router.get("/backup")
async def backup_system():
    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        if os.path.exists(DB_PATH):
            zf.write(DB_PATH, arcname="market_sistemi.db")
        if os.path.exists(SETTINGS_FILE):
            zf.write(SETTINGS_FILE, arcname="ayarlar.json")
        tpl_file = os.path.join(DATA_DIR, "etiket_sablonlari.json")
        if os.path.exists(tpl_file):
            zf.write(tpl_file, arcname="etiket_sablonlari.json")

    mem_zip.seek(0)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    filename = f"oymapos_yedek_{timestamp}.zip"
    return StreamingResponse(
        mem_zip,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.post("/restore")
async def restore_system(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower()
    content = await file.read()

    def _clean_wal_files():
        for suffix in ["-wal", "-shm"]:
            fpath = DB_PATH + suffix
            if os.path.exists(fpath):
                try:
                    os.remove(fpath)
                except Exception:
                    pass

    if ext == ".db":
        _clean_wal_files()
        with open(DB_PATH, "wb") as f:
            f.write(content)
        _clean_wal_files()
        init_db()
        return success_response(message="SQLite veritabanı başarıyla geri yüklendi.")

    elif ext == ".zip":
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            with zipfile.ZipFile(tmp_path, 'r') as zf:
                for member in zf.namelist():
                    basename = os.path.basename(member)
                    if basename == "market_sistemi.db":
                        _clean_wal_files()
                        with open(DB_PATH, "wb") as f:
                            f.write(zf.read(member))
                        _clean_wal_files()
                    elif basename == "ayarlar.json":
                        with open(SETTINGS_FILE, "wb") as f:
                            f.write(zf.read(member))
                    elif basename == "etiket_sablonlari.json":
                        tpl_file = os.path.join(DATA_DIR, "etiket_sablonlari.json")
                        with open(tpl_file, "wb") as f:
                            f.write(zf.read(member))
            init_db()
            return success_response(message="Yedek arşivi (Veritabanı ve Şablonlar) başarıyla geri yüklendi.")
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass
    else:
        return error_response(message="Desteklenmeyen yedek dosya türü. (.zip veya .db gereklidir)", status_code=400)

@router.get("/health")
async def system_health():
    return success_response(
        data={
            "status": "healthy",
            "total_products": get_products_count(),
            "ip": get_local_ip(),
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        },
        message="Sistem çalışıyor"
    )

@router.post("/shutdown")
async def shutdown_server():
    safe_log("\n[🛑 Kapatılıyor]")
    safe_log("Kapatma komutu alındı. Alt süreçler ve port serbest bırakılıyor...")
    
    def _kill():
        time.sleep(0.5)
        safe_log("[✅ Güvenle Kapatıldı]")
        safe_log("Port serbest bırakıldı.\n")
        os._exit(0)

    threading.Thread(target=_kill, daemon=True).start()
    return success_response(message="Sunucu ve port temizlenerek kapatılıyor...")

@router.get("/get-clipboard")
async def get_clipboard_content():
    """İstemci tarayıcı panosuna erişemediğinde sistem panosunu okur."""
    text = ""
    # 1. Önce Windows ctypes API ile hızlıca dene
    try:
        import ctypes
        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32

        if user32.OpenClipboard(None):
            try:
                CF_UNICODETEXT = 13
                h_mem = user32.GetClipboardData(CF_UNICODETEXT)
                if h_mem:
                    kernel32.GlobalLock.restype = ctypes.c_wchar_p
                    p_text = kernel32.GlobalLock(h_mem)
                    if p_text:
                        text = str(p_text)
                    kernel32.GlobalUnlock(h_mem)
            finally:
                user32.CloseClipboard()
    except Exception as e:
        safe_log(f"Ctypes pano okuma hatası: {e}")

    # 2. Eğer ctypes boş döndüyse Windows PowerShell Get-Clipboard ile dene
    if not text or not text.strip():
        try:
            import subprocess
            res = subprocess.run(
                ["powershell", "-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard -Raw"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=2
            )
            if res.returncode == 0 and res.stdout:
                text = res.stdout
        except Exception as ps_err:
            safe_log(f"PowerShell pano okuma hatası: {ps_err}")

    return success_response(data={"clipboard_text": text or ""})


