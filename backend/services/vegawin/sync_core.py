# -*- coding: utf-8 -*-
"""
🔄 VegaWin Sync & Price Changes Core
Fiyat değişimleri, ürün karşılaştırması ve veritabanı senkronizasyon mantığı
"""
import datetime
from backend.services.db_service import (
    db_session, init_db, clean_barcode_text, record_product_history, clean_product_title
)
from backend.utils.text_utils import (
    parse_price, fix_turkish_corrupted_chars, is_invalid_or_blacklisted_product, resolve_price_update_timestamp
)

def preview_vegawin_comparison(items: list) -> dict:
    """Yüklenen ürünleri mevcut veritabanı ile karşılaştırır ve özet bilgi üretir."""
    if not items:
        return {"success": False, "message": "Ürün listesi boş."}

    init_db()

    existing_products = {}
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT barcode, title, price, brand, stock_code, label_price, price_updated_at, updated_at FROM urunler;")
        for r in cursor.fetchall():
            existing_products[r["barcode"]] = dict(r)

    comparison_list = []
    price_change_count = 0
    price_increase_count = 0
    price_decrease_count = 0
    new_product_count = 0
    unchanged_count = 0
    title_change_count = 0

    for item in items:
        b = clean_barcode_text(item.get("barcode"))
        if not b:
            continue

        raw_t = item.get("title", "")
        clean_t = clean_product_title(raw_t)
        p = parse_price(item.get("price"))
        sc = str(item.get("stock_code") or "").strip()
        brand = fix_turkish_corrupted_chars(str(item.get("brand") or "").strip())
        unit = str(item.get("unit") or "ADET").strip()

        if is_invalid_or_blacklisted_product(b, clean_t, p) or is_invalid_or_blacklisted_product(b, raw_t, p):
            continue

        if b in existing_products:
            old = existing_products[b]
            old_p = parse_price(old.get("price"))
            old_t = old.get("title", "")

            has_price_diff = abs(old_p - p) > 0.001
            has_title_diff = (old_t != clean_t)

            if has_price_diff:
                price_change_count += 1
                diff_amt = round(p - old_p, 2)
                diff_pct = round((diff_amt / old_p * 100) if old_p > 0 else 0, 1)
                
                if p > old_p:
                    price_increase_count += 1
                else:
                    price_decrease_count += 1

                comparison_list.append({
                    "status": "price_change",
                    "barcode": b,
                    "title": clean_t or old_t,
                    "old_title": old_t,
                    "stock_code": sc,
                    "brand": brand,
                    "old_price": old_p,
                    "new_price": p,
                    "diff_amount": diff_amt,
                    "diff_percent": diff_pct
                })
            elif has_title_diff:
                title_change_count += 1
                comparison_list.append({
                    "status": "title_change",
                    "barcode": b,
                    "title": clean_t,
                    "old_title": old_t,
                    "stock_code": sc,
                    "brand": brand,
                    "old_price": old_p,
                    "new_price": p,
                    "diff_amount": 0.0,
                    "diff_percent": 0.0
                })
            else:
                unchanged_count += 1
        else:
            new_product_count += 1
            comparison_list.append({
                "status": "new",
                "barcode": b,
                "title": clean_t,
                "old_title": "",
                "stock_code": sc,
                "brand": brand,
                "old_price": 0.0,
                "new_price": p,
                "diff_amount": p,
                "diff_percent": 100.0 if p > 0 else 0.0
            })

    return {
        "success": True,
        "total_incoming": len(items),
        "total_in_db": len(existing_products),
        "price_change_count": price_change_count,
        "price_increase_count": price_increase_count,
        "price_decrease_count": price_decrease_count,
        "new_product_count": new_product_count,
        "title_change_count": title_change_count,
        "unchanged_count": unchanged_count,
        "items": comparison_list
    }

