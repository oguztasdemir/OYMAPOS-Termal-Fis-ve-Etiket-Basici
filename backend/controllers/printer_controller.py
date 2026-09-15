# -*- coding: utf-8 -*-
"""
🖨️ Printer Controller
Yazıcı listeleme, ayar kaydetme, test baskısı ve yazdırma kuyruğu
"""
import time
from fastapi import APIRouter
from backend.models.schemas import PrinterSettingsRequest
from backend.services.printer_service import (
    get_installed_printers, load_settings, save_settings, print_single_label, purge_printer_queue,
    check_printer_connection, get_print_history, get_print_history_dates
)
from backend.utils.response_utils import success_response, error_response

router = APIRouter(prefix="/api", tags=["Printer"])

@router.get("/printers")
async def list_printers():
    printers = get_installed_printers()
    settings = load_settings()
    active = settings.get("printer")
    
    # Her yazıcının durumunu ayrı ayrı analiz et
    printer_details = []
    for p in printers:
        st = check_printer_connection(p)
        printer_details.append({
            "name": p,
            "connected": st.get("connected", False),
            "status_text": st.get("status_text", ""),
            "port": st.get("port", ""),
            "is_active": (p == active)
        })

    status_info = check_printer_connection(active)
    return success_response(
        data={
            "printers": printers,
            "printer_details": printer_details,
            "active_printer": active,
            "status": status_info,
            "settings": settings
        },
        message="Yazıcılar listelendi"
    )

@router.get("/printer/status")
async def get_printer_status(printer: str = None):
    settings = load_settings()
    active = printer or settings.get("printer")
    status_info = check_printer_connection(active)
    return success_response(
        data=status_info,
        message="Yazıcı durumu sorgulandı"
    )

@router.get("/printer/history")
async def get_printer_history_endpoint(limit: int = 200, date: str = None):
    history = get_print_history(limit, date_filter=date)
    available_dates = get_print_history_dates()
    return success_response(
        data={
            "history": history,
            "count": len(history),
            "available_dates": available_dates,
            "selected_date": date or "all"
        },
        message="Baskı geçmişi listelendi"
    )

@router.post("/printer/settings")
async def update_printer_settings(req: PrinterSettingsRequest):
    updated = save_settings(req.dict(exclude_unset=True))
    return success_response(data={"settings": updated}, message="Yazıcı ayarları güncellendi")

@router.post("/printer/test")
async def test_print():
    test_product = {
        "title": "TEST ETIKET BASKISI",
        "title1": "TEST ETIKET BASKISI",
        "price": 99.90,
        "barcode": "8690000000000",
        "brand": "OYMAPOS",
        "origin": "TURKIYE",
        "date": time.strftime("%d.%m.%Y")
    }
    success, msg = print_single_label(test_product)
    if success:
        return success_response(message=msg)
    return error_response(message=msg, status_code=500)

@router.post("/printer/purge")
async def purge_queue():
    success, msg = purge_printer_queue()
    if success:
        return success_response(message=msg)
    return error_response(message=msg, status_code=500)
