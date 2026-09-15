# -*- coding: utf-8 -*-
"""
🔄 Sync Repository
VegaWin senkronizasyon geçmişi, toplu rollback, doğrudan DB aktarımı ve clipboard toplu güncelleme
"""
import os
import sqlite3
import datetime
from backend.config import DB_PATH
from backend.services.db.connection import db_session
from backend.services.db.schema import init_db
from backend.services.db.history_repo import record_product_history
from backend.utils.text_utils import (
    clean_barcode_text, clean_product_title, parse_price, fix_turkish_corrupted_chars, is_invalid_or_blacklisted_product
)

def get_sync_history_list(limit: int = 50) -> list:
    """Geçmiş VegaWin aktarımlarını listeler."""
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, timestamp, source_file, device_name, total_products,
                   updated_products, new_products, price_changes_count, status
            FROM vegawin_sync_history
            ORDER BY id DESC
            LIMIT ?;
        """, (limit,))
        return [dict(r) for r in cursor.fetchall()]

def rollback_sync_batch(sync_id: int) -> dict:
    """Bir VegaWin senkronizasyonundaki tüm değişiklikleri tek hamlede geri alır."""
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vegawin_sync_history WHERE id = ?;", (sync_id,))
        sync_rec = cursor.fetchone()
        if not sync_rec:
            return {"success": False, "message": "Senkronizasyon kaydı bulunamadı."}

        sync_dict = dict(sync_rec)
        if sync_dict.get("status") == "rolled_back":
            return {"success": False, "message": "Bu senkronizasyon zaten daha önce geri alınmış."}

        cursor.execute("SELECT * FROM vegawin_price_changes WHERE sync_id = ?;", (sync_id,))
        changes = [dict(r) for r in cursor.fetchall()]
        reverted_count = 0

        for ch in changes:
            b = ch["barcode"]
            old_p = parse_price(ch.get("old_price"))
            new_p = parse_price(ch.get("new_price"))
            cursor.execute("UPDATE urunler SET price = ?, updated_at = ?, price_updated_at = ? WHERE barcode = ?;", (old_p, now_str, now_str, b))
            reverted_count += 1

            record_product_history(
                conn,
                barcode=b,
                event_type="restored",
                old_price=new_p,
                new_price=old_p,
                diff_amount=round(old_p - new_p, 2),
                source="Toplu Geri Alma (Rollback)",
                device_name="Ana PC",
                details=f"#{sync_id} numaralı senkronizasyon geri alındı.",
                sync_id=sync_id,
                timestamp=now_str
            )

        cursor.execute("SELECT barcode FROM vegawin_new_products WHERE sync_id = ?;", (sync_id,))
        new_items = [r["barcode"] for r in cursor.fetchall()]
        deleted_new_count = 0
        for nb in new_items:
            cursor.execute("DELETE FROM urunler WHERE barcode = ?;", (nb,))
            deleted_new_count += 1
            record_product_history(
                conn,
                barcode=nb,
                event_type="deleted",
                source="Toplu Geri Alma (Rollback)",
                device_name="Ana PC",
                details=f"#{sync_id} numaralı senkronizasyon geri alındığından yeni eklenen ürün kaldırıldı.",
                sync_id=sync_id,
                timestamp=now_str
            )

        cursor.execute("UPDATE vegawin_sync_history SET status = 'rolled_back' WHERE id = ?;", (sync_id,))

        return {
            "success": True,
            "sync_id": sync_id,
            "reverted_count": reverted_count,
            "deleted_new_count": deleted_new_count,
            "message": f"#{sync_id} numaralı aktarım başarıyla geri alındı ({reverted_count} ürün eski fiyatına döndürüldü, {deleted_new_count} yeni ürün kaldırıldı)."
        }

def preview_from_source_db(source_db_path: str = None, device_name: str = "Dükkan Bilgisayarı") -> dict:
    """Dükkan / Kasa bilgisayarındaki veritabanını okur ve karşılaştırma önizlemesi üretir."""
    init_db()
    possible_paths = [
        source_db_path,
        os.path.abspath(os.path.join(os.path.dirname(DB_PATH), "..", "..", "OYMAPOS Barkod Sistemi", "data", "market_sistemi.db")),
        r"C:\Users\User\Desktop\OYMAPOS Barkod Sistemi\data\market_sistemi.db",
        r"C:\OYMAPOS Barkod Sistemi\data\market_sistemi.db",
        r"D:\OYMAPOS Barkod Sistemi\data\market_sistemi.db",
    ]
    target_path = None
    for p in possible_paths:
        if p and os.path.isfile(p):
            target_path = p
            break

    if not target_path:
        return {"success": False, "message": "Dükkan bilgisayarı veritabanı (market_sistemi.db) bulunamadı."}

    try:
        src_conn = sqlite3.connect(target_path)
        src_conn.row_factory = sqlite3.Row
        src_cursor = src_conn.cursor()
        src_cursor.execute("SELECT * FROM urunler;")
        src_rows = src_cursor.fetchall()
        src_conn.close()
    except Exception as e:
        return {"success": False, "message": f"Dükkan veritabanı okunamadı: {e}"}

    if not src_rows:
        return {"success": False, "message": "Dükkan veritabanında kayıtlı ürün bulunamadı."}

    existing_map = {}
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT barcode, title, price, brand, stock_code, label_price FROM urunler;")
        for r in cursor.fetchall():
            existing_map[r["barcode"]] = dict(r)

    comparison_list = []
    parsed_items = []
    price_change_count = 0
    new_product_count = 0
    identical_count = 0
    title_change_count = 0

    for r in src_rows:
        d = dict(r)
        b = clean_barcode_text(d.get("barcode", ""))
        if not b:
            continue

        raw_t = str(d.get("title") or d.get("title1") or "").strip()
        t = clean_product_title(raw_t)
        p = parse_price(d.get("price"))
        sc = str(d.get("stock_code") or "").strip()
        brand = fix_turkish_corrupted_chars(str(d.get("brand") or "").strip())
        unit = str(d.get("unit") or "ADET").strip()

        parsed_items.append({
            "barcode": b,
            "stock_code": sc,
            "title": t,
            "price": p,
            "brand": brand,
            "unit": unit
        })

        if b in existing_map:
            main_p = existing_map[b]
            main_price = parse_price(main_p.get("price") or 0)
            main_title = str(main_p.get("title") or "").strip()

            has_price_diff = abs(main_price - p) > 0.001
            has_title_diff = (main_title != t)

            if has_price_diff:
                diff_amt = round(p - main_price, 2)
                diff_pct = round((diff_amt / main_price * 100) if main_price > 0 else 0, 1)
                status = "price_change"
                price_change_count += 1
            elif has_title_diff:
                diff_amt = 0.0
                diff_pct = 0.0
                status = "title_change"
                title_change_count += 1
            else:
                diff_amt = 0.0
                diff_pct = 0.0
                status = "identical"
                identical_count += 1

            comparison_list.append({
                "barcode": b,
                "stock_code": sc or main_p.get("stock_code", ""),
                "main_title": main_title,
                "incoming_title": t,
                "main_price": main_price,
                "incoming_price": p,
                "diff_amount": diff_amt,
                "diff_percent": diff_pct,
                "status": status,
                "brand": brand or main_p.get("brand", ""),
                "unit": unit
            })
        else:
            status = "new_product"
            new_product_count += 1
            comparison_list.append({
                "barcode": b,
                "stock_code": sc,
                "main_title": "— (Ana Sistemde Yok)",
                "incoming_title": t,
                "main_price": None,
                "incoming_price": p,
                "diff_amount": 0.0,
                "diff_percent": 0.0,
                "status": status,
                "brand": brand,
                "unit": unit
            })

    priority = {"price_change": 0, "new_product": 1, "title_change": 2, "identical": 3}
    comparison_list.sort(key=lambda x: (priority.get(x["status"], 99), x["incoming_title"]))

    return {
        "success": True,
        "source_db_path": target_path,
        "source_db_name": os.path.basename(target_path),
        "source_filename": f"Dükkan Veritabanı ({os.path.basename(target_path)})",
        "device_name": device_name,
        "total_incoming": len(parsed_items),
        "total_items": len(parsed_items),
        "price_changes": price_change_count,
        "price_change_count": price_change_count,
        "new_products": new_product_count,
        "new_product_count": new_product_count,
        "title_changes": title_change_count,
        "title_change_count": title_change_count,
        "identical": identical_count,
        "identical_count": identical_count,
        "items": comparison_list,
        "parsed_items": parsed_items
    }

def import_all_from_source_db(source_db_path: str = None, device_name: str = "Dükkan Bilgisayarı") -> dict:
    """Dükkan / Kasa bilgisayarındaki veritabanından tüm güncel ürün ve fiyatları aktarır."""
    init_db()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    possible_paths = [
        source_db_path,
        os.path.abspath(os.path.join(os.path.dirname(DB_PATH), "..", "..", "OYMAPOS Barkod Sistemi", "data", "market_sistemi.db")),
        r"C:\Users\User\Desktop\OYMAPOS Barkod Sistemi\data\market_sistemi.db",
        r"C:\OYMAPOS Barkod Sistemi\data\market_sistemi.db",
        r"D:\OYMAPOS Barkod Sistemi\data\market_sistemi.db",
    ]
    target_path = None
    for p in possible_paths:
        if p and os.path.isfile(p):
            target_path = p
            break

    if not target_path:
        return {"success": False, "message": "Dükkan bilgisayarı veritabanı (market_sistemi.db) bulunamadı."}

    try:
        src_conn = sqlite3.connect(target_path)
        src_conn.row_factory = sqlite3.Row
        src_cursor = src_conn.cursor()
        src_cursor.execute("SELECT * FROM urunler;")
        src_rows = src_cursor.fetchall()
        src_conn.close()
    except Exception as e:
        return {"success": False, "message": f"Dükkan veritabanı okunamadı: {e}"}

    if not src_rows:
        return {"success": False, "message": "Dükkan veritabanında kayıtlı ürün bulunamadı."}

    existing_map = {}
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT barcode, title, price, brand, label_price FROM urunler;")
        for r in cursor.fetchall():
            existing_map[r["barcode"]] = dict(r)

    new_count = 0
    price_change_count = 0
    title_change_count = 0
    unchanged_count = 0
    price_changes = []

    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO vegawin_sync_history (timestamp, source_file, device_name, total_products, status)
        VALUES (?, ?, ?, ?, 'processing');
        """, (now_str, f"Doğrudan DB Aktarımı ({os.path.basename(target_path)})", device_name, len(src_rows)))
        sync_id = cursor.lastrowid

        for r in src_rows:
            d = dict(r)
            b = clean_barcode_text(d.get("barcode", ""))
            if not b:
                continue

            raw_t = str(d.get("title") or d.get("title1") or "").strip()
            t = clean_product_title(raw_t)
            p = parse_price(d.get("price"))
            sc = str(d.get("stock_code") or "").strip()
            brand = fix_turkish_corrupted_chars(str(d.get("brand") or "").strip())
            unit = str(d.get("unit") or "ADET").strip()

            if b in existing_map:
                old = existing_map[b]
                old_p = parse_price(old.get("price"))
                old_t = str(old.get("title") or "")

                has_price_diff = abs(old_p - p) > 0.001
                has_title_diff = (old_t != t)

                if has_price_diff:
                    price_change_count += 1
                    diff_amt = round(p - old_p, 2)
                    diff_pct = round((diff_amt / old_p * 100) if old_p > 0 else 0, 1)

                    price_changes.append({
                        "sync_id": sync_id,
                        "barcode": b,
                        "title": t,
                        "old_price": old_p,
                        "new_price": p,
                        "diff_amount": diff_amt,
                        "diff_percent": diff_pct,
                        "changed_at": now_str
                    })

                    cursor.execute("""
                    INSERT INTO vegawin_price_changes (sync_id, barcode, title, old_price, new_price, diff_amount, diff_percent, changed_at, source_device)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """, (sync_id, b, t, old_p, p, diff_amt, diff_pct, now_str, device_name))

                    cursor.execute("""
                    UPDATE urunler 
                    SET title = ?, price = ?, stock_code = COALESCE(NULLIF(?, ''), stock_code), 
                        brand = COALESCE(NULLIF(?, ''), brand), updated_at = ?, price_updated_at = ?, 
                        label_price = COALESCE(label_price, ?)
                    WHERE barcode = ?;
                    """, (t, p, sc, brand, now_str, now_str, old_p, b))

                    record_product_history(
                        conn,
                        barcode=b,
                        event_type="price_change",
                        old_title=old_t,
                        new_title=t,
                        old_price=old_p,
                        new_price=p,
                        diff_amount=diff_amt,
                        diff_percent=diff_pct,
                        source="Dükkan DB Aktarımı",
                        device_name=device_name,
                        details="Dükkan PC'sinden doğrudan veri gönderildi",
                        sync_id=sync_id,
                        timestamp=now_str
                    )
                elif has_title_diff:
                    title_change_count += 1
                    cursor.execute("""
                    UPDATE urunler 
                    SET title = ?, stock_code = COALESCE(NULLIF(?, ''), stock_code), 
                        brand = COALESCE(NULLIF(?, ''), brand), updated_at = ?
                    WHERE barcode = ?;
                    """, (t, sc, brand, now_str, b))

                    record_product_history(
                        conn,
                        barcode=b,
                        event_type="title_change",
                        old_title=old_t,
                        new_title=t,
                        source="Dükkan DB Aktarımı",
                        device_name=device_name,
                        details="Ürün ismi güncellendi",
                        sync_id=sync_id,
                        timestamp=now_str
                    )
                else:
                    unchanged_count += 1
            else:
                new_count += 1
                cursor.execute("""
                INSERT INTO urunler (barcode, stock_code, title, price, label_price, brand, unit, is_new, created_at, updated_at, price_updated_at)
                VALUES (?, ?, ?, ?, NULL, ?, ?, 1, ?, ?, ?);
                """, (b, sc, t, p, brand, unit, now_str, now_str, now_str))

                # Tekrarlayan barkodların aynı batch içinde çökmesini engelle
                existing_map[b] = {
                    "barcode": b,
                    "title": t,
                    "price": p,
                    "brand": brand,
                    "stock_code": sc,
                    "label_price": None
                }

                cursor.execute("""
                INSERT INTO vegawin_new_products (sync_id, barcode, title, price, created_at, source_device)
                VALUES (?, ?, ?, ?, ?, ?);
                """, (sync_id, b, t, p, now_str, device_name))

                record_product_history(
                    conn,
                    barcode=b,
                    event_type="created",
                    new_title=t,
                    new_price=p,
                    source="Dükkan DB Aktarımı",
                    device_name=device_name,
                    details="Yeni ürün dükkan veritabanından aktarıldı",
                    sync_id=sync_id,
                    timestamp=now_str
                )

        cursor.execute("""
        UPDATE vegawin_sync_history 
        SET total_products = ?, new_products = ?, updated_products = ?, price_changes_count = ?, status = 'success'
        WHERE id = ?;
        """, (len(src_rows), new_count, price_change_count + title_change_count, price_change_count, sync_id))

    return {
        "success": True,
        "sync_id": sync_id,
        "source_db": target_path,
        "total_source_products": len(src_rows),
        "new_products": new_count,
        "price_changes_count": price_change_count,
        "title_changes_count": title_change_count,
        "unchanged_count": unchanged_count,
        "price_changes": price_changes[:100],
        "message": f"Dükkan bilgisayarından {len(src_rows)} ürün başarıyla aktarıldı ({price_change_count} fiyat değişimi, {new_count} yeni ürün)."
    }

