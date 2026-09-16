# -*- coding: utf-8 -*-
"""
📦 Product Repository
Ürün sorgulama, arama, sayım, terazi barkodu çözme ve baskı zamanı güncelleme
"""
import re
import datetime
from typing import List, Dict, Optional, Any
from backend.services.db.connection import db_session
from backend.utils.text_utils import (
    fold_turkish_text, clean_barcode_text, decode_scale_barcode, format_product_dict, parse_price
)

def get_all_products(limit=None, offset=0, only_new=False, only_diff=False, only_blacklist=False, only_archived=False, blacklist_barcodes=None):
    with db_session() as conn:
        cursor = conn.cursor()
        clauses = []
        params = []
        if only_new:
            clauses.append("(is_new = 1 OR label_price IS NULL OR ABS(parse_price(price) - parse_price(COALESCE(label_price, 0))) > 0.001)")
        if only_diff:
            clauses.append("(is_new = 1 OR label_price IS NULL OR ABS(parse_price(price) - parse_price(COALESCE(label_price, 0))) > 0.001)")
        
        bl_list = list(blacklist_barcodes or [])
        if only_archived:
            clauses.append("COALESCE(is_archived, 0) = 1")
        elif only_blacklist:
            if bl_list:
                placeholders = ",".join("?" for _ in bl_list)
                clauses.append(f"(barcode IN ({placeholders}) OR is_blacklisted = 1)")
                params.extend(bl_list)
            else:
                clauses.append("is_blacklisted = 1")
        else:
            # Normal listelemede kara listedeki ve pasife/arşive alınmış ürünleri gizle
            clauses.append("COALESCE(is_archived, 0) = 0")
            if bl_list:
                placeholders = ",".join("?" for _ in bl_list)
                clauses.append(f"(barcode NOT IN ({placeholders}) AND COALESCE(is_blacklisted, 0) = 0)")
                params.extend(bl_list)
            else:
                clauses.append("COALESCE(is_blacklisted, 0) = 0")
        
        where_clause = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        if limit is not None and limit > 0:
            params.extend([limit, offset])
            cursor.execute(f"SELECT * FROM urunler {where_clause} ORDER BY title ASC LIMIT ? OFFSET ?;", tuple(params))
        else:
            cursor.execute(f"SELECT * FROM urunler {where_clause} ORDER BY title ASC;", tuple(params))
        return [format_product_dict(r) for r in cursor.fetchall()]

def search_products(query: str, limit=None, only_new=False, only_diff=False, only_blacklist=False, only_archived=False, blacklist_barcodes=None):
    cleaned_query = query.strip()
    if not cleaned_query:
        return get_all_products(limit=limit, only_new=only_new, only_diff=only_diff, only_blacklist=only_blacklist, only_archived=only_archived, blacklist_barcodes=blacklist_barcodes)
        
    tokens = [t for t in re.split(r'[\s\-_.,/]+', cleaned_query) if t]
    
    with db_session() as conn:
        cursor = conn.cursor()
        clauses = []
        params = []
        
        if only_new:
            clauses.append("(is_new = 1 OR label_price IS NULL OR ABS(parse_price(price) - parse_price(COALESCE(label_price, 0))) > 0.001)")
        if only_diff:
            clauses.append("(is_new = 1 OR label_price IS NULL OR ABS(parse_price(price) - parse_price(COALESCE(label_price, 0))) > 0.001)")
        
        bl_list = list(blacklist_barcodes or [])
        if only_archived:
            clauses.append("COALESCE(is_archived, 0) = 1")
        elif only_blacklist:
            if bl_list:
                placeholders = ",".join("?" for _ in bl_list)
                clauses.append(f"(barcode IN ({placeholders}) OR is_blacklisted = 1)")
                params.extend(bl_list)
            else:
                clauses.append("is_blacklisted = 1")
        else:
            clauses.append("COALESCE(is_archived, 0) = 0")
            if bl_list:
                placeholders = ",".join("?" for _ in bl_list)
                clauses.append(f"(barcode NOT IN ({placeholders}) AND COALESCE(is_blacklisted, 0) = 0)")
                params.extend(bl_list)
            else:
                clauses.append("COALESCE(is_blacklisted, 0) = 0")
            
        # Her bir arama kelimesi için şart ekle (AND mantığı)
        for token in tokens:
            norm_tok = fold_turkish_text(token)
            q_tok = f"%{norm_tok}%"
            clauses.append("""(
                barcode LIKE ? 
                OR fold_tr(COALESCE(title, '')) LIKE ? 
                OR fold_tr(COALESCE(brand, '')) LIKE ? 
                OR fold_tr(COALESCE(stock_code, '')) LIKE ?
            )""")
            params.extend([f"%{token}%", q_tok, q_tok, q_tok])
            
        where_clause = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        sql = f"SELECT * FROM urunler {where_clause} ORDER BY title ASC"
        if limit is not None and limit > 0:
            sql += " LIMIT ?;"
            params.append(limit)
        else:
            sql += ";"
            
        cursor.execute(sql, tuple(params))
        return [format_product_dict(r) for r in cursor.fetchall()]

