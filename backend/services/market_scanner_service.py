# -*- coding: utf-8 -*-
"""
🕵️ Market Price Scanner & Auditor Service (Piyasa Fiyat Radarı)
45+ gündür güncellenmemiş ürünleri tespit eder, internetten online market fiyatlarını tarar ve kıyaslar.
Kaldığı yerden devam etme (Resume) ve kalıcı SQLite DB önbellek desteği sunar.
"""

import json
import re
import time
import urllib.parse
import urllib.request
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from backend.services.db.connection import db_session
from backend.services.db.history_repo import record_product_history
from backend.utils.text_utils import parse_price, get_blacklist_data


def parse_db_datetime(val) -> Optional[datetime]:
    """Her türlü tarih formatını (DD.MM.YYYY, YYYY-MM-DD, ISO vb.) güvenle datetime nesnesine çevirir."""
    if not val:
        return None
    s = str(val).strip()
    if not s:
        return None
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%d.%m.%Y %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%d.%m.%Y",
        "%Y-%m-%d",
        "%Y/%m/%d %H:%M:%S",
        "%d/%m/%Y %H:%M:%S"
    ):
        try:
            return datetime.strptime(s[:19], fmt)
        except Exception:
            continue
    return None


def clean_title_for_market_search(raw_title: str) -> str:
    """Ürün adını arama motorları için temiz ve net bir sorguya dönüştürür."""
    if not raw_title:
        return ""
    
    t = str(raw_title).replace('\ufffd', ' ').replace('\x00', ' ')
    
    # 5'Lİ, 5'LI -> 5li
    t = re.sub(r"(\d+)['’]L[İIıi]", r"\1li", t, flags=re.IGNORECASE)
    t = re.sub(r"['’]L[İIıi]", "li", t, flags=re.IGNORECASE)
    
    # Kısaltmalar
    t = re.sub(r"\bEZ\.KURU\b", "EZMESİ KURU", t, flags=re.IGNORECASE)
    t = re.sub(r"\bEZ\.\b", "EZMESİ ", t, flags=re.IGNORECASE)
    t = re.sub(r"\bBOSALT\b", "BİOSALT", t, flags=re.IGNORECASE)
    
    # Fazla noktalama işaretlerini boşluğa çevir
    t = re.sub(r'[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ\s]', ' ', t)
    
    words = [w for w in t.split() if len(w) > 0]
    return " ".join(words[:6])


def generate_market_direct_links(barcode: str, title: str) -> List[Dict]:
    """Kullanıcının tek tıkla canlı fiyatı görebileceği market arama linklerini üretir."""
    q_search = clean_title_for_market_search(title) or barcode
    encoded_bc = urllib.parse.quote(barcode) if barcode else urllib.parse.quote(q_search)
    encoded_title = urllib.parse.quote(q_search)

    return [
        {
            "name": "Rüyam Market",
            "url": f"https://www.ruyammarket.com/arama?q={encoded_bc}",
            "is_search": True
        },
        {
            "name": "Migros",
            "url": f"https://www.migros.com.tr/arama?q={encoded_bc if barcode else encoded_title}",
            "is_search": True
        },
        {
            "name": "CarrefourSA",
            "url": f"https://www.carrefoursa.com/search/?text={encoded_title or encoded_bc}",
            "is_search": True
        }
    ]


