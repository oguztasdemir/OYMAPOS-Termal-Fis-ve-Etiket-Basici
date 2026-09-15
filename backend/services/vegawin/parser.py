# -*- coding: utf-8 -*-
"""
📄 VegaWin Parsers & File Readers
Excel (.xlsx, .xls), SQLite (.db, .sqlite), CSV, metin ve ikili SonSatisHareket dosyalarını çözümleme
"""
import os
import csv
import re
import openpyxl
from backend.utils.text_utils import clean_barcode_text, clean_product_title, parse_price, fix_turkish_corrupted_chars, is_invalid_or_blacklisted_product

def normalize_text(text: str) -> str:
    return str(text).strip() if text is not None else ""

def parse_vegawin_file(file_path: str, collect_blacklisted: bool = False):
    """
    Herhangi bir VegaWin/FasterPOS veritabanı (.db, .sqlite), Excel, CSV veya metin dosyasını okur.
    Tüm olası tablo ve kolon yapılarını (STOKKART, TBLSTOK, MALZEME, URUNLER vb.) dinamik olarak çözümler.
    """
    ext = os.path.splitext(file_path)[1].lower()

    if ext in ['.sqlite', '.db', '.sqlite3', '.sdb', '.fdb']:
        import sqlite3
        try:
            conn = sqlite3.connect(f"file:{file_path}?mode=ro", uri=True)
        except Exception:
            try:
                conn = sqlite3.connect(file_path)
            except Exception:
                return []
        
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        try:
            cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = [r[0] for r in cur.fetchall()]
        except Exception:
            conn.close()
            return []
        
        if not tables:
            conn.close()
            return []

        candidate_tables = []
        for t in tables:
            t_lower = t.lower()
            try:
                cur.execute(f"PRAGMA table_info([{t}]);")
                col_info = cur.fetchall()
                col_names = [c[1].lower() for c in col_info]
                
                score = 0
                if any(c in col_names for c in ['barcode', 'barkod', 'barkod1', 'ean', 'stok_kodu', 'stokkodu', 'kod', 'code']):
                    score += 2
                if any(c in col_names for c in ['title', 'urun_adi', 'malincinsi', 'stokadi', 'name', 'aciklama']):
                    score += 2
                if any(c in col_names for c in ['price', 'fiyat', 'satis_fiyati', 'satisfiyati1', 'satisfiyati', 'fiyat1', 'sfiyat']):
                    score += 2
                if 'stok' in t_lower or 'urun' in t_lower or 'kart' in t_lower or 'malzeme' in t_lower:
                    score += 1

                if score >= 2:
                    candidate_tables.append((score, t, col_info))
            except Exception:
                continue

        candidate_tables.sort(key=lambda x: x[0], reverse=True)

        if not candidate_tables:
            for t in tables:
                try:
                    cur.execute(f"PRAGMA table_info([{t}]);")
                    candidate_tables.append((1, t, cur.fetchall()))
                    break
                except Exception:
                    pass

        if not candidate_tables:
            conn.close()
            return []

        items = []
        for _, target_table, col_info in candidate_tables:
            cols = {c[1].lower(): c[1] for c in col_info}
            try:
                cur.execute(f"SELECT * FROM [{target_table}] LIMIT 15000;")
                rows = cur.fetchall()
            except Exception:
                continue

            b_key = None
            for cand in ['barcode', 'barkod', 'barkod1', 'ean', 'stok_kodu', 'stokkodu', 'kod', 'code', 'id']:
                if cand in cols:
                    b_key = cols[cand]
                    break
            
            t_key = None
            for cand in ['title', 'urun_adi', 'malincinsi', 'stokadi', 'malin_cinsi', 'stok_adi', 'name', 'aciklama', 'stokkodu']:
                if cand in cols:
                    t_key = cols[cand]
                    break

            p_key = None
            for cand in ['price', 'satis_fiyati', 'satisfiyati1', 'fiyat', 'satisfiyati', 'fiyat1', 'sfiyat', 'tutari', 'tutar']:
                if cand in cols:
                    p_key = cols[cand]
                    break

            sc_key = cols.get('stok_kodu') or cols.get('stokkodu') or cols.get('kod')
            br_key = cols.get('brand') or cols.get('marka') or cols.get('ureticisi')
            unit_key = cols.get('unit') or cols.get('birim') or cols.get('olcubirimi')

            for r in rows:
                b = clean_barcode_text(r[b_key]) if b_key and r[b_key] is not None else ""
                if not b:
                    continue
                t_raw = normalize_text(r[t_key]) if t_key and r[t_key] is not None else f"Ürün {b}"
                p = parse_price(r[p_key]) if p_key and r[p_key] is not None else 0.0
                sc = normalize_text(r[sc_key]) if sc_key and r[sc_key] is not None else ""
                brand = normalize_text(r[br_key]) if br_key and r[br_key] is not None else ""
                unit = normalize_text(r[unit_key]) if unit_key and r[unit_key] is not None else "ADET"

                clean_t = clean_product_title(t_raw)
                if is_invalid_or_blacklisted_product(b, clean_t, p):
                    continue

                items.append({
                    "barcode": b,
                    "stock_code": sc,
                    "title": clean_t,
                    "price": p,
                    "brand": brand,
                    "unit": unit
                })

            if items:
                break

        conn.close()
        return items

    elif ext in ['.xlsx', '.xlsm', '.xltx']:
        try:
            wb = openpyxl.load_workbook(file_path, data_only=True, read_only=True)
            sheet = wb.active
            rows = list(sheet.iter_rows(values_only=True))
            wb.close()
            if not rows:
                return []
            
            def clean_h(val):
                from backend.utils.text_utils import fold_turkish_text
                return re.sub(r'[^a-z0-9]', '', fold_turkish_text(str(val or '')).lower())

            header_idx = -1
            col_map = {}
            for idx, r in enumerate(rows[:10]):
                if not r: continue
                cleaned_row = [clean_h(c) for c in r]
                b_found = any(any(k in x for k in ['barkod', 'barcode', 'ean', 'stokkodu', 'kod']) for x in cleaned_row)
                t_found = any(any(k in x for k in ['malincinsi', 'malin', 'cinsi', 'urunadi', 'urun', 'title', 'name', 'aciklama', 'stokadi']) for x in cleaned_row)
                p_found = any(any(k in x for k in ['satisfiyati', 'fiyat', 'price', 'satis', 'tutar']) for x in cleaned_row)
                if (b_found and t_found) or (b_found and p_found) or (b_found and len(cleaned_row) >= 3):
                    header_idx = idx
                    for col_i, col_name in enumerate(cleaned_row):
                        col_map[col_name] = col_i
                    break

            if header_idx == -1:
                header_idx = 0
                cleaned_row = [clean_h(c) for c in rows[0]]
                for col_i, col_name in enumerate(cleaned_row):
                    col_map[col_name] = col_i

            b_idx = None
            for cand, col_i in col_map.items():
                if b_idx is None and any(k in cand for k in ['barkod', 'barcode', 'ean']):
                    b_idx = col_i
            
            sc_idx = None
            for cand, col_i in col_map.items():
                if sc_idx is None and any(k in cand for k in ['stokkodu', 'kod', 'stokkod']):
                    sc_idx = col_i

            if b_idx is None and sc_idx is not None:
                b_idx = sc_idx
                sc_idx = None

            t_idx = None
            for cand, col_i in col_map.items():
                if t_idx is None and any(k in cand for k in ['malincinsi', 'malin', 'cinsi', 'urunadi', 'urun', 'title', 'name', 'aciklama', 'stokadi']):
                    t_idx = col_i

            p_idx = None
            for cand, col_i in col_map.items():
                if p_idx is None and any(k in cand for k in ['satisfiyati', 'fiyat', 'price', 'satis', 'tutar']):
                    p_idx = col_i

            u_idx = None
            for cand, col_i in col_map.items():
                if u_idx is None and any(k in cand for k in ['birim', 'unit']):
                    u_idx = col_i

            d_idx = None
            for cand, col_i in col_map.items():
                if d_idx is None and any(k in cand for k in ['degismetarihi', 'degismatarihi', 'fiyatdegis', 'fiyattarihi', 'degisimtarihi', 'degisim', 'tarih']):
                    d_idx = col_i

            items = []
            blacklisted_items = []
            for r in rows[header_idx + 1:]:
                if not r: continue
                b = clean_barcode_text(r[b_idx]) if b_idx is not None and b_idx < len(r) and r[b_idx] is not None else ""
                if not b:
                    continue
                t_raw = normalize_text(r[t_idx]) if t_idx is not None and t_idx < len(r) and r[t_idx] is not None else f"Ürün {b}"
                has_price = (p_idx is not None and p_idx < len(r) and r[p_idx] is not None and str(r[p_idx]).strip() != '')
                p = parse_price(r[p_idx]) if has_price else None
                unit = normalize_text(r[u_idx]) if u_idx is not None and u_idx < len(r) and r[u_idx] is not None else "ADET"
                sc = normalize_text(r[sc_idx]) if sc_idx is not None and sc_idx < len(r) and r[sc_idx] is not None else ""
                
                # Tarih sütunu (1. Fiyat Değişme Tarihi)
                raw_date = r[d_idx] if d_idx is not None and d_idx < len(r) and r[d_idx] is not None else ""
                from backend.utils.text_utils import parse_date_string
                price_updated_at = parse_date_string(raw_date)

                clean_t = clean_product_title(t_raw)
                from backend.utils.text_utils import check_blacklist_with_reason
                is_blocked, block_reason = check_blacklist_with_reason(b, clean_t, p or 0.0)
                if not is_blocked and t_raw != clean_t:
                    is_blocked, block_reason = check_blacklist_with_reason(b, t_raw, p or 0.0)

                if is_blocked:
                    blacklisted_items.append({
                        "barcode": b,
                        "title": clean_t or t_raw,
                        "price": p or 0.0,
                        "price_updated_at": price_updated_at,
                        "reason": block_reason or "Kara Liste / Boş Stok / Manav / Test Kaydı"
                    })
                    continue

                items.append({
                    "barcode": b,
                    "stock_code": sc,
                    "title": clean_t,
                    "raw_system_title": t_raw,
                    "price": p,
                    "has_price": has_price,
                    "price_updated_at": price_updated_at,
                    "brand": "",
                    "unit": unit
                })
            if collect_blacklisted:
                return items, blacklisted_items
            return items
        except Exception:
            return ([], []) if collect_blacklisted else []

    elif ext in ['.csv', '.txt']:
        try:
            items = []
            for enc in ['utf-8-sig', 'windows-1254', 'iso-8859-9', 'utf-8', 'cp1252']:
                try:
                    with open(file_path, mode='r', encoding=enc) as f:
                        content = f.read()
                        if content:
                            items = parse_raw_text_products(content)
                            if items:
                                break
                except Exception:
                    continue
            return items
        except Exception:
            return []

    return []