def get_product_by_barcode(barcode: str):
    """
    Barkod veya ürün koduna göre anında arama yapar (OYMAPOS motoruyla 1-1 aynı).
    1. Tam barkod eşleşmesi (barcode = ?)
    2. Baştaki sıfırları atarak arama (ltrim 0)
    3. Stok kodu eşleşmesi (stock_code = ?)
    4. 20-29 serisi tüm terazi / şarküteri / manav barkodu ayrıştırma (PLU adayları)
    """
    if not barcode:
        return None
    b = clean_barcode_text(barcode)
    if not b:
        return None

    b_clean = b.lstrip('0') if b.isdigit() else b

    with db_session() as conn:
        cursor = conn.cursor()

        # 1. Aşama: Doğrudan Barkod Eşleşmesi
        cursor.execute("SELECT * FROM urunler WHERE barcode = ? LIMIT 1;", (b,))
        row = cursor.fetchone()
        if row:
            return format_product_dict(row)

        # 2. Aşama: Baştaki Sıfırları Atarak Arama (Örn: 0869... veya okuyucu varyasyonları)
        if b_clean and b_clean != b:
            cursor.execute("SELECT * FROM urunler WHERE barcode = ? OR ltrim(barcode, '0') = ? LIMIT 1;", (b_clean, b_clean))
            row = cursor.fetchone()
            if row:
                return format_product_dict(row)

        # 3. Aşama: Stok Kodu Eşleşmesi
        cursor.execute("SELECT * FROM urunler WHERE stock_code = ? OR ltrim(stock_code, '0') = ? LIMIT 1;", (b, b_clean))
        row = cursor.fetchone()
        if row:
            return format_product_dict(row)

        # 4. Aşama: Terazi / Manav Barkodu Kontrolü (20-29 serisi)
        scale_info = decode_scale_barcode(b)
        if scale_info:
            candidates = scale_info.get("plu_candidates", [])
            if not candidates and scale_info.get("plu_clean"):
                try:
                    candidates = [int(scale_info["plu_clean"])]
                except Exception:
                    pass

            # 4.a: manav_urunleri tablosu kontrolü
            for cand_plu in candidates:
                try:
                    cursor.execute("SELECT * FROM manav_urunleri WHERE plu = ? LIMIT 1;", (cand_plu,))
                    m_row = cursor.fetchone()
                    if m_row:
                        m_dict = dict(m_row)
                        u_price = parse_price(m_dict.get("price") or m_dict.get("scale_price") or 0.0)
                        title_val = m_dict.get("title") or m_dict.get("name") or f"Manav Ürünü (PLU: {cand_plu})"
                        weight_kg = scale_info.get("weight_kg")
                        embedded_price = scale_info.get("embedded_price")

                        final_price = u_price
                        summary_txt = f"{u_price:.2f} TL"
                        if scale_info.get("is_weight") and weight_kg is not None:
                            final_price = round(u_price * weight_kg, 2)
                            summary_txt = f"{weight_kg} KG x {u_price:.2f} TL"
                        elif embedded_price is not None:
                            final_price = embedded_price
                            summary_txt = f"Terazi Tutarı: {embedded_price:.2f} TL"

                        return {
                            "barcode": b,
                            "stock_code": str(cand_plu),
                            "title": title_val,
                            "raw_system_title": title_val,
                            "price": final_price,
                            "unit_price": u_price,
                            "label_price": None,
                            "price_updated_at": "",
                            "brand": "MANAV",
                            "unit": m_dict.get("unit", "KG"),
                            "is_scale_product": True,
                            "scanned_barcode": b,
                            "plu_code": str(cand_plu),
                            "weight_kg": weight_kg,
                            "scale_summary": summary_txt,
                            "is_new": False,
                            "last_printed_at": ""
                        }
                except Exception:
                    pass

            # 4.b: Genel katalog urunler tablosunda PLU eşleşmesi
            for cand_plu in candidates:
                cursor.execute("""
                    SELECT * FROM urunler 
                    WHERE barcode = ? OR barcode = ? OR stock_code = ? OR barcode = ?
                    LIMIT 1;
                """, (str(cand_plu), f"27{cand_plu:05d}", str(cand_plu), f"{cand_plu:05d}"))
                base_row = cursor.fetchone()
                if base_row:
                    p = format_product_dict(base_row)
                    p["is_scale_product"] = True
                    p["scanned_barcode"] = b
                    p["plu_code"] = str(cand_plu)
                    
                    if scale_info.get("is_weight") and scale_info.get("weight_kg") is not None:
                        p["unit_price"] = p["price"]
                        p["weight_kg"] = scale_info["weight_kg"]
                        p["price"] = round(p["unit_price"] * scale_info["weight_kg"], 2)
                        p["scale_summary"] = f"{scale_info['weight_kg']} KG x {p['unit_price']:.2f} TL"
                    elif scale_info.get("embedded_price") is not None:
                        p["unit_price"] = p["price"]
                        p["price"] = scale_info["embedded_price"]
                        p["scale_summary"] = f"Terazi Tutarı: {scale_info['embedded_price']:.2f} TL"
                    return p

        # 5. Aşama: Tire/boşluk arındırılmış barkod eşleşmesi
        b_digits = re.sub(r'[^0-9A-Za-z]', '', b)
        if b_digits and b_digits != b:
            cursor.execute("SELECT * FROM urunler WHERE barcode = ? LIMIT 1;", (b_digits,))
            row = cursor.fetchone()
            if row:
                return format_product_dict(row)

        return None

