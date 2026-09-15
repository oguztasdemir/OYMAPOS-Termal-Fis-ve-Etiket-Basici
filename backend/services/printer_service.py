# -*- coding: utf-8 -*-
"""
🖨️ Termal Etiket ve Fiş Yazıcı Servisi (OYMAPOS Standart TSPL/ZPL, Windows Spooler, Çift Yazıcı & Kuyruk Yönetimi)
"""
import platform
import json
import os
import re
import time
import datetime
from backend.config import SETTINGS_FILE, DEFAULT_SETTINGS, DATA_DIR

def load_settings() -> dict:
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                return {**DEFAULT_SETTINGS, **json.load(f)}
        except Exception:
            pass
    return DEFAULT_SETTINGS.copy()

def save_settings(new_settings: dict) -> dict:
    current = load_settings()
    current.update(new_settings)
    with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(current, f, ensure_ascii=False, indent=2)
    return current

def get_installed_printers() -> list:
    """İşletim sisteminde yüklü yazıcıların listesini döner."""
    printers = []
    if platform.system() == "Windows":
        try:
            import win32print
            for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS):
                printers.append(p[2])
        except Exception:
            pass
    if not printers:
        printers = ["Termal Etiket Yazici", "Xprinter XP-365B", "Zebra ZD220", "Argox OS-214plus", "Microsoft Print to PDF"]
    return printers

def check_printer_connection(printer_name: str = None) -> dict:
    """Yazıcının sisteme bağlı ve hazır olup olmadığını denetler."""
    if not printer_name:
        settings = load_settings()
        printer_name = settings.get("printer", "Termal Etiket Yazici")

    if platform.system() != "Windows":
        return {
            "connected": True,
            "status_text": "Aktif (Simülasyon)",
            "printer_name": printer_name,
            "port": "VIRTUAL",
            "driver": "Virtual Driver",
            "jobs_in_queue": 0
        }

    try:
        import win32print
        handle = win32print.OpenPrinter(printer_name)
        try:
            info = win32print.GetPrinter(handle, 2)
            jobs = win32print.EnumJobs(handle, 0, -1, 1)
            port_name = info.get("pPortName", "")
            driver_name = info.get("pDriverName", "")
            status_flags = info.get("Status", 0)
            attr_flags = info.get("Attributes", 0)

            # Windows Yazıcı Spooler Bayrakları
            PRINTER_ATTRIBUTE_WORK_OFFLINE = 0x00000400
            PRINTER_STATUS_OFFLINE = 0x00000080
            PRINTER_STATUS_ERROR = 0x00000002
            PRINTER_STATUS_PAUSED = 0x00000001
            PRINTER_STATUS_NOT_AVAILABLE = 0x00001000
            PRINTER_STATUS_NO_TONER = 0x00040000
            PRINTER_STATUS_OUT_OF_MEMORY = 0x00200000
            PRINTER_STATUS_OUTPUT_BIN_FULL = 0x00000800
            PRINTER_STATUS_PAGE_PUNT = 0x00080000
            PRINTER_STATUS_PAPER_JAM = 0x00000008
            PRINTER_STATUS_PAPER_OUT = 0x00000010
            PRINTER_STATUS_PAPER_PROBLEM = 0x00000040

            # Gerçek Çevrimdışı ve Bağlantı Kontrolü
            is_work_offline = bool(attr_flags & PRINTER_ATTRIBUTE_WORK_OFFLINE)
            is_status_offline = bool(status_flags & (PRINTER_STATUS_OFFLINE | PRINTER_STATUS_NOT_AVAILABLE))
            is_offline = is_work_offline or is_status_offline
            is_error = bool(status_flags & PRINTER_STATUS_ERROR)
            is_paused = bool(status_flags & PRINTER_STATUS_PAUSED)
            is_paper_out = bool(status_flags & (PRINTER_STATUS_PAPER_OUT | PRINTER_STATUS_PAPER_PROBLEM))
            is_paper_jam = bool(status_flags & PRINTER_STATUS_PAPER_JAM)
            
            connected = not (is_offline or is_error)
            
            if is_offline:
                status_text = "Çevrimdışı / Bağlı Değil"
            elif is_error:
                status_text = "Yazıcı Hatası"
            elif is_paper_out:
                status_text = "Kağıt / Etiket Bitti"
            elif is_paper_jam:
                status_text = "Kağıt Sıkışması"
            elif is_paused:
                status_text = "Duraklatıldı"
            else:
                status_text = "Aktif & Hazır"

            return {
                "connected": connected,
                "status_text": status_text,
                "printer_name": printer_name,
                "port": port_name,
                "driver": driver_name,
                "jobs_in_queue": len(jobs)
            }
        finally:
            win32print.ClosePrinter(handle)
    except Exception as e:
        return {
            "connected": False,
            "status_text": f"Bağlı Değil ({str(e)})",
            "printer_name": printer_name,
            "port": "",
            "driver": "",
            "jobs_in_queue": 0
        }

