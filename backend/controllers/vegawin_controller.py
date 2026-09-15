# -*- coding: utf-8 -*-
"""
🔄 VegaWin Controller
VegaWin dosya yükleme, klasör tarama, panodan yapıştırma, doğrudan DB aktarımı, değişim takibi ve geri alma (rollback)
"""
import os
import io
import csv
import time
import shutil
import tempfile
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import StreamingResponse

from backend.models.schemas import VegaWinConfirmRequest
from backend.services.db_service import (
    get_new_products_list, mark_new_products_as_printed,
    get_sync_history_list, rollback_sync_batch,
    preview_from_source_db, import_all_from_source_db,
    db_session, update_product_printed_time
)
from backend.services.vegawin_service import (
    parse_vegawin_file, sync_vegawin_items, get_price_changes_list, mark_changes_as_printed,
    preview_vegawin_comparison, scan_vegawin_directory, parse_raw_text_products
)
from backend.services.printer_service import print_single_label
from backend.controllers.network_controller import CONNECTED_DEVICES, DEVICE_INCOMING_DATA
from backend.utils.response_utils import success_response, error_response

router = APIRouter(prefix="/api/vegawin", tags=["VegaWin"])

@router.post("/preview")
async def preview_vegawin_file(file: UploadFile = File(...), device_name: Optional[str] = Form(None)):
    ext = os.path.splitext(file.filename)[1].lower()
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp_path = tmp.name
        content = await file.read()
        tmp.write(content)

    try:
        items = parse_vegawin_file(tmp_path)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    if not items:
        return error_response(message="Dosyadan geçerli ürün verisi okunamadı.", status_code=400)

    comparison_data = preview_vegawin_comparison(items)
    comparison_data["source_filename"] = file.filename
    comparison_data["device_name"] = device_name.strip() if device_name and device_name.strip() else "VegaWin PC"
    comparison_data["parsed_items"] = items

    return success_response(
        data=comparison_data,
        message=f"{comparison_data['total_incoming']} ürün başarıyla karşılaştırıldı."
    )

@router.post("/confirm-sync")
async def confirm_vegawin_sync(req: VegaWinConfirmRequest):
    if not req.items:
        return error_response(message="Aktarılacak ürün listesi boş olamaz.", status_code=400)

    source_label = req.source_name or "VegaWin Dosyası"
    dev_name = req.device_name or "VegaWin PC"
    result = sync_vegawin_items(req.items, source_name=source_label, device_name=dev_name)
    
    dev_id = f"device_{dev_name.replace(' ', '_').lower()}"
    DEVICE_INCOMING_DATA[dev_id] = {
        "device_name": dev_name,
        "timestamp": time.strftime("%d.%m.%Y %H:%M:%S"),
        "items": req.items,
        "price_changes": result.get("price_changes", []),
        "new_products": result.get("new_products", [])
    }
    if dev_id in CONNECTED_DEVICES:
        CONNECTED_DEVICES[dev_id]["has_data"] = True

    return success_response(data=result, message="VegaWin verileri sisteme başarıyla aktarıldı.")

@router.post("/upload")
async def upload_vegawin_file(file: UploadFile = File(...), device_name: Optional[str] = Form(None)):
    ext = os.path.splitext(file.filename)[1].lower()
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp_path = tmp.name
        content = await file.read()
        tmp.write(content)

    try:
        items = parse_vegawin_file(tmp_path)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    if not items:
        return error_response(message="Dosyadan geçerli ürün verisi okunamadı.", status_code=400)

    source_label = file.filename
    dev_name = device_name.strip() if device_name and device_name.strip() else "VegaWin PC"
    result = sync_vegawin_items(items, source_name=source_label, device_name=dev_name)
    return success_response(data=result, message="VegaWin stok ve fiyat senkronizasyonu tamamlandı")