class MarketScannerService:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(MarketScannerService, cls).__new__(cls)
                cls._instance._init_state()
            return cls._instance

    def _init_state(self):
        self.is_running = False
        self.stop_requested = False
        self.progress = {
            "total": 0,
            "completed": 0,
            "found": 0,
            "not_found": 0,
            "cheaper_than_market": 0,
            "current_barcode": "",
            "current_title": "",
            "started_at": None,
            "finished_at": None,
            "status_text": "Hazır"
        }
        self.thread = None

    def get_stagnant_products(self, days: int = 45, search_term: str = "", limit: int = 0) -> List[Dict]:
        """
        Belirtilen gün (30, 45, 60, 90, 180, 365 gün vb.) öncesinden bu yana güncellenmemiş
        tüm ürünleri ve mevcut piyasa denetim sonuçlarını döndürür.
        """
        now = datetime.now()
        cutoff_dt = now - timedelta(days=days)

        bl_data = get_blacklist_data()
        blacklist_barcodes = set(str(b).strip() for b in bl_data.get("barcodes", []) if str(b).strip())

        with db_session() as conn:
            cursor = conn.cursor()
            query = """
            SELECT 
                u.barcode,
                u.stock_code,
                u.title,
                u.price as current_price,
                u.label_price,
                u.price_updated_at,
                u.updated_at,
                u.created_at,
                u.last_printed_at,
                u.brand,
                u.is_blacklisted,
                m.market_price,
                m.min_price,
                m.max_price,
                m.found_sources,
                m.last_scanned_at,
                m.diff_amount,
                m.diff_percent,
                m.status as audit_status
            FROM urunler u
            LEFT JOIN market_price_audits m ON u.barcode = m.barcode
            WHERE COALESCE(u.is_blacklisted, 0) = 0 AND COALESCE(u.is_archived, 0) = 0
            """
            params = []

            if search_term:
                query += " AND (u.title LIKE ? OR u.barcode LIKE ? OR u.brand LIKE ?)"
                like_term = f"%{search_term}%"
                params.extend([like_term, like_term, like_term])

            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            result = []
            for r in rows:
                row_dict = dict(r)
                
                bc_str = str(row_dict.get("barcode", "")).strip()
                if bc_str in blacklist_barcodes or row_dict.get("is_blacklisted") == 1 or row_dict.get("is_archived") == 1:
                    continue
                
                last_update_raw = row_dict.get("price_updated_at") or row_dict.get("updated_at") or row_dict.get("created_at")
                dt = parse_db_datetime(last_update_raw)
                
                if dt:
                    days_elapsed = (now - dt).days
                    if dt > cutoff_dt:
                        continue
                else:
                    days_elapsed = 999

                row_dict["days_since_update"] = max(0, days_elapsed)

                if row_dict.get("found_sources"):
                    try:
                        raw_sources = json.loads(row_dict["found_sources"])
                        row_dict["sources_list"] = raw_sources if raw_sources else generate_market_direct_links(row_dict.get("barcode", ""), row_dict.get("title", ""))
                    except Exception:
                        row_dict["sources_list"] = generate_market_direct_links(row_dict.get("barcode", ""), row_dict.get("title", ""))
                else:
                    row_dict["sources_list"] = generate_market_direct_links(row_dict.get("barcode", ""), row_dict.get("title", ""))

                row_dict["quick_links"] = generate_market_direct_links(row_dict.get("barcode", ""), row_dict.get("title", ""))
                result.append(row_dict)

            result.sort(key=lambda x: (
                0 if (x.get("diff_percent") is not None and x.get("diff_percent") > 0) else 1,
                -(x.get("diff_percent") or 0),
                -x.get("days_since_update", 0)
            ))

            if limit and limit > 0:
                return result[:limit]
            return result

    def get_summary_stats(self, days: int = 45) -> Dict:
        """Seçilen güne ait özet metrikleri anlık hesaplar."""
        all_stagnant = self.get_stagnant_products(days=days, limit=0)
        total_stagnant = len(all_stagnant)

        total_audited = 0
        cheaper_count = 0
        normal_count = 0
        loss_percentages = []

        for p in all_stagnant:
            m_price = p.get("market_price")
            c_price = float(p.get("current_price") or 0)
            if m_price is not None and float(m_price) > 0:
                total_audited += 1
                m_val = float(m_price)
                if m_val > c_price and (m_val - c_price) >= 0.5:
                    cheaper_count += 1
                    if p.get("diff_percent"):
                        loss_percentages.append(float(p["diff_percent"]))
                else:
                    normal_count += 1

        avg_loss = round(sum(loss_percentages) / len(loss_percentages), 1) if loss_percentages else 0.0

        return {
            "total_stagnant": total_stagnant,
            "days_threshold": days,
            "total_audited": total_audited,
            "cheaper_count": cheaper_count,
            "normal_count": normal_count,
            "avg_loss_percent": avg_loss,
            "is_scanning": self.is_running
        }

    def scrape_ruyam_market(self, barcode: str, title: str) -> Optional[Dict]:
        """
        Rüyam Market (https://www.ruyammarket.com/) üzerinden barkod ve ürün adı ile
        doğrudan ürün sayfası, barkod doğrulaması, görseli ve canlı piyasa satış fiyatı tarar.
        """
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
        clean_bc = str(barcode).strip() if barcode else ""
        is_real_barcode = bool(clean_bc and len(clean_bc) >= 6 and not clean_bc.startswith("27") and not clean_bc.startswith("28"))
        
        # 1. AŞAMA: Barkod ile Birebir Arama
        if is_real_barcode:
            try:
                url = f"https://www.ruyammarket.com/arama?q={urllib.parse.quote(clean_bc)}"
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=4) as r:
                    html = r.read().decode('utf-8', errors='ignore')
                    cards = re.findall(r'<article class="product-card">(.*?)</article>', html, re.DOTALL)
                    for c in cards:
                        if bool(re.search(r'(stokta\s*yok|stok\s*yok|t[üu]kendi|disabled[^>]*>.*?stok)', c, re.IGNORECASE)):
                            continue

                        title_match = re.search(r'<h3 class="product-title"><a href="([^"]*)">([^<]*)</a>', c)
                        prod_link = ("https://www.ruyammarket.com" + title_match.group(1)) if title_match else url
                        prod_title = title_match.group(2).strip() if title_match else ""
                        
                        bc_match = re.search(r'Barkod:\s*([0-9a-zA-Z_-]+)', c)
                        found_bc = bc_match.group(1).strip() if bc_match else ""

                        img_match = re.search(r'<img[^>]+(?:data-src|src)="([^"]+)"', c)
                        img_url = ""
                        if img_match:
                            raw_img = img_match.group(1).strip()
                            img_url = f"https://www.ruyammarket.com{raw_img}" if raw_img.startswith('/') else raw_img

                        if found_bc == clean_bc or prod_link.endswith(f"-{clean_bc}"):
                            price_match = re.search(r'<div class="price">\s*<strong>\s*([\d\.,]+)\s*TL', c)
                            if price_match:
                                raw_p = price_match.group(1).replace('.', '').replace(',', '.')
                                p_val = float(raw_p)
                                if 0.5 <= p_val <= 25000.0:
                                    return {
                                        "name": "Rüyam Market",
                                        "title": prod_title or title,
                                        "barcode": found_bc,
                                        "price": p_val,
                                        "image_url": img_url,
                                        "url": prod_link,
                                        "is_exact_barcode": True,
                                        "is_in_stock": True
                                    }
            except Exception:
                pass

        # 2. AŞAMA: Başlık ile Anlamsal Eşleşme
        if title:
            t_upper = re.sub(r'[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ\s]', ' ', title.upper())
            stop_words = {'MNV', 'GR', 'GRAM', 'KG', 'LT', 'ML', 'ADET', 'LI', 'LU', 'LÜ', 'Lİ', 'TEK', 'PAKET', 'SİŞE', 'SISE', 'CAM'}
            title_words = [w for w in t_upper.split() if len(w) >= 2 and w not in stop_words]

            if len(title_words) >= 2:
                search_q = " ".join(title_words[:3])
                try:
                    url = f"https://www.ruyammarket.com/arama?q={urllib.parse.quote(search_q)}"
                    req = urllib.request.Request(url, headers=headers)
                    with urllib.request.urlopen(req, timeout=4) as r:
                        html = r.read().decode('utf-8', errors='ignore')
                        cards = re.findall(r'<article class="product-card">(.*?)</article>', html, re.DOTALL)
                        for c in cards:
                            if bool(re.search(r'(stokta\s*yok|stok\s*yok|t[üu]kendi|disabled[^>]*>.*?stok)', c, re.IGNORECASE)):
                                continue

                            title_match = re.search(r'<h3 class="product-title"><a href="([^"]*)">([^<]*)</a>', c)
                            prod_link = ("https://www.ruyammarket.com" + title_match.group(1)) if title_match else url
                            prod_title = title_match.group(2).strip() if title_match else ""

                            img_match = re.search(r'<img[^>]+(?:data-src|src)="([^"]+)"', c)
                            img_url = ""
                            if img_match:
                                raw_img = img_match.group(1).strip()
                                img_url = f"https://www.ruyammarket.com{raw_img}" if raw_img.startswith('/') else raw_img

                            f_upper = re.sub(r'[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ\s]', ' ', prod_title.upper())
                            found_words = set(w for w in f_upper.split() if len(w) >= 2)
                            matched_words = [w for w in title_words if w in found_words]

                            if len(matched_words) >= max(2, int(len(title_words) * 0.6)):
                                price_match = re.search(r'<div class="price">\s*<strong>\s*([\d\.,]+)\s*TL', c)
                                if price_match:
                                    raw_p = price_match.group(1).replace('.', '').replace(',', '.')
                                    p_val = float(raw_p)
                                    if 0.5 <= p_val <= 25000.0:
                                        return {
                                            "name": "Rüyam Market",
                                            "title": prod_title,
                                            "barcode": "",
                                            "price": p_val,
                                            "image_url": img_url,
                                            "url": prod_link,
                                            "is_exact_barcode": False,
                                            "is_in_stock": True
                                        }
                except Exception:
                    pass

        return None

    def scrape_migros_market(self, barcode: str, title: str) -> Optional[Dict]:
        """
        Migros (https://www.migros.com.tr/) üzerinden canlı fiyat, ürün adı, görsel ve link tarar.
        """
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'tr-TR,tr;q=0.9'
        }
        clean_bc = str(barcode).strip() if barcode else ""
        queries = []
        if clean_bc and len(clean_bc) >= 6 and not clean_bc.startswith("27") and not clean_bc.startswith("28"):
            queries.append(clean_bc)
        if title:
            words = [w for w in re.sub(r'[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ\s]', ' ', title).split() if len(w) >= 2]
            if words:
                queries.append(" ".join(words[:4]))

        for q in queries:
            try:
                url = f"https://www.migros.com.tr/rest/search/screens/products?q={urllib.parse.quote(q)}"
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=4) as r:
                    data = json.loads(r.read().decode('utf-8'))
                    items = data.get('data', {}).get('searchInfo', {}).get('storeProductInfos', [])
                    if items:
                        p = items[0]
                        raw_price = p.get('shownPrice') or p.get('regularPrice') or 0
                        price_val = round(float(raw_price) / 100.0, 2)
                        if price_val <= 0:
                            continue
                        images = p.get('images', [])
                        img_url = ""
                        if images and isinstance(images, list) and isinstance(images[0], dict):
                            urls_map = images[0].get('urls', {})
                            img_url = urls_map.get('PRODUCT_DETAIL') or urls_map.get('PRODUCT_LIST') or ""
                        pretty = p.get('prettyName') or ''
                        prod_url = f"https://www.migros.com.tr/{pretty}" if pretty else f"https://www.migros.com.tr/arama?q={urllib.parse.quote(q)}"
                        return {
                            "name": "Migros",
                            "title": p.get('name') or title,
                            "barcode": clean_bc,
                            "price": price_val,
                            "image_url": img_url,
                            "url": prod_url,
                            "is_in_stock": True
                        }
            except Exception:
                continue
        return None

    def scrape_online_market_price(self, barcode: str, title: str) -> Dict:
        """
        Rüyam Market ve Migros üzerinden eşzamanlı/sıralı canlı piyasa fiyatı ve görsel tarar.
        CarrefourSA için 1-tıkla arama linki sağlar.
        """
        direct_links = generate_market_direct_links(barcode, title)
        sources = []
        found_prices = []
        primary_image = ""
        market_details = {
            "ruyam": None,
            "migros": None,
            "carrefour": {
                "name": "CarrefourSA",
                "url": f"https://www.carrefoursa.com/search/?text={urllib.parse.quote(clean_title_for_market_search(title) or barcode)}"
            }
        }

        # 1. Rüyam Market
        try:
            ruyam_res = self.scrape_ruyam_market(barcode, title)
            if ruyam_res and ruyam_res.get("price", 0) > 0:
                p_val = float(ruyam_res["price"])
                found_prices.append(p_val)
                if not primary_image and ruyam_res.get("image_url"):
                    primary_image = ruyam_res["image_url"]
                sources.append({
                    "name": "Rüyam Market",
                    "url": ruyam_res["url"],
                    "title": ruyam_res.get("title", title)[:60],
                    "price": p_val,
                    "image_url": ruyam_res.get("image_url", "")
                })
                market_details["ruyam"] = ruyam_res
        except Exception:
            pass

        # 2. Migros
        try:
            migros_res = self.scrape_migros_market(barcode, title)
            if migros_res and migros_res.get("price", 0) > 0:
                p_val = float(migros_res["price"])
                found_prices.append(p_val)
                if not primary_image and migros_res.get("image_url"):
                    primary_image = migros_res["image_url"]
                sources.append({
                    "name": "Migros",
                    "url": migros_res["url"],
                    "title": migros_res.get("title", title)[:60],
                    "price": p_val,
                    "image_url": migros_res.get("image_url", "")
                })
                market_details["migros"] = migros_res
        except Exception:
            pass

        if found_prices:
            avg_p = round(sum(found_prices) / len(found_prices), 2)
            return {
                "success": True,
                "market_price": found_prices[0] if len(found_prices) == 1 else avg_p,
                "min_price": min(found_prices),
                "max_price": max(found_prices),
                "image_url": primary_image,
                "sources": sources,
                "market_details": market_details,
                "all_prices_count": len(found_prices)
            }

        return {
            "success": False,
            "market_price": 0.0,
            "min_price": 0.0,
            "max_price": 0.0,
            "image_url": "",
            "sources": direct_links,
            "market_details": market_details,
            "message": "Piyasa fiyatı bulunamadı"
        }

    def audit_single_product(self, barcode: str, title: str = "") -> Dict:
        """Tek bir ürün için anlık piyasa fiyat taraması yapar ve DB'ye kaydeder."""
        prod_title = title
        our_price = 0.0
        with db_session() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT barcode, title, price FROM urunler WHERE barcode = ?;", (barcode,))
            prod = cursor.fetchone()
            if prod:
                prod_title = prod["title"] or prod_title
                our_price = float(prod["price"] or 0)

        res = self.scrape_online_market_price(barcode, prod_title)
        market_price = res.get("market_price", 0.0)
        image_url = res.get("image_url", "")
        diff_amt = round(market_price - our_price, 2) if (market_price > 0 and our_price > 0) else 0.0
        diff_pct = round(((market_price - our_price) / our_price * 100), 1) if (our_price > 0 and market_price > 0) else 0.0
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        try:
            with db_session() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO market_price_audits (barcode, market_price, min_price, max_price, found_sources, search_query, last_scanned_at, diff_amount, diff_percent, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(barcode) DO UPDATE SET
                        market_price = excluded.market_price,
                        min_price = excluded.min_price,
                        max_price = excluded.max_price,
                        found_sources = excluded.found_sources,
                        last_scanned_at = excluded.last_scanned_at,
                        diff_amount = excluded.diff_amount,
                        diff_percent = excluded.diff_percent,
                        status = excluded.status;
                """, (
                    barcode,
                    market_price,
                    res.get("min_price", 0.0),
                    res.get("max_price", 0.0),
                    json.dumps(res.get("sources", []), ensure_ascii=False),
                    prod_title or barcode,
                    now_str,
                    diff_amt,
                    diff_pct,
                    "scanned" if res.get("success") else "not_found"
                ))
        except Exception:
            pass

        return {
            "success": res.get("success", False),
            "barcode": barcode,
            "title": prod_title,
            "current_price": our_price,
            "market_price": market_price,
            "image_url": image_url,
            "min_price": res.get("min_price", 0.0),
            "max_price": res.get("max_price", 0.0),
            "diff_amount": diff_amt,
            "diff_percent": diff_pct,
            "sources": res.get("sources", []),
            "message": res.get("message")
        }

    def start_background_scan(self, days: int = 45, resume: bool = True):
        """
        45+ gündür bekleyen TÜM ürünler için arka plan taramasını başlatır.
        Daha önce taranmış olanları veritabanında saklar ve kaldığı yerden devam eder.
        """
        with self._lock:
            if self.is_running:
                return {"success": False, "message": "Tarama zaten devam ediyor."}

            all_stagnant = self.get_stagnant_products(days=days, limit=0)
            if not all_stagnant:
                return {"success": False, "message": f"{days} gündür güncellenmemiş ürün bulunamadı."}

            # Zaten taranmış ve DB'de kayıtlı olanları tespit et
            already_scanned = [p for p in all_stagnant if p.get("market_price") is not None or p.get("last_scanned_at")]
            unscanned = [p for p in all_stagnant if p.get("market_price") is None and not p.get("last_scanned_at")]

            to_scan_list = unscanned if resume else all_stagnant

            if not to_scan_list:
                return {
                    "success": True, 
                    "message": f"Seçili {days} gün için tüm {len(all_stagnant)} ürün zaten taranmış ve veritabanında kayıtlı. Yeniden taramak için 'Sıfırla' butonunu kullanabilirsiniz."
                }

            initial_found = sum(1 for p in already_scanned if p.get("market_price") and float(p.get("market_price")) > 0)
            initial_cheaper = sum(1 for p in already_scanned if p.get("market_price") and float(p.get("market_price")) > float(p.get("current_price") or 0))

            self.is_running = True
            self.stop_requested = False
            self.progress = {
                "total": len(all_stagnant),
                "completed": len(already_scanned),
                "remaining_to_scan": len(to_scan_list),
                "found": initial_found,
                "not_found": len(already_scanned) - initial_found,
                "cheaper_than_market": initial_cheaper,
                "current_barcode": "",
                "current_title": "",
                "started_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "finished_at": None,
                "status_text": f"Piyasa fiyatları taranıyor... ({len(to_scan_list)} taranmamış ürün kaldı)"
            }

            self.thread = threading.Thread(target=self._scan_worker, args=(to_scan_list,), daemon=True)
            self.thread.start()
            return {
                "success": True, 
                "message": f"Toplam {len(all_stagnant)} ürünün {len(already_scanned)} tanesi önceden taranmıştı. Kalan {len(to_scan_list)} ürün için tarama başlatıldı."
            }

    def stop_background_scan(self):
        """Devam eden taramayı güvenli durdurur."""
        with self._lock:
            if not self.is_running:
                return {"success": True, "message": "Çalışan tarama yok."}
            self.stop_requested = True
            self.progress["status_text"] = "Durduruluyor (Veriler DB'de kaydedildi)..."
            return {"success": True, "message": "Tarama durdurma isteği iletildi. Taranan tüm ürünler veritabanına kaydedildi."}

    def _scan_worker(self, products: List[Dict]):
        """Arka planda ürünleri sırayla tarayan ve anlık DB'ye yazan işçi fonksiyon."""
        for item in products:
            if self.stop_requested:
                break

            barcode = item["barcode"]
            title = item["title"]
            our_price = float(item["current_price"] or 0)

            self.progress["current_barcode"] = barcode
            self.progress["current_title"] = title

            try:
                res = self.scrape_online_market_price(barcode, title)
                now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                with db_session() as conn:
                    cursor = conn.cursor()
                    if res.get("success"):
                        market_price = res["market_price"]
                        diff_amt = round(market_price - our_price, 2)
                        diff_pct = round(((market_price - our_price) / our_price * 100), 1) if our_price > 0 else 0.0

                        cursor.execute("""
                            INSERT INTO market_price_audits (barcode, market_price, min_price, max_price, found_sources, search_query, last_scanned_at, diff_amount, diff_percent, status)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(barcode) DO UPDATE SET
                                market_price = excluded.market_price,
                                min_price = excluded.min_price,
                                max_price = excluded.max_price,
                                found_sources = excluded.found_sources,
                                last_scanned_at = excluded.last_scanned_at,
                                diff_amount = excluded.diff_amount,
                                diff_percent = excluded.diff_percent,
                                status = excluded.status;
                        """, (
                            barcode,
                            market_price,
                            res["min_price"],
                            res["max_price"],
                            json.dumps(res["sources"], ensure_ascii=False),
                            title,
                            now_str,
                            diff_amt,
                            diff_pct,
                            "scanned"
                        ))
                        self.progress["found"] += 1
                        if market_price > our_price:
                            self.progress["cheaper_than_market"] += 1
                    else:
                        self.progress["not_found"] += 1
                        cursor.execute("""
                            INSERT INTO market_price_audits (barcode, found_sources, search_query, last_scanned_at, status)
                            VALUES (?, ?, ?, ?, ?)
                            ON CONFLICT(barcode) DO UPDATE SET
                                found_sources = excluded.found_sources,
                                last_scanned_at = excluded.last_scanned_at,
                                status = excluded.status;
                        """, (
                            barcode,
                            json.dumps(res.get("sources", []), ensure_ascii=False),
                            title,
                            now_str,
                            "not_found"
                        ))

            except Exception:
                self.progress["not_found"] += 1

            self.progress["completed"] += 1
            time.sleep(0.9)

        self.is_running = False
        self.progress["finished_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.progress["status_text"] = "Tamamlandı" if not self.stop_requested else "Durduruldu (Kayıtlar DB'de saklandı)"

    def apply_market_price(self, barcode: str, new_price: float, reason: str = "Piyasa Fiyat Radarı Güncellemesi") -> Dict:
        """Seçilen ürüne yeni fiyat uygular, audit loguna yazar ve etiket fiyatını günceller."""
        with db_session() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT barcode, title, price FROM urunler WHERE barcode = ?;", (barcode,))
            prod = cursor.fetchone()
            if not prod:
                return {"success": False, "error": "Ürün bulunamadı"}

            old_price = float(prod["price"] or 0)
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            diff_amt = round(new_price - old_price, 2)
            diff_pct = round((diff_amt / old_price * 100), 1) if old_price > 0 else 0.0

            cursor.execute("""
                UPDATE urunler 
                SET price = ?, label_price = ?, price_updated_at = ?, updated_at = ?
                WHERE barcode = ?;
            """, (new_price, new_price, now_str, now_str, barcode))

            record_product_history(
                conn=conn,
                barcode=barcode,
                event_type="PRICE_UPDATE",
                old_price=old_price,
                new_price=new_price,
                diff_amount=diff_amt,
                diff_percent=diff_pct,
                source="Piyasa Radarı",
                details=f"{reason} (Eski: {old_price} ₺ -> Yeni: {new_price} ₺)"
            )

            cursor.execute("""
                UPDATE market_price_audits 
                SET diff_amount = round(market_price - ?, 2),
                    diff_percent = CASE WHEN ? > 0 THEN round(((market_price - ?) / ? * 100), 1) ELSE 0 END
                WHERE barcode = ?;
            """, (new_price, new_price, new_price, new_price, barcode))

            return {
                "success": True,
                "barcode": barcode,
                "title": prod["title"],
                "old_price": old_price,
                "new_price": new_price
            }


market_scanner_service = MarketScannerService()
