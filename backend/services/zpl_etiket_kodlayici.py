import textwrap
import datetime
import re

MONTHS_TR = {
    1: 'Oca', 2: 'Sub', 3: 'Mar', 4: 'Nis', 5: 'May', 6: 'Haz',
    7: 'Tem', 8: 'Agu', 9: 'Eyl', 10: 'Eki', 11: 'Kas', 12: 'Ara'
}

def get_online_or_system_date():
    """Türkiye yerel saati ile güncel tarihi döner."""
    now = datetime.datetime.now()
    return f"{now.day} {MONTHS_TR.get(now.month, '')} {now.year}"

def clean_tr(text):
    """Termal yazıcı fontları için Türkçe karakter uyumluluğu ve temizleme."""
    if not text:
        return ""
    replacements = {
        'ı': 'i', 'İ': 'I',
        'ğ': 'g', 'Ğ': 'G',
        'ü': 'u', 'Ü': 'U',
        'ş': 's', 'Ş': 'S',
        'ö': 'o', 'Ö': 'O',
        'ç': 'c', 'Ç': 'C',
    }
    res = str(text)
    for k, v in replacements.items():
        res = res.replace(k, v)
    # ZPL komut karakterlerini temizle (yazıcı komut akışının bozulmasını önler)
    res = res.replace('^', '-').replace('~', '-')
    return res

def split_title_lines(title1, title2="", max_chars_per_line=34):
    """Ürün başlığını güvenli karakter sınırına göre 1 veya 2 satıra böler."""
    t1 = clean_tr(title1).strip().upper()
    t2 = clean_tr(title2).strip().upper()
    
    if t2:
        return t1[:44], t2[:44]
    
    # 32 karaktere kadar tek satırda büyük ve geniş bas
    if len(t1) <= max_chars_per_line:
        return t1, ""
        
    lines = textwrap.wrap(t1, width=max_chars_per_line)
    line1 = lines[0] if len(lines) > 0 else ""
    line2 = " ".join(lines[1:]) if len(lines) > 1 else ""

    # Eğer 2. satır yalnız bir birimle başlıyorsa (örn: "GR" veya "LT") ve 1. satırın sonu sayıysa (örn: "600"),
    # sayıyı da 2. satıra alarak "600 GR" bütünlüğünü sağla
    unit_words = {'GR', 'GRAM', 'KG', 'LT', 'LITRE', 'LİTRE', 'ML', 'CL', 'ADET', 'LI', 'LU', 'LÜ', 'PK', 'PAKET'}
    t1_words = line1.split()
    t2_words = line2.split()
    if t2_words and len(t1_words) > 1:
        first_t2_clean = re.sub(r'[^A-ZÇĞİÖŞÜ]', '', t2_words[0])
        last_t1 = t1_words[-1]
        is_unit_orphan = (first_t2_clean in unit_words) or (len(line2) <= 3)
        is_prev_number = bool(re.search(r'\d+', last_t1))
        if is_unit_orphan or is_prev_number:
            moved = t1_words.pop()
            t2_words.insert(0, moved)
            line1 = " ".join(t1_words)
            line2 = " ".join(t2_words)

    return line1[:44], line2[:44]