def preview_clipboard_price_update(items: list, blacklisted_items: list = None, device_name: str = "Ana PC - Fiyat Güncelleme Masası") -> dict:
    """Veritabanına yazmadan önce önizleme ve hesaplama yapar."""
    if not items and not blacklisted_items:
        return {"success": False, "message": "Hesaplanacak ürün listesi boş."}

    init_db()
    blacklisted_items = blacklisted_items or []

    existing_map = {}
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT barcode, title, raw_system_title, price, brand, stock_code, label_price FROM urunler;")
        for r in cursor.fetchall():
            existing_map[r["barcode"]] = dict(r)

    new_count = 0
    price_change_count = 0
    title_change_count = 0
    unchanged_count = 0
    price_changes = []
    new_products_list = []

    for item in items:
        b = clean_barcode_text(item.get("barcode", ""))
        if not b:
            continue

        raw_t = str(item.get("title") or item.get("raw_system_title") or "").strip()
        clean_t = clean_product_title(raw_t)
        has_incoming_price = item.get("has_price", True) and item.get("price") is not None
        p = parse_price(item.get("price")) if has_incoming_price else None

        if b in existing_map:
            old = existing_map[b]
            old_p = parse_price(old.get("price"))
            old_t = str(old.get("title") or "")

            has_price_diff = has_incoming_price and (abs(old_p - p) > 0.001)
            has_title_diff = (old_t != clean_t) or (raw_t and raw_t != str(old.get("raw_system_title") or ""))

            if has_price_diff:
                price_change_count += 1
                diff_amt = round(p - old_p, 2)
                diff_pct = round((diff_amt / old_p * 100) if old_p > 0 else 0, 1)

                price_changes.append({
                    "barcode": b,
                    "title": clean_t or old_t,
                    "raw_system_title": raw_t,
                    "old_price": old_p,
                    "new_price": p,
                    "diff_amount": diff_amt,
                    "diff_percent": diff_pct
                })
            elif has_title_diff:
                title_change_count += 1
            else:
                unchanged_count += 1
        else:
            new_count += 1
            new_products_list.append({
                "barcode": b,
                "title": clean_t or raw_t,
                "price": p or 0.0,
                "unit": item.get("unit") or "ADET"
            })

    total_valid = len(items)
    total_blacklisted = len(blacklisted_items)
    total_raw = total_valid + total_blacklisted

    return {
        "success": True,
        "total_items": total_raw,
        "valid_items": total_valid,
        "new_products": new_count,
        "new_products_list": new_products_list,
        "price_changes_count": price_change_count,
        "title_changes_count": title_change_count,
        "unchanged_count": unchanged_count,
        "blacklisted_count": total_blacklisted,
        "blacklisted_items": blacklisted_items,
        "price_changes": price_changes,
        "message": f"Hesaplama Tamamlandı: {total_raw} satırdan {price_change_count} fiyat değişimi, {new_count} yeni ürün, {total_blacklisted} kara listede ürün tespit edildi."
    }