@router.post("/preview-folder-upload")
@router.post("/preview-folder-files")
async def preview_folder_files_endpoint(
    files: List[UploadFile] = File(...),
    device_name: Optional[str] = Form("VegaWin Kasa PC")
):
    dev_name = device_name.strip() if device_name and device_name.strip() else "VegaWin Kasa PC"

    if not files:
        return error_response(message="Klasörden dosya seçilmedi.", status_code=400)

    temp_dir = tempfile.mkdtemp(prefix="vegawin_upload_")
    try:
        saved_files = []
        for uf in files:
            ext = os.path.splitext(uf.filename)[1].lower()
            fname_lower = uf.filename.lower()
            if ext in ['.db', '.sqlite', '.sqlite3', '.xlsx', '.xls', '.csv'] or 'sonsatishareket' in fname_lower:
                rel_path = uf.filename.replace('\\', '/')
                full_dest = os.path.join(temp_dir, os.path.basename(rel_path))
                with open(full_dest, 'wb') as f:
                    content = await uf.read()
                    f.write(content)
                saved_files.append((full_dest, rel_path))

        all_items = []
        parsed_source = "Seçilen Klasör"

        def file_priority(item):
            p = item[0]
            ext = os.path.splitext(p)[1].lower()
            if ext in ['.sqlite', '.db', '.sqlite3']: return 0
            if ext in ['.xlsx', '.xls']: return 1
            if ext == '.csv': return 2
            return 3

        saved_files.sort(key=file_priority)

        for fpath, orig_rel in saved_files:
            try:
                items = parse_vegawin_file(fpath)
                if items:
                    all_items.extend(items)
                    parsed_source = orig_rel
                    if len(all_items) > 50:
                        break
            except Exception:
                continue

        if not all_items:
            from backend.services.vegawin_service import parse_sonsatishareket_file
            for fpath, orig_rel in saved_files:
                if 'sonsatishareket' in os.path.basename(fpath).lower():
                    try:
                        items = parse_sonsatishareket_file(fpath)
                        if items:
                            all_items.extend(items)
                            parsed_source = orig_rel
                    except Exception:
                        pass
    finally:
        if os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass

    if not all_items:
        return error_response(message="Seçilen klasörde geçerli ürün veya veritabanı dosyası bulunamadı. Lütfen doğrudan VegaWin veya Data klasörünü seçin.", status_code=400)

    comparison_data = preview_vegawin_comparison(all_items)
    comparison_data["source_filename"] = f"Seçilen Klasör ({parsed_source})"
    comparison_data["device_name"] = dev_name
    comparison_data["parsed_items"] = all_items

    return success_response(
        data=comparison_data,
        message=f"Klasörden {comparison_data['total_incoming']} ürün başarıyla okundu ve karşılaştırıldı."
    )

@router.post("/preview-folder")
async def preview_folder_endpoint(
    folder_path: str = Form(...),
    device_name: Optional[str] = Form("VegaWin Kasa PC")
):
    dev_name = device_name.strip() if device_name and device_name.strip() else "VegaWin Kasa PC"
    path = folder_path.strip()

    try:
        items, detected_source = scan_vegawin_directory(path)
    except Exception as e:
        return error_response(message=f"Klasör taranamadı: {str(e)}", status_code=400)

    if not items:
        return error_response(message="Seçilen klasörde veya alt klasörlerinde uygun ürün/stok veri dosyası bulunamadı.", status_code=400)

    comparison_data = preview_vegawin_comparison(items)
    comparison_data["source_filename"] = f"{detected_source}"
    comparison_data["device_name"] = dev_name
    comparison_data["parsed_items"] = items

    return success_response(
        data=comparison_data,
        message=f"'{detected_source}' dosyasından {comparison_data['total_incoming']} ürün anında okundu ve karşılaştırıldı."
    )

@router.post("/browse-folder")
async def browse_folder_endpoint():
    import threading
    folder_selected = []

    def open_dialog():
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            folder = filedialog.askdirectory(title="VegaWin veya FasterPOS Klasörünü Seçin", initialdir="C:\\")
            root.destroy()
            if folder:
                folder_selected.append(os.path.normpath(folder))
        except Exception:
            pass

    t = threading.Thread(target=open_dialog)
    t.start()
    t.join(timeout=45)

    if folder_selected:
        selected_path = folder_selected[0]
        return success_response(
            data={"folder_path": selected_path},
            message=f"Klasör seçildi: {selected_path}"
        )
    return error_response(message="Klasör seçimi iptal edildi veya yapılmadı.", status_code=400)

