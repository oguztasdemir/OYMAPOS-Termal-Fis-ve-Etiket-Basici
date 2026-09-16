# -*- coding: utf-8 -*-
"""
🕵️ Market Radar & Stagnant Price Controller (FastAPI Router)
Piyasa Fiyat Radarı ve 45 Günlük Uyuyan Ürünler API Endpointleri
"""

from typing import List, Optional
from fastapi import APIRouter, Query
from pydantic import BaseModel

from backend.services.market_scanner_service import market_scanner_service
from backend.services.db.connection import db_session
from backend.utils.response_utils import success_response, error_response

router = APIRouter(prefix="/api/market-radar", tags=["Market Radar"])


class StartScanRequest(BaseModel):
    days: Optional[int] = 45


class ScanSingleRequest(BaseModel):
    barcode: str
    title: Optional[str] = ""


class ApplyPriceRequest(BaseModel):
    barcode: str
    new_price: float
    reason: Optional[str] = "Piyasa Fiyat Radarı Güncellemesi"


class BulkApplyItem(BaseModel):
    barcode: str
    new_price: float


class BulkApplyRequest(BaseModel):
    items: List[BulkApplyItem]


@router.get("/stagnant-products")
async def get_stagnant_products(
    days: int = Query(45, description="Kaç gündür güncellenmemiş ürünler"),
    search: str = Query("", description="Arama terimi")
):
    """Belirtilen gün eşiğine göre uyuyan ürünleri ve piyasa kıyaslamalarını listeler."""
    try:
        products = market_scanner_service.get_stagnant_products(days=days, search_term=search, limit=0)
        summary = market_scanner_service.get_summary_stats(days=days)
        return success_response(
            data={
                "days": days,
                "total_count": len(products),
                "summary": summary,
                "products": products
            },
            message=f"{days} gündür güncellenmemiş {len(products)} adet ürün listelendi."
        )
    except Exception as e:
        return error_response(f"Ürünler listelenirken hata oluştu: {str(e)}", status_code=500)


@router.get("/summary")
async def get_summary(days: int = Query(45)):
    """Özet istatistikleri ve risk metriklerini döner."""
    try:
        summary = market_scanner_service.get_summary_stats(days=days)
        return success_response(data=summary)
    except Exception as e:
        return error_response(str(e), status_code=500)


@router.post("/start-scan")
async def start_scan(req: StartScanRequest):
    """Arka planda internet piyasa fiyat taramasını başlatır."""
    days = req.days or 45
    result = market_scanner_service.start_background_scan(days=days)
    if result.get("success"):
        return success_response(data=result, message=result.get("message", "Tarama başlatıldı."))
    return error_response(result.get("message", "Tarama başlatılamadı."), status_code=400)


@router.post("/stop-scan")
async def stop_scan():
    """Devam eden taramayı durdurur."""
    result = market_scanner_service.stop_background_scan()
    return success_response(data=result, message=result.get("message", "Tarama durduruldu."))


@router.get("/scan-status")
async def get_scan_status():
    """Canlı tarama ilerleme durumunu ve bulunan sonuç sayılarını döner."""
    return success_response(data={
        "is_running": market_scanner_service.is_running,
        "progress": market_scanner_service.progress
    })


@router.post("/scan-single")
async def scan_single(req: ScanSingleRequest):
    """Tek bir ürün için anlık piyasa fiyat taraması yapar."""
    barcode = req.barcode.strip()
    if not barcode:
        return error_response("Barkod boş olamaz", status_code=400)

    result = market_scanner_service.audit_single_product(barcode, title=req.title or "")
    if result.get("success"):
        return success_response(data=result, message=f"{result.get('title')} için piyasa fiyatı bulundu.")
    return error_response(result.get("message", "Piyasa fiyatı bulunamadı"), status_code=404, data=result)


@router.post("/apply-price")
async def apply_price(req: ApplyPriceRequest):
    """Seçilen ürüne yeni fiyat uygular ve loglar."""
    barcode = req.barcode.strip()
    if not barcode or req.new_price <= 0:
        return error_response("Geçerli bir barkod ve yeni fiyat belirtilmelidir", status_code=400)

    result = market_scanner_service.apply_market_price(barcode, req.new_price, reason=req.reason)
    if result.get("success"):
        return success_response(data=result, message=f"{result.get('title')} fiyatı {req.new_price} ₺ olarak güncellendi.")
    return error_response(result.get("error", "Fiyat güncellenemedi"), status_code=400)


@router.post("/bulk-apply-prices")
async def bulk_apply_prices(req: BulkApplyRequest):
    """Birden fazla ürüne bulunan piyasa fiyatını topluca uygular."""
    if not req.items:
        return error_response("Güncellenecek ürün listesi boş", status_code=400)

    updated_count = 0
    errors = []

    for item in req.items:
        barcode = item.barcode.strip()
        new_price = item.new_price
        if barcode and new_price > 0:
            res = market_scanner_service.apply_market_price(barcode, new_price, reason="Toplu Piyasa Fiyat Eşitleme")
            if res.get("success"):
                updated_count += 1
            else:
                errors.append(f"{barcode}: {res.get('error')}")

    return success_response(
        data={"updated_count": updated_count, "errors": errors},
        message=f"{updated_count} ürünün fiyatı piyasa fiyatına eşitlendi."
    )


@router.post("/clear-audits")
async def clear_audits():
    """Önceki piyasa tarama önbelleğini temizler."""
    try:
        with db_session() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM market_price_audits;")
        return success_response(message="Piyasa denetim önbelleği temizlendi.")
    except Exception as e:
        return error_response(str(e), status_code=500)