PRINT_HISTORY_FILE = os.path.join(DATA_DIR, "baski_gecmisi.json")

def get_print_history(limit: int = 50) -> list:
    """Son etiket baskı geçmişini döner."""
    if os.path.exists(PRINT_HISTORY_FILE):
        try:
            with open(PRINT_HISTORY_FILE, 'r', encoding='utf-8') as f:
                history = json.load(f)
                return history[:limit]
        except Exception:
            return []
    return []

def log_print_job(barcode: str, title: str, price, copies: int = 1, status: str = "success", message: str = ""):
    """Yapılan baskıyı geçmişe kaydeder."""
    try:
        history = []
        if os.path.exists(PRINT_HISTORY_FILE):
            try:
                with open(PRINT_HISTORY_FILE, 'r', encoding='utf-8') as f:
                    history = json.load(f)
            except Exception:
                history = []

        now_str = datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")
        record = {
            "id": int(time.time() * 1000) if 'time' in globals() else int(datetime.datetime.now().timestamp() * 1000),
            "barcode": barcode or "-",
            "title": title or "-",
            "price": price,
            "copies": copies,
            "status": status,
            "message": message,
            "printed_at": now_str
        }
        history.insert(0, record)
        history = history[:200] # Maksimum son 200 baskıyı sakla

        with open(PRINT_HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

def clean_turkish(text: str) -> str:
    if not text:
        return ""
    tr_map = {
        'ı': 'I', 'İ': 'I', 'i': 'I',
        'ş': 'S', 'Ş': 'S',
        'ğ': 'G', 'Ğ': 'G',
        'ü': 'U', 'Ü': 'U',
        'ö': 'O', 'Ö': 'O',
        'ç': 'C', 'Ç': 'C',
        '₺': 'TL'
    }
    res = []
    for ch in str(text):
        res.append(tr_map.get(ch, ch))
    cleaned = "".join(res)
    # TSPL çift tırnak komut kırılmasını önle
    return cleaned.replace('"', "'")

def format_price_display(val) -> str:
    if val is None:
        return "0,00 TL"
    try:
        f = float(str(val).replace('TL', '').replace('tl', '').replace('₺', '').replace(',', '.').strip())
        return f"{f:.2f} TL".replace('.', ',')
    except Exception:
        return f"{val} TL"

def generate_tspl_command(data: dict, width_mm=None, height_mm=None, darkness=None, orientation=None, x_offset=None, y_offset=None, copies=1, template_data=None) -> bytes:
    """OYMAPOS Dinamik ve Şablon Duyarlı TSPL-II etiket komutunu üretir."""
    from backend.services.template_service import get_default_template

    settings = load_settings()
    tpl = template_data or get_default_template() or {}

    # Öncelik: Fonksiyon parametresi > Şablon ayarı > Genel ayarlar
    w_mm = int(width_mm if width_mm is not None else tpl.get("width_mm", settings.get("width_mm", 76)))
    h_mm = int(height_mm if height_mm is not None else tpl.get("height_mm", settings.get("height_mm", 40)))
    dark = int(darkness if darkness is not None else settings.get("darkness", 22))
    orient = str(orientation if orientation is not None else settings.get("orientation", "POR"))
    x_off = int(x_offset if x_offset is not None else settings.get("x_offset", 0))
    y_off = int(y_offset if y_offset is not None else settings.get("y_offset", 0))

    # 203 DPI = 8 dots / mm
    total_w = w_mm * 8
    total_h = h_mm * 8

    lines = []
    lines.append(f"SIZE {w_mm} mm, {h_mm} mm")
    lines.append("GAP 2 mm, 0 mm")
    direction = "1" if orient == "POR" else "0"
    lines.append(f"DIRECTION {direction}")
    lines.append(f"DENSITY {dark}")
    lines.append("CLS")

    # Başlık ve metin ayrıştırma
    from backend.services.db_service import clean_product_title
    raw_incoming_title = (data.get('title') or data.get('title1') or '').strip()
    full_title = clean_turkish(clean_product_title(raw_incoming_title).upper())
    max_char_per_line = max(18, int(w_mm * 0.45))
    if len(full_title) <= max_char_per_line:
        title1 = full_title
        title2 = ""
    else:
        words = full_title.split()
        t1_words, t2_words = [], []
        cur_len = 0
        for w in words:
            if cur_len + len(w) <= max_char_per_line and not t2_words:
                t1_words.append(w)
                cur_len += len(w) + 1
            else:
                t2_words.append(w)

        # Eğer 2. satırda tek başına birim kalmışsa (örn: ["GR"]) ve 1. satırın sonu sayıysa (örn: "600"),
        # veya 2. satır 3 karakterden kısaysa, 1. satırın son kelimesini 2. satırın başına al
        unit_words = {'GR', 'GRAM', 'KG', 'LT', 'LITRE', 'LİTRE', 'ML', 'CL', 'ADET', 'LI', 'LU', 'LÜ', 'PK', 'PAKET'}
        if t2_words and len(t1_words) > 1:
            first_t2_clean = re.sub(r'[^A-ZÇĞİÖŞÜ]', '', t2_words[0])
            last_t1 = t1_words[-1]
            is_unit_orphan = (first_t2_clean in unit_words) or (len(" ".join(t2_words)) <= 3)
            is_prev_number = bool(re.search(r'\d+', last_t1))
            if is_unit_orphan or is_prev_number:
                moved = t1_words.pop()
                t2_words.insert(0, moved)

        title1 = " ".join(t1_words) if t1_words else full_title[:max_char_per_line]
        title2 = " ".join(t2_words) if t2_words else full_title[max_char_per_line:]

    default_market = clean_turkish(str(settings.get("market_name") or data.get("brand") or "MARKET").strip().upper())
    brand = default_market
    origin = clean_turkish((data.get('origin') or 'TURKIYE').strip().upper())
    raw_d = str(data.get('date') or datetime.datetime.now().strftime("%d.%m.%Y")).strip()
    date_str = raw_d.split()[0] if raw_d else datetime.datetime.now().strftime("%d.%m.%Y")
    barcode = str(data.get('barcode') or '').strip()
    price_str = format_price_display(data.get('price'))

    show_barcode = tpl.get("show_barcode", True)
    show_origin = tpl.get("show_origin", True)
    show_date = tpl.get("show_date", True)
    top_right_mode = tpl.get("top_right_mode", "empty")

    # 1. Mini Etiket Düzeni (40x20mm veya küçük)
    if w_mm <= 45 or h_mm <= 25:
        # Mini başlık
        lines.append(f'TEXT {8 + x_off},{4 + y_off},"2",0,1,1,"{title1[:20]}"')
        if barcode and show_barcode:
            if barcode.isdigit() and len(barcode) == 13:
                lines.append(f'BARCODE {8 + x_off},{40 + y_off},"EAN13",35,1,0,2,2,"{barcode}"')
            else:
                lines.append(f'BARCODE {8 + x_off},{40 + y_off},"128",35,1,0,2,2,"{barcode}"')
            # Fiyat sağda
            price_x = int(total_w * 0.55) + x_off
            lines.append(f'TEXT {price_x},{45 + y_off},"3",0,1,1,"{price_str}"')
        else:
            # Sadece büyük fiyat
            lines.append(f'TEXT {8 + x_off},{40 + y_off},"4",0,1,1,"{price_str}"')

    # 2. Standart ve Geniş Etiket Düzeni (60x40, 76x40, 85x45 mm)
    else:
        # 1. Satır Ürün Adı
        title_font = "3" if w_mm >= 70 else "2"
        lines.append(f'TEXT {12 + x_off},{8 + y_off},"{title_font}",0,1,1,"{title1[:36]}"')
        
        # 2. Satır Ürün Adı
        if title2:
            lines.append(f'TEXT {12 + x_off},{32 + y_off},"2",0,1,1,"{title2[:42]}"')
            info_box_y = 60
        else:
            info_box_y = 42

        # Bilgi Kutucukları (Market, Menşei, Tarih, Rozet)
        box_h = 24
        box_y1 = info_box_y + y_off
        box_y2 = box_y1 + box_h

        # 1. Kutu: Market Adı
        b1_w = int(total_w * 0.30)
        lines.append(f'BOX {12 + x_off},{box_y1},{12 + b1_w + x_off},{box_y2},2')
        lines.append(f'TEXT {16 + x_off},{box_y1 + 4},"1",0,1,1,"MKT: {brand[:10]}"')

        # 2. Kutu: Menşei (Gösteriliyorsa)
        if show_origin:
            b2_x1 = 18 + b1_w + x_off
            b2_w = int(total_w * 0.28)
            lines.append(f'BOX {b2_x1},{box_y1},{b2_x1 + b2_w},{box_y2},2')
            lines.append(f'TEXT {b2_x1 + 4},{box_y1 + 4},"1",0,1,1,"MEN: {origin[:8]}"')
        else:
            b2_x1 = 18 + b1_w + x_off
            b2_w = 0

        # 3. Kutu: Tarih (Gösteriliyorsa)
        if show_date:
            b3_x1 = b2_x1 + b2_w + (6 if b2_w > 0 else 0)
            b3_w = int(total_w * 0.32)
            lines.append(f'BOX {b3_x1},{box_y1},{b3_x1 + b3_w},{box_y2},2')
            lines.append(f'TEXT {b3_x1 + 4},{box_y1 + 4},"1",0,1,1,"TAR: {date_str}"')

        # Sağ Üst Rozet (Yerli, İndirim vb.)
        if top_right_mode == "yerli":
            lines.append(f'TEXT {total_w - 110 + x_off},{8 + y_off},"1",0,1,1,"[YERLI URETIM]"')
        elif top_right_mode == "discount":
            lines.append(f'TEXT {total_w - 95 + x_off},{8 + y_off},"1",0,1,1,"[INDIRIMLI]"')

        # Alt Bölüm: Barkod ve Fiyat
        bottom_y = box_y2 + 12
        price_box_w = max(160, int(total_w * 0.42))
        price_box_x1 = total_w - price_box_w - 12 + x_off
        price_box_y2 = total_h - 12 + y_off
        price_box_h = price_box_y2 - bottom_y

        # Barkod Çizgileri
        if barcode and show_barcode:
            bc_h = max(35, int(price_box_h * 0.8))
            if barcode.isdigit() and len(barcode) == 13:
                lines.append(f'BARCODE {12 + x_off},{bottom_y},"EAN13",{bc_h},1,0,2,2,"{barcode}"')
            else:
                lines.append(f'BARCODE {12 + x_off},{bottom_y},"128",{bc_h},1,0,2,2,"{barcode}"')

        # Fiyat Kutusu ve Değeri
        lines.append(f'BOX {price_box_x1},{bottom_y},{total_w - 12 + x_off},{price_box_y2},2')
        
        # Fiyat Yazısı Fontu (Büyük ve Net)
        price_font = "4"
        price_font_y = bottom_y + int((price_box_h - 32) / 2)
        lines.append(f'TEXT {price_box_x1 + 8},{price_font_y},"{price_font}",0,2,2,"{price_str}"')

    # Özel Eklenen Katmanlar (Varsa)
    custom_layers = tpl.get("custom_layers", [])
    for lyr in custom_layers:
        l_type = lyr.get("type", "text")
        l_x = int(lyr.get("x", 0)) + x_off
        l_y = int(lyr.get("y", 0)) + y_off
        l_content = clean_turkish(str(lyr.get("content", "")).upper())
        if l_type == "text" and l_content:
            lines.append(f'TEXT {l_x},{l_y},"2",0,1,1,"{l_content}"')
        elif l_type == "box":
            l_w = int(lyr.get("width", 50))
            l_h = int(lyr.get("height", 20))
            lines.append(f'BOX {l_x},{l_y},{l_x + l_w},{l_y + l_h},2')

    lines.append(f"PRINT {copies},1")
    lines.append("") # Boş satır ile sonlandır
    cmd_str = "\r\n".join(lines) + "\r\n"
    return cmd_str.encode('latin1', errors='replace')

def send_raw_to_printer(printer_name: str, raw_data: bytes) -> tuple:
    if platform.system() != "Windows":
        return True, "Simülasyon modu (Windows dışı)"

    try:
        import win32print
        handle = win32print.OpenPrinter(printer_name)
        try:
            win32print.StartDocPrinter(handle, 1, ("Etiket_Baskisi", None, "RAW"))
            try:
                win32print.StartPagePrinter(handle)
                try:
                    win32print.WritePrinter(handle, raw_data)
                finally:
                    win32print.EndPagePrinter(handle)
            finally:
                win32print.EndDocPrinter(handle)
            return True, "Yazıcıya başarıyla iletildi."
        finally:
            win32print.ClosePrinter(handle)
    except Exception as e:
        return False, f"Yazıcı hatası: {str(e)}"

def purge_printer_queue(printer_name: str = None) -> tuple:
    """Yazıcı kuyruğundaki bekleyen tüm yazdırma işlerini temizler/iptal eder."""
    if platform.system() != "Windows":
        return True, "Kuyruk temizlendi (Simülasyon)"
    if not printer_name:
        settings = load_settings()
        printer_name = settings.get("printer", "Termal Etiket Yazici")
    try:
        import win32print
        handle = win32print.OpenPrinter(printer_name, {"DesiredAccess": win32print.PRINTER_ALL_ACCESS})
        try:
            win32print.SetPrinter(handle, 0, None, win32print.PRINTER_CONTROL_PURGE)
            return True, f"'{printer_name}' kuyruğu başarıyla temizlendi."
        finally:
            win32print.ClosePrinter(handle)
    except Exception as e:
        return False, f"Kuyruk temizleme hatası: {str(e)}"

def print_raw_zpl(printer_name: str, zpl_code: str, doc_name="Market Raf Etiketi") -> tuple:
    """Belirtilen Windows yazıcı kuyruğuna ham ZPL baytlarını UTF-8 olarak iletir."""
    if platform.system() != "Windows":
        return True, "Simülasyon modu (Windows dışı)"
    try:
        import win32print
        hPrinter = win32print.OpenPrinter(printer_name)
        try:
            hJob = win32print.StartDocPrinter(hPrinter, 1, (doc_name, None, "RAW"))
            try:
                win32print.StartPagePrinter(hPrinter)
                raw_bytes = zpl_code.encode("utf-8", errors="ignore")
                win32print.WritePrinter(hPrinter, raw_bytes)
                win32print.EndPagePrinter(hPrinter)
            finally:
                win32print.EndDocPrinter(hPrinter)
        finally:
            win32print.ClosePrinter(hPrinter)
        return True, f"'{printer_name}' yazıcısına baskı gönderildi."
    except Exception as e:
        return False, f"ZPL baskı hatası: {str(e)}"

def print_single_label(product: dict, copies=1, template_data=None, target_printer: str = None) -> tuple:
    if not product:
        return False, "Yazdırılacak ürün verisi boş olamaz."
    settings = load_settings()
    printer_name = target_printer or settings.get("printer", "Termal Etiket Yazici")
    
    # Yazıcı bağlantı / çevrimdışı kontrolü (Yumuşak kontrol: Sahte çevrimdışı sürücü bayraklarında baskıyı engellemez)
    conn_info = check_printer_connection(printer_name)
    if not conn_info.get("connected", False):
        status_desc = conn_info.get("status_text") or "Bağlantı Belirsiz"
        # Sadece yazıcı sistemde kesinlikle yoksa veya açılamıyorsa durdur
        if "Bağlı Değil" in status_desc and ("error" in status_desc.lower() or "bulunamadı" in status_desc.lower()):
            return False, f"'{printer_name}' yazıcısına ulaşılamıyor: {status_desc}. Lütfen yazıcının açık ve bağlı olduğunu kontrol edin."
    from backend.services.template_service import get_default_template
    tpl = template_data or get_default_template() or {}
    w_mm = float(tpl.get("width_mm", settings.get("width_mm", 76)))
    h_mm = float(tpl.get("height_mm", settings.get("height_mm", 40)))
    x_off = int(settings.get("x_offset", 0))
    y_off = int(settings.get("y_offset", 0))

    try:
        from backend.services.zpl_etiket_kodlayici import generate_market_shelf_zpl
        full_title = str(product.get("title") or product.get("title1") or "").strip()
        t2_explicit = str(product.get("title2") or "").strip()

        zpl_data = {
            "title1": full_title,
            "title2": t2_explicit,
            "brand": product.get("brand") or settings.get("market_name", "YARENLER"),
            "origin": str(product.get("origin") or "TÜRKİYE"),
            "date": str(product.get("date") or datetime.datetime.now().strftime("%d.%m.%Y")),
            "unit_price": str(product.get("unit_price") or ""),
            "barcode": str(product.get("barcode") or ""),
            "price": format_price_display(product.get("price")),
            "top_right_mode": tpl.get("top_right_mode", "empty"),
            "top_right_text": tpl.get("top_right_text", "")
        }

        zpl_code = generate_market_shelf_zpl(
            zpl_data,
            orientation=settings.get("orientation", "POR"),
            x_offset=x_off,
            y_offset=y_off,
            width_mm=w_mm,
            height_mm=h_mm,
            copies=copies
        )

        success, msg = print_raw_zpl(printer_name, zpl_code, f"Etiket: {full_title[:20]}")
        if not success:
            # Fallback to TSPL
            raw_tspl = generate_tspl_command(product, copies=copies, template_data=template_data)
            success, msg = send_raw_to_printer(printer_name, raw_tspl)

        log_print_job(
            barcode=product.get("barcode", ""),
            title=full_title,
            price=product.get("price"),
            copies=copies,
            status="success" if success else "error",
            message=msg
        )
        return success, msg
    except Exception as e:
        # Hata durumunda TSPL ile dene
        try:
            raw_tspl = generate_tspl_command(product, copies=copies, template_data=template_data)
            success, msg = send_raw_to_printer(printer_name, raw_tspl)
            log_print_job(
                barcode=product.get("barcode", ""),
                title=product.get("title") or product.get("title1", ""),
                price=product.get("price"),
                copies=copies,
                status="success" if success else "error",
                message=msg
            )
            return success, msg
        except Exception as ex:
            err_msg = f"Baskı komutu oluşturulamadı: {str(ex)}"
            log_print_job(
                barcode=product.get("barcode", ""),
                title=product.get("title") or product.get("title1", ""),
                price=product.get("price"),
                copies=copies,
                status="error",
                message=err_msg
            )
            return False, err_msg