def apply_vegawin_sync(items: list, device_name: str = "VegaWin Entegrasyonu") -> dict:
    """VegaWin veya dükkan veritabanından gelen ürün listesini uygular ve detaylı değişim raporu üretir."""
    if not items:
        return {"success": False, "message": "Uygulanacak ürün listesi boş."}

    init_db()
    now_dt = datetime.datetime.now()
    now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")

    sync_id = f"vegasync_{int(now_dt.timestamp())}"

    existing_products = {}
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT barcode, title, price, brand, stock_code, label_price, price_updated_at, updated_at FROM urunler;")
        for r in cursor.fetchall():
            existing_products[r["barcode"]] = dict(r)

    price_changes = []
    new_count = 0
    price_change_count = 0
    title_change_count = 0
    unchanged_count = 0

    with db_session() as conn:
        cursor = conn.cursor()

        # Sync Master Kaydı
        cursor.execute("""
        INSERT INTO vegawin_sync_history (sync_id, sync_date, total_products, new_count, price_changed_count, source_device)
        VALUES (?, ?, ?, 0, 0, ?);
        """, (sync_id, now_str, len(items), device_name))

        for item in items:
            b = clean_barcode_text(item.get("barcode"))
            if not b:
                continue

            raw_t = item.get("title", "")
            clean_t = clean_product_title(raw_t)
            p = parse_price(item.get("price"))
            sc = str(item.get("stock_code") or "").strip()
            brand = fix_turkish_corrupted_chars(str(item.get("brand") or "").strip())
            unit = str(item.get("unit") or "ADET").strip()

            if is_invalid_or_blacklisted_product(b, clean_t, p) or is_invalid_or_blacklisted_product(b, raw_t, p):
                continue

            if b in existing_products:
                old = existing_products[b]
                old_p = parse_price(old.get("price"))
                old_t = old.get("title", "")

                has_price_diff = abs(old_p - p) > 0.001
                has_title_diff = (old_t != clean_t)

                if has_price_diff:
                    price_change_count += 1
                    diff_amt = round(p - old_p, 2)
                    diff_pct = round((diff_amt / old_p * 100) if old_p > 0 else 0, 1)

                    # 🕒 Fiyat Güncelleme Tarihi Kuralı:
                    # Öncelik bu bilgisayarın anlık yerel saatidir. Eğer gelen tarih daha yeni ise o kullanılır.
                    item_date = resolve_price_update_timestamp(
                        item.get("price_updated_at") or item.get("date"),
                        old.get("price_updated_at") or old.get("updated_at")
                    )

                    price_changes.append({
                        "sync_id": sync_id,
                        "barcode": b,
                        "title": clean_t or old_t,
                        "old_price": old_p,
                        "new_price": p,
                        "diff_amount": diff_amt,
                        "diff_percent": diff_pct,
                        "changed_at": item_date
                    })

                    cursor.execute("""
                    INSERT INTO vegawin_price_changes (sync_id, barcode, title, old_price, new_price, diff_amount, diff_percent, changed_at, source_device)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """, (sync_id, b, clean_t or old_t, old_p, p, diff_amt, diff_pct, item_date, device_name))

                    cursor.execute("""
                    UPDATE urunler 
                    SET title = ?, price = ?, price_num = ?, stock_code = COALESCE(NULLIF(?, ''), stock_code), 
                        brand = COALESCE(NULLIF(?, ''), brand), updated_at = ?, price_updated_at = ?, 
                        label_price = COALESCE(label_price, ?), is_archived = 0, archived_at = NULL
                    WHERE barcode = ?;
                    """, (clean_t or old_t, str(p), p, sc, brand, now_str, item_date, old_p, b))

                    record_product_history(
                        conn,
                        barcode=b,
                        event_type="price_change",
                        old_title=old_t,
                        new_title=clean_t or old_t,
                        old_price=old_p,
                        new_price=p,
                        diff_amount=diff_amt,
                        diff_percent=diff_pct,
                        source="VegaWin Aktarımı",
                        device_name=device_name,
                        details=f"Fiyat değişimi ({old_p:.2f} TL -> {p:.2f} TL)",
                        sync_id=sync_id,
                        timestamp=item_date
                    )
                elif has_title_diff:
                    title_change_count += 1
                    cursor.execute("""
                    UPDATE urunler 
                    SET title = ?, stock_code = COALESCE(NULLIF(?, ''), stock_code), 
                        brand = COALESCE(NULLIF(?, ''), brand), updated_at = ?
                    WHERE barcode = ?;
                    """, (clean_t or old_t, sc, brand, now_str, b))

                    record_product_history(
                        conn,
                        barcode=b,
                        event_type="title_change",
                        old_title=old_t,
                        new_title=clean_t or old_t,
                        source="VegaWin Aktarımı",
                        device_name=device_name,
                        details="Ürün ismi güncellendi",
                        sync_id=sync_id,
                        timestamp=now_str
                    )
                else:
                    unchanged_count += 1
            else:
                new_count += 1
                item_date = resolve_price_update_timestamp(
                    item.get("price_updated_at") or item.get("date"),
                    None
                )
                cursor.execute("""
                INSERT INTO urunler (barcode, stock_code, title, price, label_price, brand, unit, is_new, created_at, updated_at, price_updated_at)
                VALUES (?, ?, ?, ?, NULL, ?, ?, 1, ?, ?, ?);
                """, (b, sc, clean_t, p, brand, unit, now_str, now_str, item_date))

                # Tekrarlayan barkodların aynı batch içinde çökmesini engelle
                existing_products[b] = {
                    "barcode": b,
                    "title": clean_t,
                    "price": p,
                    "brand": brand,
                    "stock_code": sc,
                    "label_price": None,
                    "price_updated_at": item_date,
                    "updated_at": now_str
                }

                cursor.execute("""
                INSERT INTO vegawin_new_products (sync_id, barcode, title, price, created_at, source_device)
                VALUES (?, ?, ?, ?, ?, ?);
                """, (sync_id, b, clean_t, p, now_str, device_name))

                record_product_history(
                    conn,
                    barcode=b,
                    event_type="created",
                    new_title=clean_t,
                    new_price=p,
                    source="VegaWin Aktarımı",
                    device_name=device_name,
                    details="Yeni ürün VegaWin dosyasından eklendi",
                    sync_id=sync_id,
                    timestamp=now_str
                )

        cursor.execute("""
        UPDATE vegawin_sync_history 
        SET total_products = ?, new_products = ?, updated_products = ?, price_changes_count = ?, status = 'success'
        WHERE id = ?;
        """, (len(items), new_count, price_change_count + title_change_count, price_change_count, sync_id))

    return {
        "success": True,
        "sync_id": sync_id,
        "total_received": len(items),
        "new_products": new_count,
        "price_changes_count": price_change_count,
        "title_changes_count": title_change_count,
        "unchanged_count": unchanged_count,
        "price_changes": price_changes[:100],
        "message": f"Senkronizasyon tamamlandı: {len(items)} ürün işlendi ({price_change_count} fiyat değişimi, {new_count} yeni ürün)."
    }

def get_price_changes_list(unprinted_only=False, limit=200):
    with db_session() as conn:
        cursor = conn.cursor()
        if unprinted_only:
            cursor.execute("SELECT * FROM vegawin_price_changes WHERE is_printed = 0 ORDER BY id DESC LIMIT ?;", (limit,))
        else:
            cursor.execute("SELECT * FROM vegawin_price_changes ORDER BY id DESC LIMIT ?;", (limit,))
        return [dict(r) for r in cursor.fetchall()]

def mark_changes_as_printed(change_ids=None):
    with db_session() as conn:
        cursor = conn.cursor()
        if change_ids:
            placeholders = ",".join("?" for _ in change_ids)
            cursor.execute(f"UPDATE vegawin_price_changes SET is_printed = 1 WHERE id IN ({placeholders});", change_ids)
        else:
            cursor.execute("UPDATE vegawin_price_changes SET is_printed = 1 WHERE is_printed = 0;")

def sync_vegawin_items(items: list, source_name: str = "VegaWin Dosyası", device_name: str = "VegaWin PC") -> dict:
    """Geriye dönük uyumluluk takma adı (alias) -> apply_vegawin_sync."""
    return apply_vegawin_sync(items, device_name=device_name)
