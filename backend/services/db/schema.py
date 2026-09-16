# -*- coding: utf-8 -*-
"""
🏗️ Database Schema & Auto-Discovery
Tablo kurulumları, migration kontrolleri, otomatik keşif ve başlık temizleme
"""
import os
import sqlite3
from backend.config import DB_PATH
from backend.services.db.connection import db_session
from backend.utils.text_utils import clean_product_title, format_product_dict, parse_price, unify_product_title, fold_turkish_text, is_invalid_or_blacklisted_product

def init_db():
    """Veritabanı tablolarını ve eksik sütunları otomatik günceller."""
    with db_session() as conn:
        cursor = conn.cursor()
        
        # 1. Ana Tablo
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS urunler (
            barcode TEXT PRIMARY KEY,
            stock_code TEXT,
            title TEXT NOT NULL,
            raw_system_title TEXT,
            price REAL NOT NULL DEFAULT 0,
            label_price REAL,
            price_updated_at TEXT,
            brand TEXT,
            unit TEXT DEFAULT 'ADET',
            source_device TEXT DEFAULT 'OYMAPOS Barkod Sistemi',
            is_new INTEGER DEFAULT 0,
            is_blacklisted INTEGER DEFAULT 0,
            is_archived INTEGER DEFAULT 0,
            archived_at TEXT,
            created_at TEXT,
            updated_at TEXT,
            last_printed_at TEXT
        );
        """)
        
        # 2. Mevcut Sütunları Kontrol Et & Eksik Varsa Ekle (Migration)
        cursor.execute("PRAGMA table_info(urunler);")
        existing_cols = {r["name"] for r in cursor.fetchall()}
        
        migrations = [
            ("stock_code", "TEXT"),
            ("title", "TEXT"),
            ("raw_system_title", "TEXT"),
            ("price", "REAL DEFAULT 0"),
            ("label_price", "REAL"),
            ("price_updated_at", "TEXT"),
            ("brand", "TEXT"),
            ("unit", "TEXT DEFAULT 'ADET'"),
            ("source_device", "TEXT DEFAULT 'OYMAPOS Barkod Sistemi'"),
            ("is_new", "INTEGER DEFAULT 0"),
            ("is_blacklisted", "INTEGER DEFAULT 0"),
            ("is_archived", "INTEGER DEFAULT 0"),
            ("archived_at", "TEXT"),
            ("created_at", "TEXT"),
            ("updated_at", "TEXT"),
            ("last_printed_at", "TEXT")
        ]
        for col_name, col_def in migrations:
            if col_name not in existing_cols:
                try:
                    cursor.execute(f"ALTER TABLE urunler ADD COLUMN {col_name} {col_def};")
                except Exception:
                    pass

        # 3. İndeksler
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_urunler_title ON urunler(title);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_urunler_brand ON urunler(brand);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_urunler_stock_code ON urunler(stock_code);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_urunler_is_new ON urunler(is_new);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_urunler_label_price ON urunler(label_price);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_urunler_last_printed ON urunler(last_printed_at);")

        # 4. Senkronizasyon Geçmişi
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS vegawin_sync_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            source_file TEXT,
            device_name TEXT DEFAULT 'VegaWin PC',
            total_products INTEGER DEFAULT 0,
            updated_products INTEGER DEFAULT 0,
            new_products INTEGER DEFAULT 0,
            price_changes_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'success'
        );
        """)

        cursor.execute("PRAGMA table_info(vegawin_sync_history);")
        sync_cols = {r["name"] for r in cursor.fetchall()}
        if "device_name" not in sync_cols:
            try:
                cursor.execute("ALTER TABLE vegawin_sync_history ADD COLUMN device_name TEXT DEFAULT 'VegaWin PC';")
            except Exception:
                pass

        # 5. Fiyat Değişimleri
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS vegawin_price_changes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sync_id INTEGER,
            barcode TEXT NOT NULL,
            title TEXT NOT NULL,
            old_price REAL DEFAULT 0,
            new_price REAL DEFAULT 0,
            diff_amount REAL DEFAULT 0,
            diff_percent REAL DEFAULT 0,
            changed_at TEXT NOT NULL,
            source_device TEXT DEFAULT 'VegaWin',
            is_printed INTEGER DEFAULT 0
        );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_price_changes_printed ON vegawin_price_changes(is_printed);")

        cursor.execute("PRAGMA table_info(vegawin_price_changes);")
        pc_cols = {r["name"] for r in cursor.fetchall()}
        if "source_device" not in pc_cols:
            try:
                cursor.execute("ALTER TABLE vegawin_price_changes ADD COLUMN source_device TEXT DEFAULT 'VegaWin';")
            except Exception:
                pass

        # 6. Yeni Eklenen Ürünler Takibi
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS vegawin_new_products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sync_id INTEGER,
            barcode TEXT NOT NULL,
            title TEXT NOT NULL,
            price REAL DEFAULT 0,
            created_at TEXT NOT NULL,
            source_device TEXT DEFAULT 'VegaWin',
            is_printed INTEGER DEFAULT 0
        );
        """)
        cursor.execute("PRAGMA table_info(vegawin_new_products);")
        np_cols = {r["name"] for r in cursor.fetchall()}
        if "source_device" not in np_cols:
            try:
                cursor.execute("ALTER TABLE vegawin_new_products ADD COLUMN source_device TEXT DEFAULT 'VegaWin';")
            except Exception:
                pass
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_new_products_printed ON vegawin_new_products(is_printed);")

        # 7. Kapsamlı Ürün Değişiklik & Audit Geçmişi
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS product_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sync_id INTEGER,
            barcode TEXT NOT NULL,
            event_type TEXT NOT NULL,
            old_title TEXT,
            new_title TEXT,
            old_price REAL,
            new_price REAL,
            diff_amount REAL DEFAULT 0,
            diff_percent REAL DEFAULT 0,
            source TEXT DEFAULT 'Sistem',
            device_name TEXT DEFAULT 'Ana PC',
            details TEXT,
            created_at TEXT NOT NULL
        );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_prod_history_barcode ON product_history(barcode);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_prod_history_sync_id ON product_history(sync_id);")

        # 8. Piyasa Fiyat Radarı & Zam Denetimi (Market Price Audits)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS market_price_audits (
            barcode TEXT PRIMARY KEY,
            market_price REAL DEFAULT 0,
            min_price REAL DEFAULT 0,
            max_price REAL DEFAULT 0,
            found_sources TEXT,
            search_query TEXT,
            last_scanned_at TEXT,
            diff_amount REAL DEFAULT 0,
            diff_percent REAL DEFAULT 0,
            status TEXT DEFAULT 'scanned'
        );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_market_audits_diff ON market_price_audits(diff_percent);")

        # 9. Otomatik Keşif (Sadece veritabanı tamamen boşken ilk kurulumda)
        cursor.execute("SELECT COUNT(*) as total FROM urunler;")
        if cursor.fetchone()["total"] == 0:
            auto_discover_and_import(conn)

def cleanup_all_existing_titles_in_db(conn):
    """
    Kullanıcının veritabanındaki orijinal ürün adlarını ve fiyatlarını korur.
    Gereksiz ezme / otomatik birleştirme yapmaz.
    """
    pass

def auto_discover_and_import(conn):
    """Eğer veritabanı boşsa, çevredeki OYMAPOS veya VegaWin veritabanlarını otomatik bulup aktarır."""
    possible_paths = [
        os.path.abspath(os.path.join(os.path.dirname(DB_PATH), "..", "..", "OYMAPOS Barkod Sistemi", "data", "market_sistemi.db")),
        r"C:\Users\User\Desktop\OYMAPOS Barkod Sistemi\data\market_sistemi.db",
        r"C:\OYMAPOS Barkod Sistemi\data\market_sistemi.db",
        r"D:\OYMAPOS Barkod Sistemi\data\market_sistemi.db",
    ]

    for p in possible_paths:
        if os.path.isfile(p) and p != DB_PATH:
            try:
                src_conn = sqlite3.connect(p)
                src_conn.row_factory = sqlite3.Row
                src_cursor = src_conn.cursor()
                src_cursor.execute("SELECT * FROM urunler;")
                rows = src_cursor.fetchall()
                if rows:
                    dest_cursor = conn.cursor()
                    for r in rows:
                        d = format_product_dict(r)
                        dest_cursor.execute("""
                        INSERT OR IGNORE INTO urunler (barcode, stock_code, title, price, brand, unit, source_device, is_new, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                        """, (
                            d["barcode"],
                            d.get("stock_code", ""),
                            d["title"],
                            d["price"],
                            d.get("brand", ""),
                            d.get("unit", "ADET"),
                            d.get("source_device", "OYMAPOS Barkod Sistemi"),
                            0,
                            d.get("created_at", ""),
                            d.get("updated_at", "")
                        ))
                    print(f"📦 [Otomatik Keşif] {len(rows)} ürün '{p}' kaynağından içe aktarıldı.")
                src_conn.close()
                break
            except Exception as e:
                print(f"⚠️ [Otomatik Keşif] {p} okunamadı: {e}")
