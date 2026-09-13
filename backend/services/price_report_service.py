# -*- coding: utf-8 -*-
"""
📊 Günlük Fiyat Değişim Rapor Servisi
- Tarihe göre fiyat değişimlerini sorgular (product_history ve vegawin_price_changes)
- Market adı, tarih, eski fiyat, yeni fiyat, artış tutarı ve ortalanmış barkod çizgili PDF üretir
"""
import os
import sys
import io
import datetime
import sqlite3
from typing import List, Dict, Any, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.barcode import code128
from reportlab.graphics.barcode.eanbc import Ean13BarcodeWidget
from reportlab.graphics.shapes import Drawing

from backend.config import DB_PATH, BASE_DIR
from backend.services.printer_service import load_settings
from backend.services.db.connection import db_session
from backend.utils.text_utils import clean_barcode_text, parse_price

# Font Kaydı
_fonts_registered = False
def _ensure_fonts():
    global _fonts_registered
    if not _fonts_registered:
        font_path = "C:/Windows/Fonts/arial.ttf"
        font_bold_path = "C:/Windows/Fonts/arialbd.ttf"
        if os.path.exists(font_path) and os.path.exists(font_bold_path):
            try:
                pdfmetrics.registerFont(TTFont("ArialTR", font_path))
                pdfmetrics.registerFont(TTFont("ArialTR-Bold", font_bold_path))
            except Exception:
                pass
        _fonts_registered = True

def get_available_price_change_dates() -> List[str]:
    """Sistemde fiyat değişimi bulunan tüm günlerin listesini (YYYY-MM-DD) döner."""
    dates_set = set()
    with db_session() as conn:
        c = conn.cursor()
        c.execute("""
            SELECT DISTINCT substr(created_at, 1, 10) FROM product_history 
            WHERE (old_price IS NOT NULL AND new_price IS NOT NULL AND abs(new_price - old_price) > 0.001)
               OR event_type IN ('price_change', 'manual_edit', 'price_increase', 'price_decrease');
        """)
        for r in c.fetchall():
            if r[0]: dates_set.add(str(r[0]).strip())

        c.execute("SELECT DISTINCT substr(changed_at, 1, 10) FROM vegawin_price_changes;")
        for r in c.fetchall():
            if r[0]: dates_set.add(str(r[0]).strip())

    return sorted(list(dates_set), reverse=True)

def get_price_changes_by_date(target_date: str = None) -> List[Dict[str, Any]]:
    """
    Belirli bir gündeki (YYYY-MM-DD) tüm fiyat değişimlerini listeler.
    Eğer tarih verilmezse bugünün tarihini alır.
    """
    if not target_date:
        target_date = datetime.datetime.now().strftime("%Y-%m-%d")

    target_date = target_date.strip()
    results = {}

    with db_session() as conn:
        c = conn.cursor()
        
        # 1. product_history tablosundaki fiyat değişimleri
        c.execute("""
            SELECT id, barcode, COALESCE(new_title, old_title) as title,
                   old_price, new_price, diff_amount, diff_percent,
                   source, device_name, created_at
            FROM product_history
            WHERE substr(created_at, 1, 10) = ?
              AND (
                  (old_price IS NOT NULL AND new_price IS NOT NULL AND abs(new_price - old_price) > 0.001)
                  OR event_type IN ('price_change', 'manual_edit', 'price_increase', 'price_decrease')
              )
            ORDER BY id ASC;
        """, (target_date,))
        
        for r in c.fetchall():
            b = str(r["barcode"]).strip()
            old_p = parse_price(r["old_price"])
            new_p = parse_price(r["new_price"])
            diff = round(new_p - old_p, 2)
            
            # Ürünün güncel adını alalım
            c2 = conn.cursor()
            c2.execute("SELECT title FROM urunler WHERE barcode = ?;", (b,))
            cur_prod = c2.fetchone()
            p_title = cur_prod["title"] if cur_prod else (r["title"] or b)
            
            # Aynı ürün gün içinde birden fazla değiştiyse en ilk ve en son fiyatı koru
            if b in results:
                results[b]["new_price"] = new_p
                results[b]["diff_amount"] = round(new_p - results[b]["old_price"], 2)
                results[b]["time"] = str(r["created_at"]).split(" ")[-1]
            else:
                results[b] = {
                    "barcode": b,
                    "title": p_title,
                    "old_price": old_p,
                    "new_price": new_p,
                    "diff_amount": diff,
                    "diff_percent": round((diff / old_p * 100) if old_p > 0 else 0, 1),
                    "source": r["source"] or "Sistem",
                    "device": r["device_name"] or "Ana PC",
                    "time": str(r["created_at"]).split(" ")[-1]
                }

        # 2. vegawin_price_changes tablosundaki kayıtlar (varsa ve eklenmediyse)
        c.execute("""
            SELECT id, barcode, title, old_price, new_price, diff_amount, diff_percent, changed_at, source_device
            FROM vegawin_price_changes
            WHERE substr(changed_at, 1, 10) = ?
            ORDER BY id ASC;
        """, (target_date,))
        for r in c.fetchall():
            b = str(r["barcode"]).strip()
            if b not in results:
                old_p = parse_price(r["old_price"])
                new_p = parse_price(r["new_price"])
                diff = round(new_p - old_p, 2)
                
                c2 = conn.cursor()
                c2.execute("SELECT title FROM urunler WHERE barcode = ?;", (b,))
                cur_prod = c2.fetchone()
                p_title = cur_prod["title"] if cur_prod else (r["title"] or b)
                
                results[b] = {
                    "barcode": b,
                    "title": p_title,
                    "old_price": old_p,
                    "new_price": new_p,
                    "diff_amount": diff,
                    "diff_percent": round((diff / old_p * 100) if old_p > 0 else 0, 1),
                    "source": r["source_device"] or "VegaWin",
                    "device": r["source_device"] or "VegaWin",
                    "time": str(r["changed_at"]).split(" ")[-1]
                }

    items = list(results.values())
    items.sort(key=lambda x: x["title"])
    return items