def generate_market_shelf_zpl(data, orientation="POR", x_offset=0, y_offset=0, width_mm=76, height_mm=40, dpi=203, copies=1):
    """
    Özelleştirilebilir Market Raf Etiketi ZPL Motoru.
    
    data['top_right_mode'] seçenekleri:
    - 'empty'       : Sağ üst boş, tam genişlik başlık (Varsayılan)
    - 'unit_price'  : Sade Birim Fiyat Kutusu (Birim Fiyat: 250,00 TL/Kg)
    - 'weight'      : Gramaj / Miktar Rozeti ([ NET: 35 GR ])
    - 'code'        : Reyon / Ürün Kodu ([ REYON: A-04 ])
    - 'qr'          : Karekod (QR Kod)
    - 'campaign'    : Siyah Zemin Fırsat / Kampanya Rozeti
    - 'yerli'       : Resmi Yerli Üretim Logosu
    """
    dpmm = 8 if dpi == 203 else 12
    qty = max(1, int(copies))
    
    w_dots = int(width_mm * dpmm) # ~608 dot
    h_dots = int(height_mm * dpmm) # ~320 dot

    top_right_mode = data.get('top_right_mode', 'empty')
    top_right_text = clean_tr(data.get('top_right_text', '')).strip()

    # Eğer sağ üst doluysa başlık karakter limitini ayarla
    max_title_chars = 26 if top_right_mode != 'empty' else 38
    raw_t1 = data.get('title1', 'ULK 398-6 PIKO PORTAKAL')
    raw_t2 = data.get('title2', 'PIR PAT KAP')
    t1, t2 = split_title_lines(raw_t1, raw_t2, max_chars_per_line=max_title_chars)

    from backend.services.printer_service import load_settings
    settings = load_settings()
    configured_brand = str(settings.get("market_name") or data.get("brand") or "MARKET").strip().upper()

    # Barkodun üstündeki mağaza/market adı (Kullanıcı ayarlarından dinamik)
    brand = configured_brand
    origin = clean_tr(data.get('origin', 'TURKIYE')).strip().upper()
    
    # Tarih belirleme (Yalnızca gün/ay/yıl tarihi - saat kaldırıldı)
    custom_date = data.get('date')
    if custom_date and str(custom_date).strip():
        date_raw = str(custom_date).strip()
        # Eğer saat içeriyorsa (örn: '25.09.2025 21:00:41' veya '2026-09-09 17:33:33') sadece tarih kısmını al
        date_raw = date_raw.split()[0]
        date = clean_tr(date_raw).strip()
    else:
        date = get_online_or_system_date()
        
    unit_price = clean_tr(data.get('unit_price', '250.00 TL/Kg')).strip()
    barcode = str(data.get('barcode', '8690504114925')).strip()
    price = str(data.get('price', '10,00 TL')).replace('₺', 'TL').strip()

    # Kalibrasyon Ofsetleri
    oy = int(y_offset) + 100
    ox = int(x_offset) + 28

    if orientation in ["POR", "90", "YATAY", "horizontal"]:
        # =========================================================================
        # 90 DERECE YATAY BASKI MODU (Termal Rulo Uyumlu)
        # =========================================================================
        pw = h_dots + ox + 10
        ll = w_dots
        
        zpl = [
            "^XA",
            "^CI28",                # UTF-8 Kod Sayfası
            "~SD22",                # Koyu net termal kontrast
            "^MNY",                 # Ara boşluk (Gap) algılama sensörü
            "^MMT",                 # Tear-off yırtma modu
            f"^PW{pw}",             # Kafa genişliği
            f"^LL{ll}",             # Kağıt uzunluğu
            "^LH0,0",
        ]

        # -------------------------------------------------------------
        # 1. BÖLÜM (ÜST KATMAN): Başlıklar & Özelleştirilebilir Sağ Üst
        # -------------------------------------------------------------
        if t2:
            zpl.extend([
                f"^FO{ox + 270},{oy + 18}^A0R,30,26^FD{t1}^FS",
                f"^FO{ox + 238},{oy + 18}^A0R,28,24^FD{t2}^FS",
            ])
        else:
            # Tek satırda büyük ve geniş basım (Karakter uzunluğuna göre maksimum okunabilirlik)
            t1_len = len(t1)
            if t1_len <= 20:
                font_h, font_w = 44, 38
                pos_x = ox + 248
            elif t1_len <= 28:
                font_h, font_w = 40, 34
                pos_x = ox + 250
            else:
                font_h, font_w = 34, 28
                pos_x = ox + 254

            zpl.append(f"^FO{pos_x},{oy + 18}^A0R,{font_h},{font_w}^FD{t1}^FS")

        # Sağ Üst Köşe Özelleştirmeleri
        if top_right_mode == 'unit_price':
            # Sade Birim Fiyat Kutusu
            box_x = ox + 230
            box_y = oy + w_dots - 175
            val = top_right_text or unit_price
            zpl.extend([
                f"^FO{box_x},{box_y}^GB75,165,2^FS",
                f"^FO{box_x + 48},{box_y + 10}^A0R,15,13^FDBirim Fiyat:^FS",
                f"^FO{box_x + 18},{box_y + 15}^A0R,20,18^FD{val}^FS",
            ])

        elif top_right_mode == 'weight':
            # Gramaj / Miktar Rozeti
            box_x = ox + 235
            box_y = oy + w_dots - 155
            val = top_right_text or "NET: 35 GR"
            zpl.extend([
                f"^FO{box_x},{box_y}^GB65,145,2^FS",
                f"^FO{box_x + 20},{box_y + 15}^A0R,24,20^FD{val}^FS",
            ])

        elif top_right_mode == 'code':
            # Reyon / Ürün Kodu
            box_x = ox + 235
            box_y = oy + w_dots - 155
            val = top_right_text or "REYON: A-04"
            zpl.extend([
                f"^FO{box_x},{box_y}^GB65,145,2^FS",
                f"^FO{box_x + 20},{box_y + 15}^A0R,22,18^FD{val}^FS",
            ])

        elif top_right_mode == 'qr':
            # QR Kod
            qr_data = top_right_text or barcode or "https://market.com"
            box_x = ox + 230
            box_y = oy + w_dots - 100
            zpl.append(f"^FO{box_x},{box_y}^BQN,2,3^FDQA,{qr_data}^FS")

        elif top_right_mode == 'campaign':
            # Kampanya Rozeti (Siyah Zemin)
            box_x = ox + 235
            box_y = oy + w_dots - 165
            val = top_right_text or "SUPER FIYAT"
            zpl.extend([
                f"^FO{box_x},{box_y}^GB65,155,65^FS",
                f"^FO{box_x + 18},{box_y + 12}^A0R,24,20^FR^FD{val}^FS",
            ])

        elif top_right_mode == 'yerli':
            # Resmi Yerli Üretim Logosu
            box_x = ox + 225
            box_y = oy + w_dots - 185
            zpl.extend([
                f"^FO{box_x},{box_y}^GB85,175,2^FS",
                f"^FO{box_x + 50},{box_y + 8}^GB26,26,2^FS",
                f"^FO{box_x + 53},{box_y + 11}^A0R,14,12^FD[YERLI]^FS",
                f"^FO{box_x + 25},{box_y + 11}^A0R,14,12^FD[URETIM]^FS",
                f"^FO{box_x + 55},{box_y + 70}^A0R,14,12^FDBirim Fiyat - Kg/Lt/Ad^FS",
                f"^FO{box_x + 25},{box_y + 80}^A0R,18,16^FD{unit_price}^FS",
            ])

        # 1. AYRAÇ ÇİZGİSİ (Yatay Boydan Boya)
        zpl.append(f"^FO{ox + 215},{oy + 10}^GB2,{w_dots - 20},2^FS")

        # -------------------------------------------------------------
        # 2. BÖLÜM (ORTA KATMAN): Marka (Sol) & 3 Satır Yasal Bilgi (Sağ)
        # Yarenler (Marka) 0.1 cm (8 dot) aşağı taşındı (ox + 168 -> ox + 160)
        # -------------------------------------------------------------
        zpl.append(f"^FO{ox + 160},{oy + 20}^A0R,34,28^FD{brand}^FS")

        mid_y = oy + int(w_dots * 0.35)
        zpl.extend([
            f"^FO{ox + 188},{mid_y}^A0R,16,14^FDUretim Yeri: {origin}^FS",
            f"^FO{ox + 161},{mid_y}^A0R,15,13^FDFiyatlarimiza Kdv Dahildir.^FS",
            f"^FO{ox + 135},{mid_y}^A0R,15,13^FDFiyat Degistirme Tarihi: {date}^FS",
        ])

        # 2. AYRAÇ ÇİZGİSİ (Yatay Boydan Boya)
        zpl.append(f"^FO{ox + 122},{oy + 10}^GB2,{w_dots - 20},2^FS")

        # -------------------------------------------------------------
        # 3. BÖLÜM (ALT KATMAN): EAN-13 Barkod | Satış Fiyatı | BÜYÜK FİYAT
        # -------------------------------------------------------------
        # Barkod alanı sol tarafta güvenli mesafede
        clean_bc = re.sub(r'[^0-9A-Za-z]', '', barcode)
        if len(clean_bc) == 13 and clean_bc.isdigit():
            zpl.append(f"^FO{ox + 41},{oy + 18}^BER,52,Y,N^FD{clean_bc}^FS")
        elif len(clean_bc) == 8 and clean_bc.isdigit():
            zpl.append(f"^FO{ox + 41},{oy + 18}^BER,52,Y,N^FD{clean_bc}^FS")
        else:
            # Code 128 için daraltılmış çizgi kalınlığı
            zpl.append(f"^FO{ox + 41},{oy + 18}^BY2,3,52^BCR,52,Y,N,N^FD{clean_bc or '00000000'}^FS")

        # Satış Fiyatı Dikey Ayracı (Kutu ve yazı)
        div_y = oy + int(w_dots * 0.38)
        zpl.extend([
            f"^FO{ox + 16},{div_y}^GB82,54,2^FS",
            f"^FO{ox + 48},{div_y + 8}^A0R,16,14^FDSatis^FS",
            f"^FO{ox + 20},{div_y + 8}^A0R,16,14^FDFiyati^FS",
        ])

        # SATIŞ FİYATI (Sağ Alt - Örn: 1.250,00 TL veya 10,00 TL)
        # Fiyat karakter uzunluğuna göre dinamik font boyutu seçimi (Taşmayı ve '00' kesilmesini önler)
        price_clean = str(price).strip()
        price_len = len(price_clean)
        
        if price_len >= 11:
            # Örn: "1.250,00 TL" veya daha uzun
            f_h, f_w = 70, 56
            price_y = oy + int(w_dots * 0.48)
        elif price_len >= 9:
            # Örn: "150,00 TL"
            f_h, f_w = 80, 64
            price_y = oy + int(w_dots * 0.49)
        else:
            # Standart: "10,00 TL", "5,00 TL"
            f_h, f_w = 88, 70
            price_y = oy + int(w_dots * 0.50)

        zpl.append(f"^FO{ox + 8},{price_y}^A0R,{f_h},{f_w}^FD{price_clean}^FS")

        if qty > 1:
            zpl.append(f"^PQ{qty},0,1,Y")

        zpl.append("^XZ\r\n")
        return "\r\n".join(zpl)

    else:
        # 0 DERECE DÜZ MOD
        zpl = [
            "^XA",
            "^CI28",
            "~SD22",
            "^MNY",
            "^MMT",
            f"^PW{w_dots}",
            f"^LL{h_dots}",
            "^LH0,0",
        ]

        if t2:
            zpl.extend([
                f"^FO{ox + 20},{oy + 15}^A0N,28,24^FD{t1}^FS",
                f"^FO{ox + 20},{oy + 48}^A0N,24,20^FD{t2}^FS",
            ])
        else:
            zpl.append(f"^FO{ox + 20},{oy + 22}^A0N,38,34^FD{t1}^FS")

        # Üretim yeri & yasal bilgiler 1 tık yukarı (-12 dot)
        line1_y = oy + int(h_dots * 0.32) - 12
        zpl.append(f"^FO{ox + 10},{line1_y}^GB{w_dots - 20},2,2^FS")

        # Yarenler (Marka) 0.1 cm (+8 dot) aşağı taşındı
        zpl.append(f"^FO{ox + 20},{line1_y + 23}^A0N,32,28^FD{brand}^FS")

        legal_x = ox + int(w_dots * 0.36)
        zpl.extend([
            f"^FO{legal_x},{line1_y + 10}^A0N,16,14^FDUretim Yeri: {origin}^FS",
            f"^FO{legal_x},{line1_y + 30}^A0N,15,13^FDFiyatlarimiza Kdv Dahildir.^FS",
            f"^FO{legal_x},{line1_y + 50}^A0N,15,13^FDFiyat Degistirme Tarihi: {date}^FS",
        ])

        line2_y = oy + int(h_dots * 0.62)
        zpl.append(f"^FO{ox + 10},{line2_y}^GB{w_dots - 20},2,2^FS")

        # Barkod 0.1 cm daha (-16 dot) yukarı
        barcode_y = line2_y + 15 - 16
        if len(barcode) == 13 and barcode.isdigit():
            zpl.append(f"^FO{ox + 35},{barcode_y}^BEN,52,Y,N^FD{barcode}^FS")
        else:
            zpl.append(f"^FO{ox + 35},{barcode_y}^BY2^BCN,52,Y,N,N^FD{barcode}^FS")

        div_x = ox + int(w_dots * 0.42)
        zpl.extend([
            f"^FO{div_x},{line2_y + 10}^GB65,{int(h_dots * 0.32)},2^FS",
            f"^FO{div_x + 8},{line2_y + 20}^A0N,16,14^FDSatis^FS",
            f"^FO{div_x + 8},{line2_y + 45}^A0N,16,14^FDFiyati^FS",
        ])

        price_x = ox + int(w_dots * 0.55)
        zpl.append(f"^FO{price_x},{line2_y + 16}^A0N,92,74^FD{price}^FS")

        if qty > 1:
            zpl.append(f"^PQ{qty},0,1,Y")

        zpl.append("^XZ\r\n")
        return "\r\n".join(zpl)
