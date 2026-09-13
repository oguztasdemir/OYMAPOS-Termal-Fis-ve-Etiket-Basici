# -*- coding: utf-8 -*-
"""
🗄️ SQLite Veritabanı Servisi (Modular Facade & Backward Compatibility Layer)
Tüm db repository ve text util fonksiyonlarını dışa aktararak geriye dönük 100% uyumluluk sağlar.
"""
from backend.utils.text_utils import (
    fix_turkish_corrupted_chars, strip_supplier_stock_codes, clean_product_title,
    fold_turkish_text, clean_barcode_text, parse_price, format_product_dict,
    decode_scale_barcode
)
from backend.services.db.connection import get_connection, db_session
from backend.services.db.schema import init_db, cleanup_all_existing_titles_in_db, auto_discover_and_import
from backend.services.db.product_repo import (
    get_all_products, search_products, get_product_by_barcode,
    get_product_price_history, get_products_count, get_new_products_list,
    mark_new_products_as_printed, update_product_printed_time, sync_all_label_prices_to_pos_price
)
from backend.services.db.history_repo import (
    record_product_history, get_full_product_history, revert_product_history, update_product_details
)
from backend.services.db.sync_repo import (
    get_sync_history_list, rollback_sync_batch, preview_from_source_db,
    import_all_from_source_db, update_products_by_clipboard_data, preview_clipboard_price_update
)