def update_products_by_clipboard_data(items: list, device_name: str = "Ana PC - Fiyat Güncelleme Masası", blacklisted_count: int = 0) -> dict:
    """Barkod numarasına göre ürünlerin fiyatını ve orijinal sistem adını günceller."""
    if not items:
        return {"success": False, "message": "Güncellenecek ürün listesi boş."}

    init_db()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    existing_map = {}
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT barcode, title, raw_system_title, price, brand, stock_code, label_price FROM urunler;")
        for r in cursor.fetchall():
            existing_map[r["barcode"]] = dict(r)

    new_count = 0
    price_change_count = 0
    title_change_count = 0
    unchanged_count = 0
    price_changes = []

    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO vegawin_sync_history (timestamp, source_file, device_name, total_products, status)
        VALUES (?, 'Fiyat Güncelleme Masası (Ctrl+V)', ?, ?, 'processing');
        """, (now_str, device_name, len(items)))
        sync_id = cursor.lastrowid

        for item in items:
            b = clean_barcode_text(item.get("barcode", ""))
            if not b:
                continue

            raw_t = str(item.get("title") or item.get("raw_system_title") or "").strip()
            clean_t = clean_product_title(raw_t)
            has_incoming_price = item.get("has_price", True) and item.get("price") is not None
            p = parse_price(item.get("price")) if has_incoming_price else None
            sc = str(item.get("stock_code") or "").strip()
            brand = fix_turkish_corrupted_chars(str(item.get("brand") or "").strip())
            unit = str(item.get("unit") or "ADET").strip()

            if is_invalid_or_blacklisted_product(b, clean_t, p or 0.0) or is_invalid_or_blacklisted_product(b, raw_t, p or 0.0):
                continue

            if b in existing_map:
                old = existing_map[b]
                old_p = parse_price(old.get("price"))
                old_t = str(old.get("title") or "")
                actual_p = p if has_incoming_price else old_p
                item_date = item.get("price_updated_at") or now_str

                has_price_diff = has_incoming_price and (abs(old_p - actual_p) > 0.001)
                has_title_diff = (old_t != clean_t) or (raw_t and raw_t != str(old.get("raw_system_title") or ""))

                if has_price_diff:
                    price_change_count += 1
                    diff_amt = round(actual_p - old_p, 2)
                    diff_pct = round((diff_amt / old_p * 100) if old_p > 0 else 0, 1)

                    price_changes.append({
                        "sync_id": sync_id,
                        "barcode": b,
                        "title": clean_t or old_t,
                        "raw_system_title": raw_t,
                        "old_price": old_p,
                        "new_price": actual_p,
                        "diff_amount": diff_amt,
                        "diff_percent": diff_pct,
                        "changed_at": item_date
                    })

                    cursor.execute("""
                    INSERT INTO vegawin_price_changes (sync_id, barcode, title, old_price, new_price, diff_amount, diff_percent, changed_at, source_device)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """, (sync_id, b, clean_t or old_t, old_p, actual_p, diff_amt, diff_pct, item_date, device_name))

                    cursor.execute("""
                    UPDATE urunler 
                    SET title = ?, raw_system_title = ?, price = ?, price_num = ?, stock_code = COALESCE(NULLIF(?, ''), stock_code), 
                        brand = COALESCE(NULLIF(?, ''), brand), unit = COALESCE(NULLIF(?, ''), unit), updated_at = ?, price_updated_at = ?, 
                        label_price = COALESCE(label_price, ?)
                    WHERE barcode = ?;
                    """, (clean_t or old_t, raw_t or clean_t or old_t, str(actual_p), actual_p, sc, brand, unit, now_str, item_date, old_p, b))

                    record_product_history(
                        conn,
                        barcode=b,
                        event_type="price_change",
                        old_title=old_t,
                        new_title=clean_t or old_t,
                        old_price=old_p,
                        new_price=actual_p,
                        diff_amount=diff_amt,
                        diff_percent=diff_pct,
                        source="Fiyat Güncelleme Masası",
                        device_name=device_name,
                        details=f"Fiyat güncellendi ({old_p:.2f} TL -> {actual_p:.2f} TL)",
                        sync_id=sync_id,
                        timestamp=item_date
                    )
                elif has_title_diff:
                    title_change_count += 1
                    cursor.execute("""
                    UPDATE urunler 
                    SET title = ?, raw_system_title = ?, stock_code = COALESCE(NULLIF(?, ''), stock_code), 
                        brand = COALESCE(NULLIF(?, ''), brand), unit = COALESCE(NULLIF(?, ''), unit), updated_at = ?
                    WHERE barcode = ?;
                    """, (clean_t or old_t, raw_t or clean_t or old_t, sc, brand, unit, now_str, b))

                    record_product_history(
                        conn,
                        barcode=b,
                        event_type="title_change",
                        old_title=old_t,
                        new_title=clean_t or old_t,
                        source="Fiyat Güncelleme Masası",
                        device_name=device_name,
                        details="Ürün ismi / Sistem adı güncellendi",
                        sync_id=sync_id,
                        timestamp=now_str
                    )
                else:
                    unchanged_count += 1
            else:
                new_count += 1
                item_date = item.get("price_updated_at") or now_str
                cursor.execute("""
                INSERT INTO urunler (barcode, stock_code, title, raw_system_title, price, price_num, label_price, brand, unit, is_new, created_at, updated_at, price_updated_at)
                VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, ?, ?, ?);
                """, (b, sc, clean_t, raw_t or clean_t, str(p or 0.0), p or 0.0, brand, unit, now_str, now_str, item_date))

                # Tekrarlayan barkodların aynı batch içinde çökmesini engelle
                existing_map[b] = {
                    "barcode": b,
                    "title": clean_t,
                    "raw_system_title": raw_t or clean_t,
                    "price": p,
                    "brand": brand,
                    "stock_code": sc,
                    "label_price": None
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
                    source="Fiyat Güncelleme Masası",
                    device_name=device_name,
                    details="Yeni ürün eklendi",
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
        "total_items": len(items),
        "new_products": new_count,
        "price_changes_count": price_change_count,
        "title_changes_count": title_change_count,
        "unchanged_count": unchanged_count,
        "blacklisted_count": blacklisted_count,
        "price_changes": price_changes[:100],
        "message": f"Toplam {len(items)} ürün işlendi ({price_change_count} fiyat değişimi, {new_count} yeni ürün, {blacklisted_count} kara listede ürün)."
    }

