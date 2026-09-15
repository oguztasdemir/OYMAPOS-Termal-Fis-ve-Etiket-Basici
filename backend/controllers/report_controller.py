# -*- coding: utf-8 -*-
"""
📊 Price Report Controller
Günlük fiyat değişim raporu sorgulama, mevcut tarihleri listeleme ve PDF rapor indirme/önizleme uç noktaları.
"""
import io
import datetime
from typing import Optional
from fastapi import APIRouter, Response, Query
from fastapi.responses import StreamingResponse, JSONResponse

from backend.services.price_report_service import (
    get_available_price_change_dates, get_price_changes_by_date, generate_daily_report_pdf,
    confirm_printed_prices_by_date
)
from backend.utils.response_utils import success_response, error_response
from pydantic import BaseModel

class ReportConfirmRequest(BaseModel):
    date: Optional[str] = None
    source_filter: Optional[str] = "all"

router = APIRouter(prefix="/api/reports", tags=["Reports"])

@router.get("/price-changes/dates")
async def get_report_dates(source_filter: str = Query("all", description="Filtre: all, mobile, desktop")):
    """Sistemde fiyat değişimi bulunan tüm tarihleri döner."""
    dates = get_available_price_change_dates(source_filter=source_filter)
    return success_response(
        data={"dates": dates},
        message=f"{len(dates)} farklı günün fiyat değişim kaydı bulundu."
    )

@router.get("/price-changes")
async def get_daily_price_changes(date: Optional[str] = Query(None), source_filter: str = Query("all", description="Filtre: all, mobile, desktop")):
    """Belirtilen günün (YYYY-MM-DD) fiyat değişim listesini JSON olarak döner."""
    target_date = date or datetime.datetime.now().strftime("%Y-%m-%d")
    items = get_price_changes_by_date(target_date, source_filter=source_filter)
    return success_response(
        data={
            "date": target_date,
            "source_filter": source_filter,
            "total_count": len(items),
            "items": items
        },
        message=f"{target_date} tarihli {len(items)} adet fiyat değişimi listelendi."
    )

@router.post("/price-changes/confirm")
async def confirm_report_prices(req: ReportConfirmRequest):
    """
    Raporu indirilen ürünlerin etiket raf fiyatlarını yeni satış fiyatına eşitler
    ve basıldı olarak onaylar.
    """
    target_date = req.date or datetime.datetime.now().strftime("%Y-%m-%d")
    source_filter = req.source_filter or "all"
    updated_count = confirm_printed_prices_by_date(target_date, source_filter=source_filter)
    return success_response(
        data={"updated_count": updated_count, "date": target_date, "source_filter": source_filter},
        message=f"{updated_count} adet ürünün raf etiket fiyatı güncellendi ve basıldı olarak onaylandı."
    )

@router.get("/price-changes/pdf")
async def download_daily_price_changes_pdf(date: Optional[str] = Query(None), source_filter: str = Query("all", description="Filtre: all, mobile, desktop")):
    """
    Belirtilen tarihe ait günlük fiyat değişim raporunu
    ortalanmış barkod çizgili, market başlıklı PDF olarak üretir ve indirir/görüntüler.
    """
    target_date = date or datetime.datetime.now().strftime("%Y-%m-%d")
    try:
        pdf_bytes = generate_daily_report_pdf(target_date, source_filter=source_filter)
        suffix = f"_{source_filter}" if source_filter != "all" else ""
        filename = f"gunluk_fiyat_degisim_raporu_{target_date}{suffix}.pdf"
        
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"inline; filename={filename}",
                "X-Filename": filename
            }
        )
    except Exception as e:
        return JSONResponse({"status": "error", "message": f"PDF raporu üretilirken hata oluştu: {str(e)}"}, status_code=500)