@router.post("/preview-clipboard")
async def preview_clipboard_endpoint(
    raw_text: str = Form(...),
    device_name: Optional[str] = Form("VegaWin Kasa PC")
):
    dev_name = device_name.strip() if device_name and device_name.strip() else "VegaWin Kasa PC"

    if not raw_text or not raw_text.strip():
        return error_response(message="Lütfen kopyaladığınız ürün tablosunu yapıştırın.", status_code=400)

    items, blacklisted_items = parse_raw_text_products(raw_text, collect_blacklisted=True)
    if not items and not blacklisted_items:
        return error_response(message="Yapıştırılan metinden geçerli ürün veya fiyat sütunu tespit edilemedi.", status_code=400)

    comparison_data = preview_vegawin_comparison(items)
    comparison_data["source_filename"] = f"Panodan Yapıştırılan Liste ({len(items)} Ürün)"
    comparison_data["device_name"] = dev_name
    comparison_data["parsed_items"] = items
    comparison_data["blacklisted_items"] = blacklisted_items
    comparison_data["blacklisted_count"] = len(blacklisted_items)

    return success_response(
        data=comparison_data,
        message=f"Panodan {comparison_data['total_incoming']} ürün başarıyla çözümlendi ve karşılaştırıldı. ({len(blacklisted_items)} kara liste kaydı ayrıldı)"
    )

@router.post("/preview-direct-db")
async def preview_direct_db_endpoint(
    db_file: Optional[UploadFile] = File(None),
    device_name: Optional[str] = Form(None)
):
    dev_name = device_name.strip() if device_name and device_name.strip() else "Dükkan Bilgisayarı"
    
    tmp_path = None
    if db_file and db_file.filename:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
            tmp.write(await db_file.read())
            tmp_path = tmp.name

    try:
        result = preview_from_source_db(source_db_path=tmp_path, device_name=dev_name)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    if not result.get("success"):
        return error_response(message=result.get("message", "Veritabanı karşılaştırılamadı."), status_code=400)
    return success_response(data=result, message=f"{result.get('total_incoming', 0)} ürün başarıyla önizlendi.")

@router.post("/sync-direct-db")
async def sync_direct_db_endpoint(
    db_file: Optional[UploadFile] = File(None),
    device_name: Optional[str] = Form(None)
):
    dev_name = device_name.strip() if device_name and device_name.strip() else "Dükkan Bilgisayarı"
    
    tmp_path = None
    if db_file and db_file.filename:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
            tmp.write(await db_file.read())
            tmp_path = tmp.name

    try:
        result = import_all_from_source_db(source_db_path=tmp_path, device_name=dev_name)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    if not result.get("success"):
        return error_response(message=result.get("message", "Veritabanı aktarımı başarısız oldu."), status_code=400)
    
    dev_id = f"device_{dev_name.replace(' ', '_').lower()}"
    DEVICE_INCOMING_DATA[dev_id] = {
        "device_name": dev_name,
        "timestamp": time.strftime("%d.%m.%Y %H:%M:%S"),
        "items": result.get("price_changes", []),
        "price_changes": result.get("price_changes", []),
        "new_products": []
    }
    return success_response(data=result, message=result.get("message", "Dükkan verileri başarıyla aktarıldı."))

@router.get("/sync-history")
async def get_vegawin_sync_history(limit: int = 50):
    history = get_sync_history_list(limit=limit)
    return success_response(
        data={"sync_history": history, "count": len(history)},
        message="Senkronizasyon geçmişi listelendi"
    )

@router.post("/sync/{sync_id}/rollback")
async def rollback_vegawin_sync(sync_id: int):
    res = rollback_sync_batch(sync_id)
    if not res.get("success"):
        return error_response(message=res.get("message", "Geri alma başarısız oldu."), status_code=400)
    return success_response(data=res, message=res["message"])

@router.post("/clear-all-history")
async def clear_all_vegawin_history():
    """Tüm aktarım geçmişini, fiyat değişimlerini ve ürün hareketlerini tamamen temizler."""
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM vegawin_sync_history;")
        cursor.execute("DELETE FROM vegawin_price_changes;")
        cursor.execute("DELETE FROM vegawin_new_products;")
        cursor.execute("DELETE FROM product_history;")
        conn.commit()
    return success_response(message="Tüm aktarım geçmişi ve kayıtlar tamamen temizlendi.")


@router.get("/changes")
async def get_vegawin_changes(unprinted: bool = False):
    changes = get_price_changes_list(unprinted_only=unprinted)
    return success_response(
        data={"changes": changes, "count": len(changes)},
        message="Fiyat değişimleri listelendi"
    )

@router.get("/new-products")
async def get_vegawin_new_products(unprinted: bool = False):
    new_items = get_new_products_list(unprinted_only=unprinted)
    return success_response(
        data={"new_products": new_items, "count": len(new_items)},
        message="Yeni eklenen ürünler listelendi"
    )

