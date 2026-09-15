# -*- coding: utf-8 -*-
"""
🕒 History Repository
Ürün hareket geçmişi (audit trail), kayıt ekleme, geri alma (undo) ve ürün detaylarını el ile güncelleme
"""
import datetime
from backend.services.db.connection import db_session
from backend.utils.text_utils import clean_barcode_text, parse_price, format_product_dict

def record_product_history(
    conn,
    barcode: str,
    event_type: str,
    old_title: str = None,
    new_title: str = None,
    old_price: float = None,
    new_price: float = None,
    diff_amount: float = 0.0,
    diff_percent: float = 0.0,
    source: str = "Sistem",
    device_name: str = "Ana PC",
    details: str = "",
    sync_id: int = None,
    timestamp: str = None
) -> int:
    """Ürünle ilgili tüm isim, fiyat, baskı ve düzenleme olaylarını tarihçeye işler."""
    if not barcode:
        return 0
    now_str = timestamp or datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO product_history (
            sync_id, barcode, event_type, old_title, new_title,
            old_price, new_price, diff_amount, diff_percent,
            source, device_name, details, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, (
        sync_id, clean_barcode_text(barcode), event_type, old_title, new_title,
        old_price, new_price, diff_amount, diff_percent,
        source, device_name, details, now_str
    ))
    return cursor.lastrowid