def parse_raw_text_products(raw_text: str, collect_blacklisted: bool = False):
    """Panodan kopyalanmış tab / noktalı virgül / virgül ayrılmış metin satırlarını çözer."""
    if not raw_text or not raw_text.strip():
        return ([], []) if collect_blacklisted else []

    lines = [l.strip() for l in raw_text.strip().splitlines() if l.strip()]
    if not lines:
        return ([], []) if collect_blacklisted else []

    sample = "\n".join(lines[:10])
    delimiter = '\t'
    if '\t' in sample:
        delimiter = '\t'
    elif ';' in sample:
        delimiter = ';'
    elif ',' in sample and sample.count(',') > sample.count(' '):
        delimiter = ','
    elif '|' in sample:
        delimiter = '|'

    reader = list(csv.reader(lines, delimiter=delimiter))
    if not reader:
        return []

    import re
    from backend.utils.text_utils import fold_turkish_text

    def clean_header_name(s: str) -> str:
        folded = fold_turkish_text(str(s or "")).lower()
        return re.sub(r'[^a-z0-9]', '', folded)

    col_map = {}
    header_idx = -1
    for idx, r in enumerate(reader[:5]):
        cleaned_headers = [clean_header_name(c) for c in r]
        b_found = any(any(k in h for k in ['barkod', 'barcode', 'ean', 'stokkodu', 'kod']) for h in cleaned_headers)
        t_found = any(any(k in h for k in ['urun', 'malin', 'cinsi', 'title', 'name', 'aciklama', 'stokadi']) for h in cleaned_headers)
        p_found = any(any(k in h for k in ['fiyat', 'price', 'satis', 'tutar']) for h in cleaned_headers)

        # Başlık satırında barkod, ürün adı veya fiyat herhangi ikisi veya en az biri + başka sütun varsa başlık kabul et
        if (b_found and t_found) or (b_found and p_found) or (t_found and p_found) or (b_found and len(cleaned_headers) >= 3):
            header_idx = idx
            for col_i, h in enumerate(cleaned_headers):
                col_map[h] = col_i
            break

    b_idx, t_idx, p_idx, sc_idx, br_idx, u_idx, d_idx = None, None, None, None, None, None, None

    if header_idx != -1:
        for h, col_i in col_map.items():
            if b_idx is None and any(k in h for k in ['barkod', 'barcode', 'ean']):
                b_idx = col_i
            elif t_idx is None and any(k in h for k in ['malincinsi', 'malin', 'cinsi', 'urunadi', 'urun', 'title', 'name', 'aciklama', 'stokadi']):
                t_idx = col_i
            elif p_idx is None and any(k in h for k in ['satisfiyati', 'fiyat', 'price', 'satis', 'tutar']):
                p_idx = col_i
            elif d_idx is None and any(k in h for k in ['degismetarihi', 'degismatarihi', 'fiyatdegis', 'fiyattarihi', 'degisimtarihi', 'degisim', 'tarih']):
                d_idx = col_i
            elif sc_idx is None and any(k in h for k in ['stokkodu', 'kod', 'stokkod']):
                sc_idx = col_i
            elif br_idx is None and any(k in h for k in ['marka', 'brand']):
                br_idx = col_i
            elif u_idx is None and any(k in h for k in ['birim', 'unit']):
                u_idx = col_i

        # Eğer barkod bulunamadıysa ama stok kodu varsa barkod yerine kullan
        if b_idx is None and sc_idx is not None:
            b_idx = sc_idx
            sc_idx = None

        start_idx = header_idx + 1
    else:
        start_idx = 0
        # İlk 10 satırı inceleyerek sütun tiplerini oyla (voting)
        inspect_rows = reader[:min(10, len(reader))]
        col_counts = len(reader[0]) if reader else 0

        barcode_scores = [0] * col_counts
        price_scores = [0] * col_counts
        title_scores = [0] * col_counts
        date_scores = [0] * col_counts

        def is_date_candidate(val_str):
            s = str(val_str).strip()
            return bool(re.match(r'^\d{2}[\.\/]\d{2}[\.\/]\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?$', s) or re.match(r'^\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?$', s))

        for r in inspect_rows:
            for col_i, val in enumerate(r):
                if col_i >= col_counts:
                    break
                v_str = str(val).strip()
                if not v_str:
                    continue
                v_clean = clean_barcode_text(v_str)
                if v_clean.isdigit() and len(v_clean) in (8, 12, 13, 14):
                    barcode_scores[col_i] += 4
                elif v_clean.isdigit() and len(v_clean) >= 4:
                    barcode_scores[col_i] += 2
                
                if is_date_candidate(v_str):
                    date_scores[col_i] += 5
                
                if any(curr in v_str for curr in ['₺', 'TL', 'tl', ',']) or (v_str.replace('.', '').replace(',', '').isdigit() and len(v_str) <= 8 and not is_date_candidate(v_str)):
                    price_scores[col_i] += 2
                
                # Tarih ve sayılar asla başlık olamaz!
                if len(v_str) > 2 and not is_date_candidate(v_str) and not v_str.replace('.', '').replace(',', '').replace('-', '').isdigit():
                    title_scores[col_i] += 3

        if any(barcode_scores):
            b_idx = barcode_scores.index(max(barcode_scores))
        if any(date_scores):
            d_idx = date_scores.index(max(date_scores))
        if any(price_scores):
            valid_p_scores = [s if i not in (b_idx, d_idx) else -1 for i, s in enumerate(price_scores)]
            if any(s > 0 for s in valid_p_scores):
                p_idx = valid_p_scores.index(max(valid_p_scores))
        if any(title_scores):
            valid_t_scores = [s if i not in (b_idx, p_idx, d_idx) else -1 for i, s in enumerate(title_scores)]
            if any(s > 0 for s in valid_t_scores):
                t_idx = valid_t_scores.index(max(valid_t_scores))

        # Eğer standart 4 sütunlu yapı geldiyse (Barkod, Malın Cinsi, Fiyat, Değişme Tarihi)
        if col_counts == 4:
            if b_idx is None: b_idx = 0
            if t_idx is None: t_idx = 1
            if p_idx is None: p_idx = 2
            if d_idx is None: d_idx = 3
        elif col_counts == 3:
            if b_idx is None: b_idx = 0
            if t_idx is None: t_idx = 1
            if p_idx is None: p_idx = 2
        else:
            if b_idx is None and col_counts > 0: b_idx = 0
            if t_idx is None and col_counts > 1: t_idx = 1
            if p_idx is None and col_counts > 2: p_idx = 2

    items = []
    blacklisted_items = []
    for r in reader[start_idx:]:
        if not r:
            continue
        b = clean_barcode_text(r[b_idx]) if b_idx is not None and b_idx < len(r) else ""
        if not b:
            continue
        t_raw = normalize_text(r[t_idx]) if t_idx is not None and t_idx < len(r) else f"Ürün {b}"
        has_price_col = (p_idx is not None and p_idx < len(r) and str(r[p_idx]).strip() != '')
        p = parse_price(r[p_idx]) if has_price_col else None
        sc = normalize_text(r[sc_idx]) if sc_idx is not None and sc_idx < len(r) else ""
        brand = normalize_text(r[br_idx]) if br_idx is not None and br_idx < len(r) else ""
        unit = normalize_text(r[u_idx]) if u_idx is not None and u_idx < len(r) else "ADET"
        
        raw_date = r[d_idx] if d_idx is not None and d_idx < len(r) else ""
        from backend.utils.text_utils import parse_date_string
        price_updated_at = parse_date_string(raw_date)

        clean_t = clean_product_title(t_raw)
        from backend.utils.text_utils import check_blacklist_with_reason
        is_blocked, block_reason = check_blacklist_with_reason(b, clean_t, p or 0.0)
        if not is_blocked and t_raw != clean_t:
            is_blocked, block_reason = check_blacklist_with_reason(b, t_raw, p or 0.0)

        if is_blocked:
            blacklisted_items.append({
                "barcode": b,
                "title": clean_t or t_raw,
                "price": p or 0.0,
                "price_updated_at": price_updated_at,
                "reason": block_reason or "Kara Liste / Test Kaydı"
            })
            continue

        items.append({
            "barcode": b,
            "stock_code": sc,
            "title": clean_t,
            "raw_system_title": t_raw,
            "price": p,
            "has_price": has_price_col,
            "price_updated_at": price_updated_at,
            "brand": brand,
            "unit": unit
        })

    if collect_blacklisted:
        return items, blacklisted_items
    return items

