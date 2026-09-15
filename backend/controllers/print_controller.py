# -*- coding: utf-8 -*-
"""
🖨️ Print Controller
Tekli etiket baskısı, çoklu toplu etiket baskısı ve mobil terminal okutma
"""
import time
from fastapi import APIRouter

from backend.models.schemas import PrintSingleRequest, PrintBatchRequest, MobileScanRequest
from backend.services.db_service import get_product_by_barcode, update_product_printed_time, update_product_details
from backend.services.printer_service import print_single_label, load_settings
from backend.utils.response_utils import success_response, error_response

router = APIRouter(prefix="/api/print", tags=["Print Operations"])

@router.post("/single")
async def print_single(req: PrintSingleRequest):
    prod = None
    if req.barcode:
        prod = get_product_by_barcode(req.barcode)
    
    if prod and req.barcode:
        has_price_change = (req.price is not None and abs(float(req.price) - float(prod.get("price") or 0)) > 0.001)
        has_title_change = (bool(req.title) and req.title.strip() != str(prod.get("title") or "").strip())
        
        if req.price is not None:
            prod["price"] = float(req.price)
        if req.title:
            prod["title"] = req.title.strip()
        if req.brand:
            prod["brand"] = req.brand.strip()
            
        if has_price_change or has_title_change:
            try:
                update_product_details(
                    barcode=req.barcode,
                    title=prod["title"],
                    price=prod["price"],
                    brand=prod.get("brand"),
                    device_name="Etiket Baskı Masası"
                )
            except Exception:
                pass
    elif not prod and req.title and req.price is not None:
        prod = {
            "title": req.title,
            "price": req.price,
            "barcode": req.barcode or "",
            "brand": req.brand or "",
            "date": time.strftime("%d.%m.%Y")
        }
    if not prod:
        return error_response(message="Geçersiz ürün bilgisi.", status_code=400)

    success, msg = print_single_label(prod, copies=req.copies or 1, target_printer=req.printer)
    if success:
        prod_data = {}
        if prod.get("barcode"):
            prod_data = update_product_printed_time(prod["barcode"], printed_price=prod.get("price"))
        return success_response(data={"product": prod_data, "last_printed_at": prod_data.get("last_printed_at")}, message=msg)
    return error_response(message=msg, status_code=500)

@router.post("/batch")
async def print_batch(req: PrintBatchRequest):
    if not req.products:
        return error_response(message="Yazdırılacak ürün seçilmedi.", status_code=400)
    
    printed_count = 0
    errors = []
    target_printer = req.printer
    for item in req.products:
        item_printer = item.printer or target_printer
        prod = {
            "title": item.title,
            "price": item.price,
            "barcode": item.barcode or "",
            "brand": item.brand or "",
            "date": time.strftime("%d.%m.%Y")
        }
        success, msg = print_single_label(prod, copies=req.copies or 1, target_printer=item_printer)
        if success:
            printed_count += 1
            if item.barcode:
                # 1. Satış fiyatı ve isim güncellemesini yap
                if item.price is not None or item.title:
                    try:
                        update_product_details(
                            barcode=item.barcode,
                            title=item.title,
                            price=float(item.price) if item.price is not None else None,
                            brand=item.brand,
                            device_name="Mobil Reyon Terminali"
                        )
                    except Exception:
                        pass
                # 2. Raf etiket fiyatını ve son baskı zamanını güncelle
                update_product_printed_time(item.barcode, printed_price=item.price)
        else:
            errors.append(f"{item.title}: {msg}")
            
    if printed_count == 0 and errors:
        return error_response(message=f"Baskı başarısız: {errors[0]}", data={"errors": errors}, status_code=500)

    return success_response(
        data={"printed_count": printed_count, "errors": errors},
        message=f"{printed_count} adet etiket yazdırıldı."
    )

@router.post("/mobile_scan")
async def mobile_scan_print(req: MobileScanRequest):
    barcode = req.barcode.strip()
    prod = get_product_by_barcode(barcode)
    if not prod:
        return error_response(message=f"Barkod veritabanında bulunamadı: {barcode}", status_code=404)

    print_res = {"printed": False, "message": "Fiyat görüntülendi (Yazdırılmadı)"}
    if req.auto_print:
        success, msg = print_single_label(prod, copies=req.copies or 1, target_printer=req.printer)
        if success:
            update_product_printed_time(barcode)
        settings = load_settings()
        target_pr_name = req.printer or settings.get("printer")
        print_res = {
            "printed": success,
            "printer": target_pr_name,
            "message": msg
        }

    return success_response(
        data={
            "product": prod,
            "print_status": print_res
        },
        message="Barkod okundu"
    )