def get_full_product_history(barcode: str, limit: int = 100) -> list:
    """Belirtilen barkodun tüm geçmiş hareketlerini döner."""
    if not barcode:
        return []
    b = clean_barcode_text(barcode)
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, sync_id, barcode, event_type, old_title, new_title,
                   old_price, new_price, diff_amount, diff_percent,
                   source, device_name, details, created_at
            FROM product_history
            WHERE barcode = ?
            ORDER BY id DESC
            LIMIT ?;
        """, (b, limit))
        rows = cursor.fetchall()
        
        history = [dict(r) for r in rows]
        if not history:
            cursor.execute("""
                SELECT id, sync_id, barcode, 'price_change' as event_type,
                       title as old_title, title as new_title,
                       old_price, new_price, diff_amount, diff_percent,
                       source_device as source, source_device as device_name,
                       'Fiyat Değişimi' as details, changed_at as created_at
                FROM vegawin_price_changes
                WHERE barcode = ?
                ORDER BY id DESC
                LIMIT ?;
            """, (b, limit))
            history = [dict(r) for r in cursor.fetchall()]

        return history

def revert_product_history(history_id: int) -> dict:
    """Belirli bir geçmiş kaydındaki önceki duruma (eski isim / eski fiyat) geri döner."""
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM product_history WHERE id = ?;", (history_id,))
        hist = cursor.fetchone()
        if not hist:
            return {"success": False, "message": "Geçmiş kaydı bulunamadı."}

        hist_dict = dict(hist)
        barcode = hist_dict["barcode"]
        cursor.execute("SELECT * FROM urunler WHERE barcode = ?;", (barcode,))
        current = cursor.fetchone()
        if not current:
            return {"success": False, "message": "Ürün veritabanında bulunamadı."}

        curr_dict = dict(current)
        curr_price = parse_price(curr_dict.get("price"))
        target_title = hist_dict["old_title"] if hist_dict.get("old_title") else curr_dict["title"]
        target_price = parse_price(hist_dict["old_price"]) if hist_dict.get("old_price") is not None else curr_price

        cursor.execute("""
            UPDATE urunler 
            SET title = ?, price = ?, updated_at = ?, price_updated_at = ?
            WHERE barcode = ?;
        """, (target_title, target_price, now_str, now_str, barcode))

        record_product_history(
            conn,
            barcode=barcode,
            event_type="restored",
            old_title=curr_dict["title"],
            new_title=target_title,
            old_price=curr_price,
            new_price=target_price,
            diff_amount=round(target_price - curr_price, 2),
            source="Geri Alma (Undo)",
            device_name="Ana PC",
            details=f"Geçmiş #{history_id} kaydındaki duruma geri dönüldü.",
            timestamp=now_str
        )

        cursor.execute("SELECT * FROM urunler WHERE barcode = ?;", (barcode,))
        updated_prod = format_product_dict(cursor.fetchone())
        return {
            "success": True,
            "product": updated_prod,
            "message": f"{barcode} barkodlu ürün başarıyla önceki durumuna ({target_title} - {target_price:.2f} TL) döndürüldü."
        }

def update_product_details(barcode: str, title: str = None, price: float = None, brand: str = None, unit: str = None, device_name: str = "Ana PC") -> dict:
    """Ürün adı veya fiyatını el ile günceller / yeni ürünse ekler ve her değişikliği audit geçmişine kaydeder."""
    b = clean_barcode_text(barcode)
    if not b:
        return {"success": False, "message": "Geçersiz barkod."}

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM urunler WHERE barcode = ?;", (b,))
        current = cursor.fetchone()
        
        # 1. Durum: Ürün veritabanında henüz kayıtlı DEĞİLSE -> Yeni Ürün Olarak Ekle ve 0 -> Yeni Fiyat Kaydı At
        if not current:
            new_t = title.strip() if title and title.strip() else f"Yeni Ürün ({b})"
            new_p = float(price) if price is not None else 0.0
            new_b = brand.strip() if brand is not None else ""
            new_u = unit.strip() if unit is not None else "ADET"

            cursor.execute("""
                INSERT INTO urunler (
                    barcode, stock_code, title, raw_system_title, price, label_price,
                    brand, unit, source_device, is_new, is_blacklisted,
                    created_at, updated_at, price_updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                b, b, new_t, new_t, new_p, 0.0,
                new_b, new_u, device_name, 1, 0,
                now_str, now_str, now_str
            ))

            diff_amt = new_p
            diff_pct = 100.0 if new_p > 0 else 0.0
            dev_lower = (device_name or "").lower()
            source_label = "Mobil Reyon Terminali" if ("mobil" in dev_lower or "qr" in dev_lower or "kamera" in dev_lower) else "Masaüstü Yeni Kayıt"

            record_product_history(
                conn,
                barcode=b,
                event_type="new_product",
                old_title="",
                new_title=new_t,
                old_price=0.0,
                new_price=new_p,
                diff_amount=diff_amt,
                diff_percent=diff_pct,
                source=source_label,
                device_name=device_name,
                details=f"Yeni ürün kaydedildi. (Fiyat: 0.00 TL -> {new_p:.2f} TL)",
                timestamp=now_str
            )

            cursor.execute("SELECT * FROM urunler WHERE barcode = ?;", (b,))
            return {
                "success": True,
                "product": format_product_dict(cursor.fetchone()),
                "message": "Yeni ürün başarıyla kaydedildi ve fiyat değişim geçmişine eklendi."
            }

        # 2. Durum: Mevcut Ürün Güncelleme
        curr_dict = dict(current)
        old_title = curr_dict["title"]
        old_price = float(curr_dict["price"] or 0)

        new_t = title.strip() if title and title.strip() else old_title
        new_p = float(price) if price is not None else old_price
        new_b = brand.strip() if brand is not None else curr_dict.get("brand", "")
        new_u = unit.strip() if unit is not None else curr_dict.get("unit", "ADET")

        has_title_change = (new_t != old_title)
        has_price_change = (abs(new_p - old_price) > 0.001)

        cursor.execute("""
            UPDATE urunler
            SET title = ?, price = ?, brand = ?, unit = ?, updated_at = ?,
                price_updated_at = CASE WHEN ? THEN ? ELSE price_updated_at END
            WHERE barcode = ?;
        """, (new_t, new_p, new_b, new_u, now_str, has_price_change, now_str, b))

        if has_title_change or has_price_change:
            event_type = "price_change" if has_price_change and not has_title_change else ("title_change" if has_title_change and not has_price_change else "manual_edit")
            diff_amt = round(new_p - old_price, 2)
            diff_pct = round((diff_amt / old_price * 100) if old_price > 0 else (100.0 if new_p > 0 else 0.0), 1)

            dev_lower = (device_name or "").lower()
            source_label = "Mobil Reyon Terminali" if ("mobil" in dev_lower or "qr" in dev_lower or "kamera" in dev_lower) else "Kullanıcı Düzenleme"

            record_product_history(
                conn,
                barcode=b,
                event_type=event_type,
                old_title=old_title if has_title_change else None,
                new_title=new_t if has_title_change else None,
                old_price=old_price if has_price_change else None,
                new_price=new_p if has_price_change else None,
                diff_amount=diff_amt,
                diff_percent=diff_pct,
                source=source_label,
                device_name=device_name,
                details="Kullanıcı tarafından el ile güncellendi.",
                timestamp=now_str
            )

        cursor.execute("SELECT * FROM urunler WHERE barcode = ?;", (b,))
        return {
            "success": True,
            "product": format_product_dict(cursor.fetchone()),
            "message": "Ürün bilgileri başarıyla güncellendi."
        }