@router.post("/print_changes")
async def print_vegawin_changes():
    changes = get_price_changes_list(unprinted_only=True)
    if not changes:
        return error_response(message="Basılacak yeni fiyat değişimi bulunamadı.", status_code=400)

    products = []
    for c in changes:
        products.append({
            "title": c["title"],
            "price": c["new_price"],
            "barcode": c["barcode"],
            "date": c["changed_at"].split(" ")[0] if " " in c["changed_at"] else c["changed_at"],
            "copies": 1
        })

    from backend.services.printer_service import print_batch_labels
    success, msg = print_batch_labels(products)
    if success:
        for c in changes:
            if c.get("barcode"):
                update_product_printed_time(c["barcode"], printed_price=c["new_price"])
        mark_changes_as_printed([c['id'] for c in changes])
        return success_response(
            data={"printed_count": len(products)},
            message=f"{len(products)} adet fiyat etiketi başarıyla yazdırıldı."
        )
    return error_response(message=f"Toplu baskı hatası: {msg}", status_code=500)

@router.post("/print_new_products")
async def print_vegawin_new_products():
    new_prods = get_new_products_list(unprinted_only=True)
    if not new_prods:
        return error_response(message="Basılacak yeni ürün etiketi bulunamadı.", status_code=400)

    products = []
    for np in new_prods:
        products.append({
            "title": np["title"],
            "price": np["price"],
            "barcode": np["barcode"],
            "date": np["created_at"].split(" ")[0] if " " in np["created_at"] else np["created_at"],
            "copies": 1
        })

    from backend.services.printer_service import print_batch_labels
    success, msg = print_batch_labels(products)
    if success:
        for np in new_prods:
            if np.get("barcode"):
                update_product_printed_time(np["barcode"], printed_price=np["price"])
        mark_new_products_as_printed([np['id'] for np in new_prods])
        return success_response(
            data={"printed_count": len(products)},
            message=f"{len(products)} adet yeni ürün etiketi başarıyla yazdırıldı."
        )
    return error_response(message=f"Toplu baskı hatası: {msg}", status_code=500)

@router.post("/print_all_pending")
async def print_all_pending_vegawin():
    changes = get_price_changes_list(unprinted_only=True)
    new_prods = get_new_products_list(unprinted_only=True)

    if not changes and not new_prods:
        return error_response(message="Basılacak bekleyen fiyat değişimi veya yeni ürün bulunamadı.", status_code=400)

    products = []
    for c in changes:
        products.append({
            "title": c["title"],
            "price": c["new_price"],
            "barcode": c["barcode"],
            "date": c["changed_at"].split(" ")[0] if " " in c["changed_at"] else c["changed_at"],
            "copies": 1
        })
    for np in new_prods:
        products.append({
            "title": np["title"],
            "price": np["price"],
            "barcode": np["barcode"],
            "date": np["created_at"].split(" ")[0] if " " in np["created_at"] else np["created_at"],
            "copies": 1
        })

    from backend.services.printer_service import print_batch_labels
    success, msg = print_batch_labels(products)
    if success:
        for c in changes:
            if c.get("barcode"):
                update_product_printed_time(c["barcode"], printed_price=c["new_price"])
        if changes:
            mark_changes_as_printed([c['id'] for c in changes])

        for np in new_prods:
            if np.get("barcode"):
                update_product_printed_time(np["barcode"], printed_price=np["price"])
        if new_prods:
            mark_new_products_as_printed([np['id'] for np in new_prods])

        return success_response(
            data={"printed_count": len(products), "changes_count": len(changes), "new_count": len(new_prods)},
            message=f"Toplam {len(products)} etiket ({len(changes)} Değişen + {len(new_prods)} Yeni Ürün) yazdırıldı."
        )
    return error_response(message=f"Toplu baskı hatası: {msg}", status_code=500)

@router.get("/export/changes/csv")
async def export_changes_csv():
    changes = get_price_changes_list(unprinted_only=False, limit=5000)
    output = io.StringIO()
    output.write('\ufeff')
    writer = csv.writer(output, delimiter=';')
    writer.writerow(["Barkod", "Ürün Adı", "Eski Fiyat", "Yeni Fiyat", "Fark (TL)", "Fark (%)", "Değişim Tarihi", "Basıldı"])
    for c in changes:
        writer.writerow([
            c.get("barcode", ""),
            c.get("title", ""),
            str(c.get("old_price", 0)).replace('.', ','),
            str(c.get("new_price", 0)).replace('.', ','),
            str(c.get("diff_amount", 0)).replace('.', ','),
            c.get("diff_percent", 0),
            c.get("changed_at", ""),
            "Evet" if c.get("is_printed") else "Hayır"
        ])
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=fiyat_degisimleri.csv"}
    )