def get_product_price_history(barcode: str, limit: int = 50) -> list:
    """Belirtilen barkodun tüm geçmiş fiyat değişimlerini döner."""
    if not barcode:
        return []
    b = clean_barcode_text(barcode)
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, sync_id, barcode, title, old_price, new_price, diff_amount, diff_percent, changed_at, source_device, is_printed
            FROM vegawin_price_changes 
            WHERE barcode = ? 
            ORDER BY id DESC 
            LIMIT ?;
        """, (b, limit))
        return [dict(r) for r in cursor.fetchall()]

def get_products_count(only_new=False, only_diff=False, only_blacklist=False, only_archived=False, blacklist_barcodes=None):
    with db_session() as conn:
        cursor = conn.cursor()
        clauses = []
        params = []
        if only_new:
            clauses.append("(is_new = 1 OR label_price IS NULL OR ABS(parse_price(price) - parse_price(COALESCE(label_price, 0))) > 0.001)")
        if only_diff:
            clauses.append("(is_new = 1 OR label_price IS NULL OR ABS(parse_price(price) - parse_price(COALESCE(label_price, 0))) > 0.001)")
        
        bl_list = list(blacklist_barcodes or [])
        if only_archived:
            clauses.append("COALESCE(is_archived, 0) = 1")
        elif only_blacklist:
            if bl_list:
                placeholders = ",".join("?" for _ in bl_list)
                clauses.append(f"(barcode IN ({placeholders}) OR is_blacklisted = 1)")
                params.extend(bl_list)
            else:
                clauses.append("is_blacklisted = 1")
        else:
            clauses.append("COALESCE(is_archived, 0) = 0")
            if bl_list:
                placeholders = ",".join("?" for _ in bl_list)
                clauses.append(f"(barcode NOT IN ({placeholders}) AND COALESCE(is_blacklisted, 0) = 0)")
                params.extend(bl_list)
            else:
                clauses.append("COALESCE(is_blacklisted, 0) = 0")

        where_clause = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        cursor.execute(f"SELECT COUNT(*) as total FROM urunler {where_clause};", tuple(params))
        row = cursor.fetchone()
        return row["total"] if row else 0

def get_new_products_list(unprinted_only=False, limit=200):
    with db_session() as conn:
        cursor = conn.cursor()
        if unprinted_only:
            cursor.execute("SELECT * FROM vegawin_new_products WHERE is_printed = 0 ORDER BY id DESC LIMIT ?;", (limit,))
        else:
            cursor.execute("SELECT * FROM vegawin_new_products ORDER BY id DESC LIMIT ?;", (limit,))
        return [dict(r) for r in cursor.fetchall()]

def mark_new_products_as_printed(item_ids=None):
    with db_session() as conn:
        cursor = conn.cursor()
        if item_ids:
            placeholders = ",".join("?" for _ in item_ids)
            cursor.execute(f"UPDATE vegawin_new_products SET is_printed = 1 WHERE id IN ({placeholders});", item_ids)
        else:
            cursor.execute("UPDATE vegawin_new_products SET is_printed = 1 WHERE is_printed = 0;")

def update_product_printed_time(barcode: str, printed_price=None) -> dict:
    now_str = datetime.datetime.now().strftime("%d.%m.%Y %H:%M")
    b = clean_barcode_text(barcode)
    with db_session() as conn:
        cursor = conn.cursor()
        if printed_price is not None:
            cursor.execute("UPDATE urunler SET last_printed_at = ?, label_price = ? WHERE barcode = ?;", (now_str, float(printed_price), b))
        else:
            cursor.execute("UPDATE urunler SET last_printed_at = ?, label_price = price WHERE barcode = ?;", (now_str, b))
        cursor.execute("SELECT * FROM urunler WHERE barcode = ?;", (b,))
        row = cursor.fetchone()
        return format_product_dict(row) if row else {"last_printed_at": now_str}

def sync_all_label_prices_to_pos_price() -> int:
    """Tüm ürünlerin etiket fiyatını mevcut kasa satış fiyatına eşitler."""
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE urunler SET label_price = price;")
        return cursor.rowcount

def set_product_archived(barcode: str, archived: bool = True) -> bool:
    """Ürünü pasife / satışı durduruldu (is_archived = 1) durumuna alır veya aktif eder."""
    b = clean_barcode_text(barcode)
    if not b:
        return False
    now_str = datetime.datetime.now().strftime("%d.%m.%Y %H:%M")
    with db_session() as conn:
        cursor = conn.cursor()
        val = 1 if archived else 0
        arch_date = now_str if archived else None
        cursor.execute("UPDATE urunler SET is_archived = ?, archived_at = ? WHERE barcode = ?;", (val, arch_date, b))
        conn.commit()
        return cursor.rowcount > 0

def restore_archived_product_if_needed(barcode: str, reason: str = ""):
    """Eğer ürün pasifteyse (satışı bırakılmışsa) otomatik olarak aktif duruma geri getirir."""
    b = clean_barcode_text(barcode)
    if not b:
        return
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT is_archived, title FROM urunler WHERE barcode = ?;", (b,))
        row = cursor.fetchone()
        if row and row["is_archived"] == 1:
            cursor.execute("UPDATE urunler SET is_archived = 0, archived_at = NULL WHERE barcode = ?;", (b,))
            conn.commit()
            print(f"✨ [Otomatik Canlanma] '{row['title']}' ({b}) tekrar aktife alındı. Sebep: {reason}")