def parse_sonsatishareket_file(file_path: str) -> list:
    """VegaWin / FasterPOS SonSatisHareket ikili/metin veri dosyasını okur."""
    if not os.path.exists(file_path):
        return []
    
    items = []
    try:
        with open(file_path, 'r', encoding='latin-1', errors='ignore') as f:
            content = f.read()
            if content:
                items = parse_raw_text_products(content)
    except Exception:
        pass
    return items

def scan_vegawin_directory(dir_path: str) -> tuple:
    """Belirtilen klasörü tarayarak uygun stok ve veritabanı dosyalarını bulup çözümler."""
    if not os.path.isdir(dir_path):
        raise ValueError(f"Klasör bulunamadı: {dir_path}")

    found_files = []
    for root, _, files in os.walk(dir_path):
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            f_lower = f.lower()
            full_p = os.path.join(root, f)
            if ext in ['.db', '.sqlite', '.sqlite3', '.xlsx', '.xls', '.csv'] or 'sonsatishareket' in f_lower:
                found_files.append(full_p)

    def sort_key(p):
        ext = os.path.splitext(p)[1].lower()
        fname = os.path.basename(p).lower()
        if 'market_sistemi' in fname: return 0
        if ext in ['.db', '.sqlite', '.sqlite3']: return 1
        if 'stok' in fname or 'fiyat' in fname: return 2
        if ext in ['.xlsx', '.xls']: return 3
        return 4

    found_files.sort(key=sort_key)

    for fp in found_files:
        items = parse_vegawin_file(fp)
        if items:
            return items, os.path.basename(fp)

    return [], ""