def generate_daily_report_pdf(target_date: str = None) -> bytes:
    """
    Belirli bir günün fiyat değişim raporunu tam A4, kartlı,
    büyük ortalanmış barkod çizgili ve Türkçe uyumlu PDF olarak üretir ve baytlarını döner.
    """
    _ensure_fonts()
    if not target_date:
        target_date = datetime.datetime.now().strftime("%Y-%m-%d")

    settings = load_settings()
    market_name = settings.get("market_name", "YARENLER SÜPERMARKET").upper()

    items = get_price_changes_by_date(target_date)

    # Tarihi güzel formata dönüştür (Örn: 12.09.2026 Cumartesi)
    try:
        dt = datetime.datetime.strptime(target_date, "%Y-%m-%d")
        tr_months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
        tr_days = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
        date_display = f"{dt.day} {tr_months[dt.month-1]} {dt.year} {tr_days[dt.weekday()]}"
    except Exception:
        date_display = target_date

    pdf_buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        pdf_buffer,
        pagesize=A4,
        leftMargin=18,
        rightMargin=18,
        topMargin=22,
        bottomMargin=22
    )

    elements = []
    
    main_font = "ArialTR" if _fonts_registered else "Helvetica"
    bold_font = "ArialTR-Bold" if _fonts_registered else "Helvetica-Bold"

    market_title_style = ParagraphStyle(
        "MarketTitle",
        fontName=bold_font,
        fontSize=15,
        leading=18,
        alignment=1,
        textColor=colors.HexColor("#0f172a")
    )

    report_subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        fontName=bold_font,
        fontSize=11,
        leading=14,
        alignment=1,
        textColor=colors.HexColor("#0284c7")
    )

    meta_info_style = ParagraphStyle(
        "MetaInfo",
        fontName=main_font,
        fontSize=9,
        leading=12,
        alignment=1,
        textColor=colors.HexColor("#64748b")
    )

    item_title_style = ParagraphStyle(
        "ItemTitle",
        fontName=bold_font,
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#0f172a")
    )

    price_old_style = ParagraphStyle(
        "PriceOld",
        fontName=bold_font,
        fontSize=11,
        leading=14,
        alignment=1,
        textColor=colors.HexColor("#dc2626")
    )

    price_new_style = ParagraphStyle(
        "PriceNew",
        fontName=bold_font,
        fontSize=14,
        leading=17,
        alignment=1,
        textColor=colors.HexColor("#1e3a8a")
    )

    price_diff_style = ParagraphStyle(
        "PriceDiff",
        fontName=bold_font,
        fontSize=11,
        leading=14,
        alignment=1,
        textColor=colors.HexColor("#059669")
    )

    barcode_txt_style = ParagraphStyle(
        "BarcodeTxt",
        fontName=bold_font,
        fontSize=9.5,
        leading=12,
        alignment=1,
        textColor=colors.HexColor("#334155")
    )

    empty_style = ParagraphStyle(
        "EmptyText",
        fontName=main_font,
        fontSize=12,
        leading=16,
        alignment=1,
        textColor=colors.HexColor("#64748b")
    )

    # Başlık Alanı
    elements.append(Paragraph(market_name, market_title_style))
    elements.append(Spacer(1, 3))
    elements.append(Paragraph(f"GÜNLÜK FİYAT DEĞİŞİM RAPORU", report_subtitle_style))
    elements.append(Spacer(1, 2))
    elements.append(Paragraph(f"Tarih: <b>{date_display}</b> &nbsp;|&nbsp; Toplam Değişen Ürün: <b>{len(items)} Adet</b>", meta_info_style))
    elements.append(Spacer(1, 14))

    if not items:
        elements.append(Spacer(1, 40))
        elements.append(Paragraph(f"Bu tarihte ({target_date}) herhangi bir fiyat değişimi kaydı bulunamadı.", empty_style))
        doc.build(elements)
        pdf_buffer.seek(0)
        return pdf_buffer.getvalue()

    for idx, item in enumerate(items, 1):
        barcode_val = item["barcode"]
        old_p = item["old_price"]
        new_p = item["new_price"]
        diff_amt = item["diff_amount"]
        
        diff_str = f"+{diff_amt:.2f} TL" if diff_amt > 0 else f"{diff_amt:.2f} TL"
        diff_color = "#059669" if diff_amt > 0 else ("#dc2626" if diff_amt < 0 else "#64748b")

        # 13 haneli standart perakende barkodları için saf EAN-13, diğerleri için Code128
        try:
            b_clean = str(barcode_val).strip()
            if len(b_clean) == 13 and b_clean.isdigit():
                d = Drawing(160, 52)
                bc_widget = Ean13BarcodeWidget(b_clean)
                bc_widget.barHeight = 44
                bc_widget.barWidth = 1.35
                d.add(bc_widget)
                bc = d
            else:
                bc = code128.Code128(b_clean, barHeight=50, barWidth=1.45)
        except Exception:
            bc = Paragraph(f"<b>{barcode_val}</b>", barcode_txt_style)

        card_data = [
            # 1. Satır: Başlık & Fiyatlar
            [
                Paragraph(f"<b>#{idx}</b>", item_title_style),
                Paragraph(f"<b>{item['title']}</b>", item_title_style),
                Paragraph(f"<font size=7 color='#64748b'>ÖNCEKİ SATIŞ</font><br/><b>{old_p:.2f} TL</b>", price_old_style),
                Paragraph(f"<font size=7 color='#1e3a8a'>YENİ SATIŞ</font><br/><b>{new_p:.2f} TL</b>", price_new_style),
                Paragraph(f"<font size=7 color='{diff_color}'>FARK / ARTIŞ</font><br/><font color='{diff_color}'><b>{diff_str}</b></font>", price_diff_style),
            ],
            # 2. Satır: Tam ortalanmış büyük Barkod Çizgisi (Üst ve alttan geniş yalıtım)
            [
                "",
                bc,
                "",
                "",
                ""
            ],
            # 3. Satır: Barkod Numarası Metni (Ortalı)
            [
                "",
                Paragraph(f"Barkod: <b>{barcode_val}</b>", barcode_txt_style),
                "",
                "",
                ""
            ]
        ]

        card_table = Table(
            card_data,
            colWidths=[30, 279, 80, 90, 80]
        )
        card_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f8fafc")),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('ALIGN', (1, 0), (1, 0), 'LEFT'),
            ('ALIGN', (1, 1), (1, 1), 'CENTER'), # Barkod çizgisi tam ortalı
            ('ALIGN', (1, 2), (1, 2), 'CENTER'), # Barkod metni tam ortalı
            ('ALIGN', (2, 0), (-1, 0), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('SPAN', (1, 1), (4, 1)),             # Barkod satırını birleştir
            ('SPAN', (1, 2), (4, 2)),             # Metin satırını birleştir
            ('BOX', (0, 0), (-1, -1), 1.2, colors.HexColor("#475569")),
            ('LINEBELOW', (0, 0), (-1, 0), 0.75, colors.HexColor("#cbd5e1")),
            ('TOPPADDING', (0, 0), (-1, 0), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('TOPPADDING', (1, 1), (4, 1), 16),   # Barkodun üstüne geniş mesafe
            ('BOTTOMPADDING', (1, 1), (4, 1), 8),
            ('BOTTOMPADDING', (1, 2), (4, 2), 14), # Barkodun altına geniş mesafe
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))

        elements.append(KeepTogether(card_table))
        # İki ürün kartı arasına çok geniş güvenlik mesafesi (65 pt ~ 2.3 cm)
        # Böylece sayfada sadece 3 ürün yer alır ve POS okuyucu/kamera asla alt veya üstteki ürünü görmez!
        elements.append(Spacer(1, 65))

    doc.build(elements)
    pdf_buffer.seek(0)
    return pdf_buffer.getvalue()
