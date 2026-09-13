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
    get_available_price_change_dates, get_price_changes_by_date, generate_daily_report_pdf
)
from backend.utils.response_utils import success_response, error_response

router = APIRouter(prefix="/api/reports", tags=["Reports"])

@router.get("/price-changes/dates")
async def get_report_dates():
    """Sistemde fiyat değişimi bulunan tüm tarihleri döner."""
    dates = get_available_price_change_dates()
    return success_response(
        data={"dates": dates},
        message=f"{len(dates)} farklı günün fiyat değişim kaydı bulundu."
    )

@router.get("/price-changes")
async def get_daily_price_changes(date: Optional[str] = Query(None)):
    """Belirtilen günün (YYYY-MM-DD) fiyat değişim listesini JSON olarak döner."""
    target_date = date or datetime.datetime.now().strftime("%Y-%m-%d")
    items = get_price_changes_by_date(target_date)
    return success_response(
        data={
            "date": target_date,
            "total_count": len(items),
            "items": items
        },
        message=f"{target_date} tarihli {len(items)} adet fiyat değişimi listelendi."
    )

@router.get("/price-changes/pdf")
async def download_daily_price_changes_pdf(date: Optional[str] = Query(None)):
    """
    Belirtilen tarihe ait günlük fiyat değişim raporunu
    ortalanmış barkod çizgili, market başlıklı PDF olarak üretir ve indirir/görüntüler.
    """
    target_date = date or datetime.datetime.now().strftime("%Y-%m-%d")
    try:
        pdf_bytes = generate_daily_report_pdf(target_date)
        filename = f"gunluk_fiyat_degisim_raporu_{target_date}.pdf"
        
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
