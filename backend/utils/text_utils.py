# -*- coding: utf-8 -*-
"""
🔡 Metin, Türkçe Karakter, Fiyat & Barkod Temizleme Araçları
"""
import os
import re
from typing import Optional

def to_turkish_upper(text: str) -> str:
    """Türkçe karakter kurallarına (i -> İ, ı -> I vb.) uygun büyük harfe çevirir."""
    if not text:
        return ""
    tr_map = {
        'i': 'İ', 'ı': 'I', 'ğ': 'Ğ', 'ü': 'Ü', 'ş': 'Ş', 'ö': 'Ö', 'ç': 'Ç'
    }
    return "".join(tr_map.get(c, c.upper()) for c in str(text))

def fix_turkish_corrupted_chars(text: str) -> str:
    """Bozuk karakterleri ve kodlama artıklarını temizler."""
    if not text:
        return ""
    s = str(text).replace('\x00', '').strip()
    
    # Bozuk unicode artık haritaları
    replace_pairs = [
        ('\ufffd', ''),
        ('  ', ' ')
    ]
    for old, new in replace_pairs:
        s = s.replace(old, new)
        
    return s

# Temizleme regex'i tarafından stok kodu sanılıp yanlışlıkla silinmemesi gereken temel ürün kelimeleri
PROTECTED_WORDS = {
    'SU', 'UN', 'SUT', 'SÜT', 'TUZ', 'YAG', 'YAĞ', 'CAY', 'ÇAY', 'BAL', 'EKMEK', 
    'AYRAN', 'KOLA', 'KOLONYA', 'SODA', 'MUZ', 'ELMA', 'DUT', 'PIRINC', 'PİRİNÇ',
    'BULGUR', 'NOHUT', 'MERCIMEK', 'MERCİMEK', 'MAKARNA', 'YUMURTA', 'PEYNIR', 'PEYNİR',
    'ZEYTIN', 'ZEYTİN', 'KASAR', 'KAŞAR', 'TEREYAG', 'TEREYAĞ', 'SALCA', 'SALÇA', 'SIVI', 'SIVIYAĞ',
    'ETİ', 'ETI', 'ÜLKER', 'ULKER', 'PINAR', 'SÜTAŞ', 'SUTAS', 'DOĞUŞ', 'DOGUS', 'TORKU',
    'LİPTON', 'LIPTON', 'DİMES', 'DIMES', 'CAPPY', 'FANTA', 'SPRITE', 'PEPSI', 'COCA-COLA',
    'NESTLE', 'TAMEK', 'TATLISO', 'TAT', 'ÖNCÜ', 'ONCU', 'YUDUM', 'ORUÇOĞLU', 'KOMİLİ', 'KOMILI'
}

def strip_supplier_stock_codes(title: str) -> str:
    """
    Ürün adındaki tedarikçi stok kodlarını, baştaki barkod numaralarını,
    marka arkasındaki kodları ve sondaki koli/paketleme artıklarını temizler.
    (Örn: '8690579003339 TADIM...' -> 'TADIM...', 'KENT 12429 OLİPS...' -> 'KENT OLİPS...', 'ULK 1905 TAC...' -> 'ÜLKER TAC...')
    """
    if not title:
        return ""
    s = fix_turkish_corrupted_chars(title).strip()

    # 1. Başta yer alan - veya _ sembolleri
    s = re.sub(r'^[-\-_.:\s*#+]+', '', s).strip()

    # 2. Baştaki 8-14 haneli barkod numaralarını temizle (Örn: '8690579003339 TADIM...')
    s = re.sub(r'^\d{8,14}\s+', '', s).strip()

    # 3. Koli/Paketleme tedarikçi artıklarını temizle (Örn: '[X12]', '(X24)')
    s = re.sub(r'\s*\[\s*X\d+\s*\]|\s*\(\s*X\d+\s*\)', '', s, flags=re.IGNORECASE).strip()

    # 4. Marka + Stok Kodu temizleme:
    # Örn: 'KENT 12429 OLİPS' -> 'KENT OLİPS', 'ULK 1905 TAC KRAKER' -> 'ÜLKER TAC KRAKER', 'ETI 16459 LIFALIF' -> 'ETİ LIFALIF'
    brand_code_pattern = re.compile(
        r'^(RMZ\.ULK|BAY\.ULK|BY\.ULK|ULK|ÜLK|ULKER|ÜLKER|ETI|ETİ|KENT|PINAR|DOĞUŞ|DOGUS|NESTLE|NESCAFE|TORKU|ICIM|İÇİM|KOMİLİ|KOMILI|ÇAYKUR|CAYKUR|BİNGO|BINGO|DURU|HACISAKIR|HACI\s*ŞAKİR|İPEK|IPEK|ELİDOR|ELIDOR|PANTENE|CALVE|SARELLE|TADELLE|HARİBO|HARIBO|FALIM|ALGİDA|ALGIDA|DİMES|DIMES|CAPPY|TAMEK|TAT|ÖNCÜ|ONCU|YUDUM|ORUÇOĞLU|ORUCOGLU|KRİSTAL|KRISTAL|BİFROST|BIFROST)\s+(\d{3,6}|\d{2,4}-\d{1,3})\s+(.+)$',
        re.IGNORECASE
    )
    m = brand_code_pattern.match(s)
    if m:
        brand = m.group(1).upper()
        if brand in ['ULK', 'ÜLK', 'ULKER', 'ÜLKER', 'RMZ.ULK', 'BAY.ULK', 'BY.ULK']:
            brand = 'ÜLKER'
        elif brand in ['ETI', 'ETİ']:
            brand = 'ETİ'
        elif brand in ['ICIM', 'İÇİM']:
            brand = 'İÇİM'
        elif brand in ['KOMILI', 'KOMİLİ']:
            brand = 'KOMİLİ'
        
        code = m.group(2)
        rest = m.group(3).strip()
        first_rest = rest.split()[0].upper() if rest.split() else ''
        if first_rest in ['GR', 'GRAM', 'KG', 'ML', 'LT', 'LİTRE', 'LITRE', 'CL', 'ADET', 'LI', 'LU', 'LÜ', 'LUK', 'LÜK']:
            s = f"{brand} {code} {rest}"
        else:
            s = f"{brand} {rest}"

    # 'ULK ' / 'BAY.ULK ' / 'RMZ.ULK ' öneklerini 'ÜLKER ' ile değiştir
    s = re.sub(r'^(?:RMZ\.ULK|BAY\.ULK|BY\.ULK|ULK)\s+', 'ÜLKER ', s, flags=re.IGNORECASE)

    # 5. Başta yer alan anlamsız stok kodları (korunan kelimeler hariç)
    first_token_match = re.match(r'^([A-Za-z0-9\-_./]+)\s+(.+)$', s)
    if first_token_match:
        token = first_token_match.group(1).upper()
        rest = first_token_match.group(2).strip()
        is_pack_count = bool(re.match(r'^[0-9]+[\'"]?[A-Za-zÇŞĞÜÖİçşğüöı]+$', token))
        if token not in PROTECTED_WORDS and not is_pack_count:
            if re.match(r'^(?:[0-9]{3,8}[A-Za-z0-9\-_.]*|[A-Za-z]{2,5}[0-9]+[A-Za-z0-9\-_.]*)$', token):
                s = rest
            elif '-' in token and re.search(r'[0-9]', token):
                s = rest

    # 6. Sonda tek kalan tire/kod artıkları (örn: 'KOMİLİ PECETE 100LU 7632-0' -> 'KOMİLİ PECETE 100LU')
    s = re.sub(r'\s+\d{3,5}-\d{1,3}\b', '', s)

    s = re.sub(r'[\-_.:\s]+$', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

# Detaylı Türkçe Market & Marka Sözlüğü
GROCERY_DICTIONARY = {
    # Markalar
    '8INGO': 'BİNGO',
    'BINGO': 'BİNGO',
    'JU8MBO': 'JUMBO',
    '0GOPOGO': 'OGOPOGO',
    'ZUBER': 'ZÜBER',
    'ZBER': 'ZÜBER',
    'SUTAS': 'SÜTAŞ',
    'YUMOS': 'YUMOŞ',
    'ULKER': 'ÜLKER',
    'ETI': 'ETİ',
    'DOGUS': 'DOĞUŞ',
    'TORKU': 'TORKU',
    'LIPTON': 'LİPTON',
    'DIMES': 'DİMES',
    'COCA COLA': 'COCA-COLA',
    'ALGIDA': 'ALGİDA',
    'CALVE': 'CALVÉ',
    'NESCAFE': 'NESCAFÉ',
    'NESTLE': 'NESTLÉ',
    'PINAR': 'PINAR',
    'FALIM': 'FALIM',
    'HARIBO': 'HARİBO',
    'TADELLE': 'TADELLE',
    'SARELLE': 'SARELLE',
    'KENT': 'KENT',
    'DURU': 'DURU',
    'HACISAKIR': 'HACI ŞAKİR',
    'HACI SAKIR': 'HACI ŞAKİR',
    'IPEK': 'İPEK',
    'ELIDOR': 'ELİDOR',
    'PANTENE': 'PANTENE',
    'HEAD&SHOULDERS': 'HEAD & SHOULDERS',
    'HEAD & SHOULDERS': 'HEAD & SHOULDERS',
    'SENPILIC': 'ŞENPİLİÇ',
    'SEN PILIC': 'ŞENPİLİÇ',
    'BEYPILIC': 'BEYPİLİÇ',
    'BEY PILIC': 'BEYPİLİÇ',
    'GEDIK': 'GEDİK',
    'BANVIT': 'BANVİT',
    'KOCAYAYLA': 'KOCAYAYLA',
    'ONCU': 'ÖNCÜ',
    'TAT': 'TAT',
    'BURCU': 'BURCU',
    'TAMEK': 'TAMEK',
    'YUDUM': 'YUDUM',
    'ORUCOGLU': 'ORUÇOĞLU',
    'KOMILI': 'KOMİLİ',
    'KRISTAL': 'KRİSTAL',
    'TARIS': 'TARİŞ',
    'MARMARABIRLIK': 'MARMARABİRLİK',
    'FORA': 'FORA',
    'DOGANAY': 'DOĞANAY',
    'BEYPAZARI': 'BEYPAZARI',
    'KINIK': 'KINIK',
    'KIZILCAHAMAM': 'KIZILCAHAMAM',
    'AVSAR': 'AVŞAR',
    'SARIKIZ': 'SARIKIZ',
    'FRESA': 'FREŞA',
    'ERIKLI': 'ERİKLİ',
    'SIRMA': 'SIRMA',
    'HAYAT': 'HAYAT',
    'KORASU': 'KORASU',
    'DAMLA': 'DAMLA',
    'KIZILAY': 'KIZILAY',
    'CELEBIOGULLARI': 'ÇELEBİOĞULLARI',
    'INCIM': 'İNCİM',
    'OREO': 'OREO',
    'MILKA': 'MİLKA',
    'TOBLERONE': 'TOBLERONE',
    'NUTELLA': 'NUTELLA',
    'COCO STAR': 'COCO STAR',
    'ALBENI': 'ALBENİ',
    'COKONAT': 'ÇOKONAT',
    'COKOKREM': 'ÇOKOKREM',
    'HALLEY': 'HALLEY',
    'HANIMELLER': 'HANIMELLER',
    'BENIMO': 'BENİMO',
    'BIPLAN': 'BİPLAN',
    'CANPA': 'CANPA',
    'DANKER': 'DANKER',
    'DIDI': 'DİDİ',
    'FUSE TEA': 'FUSE TEA',
    'ICE TEA': 'ICE TEA',

    # Temel Ürün Türleri & Sıfatlar
    'YOGURT': 'YOĞURT',
    'YOGURDU': 'YOĞURDU',
    'YOGURTLU': 'YOĞURTLU',
    'KAYMAKLI': 'KAYMAKLI',
    'KAYMAKSIZ': 'KAYMAKSIZ',
    'SUZME': 'SÜZME',
    'SUZME PEYNIR': 'SÜZME PEYNİR',
    'PEYNIR': 'PEYNİR',
    'PEYNIRI': 'PEYNİRİ',
    'PEYNIRLI': 'PEYNİRLİ',
    'KASAR': 'KAŞAR',
    'KASARI': 'KAŞARI',
    'KASARLI': 'KAŞARLI',
    'TEREYAG': 'TEREYAĞI',
    'TEREYAGI': 'TEREYAĞI',
    'TEREYAGLI': 'TEREYAĞLI',
    'SUT': 'SÜT',
    'SUTLU': 'SÜTLÜ',
    'SUTU': 'SÜTÜ',
    'YAGLI': 'YAĞLI',
    'YAGSIZ': 'YAĞSIZ',
    'YARIM YAGLI': 'YARIM YAĞLI',
    'TAM YAGLI': 'TAM YAĞLI',
    'CIKOLATA': 'ÇİKOLATA',
    'CIKOLATALI': 'ÇİKOLATALI',
    'CIKOLATASI': 'ÇİKOLATASI',
    'BITTER': 'BİTTER',
    'GOFRET': 'GOFRET',
    'GOFRETI': 'GOFRETİ',
    'GOFRETLI': 'GOFRETLİ',
    'BISKUVI': 'BİSKÜVİ',
    'BISKUVILI': 'BİSKÜVİLİ',
    'BISKUVISI': 'BİSKÜVİSİ',
    'KEK': 'KEK',
    'KEKI': 'KEKİ',
    'KEKLI': 'KEKLİ',
    'PASTA': 'PASTA',
    'PASTASI': 'PASTASI',
    'EKMEK': 'EKMEK',
    'EKMEGI': 'EKMEĞİ',
    'SEKER': 'ŞEKER',
    'SEKERI': 'ŞEKERİ',
    'SEKERLI': 'ŞEKERLİ',
    'SEKERSIZ': 'ŞEKERSİZ',
    'SEKERLEME': 'ŞEKERLEME',
    'TUZ': 'TUZ',
    'TUZLU': 'TUZLU',
    'TUZSUZ': 'TUZSUZ',
    'UN': 'UN',
    'UNU': 'UNU',
    'CAY': 'ÇAY',
    'CAYI': 'ÇAYI',
    'KAHVE': 'KAHVE',
    'KAHVESI': 'KAHVESİ',
    'ZEYTIN': 'ZEYTİN',
    'ZEYTINI': 'ZEYTİNİ',
    'ZEYTINLI': 'ZEYTİNLİ',
    'ZEYTINYAGI': 'ZEYTİNYAĞI',
    'ZEYTIN YAGI': 'ZEYTİNYAĞI',
    'AYCICEK': 'AYÇİÇEK',
    'AYCICEGI': 'AYÇİÇEĞİ',
    'AYCICEK YAGI': 'AYÇİÇEK YAĞI',
    'MISIROZU': 'MISIRÖZÜ',
    'MISIR OZU': 'MISIRÖZÜ',
    'SALCA': 'SALÇA',
    'SALCASI': 'SALÇASI',
    'DOMATES': 'DOMATES',
    'DOMATESLI': 'DOMATESLİ',
    'BIBER': 'BİBER',
    'BIBERLI': 'BİBERLİ',
    'SALATALIK': 'SALATALIK',
    'PATATES': 'PATATES',
    'SOGAN': 'SOĞAN',
    'SOGANLI': 'SOĞANLI',
    'SARIMSAK': 'SARIMSAK',
    'SARIMSAKLI': 'SARIMSAKLI',
    'LIMON': 'LİMON',
    'LIMONLU': 'LİMONLU',
    'LIMONATA': 'LİMONATA',
    'PORTAKAL': 'PORTAKAL',
    'PORTAKALLI': 'PORTAKALLI',
    'MANDALINA': 'MANDALİNA',
    'ELMA': 'ELMA',
    'ELMALI': 'ELMALI',
    'ARMUT': 'ARMUT',
    'CILEK': 'ÇİLEK',
    'CILEKLI': 'ÇİLEKLİ',
    'VISNE': 'VİŞNE',
    'VISNELI': 'VİŞNELİ',
    'KAYISI': 'KAYISI',
    'KAYISILI': 'KAYISILI',
    'SEFTALI': 'ŞEFTALİ',
    'SEFTALILI': 'ŞEFTALİLİ',
    'KIRAZ': 'KİRAZ',
    'KIRAZLI': 'KİRAZLI',
    'UZUM': 'ÜZÜM',
    'UZUMLU': 'ÜZÜMLÜ',
    'INCIR': 'İNCİR',
    'INCIRLI': 'İNCİRLİ',
    'NAR': 'NAR',
    'NARLI': 'NARLI',
    'KARPUZ': 'KARPUZ',
    'KARPUZLU': 'KARPUZLU',
    'KAVUN': 'KAVUN',
    'KAVUNLU': 'KAVUNLU',
    'MUZ': 'MUZ',
    'MUZLU': 'MUZLU',
    'KIVI': 'KİVİ',
    'KIVILI': 'KİVİLİ',
    'AHUDUDU': 'AHUDUDU',
    'AHUDUDULU': 'AHUDUDULU',
    'BOGURTLEN': 'BÖĞÜRTLEN',
    'BOGURTLENLI': 'BÖĞÜRTLENLİ',
    'YABAN MERSINI': 'YABAN MERSİNİ',
    'ORMAN MEYVELI': 'ORMAN MEYVELİ',
    'ORMAN MEYVELERI': 'ORMAN MEYVELERİ',
    'FINDIK': 'FINDIK',
    'FINDIKLI': 'FINDIKLI',
    'FISTIK': 'FISTIK',
    'FISTIKLI': 'FISTIKLI',
    'ANTEP FISTIGI': 'ANTEP FISTIĞI',
    'ANTEP FISTIKLI': 'ANTEP FISTIKLI',
    'YER FISTIGI': 'YER FISTIĞI',
    'YER FISTIKLI': 'YER FISTIKLI',
    'CEVIZ': 'CEVİZ',
    'CEVIZLI': 'CEVİZLİ',
    'BADEM': 'BADEM',
    'BADEMLI': 'BADEMLİ',
    'HINDISTAN CEVIZI': 'HİNDİSTAN CEVİZİ',
    'HINDISTAN CEVIZLI': 'HİNDİSTAN CEVİZLİ',
    'HINDI CEVIZ': 'HİNDİSTAN CEVİZİ',
    'SUSAM': 'SUSAM',
    'SUSAMLI': 'SUSAMLI',
    'COREKOTU': 'ÇÖREK OTU',
    'COREK OTU': 'ÇÖREK OTU',
    'COREKOTLU': 'ÇÖREK OTLU',
    'HASHAŞ': 'HAŞHAŞ',
    'HASHASLI': 'HAŞHAŞLI',
    'BAHARAT': 'BAHARAT',
    'BAHARATLI': 'BAHARATLI',
    'ACI': 'ACI',
    'ACILI': 'ACILI',
    'ACISIZ': 'ACISIZ',
    'TATLI': 'TATLI',
    'EKSI': 'EKŞİ',
    'EKSILI': 'EKŞİLİ',
    'YUMUSATICI': 'YUMUŞATICI',
    'YUMUSATICISI': 'YUMUŞATICISI',
    'DETERJAN': 'DETERJAN',
    'DETERJANI': 'DETERJANI',
    'CAMASIR SUYU': 'ÇAMAŞIR SUYU',
    'CAMASIR': 'ÇAMAŞIR',
    'BULASIK': 'BULAŞIK',
    'BULASIK DETERJANI': 'BULAŞIK DETERJANI',
    'BULASIK SIVISI': 'BULAŞIK SIVISI',
    'SABUN': 'SABUN',
    'SABUNU': 'SABUNU',
    'SIVI SABUN': 'SIVI SABUN',
    'SAMPUAN': 'ŞAMPUAN',
    'SAMPUANI': 'ŞAMPUANI',
    'DUS JELI': 'DUŞ JELİ',
    'DIS MACUNU': 'DİŞ MACUNU',
    'DIS FIRCASI': 'DİŞ FIRÇASI',
    'KOLONYA': 'KOLONYA',
    'KOLONYASI': 'KOLONYASI',
    'ISLAK HAVLU': 'ISLAK HAVLU',
    'ISLAK MENDIL': 'ISLAK MENDİL',
    'HAVLU': 'HAVLU',
    'PEÇETE': 'PEÇETE',
    'TUVALET KAGIDI': 'TUVALET KAĞIDI',
    'KAGIT HAVLU': 'KAĞIT HAVLU',
    'COP TORBASI': 'ÇÖP TORBASI',
    'ALUMINYUM FOLYO': 'ALÜMİNYUM FOLYO',
    'STREC FILM': 'STREÇ FİLM',
    'PISIRME KAGIDI': 'PİŞİRME KAĞIDI',
    'KEDI MAMASI': 'KEDİ MAMASI',
    'KOPEK MAMASI': 'KÖPEK MAMASI',
    'BEBEK BEZI': 'BEBEK BEZİ',
    'BEBEK SAMPUANI': 'BEBEK ŞAMPUANI',
    'BEBEK YAGI': 'BEBEK YAĞI',
    'BEBEK MAMASI': 'BEBEK MAMASI',
    'SIRKE': 'SİRKE',
    'UZUM SIRKESI': 'ÜZÜM SİRKESİ',
    'ELMA SIRKESI': 'ELMA SİRKESİ',
    'NAR EKSISI': 'NAR EKŞİSİ',
    'NAR EKSILI SOS': 'NAR EKŞİLİ SOS',
    'LIMON SOSU': 'LİMON SOSU',
    'KETCAP': 'KETÇAP',
    'MAYONEZ': 'MAYONEZ',
    'HARDAL': 'HARDAL',
    'PIRINC': 'PİRİNÇ',
    'BULGUR': 'BULGUR',
    'PILAVLIK BULGUR': 'PİLAVLIK BULGUR',
    'KOFTELIK BULGUR': 'KÖFTELİK BULGUR',
    'MERCIMEK': 'MERCİMEK',
    'KIRMIZI MERCIMEK': 'KIRMIZI MERCİMEK',
    'YESIL MERCIMEK': 'YEŞİL MERCİMEK',
    'SARI MERCIMEK': 'SARI MERCİMEK',
    'NOHUT': 'NOHUT',
    'FASULYE': 'FASULYE',
    'KURU FASULYE': 'KURU FASULYE',
    'BARBUNYA': 'BARBUNYA',
    'MAKARNA': 'MAKARNA',
    'MAKARNASI': 'MAKARNASI',
    'SEHRIYE': 'ŞEHRİYE',
    'ARPA SEHRIYE': 'ARPA ŞEHRİYE',
    'TEL SEHRIYE': 'TEL ŞEHRİYE',
    'ERISTE': 'ERİŞTE',
    'TARHANA': 'TARHANA',
    'YUMURTA': 'YUMURTA',
    'SUCUK': 'SUCUK',
    'SUCUGU': 'SUCUĞU',
    'SALAM': 'SALAM',
    'SALAMI': 'SALAMI',
    'SOSIS': 'SOSİS',
    'SOSISI': 'SOSİSİ',
    'PASTIRMA': 'PASTIRMA',
    'KAVURMA': 'KAVURMA',
    'TAVUK': 'TAVUK',
    'KOFTE': 'KÖFTE',
    'DONER': 'DÖNER',
    'MANTI': 'MANTI',
    'MILFOY': 'MİLFÖY',
    'YUFKA': 'YUFKA',
    'BOREK': 'BÖREK',
    'BOREKLIK': 'BÖREKLİK',
    'PIDE': 'PİDE',
    'SIMITE': 'SİMİT',
    'SIMIT': 'SİMİT',
    'POHACA': 'POĞAÇA',
    'ACMA': 'AÇMA',
    'CRAX': 'KRAKS',
    'KRAKER': 'KRAKER',
    'KRAKERI': 'KRAKERİ',
    'CUBUK KRAKER': 'ÇUBUK KRAKER',
    'BALIK KRAKER': 'BALIK KRAKER',
    'MISIR GEVREGI': 'MISIR GEVREĞİ',
    'YULAF': 'YULAF',
    'YULAF EZMESI': 'YULAF EZMESİ',
    'KAHVALTILIK GEVREK': 'KAHVALTILIK GEVREK',
    'RECEL': 'REÇEL',
    'RECELI': 'REÇELİ',
    'BAL': 'BAL',
    'CICEK BALI': 'ÇİÇEK BALI',
    'CAM BALI': 'ÇAM BALI',
    'PETEK BAL': 'PETEK BAL',
    'SUT RECELI': 'SÜT REÇELİ',
    'TAHIN': 'TAHİN',
    'PEKMEZ': 'PEKMEZ',
    'UZUM PEKMEZI': 'ÜZÜM PEKMEZİ',
    'DUT PEKMEZI': 'DUT PEKMEZİ',
    'HARNUP PEKMEZI': 'HARNUP PEKMEZİ',
    'KECIBOYNUZU PEKMEZI': 'KEÇİBOYNUZU PEKMEZİ',
    'HELVA': 'HELVA',
    'HELVASI': 'HELVASI',
    'TAHIN HELVASI': 'TAHİN HELVASI',
    'KAKAOLU HELVA': 'KAKAOLU HELVA',
    'SADE HELVA': 'SADE HELVA',
    'FINDIK EZMESI': 'FINDIK EZMESİ',
    'FISTIK EZMESI': 'FISTIK EZMESİ',
    'KREMA': 'KREMA',
    'KREMASI': 'KREMASI',
    'SANTİ': 'ŞANTİ',
    'KREMSANTİ': 'KREM ŞANTİ',
    'KREM SANTI': 'KREM ŞANTİ',
    'PUDING': 'PUDİNG',
    'PUDINGI': 'PUDİNGİ',
    'VANILYA': 'VANİLYA',
    'KABARTMA TOZU': 'KABARTMA TOZU',
    'MAYA': 'MAYA',
    'KURU MAYA': 'KURU MAYA',
    'YAS MAYA': 'YAŞ MAYA',
    'NISASTA': 'NİŞASTA',
    'MISIR NISASTASI': 'MISIR NİŞASTASI',
    'BUGDAY NISASTASI': 'BUĞDAY NİŞASTASI',
    'IRMIK': 'İRMİK',
    'PIRINC UNU': 'PİRİNÇ UNU',
    'PUDRA SEKERI': 'PUDRA ŞEKERİ',
    'HINDISTAN CEVIZI RENDESI': 'HİNDİSTAN CEVİZİ RENDE',
    'KAKAO': 'KAKAO',
    'DAMLA CIKOLATA': 'DAMLA ÇİKOLATA',
    'KUVERTUR': 'KÜVERTÜR',
    'SAKIZ': 'SAKIZ',
    'SAKIZI': 'SAKIZI',
    'SEKERSİZ SAKIZ': 'ŞEKERSİZ SAKIZ',
    'SEKERSIZ SAKIZ': 'ŞEKERSİZ SAKIZ',
    'DOGAL': 'DOĞAL',
    'OZLER': 'ÖZLER',
    'CICEGI': 'ÇİÇEĞİ',
    'CICEK': 'ÇİÇEK',
    'CEKIRDEKLI': 'ÇEKİRDEKLİ',
    'CEKIRDEK': 'ÇEKİRDEK',
    'KARSITI': 'KARŞITI',
    'POSET': 'POŞET',
    'POSETI': 'POŞETİ',
    'POSETLI': 'POŞETLİ',
    'KUSBURNU': 'KUŞBURNU',
    'ADACAYI': 'ADAÇAYI',
    'ADA CAYI': 'ADAÇAYI',
    'AC BITIR': 'AÇ BİTİR',
    'FISTIGI': 'FISTIĞI',
    'CEVIZI': 'CEVİZİ',
    'TARCIN': 'TARÇIN',
    'TARCINLI': 'TARÇINLI',
    'HINDI': 'HİNDİ',
    'HINDI FUME': 'HİNDİ FÜME',
    'FUME': 'FÜME',
    'KIRIK': 'KIRIK',
    'CESNI': 'ÇEŞNİ',
    'CESNILI': 'ÇEŞNİLİ',
    'PRIN': 'PİRİNÇ',
    'PRINC': 'PİRİNÇ',
    'TEMIZLEYICI': 'TEMİZLEYİCİ',
    'TEMIZLIK': 'TEMİZLİK',
    'PARLATICI': 'PARLATICI',
    'KREMI': 'KREMİ',
    'DIS': 'DİŞ',
    'FIRCA': 'FIRÇA',
    'FIRCASI': 'FIRÇASI',
    'PECETE': 'PEÇETE',
    'KAGIT': 'KAĞIT',
    'KAGIDI': 'KAĞIDI',
    'KAVRULMUS': 'KAVRULMUŞ',
    'KIZARMIS': 'KIZARMIŞ',
    'HASLANMIS': 'HAŞLANMIŞ',
    'SISE': 'ŞİŞE',
    'TURSU': 'TURŞU',
    'TURSUSU': 'TURŞUSU',
    'COKELEK': 'ÇÖKELEK',
    'MARGARIN': 'MARGARİN',
    'KIYMA': 'KIYMA',
    'KUSBASI': 'KUŞBAŞI',
    'PILIC': 'PİLİÇ',
    'TON BALIGI': 'TON BALIĞI',
    'SARDALYA': 'SARDALYA',
    'KURSUN': 'KURŞUN',
    'TURK KAHVESI': 'TÜRK KAHVESİ',
    'YESIL CAY': 'YEŞİL ÇAY',
    'MEYVE SUYU': 'MEYVE SUYU',
    'M.SUYU': 'MEYVE SUYU',
    'MADEN SUYU': 'MADEN SUYU',
    'SERBET': 'ŞERBET',
    'LOKUM': 'LOKUM',
    'LOKUMU': 'LOKUMU',
    'JELIBON': 'JELİBON',
    'MARSMALLOW': 'MARŞMELOV',
    'MARSHMALLOW': 'MARŞMELOV',
    'FIND.SUTLU': 'FINDIKLI SÜTLÜ',
    'FIND.': 'FINDIKLI ',
    'H.CEVIZI': 'HİNDİSTAN CEVİZİ',
    'H.CEVIZLI': 'HİNDİSTAN CEVİZLİ',
    'H.CEVİZLİ': 'HİNDİSTAN CEVİZLİ',
    'H.CEVİZ': 'HİNDİSTAN CEVİZİ'
}

SORTED_GROCERY_KEYS = sorted(GROCERY_DICTIONARY.keys(), key=lambda x: len(x), reverse=True)
_GROCERY_PATTERN = re.compile(r'\b(' + '|'.join(re.escape(k) for k in SORTED_GROCERY_KEYS) + r')\b', re.IGNORECASE)
_GROCERY_UPPER_MAP = {k.upper(): v for k, v in GROCERY_DICTIONARY.items()}

def apply_grocery_dictionary(text: str) -> str:
    """Metindeki tüm kelimeleri Türkçe market sözlüğüne göre standartlaştırır (hızlı tek geçişli regex)."""
    if not text:
        return ""
    return _GROCERY_PATTERN.sub(lambda m: _GROCERY_UPPER_MAP.get(m.group(0).upper(), m.group(0)), str(text))

def clean_product_title(title: str) -> str:
    """Ürün adını orijinal haliyle korur, sadece bozuk unicode artıklarını ve çift boşlukları düzeltir."""
    if not title:
        return ""
    s = fix_turkish_corrupted_chars(str(title)).strip()
    s = re.sub(r'\s+', ' ', s)
    return s

def unify_product_title(title: str, raw_system_title: str = None, brand: str = None) -> str:
    """
    Etiket ürün adı (title) ile sistemdeki kayıt adını (raw_system_title) ve marka bilgisini
    akıllıca birleştirerek eksiksiz, temiz, standart Türkçe ürün adı oluşturur.
    Örn: 'Sütaş Kaymaksız Yoğurt 1 KG', 'Züber Fındık Kaplı Meyve Topu 96 GR'
    """
    clean_t = strip_supplier_stock_codes(title or "")
    clean_sys = strip_supplier_stock_codes(raw_system_title or "")
    clean_b = fix_turkish_corrupted_chars(brand or "").strip()
    clean_b = re.sub(r'^[-\-_.:\s]+', '', clean_b).strip()
    
    # Sistem başlığında varsa 'SİGARA ' / 'SIGARA ' öneklerini temizle
    clean_sys = re.sub(r'^(?:S[İI]GARA|SIGARA)\s+', '', clean_sys, flags=re.IGNORECASE).strip()
    clean_t = re.sub(r'^(?:S[İI]GARA|SIGARA)\s+', '', clean_t, flags=re.IGNORECASE).strip()

    t_words = clean_t.split()
    sys_words = clean_sys.split()
    
    # Eğer title 'ML ...', 'LT ...', 'LİTRE ...' gibi birimle başlıyorsa (kırpılmışsa)
    is_t_truncated = False
    if t_words:
        first_w = t_words[0].upper()
        if first_w in ['ML', 'LT', 'LİTRE', 'LITRE', 'GR', 'GRAM', 'KG', 'CL', 'ADET', 'PK', 'PAKET']:
            is_t_truncated = True

    # Seçim mantığı:
    if (is_t_truncated or len(t_words) <= 2) and len(sys_words) > len(t_words):
        chosen = clean_sys
    elif len(clean_t) >= len(clean_sys):
        chosen = clean_t
    else:
        chosen = clean_sys if clean_sys else clean_t

    # 1. Sözlük standartlaştırması
    chosen = apply_grocery_dictionary(chosen)

    # 2. Tekrar eden kelimeleri temizle (örn: 'INCIM INCIM' -> 'INCIM')
    words = chosen.split()
    deduped = []
    seen = set()
    for w in words:
        wf = fold_turkish_text(w)
        if wf in seen and len(wf) >= 3 and not re.match(r'^[0-9]+', w):
            continue
        seen.add(wf)
        deduped.append(w)
    result = ' '.join(deduped)

    # 3. Marka adı başlıkta yoksa ve mantıklıysa ekle (Market isimlerini ve YARENLER önekini ekleme)
    if clean_b and clean_b.upper() not in ['DİĞER', 'DIGER', 'GENEL', 'YOK', '-', 'STANDART', 'YARENLER', 'MARKET']:
        clean_b_std = apply_grocery_dictionary(clean_b)
        b_folded = fold_turkish_text(clean_b_std)
        res_folded = fold_turkish_text(result)
        if b_folded not in res_folded and len(clean_b_std) >= 3:
            result = f"{clean_b_std} {result}"

    # 4. Gramaj, çoklu paket ve birim standardizasyonu (örn: 0.5kg -> 0.5 KG, 1,5 kg -> 1.5 KG, 6'lı / 6 li -> 6'LI)
    result = re.sub(r'(\d+)[,\.](\d+)\s*([Kk][Gg]|[Ll][Tt]|[Ll][İiİı][Tt][Rr][Ee]|[Mm][Ll]|[Gg][Rr])\b', r'\1.\2 \3', result)
    result = re.sub(r'(\d+)\s*([Kk][Gg]|[Ll][Tt]|[Mm][Ll]|[Gg][Rr])\b', r'\1 \2', result)
    result = re.sub(r'\b(\d+(?:\.\d+)?)\s*kg\b', r'\1 KG', result, flags=re.IGNORECASE)
    result = re.sub(r'\b(\d+(?:\.\d+)?)\s*gr\b', r'\1 GR', result, flags=re.IGNORECASE)
    result = re.sub(r'\b(\d+(?:\.\d+)?)\s*gram\b', r'\1 GR', result, flags=re.IGNORECASE)
    result = re.sub(r'\b(\d+(?:\.\d+)?)\s*lt\b', r'\1 LT', result, flags=re.IGNORECASE)
    result = re.sub(r'\b(\d+(?:\.\d+)?)\s*litre\b', r'\1 LT', result, flags=re.IGNORECASE)
    result = re.sub(r'\b(\d+(?:\.\d+)?)\s*ml\b', r'\1 ML', result, flags=re.IGNORECASE)
    result = re.sub(r'\b(\d+(?:\.\d+)?)\s*cl\b', r'\1 CL', result, flags=re.IGNORECASE)
    result = re.sub(r'\b(\d+)\s*adet\b', r'\1 ADET', result, flags=re.IGNORECASE)
    result = re.sub(r'\b(\d+)\s*pk\b', r'\1 PK', result, flags=re.IGNORECASE)
    result = re.sub(r'\b(\d+)\s*paket\b', r'\1 PAKET', result, flags=re.IGNORECASE)
    
    # 4.1 Çoklu paket standardizasyonu (6'LI, 12'Lİ, 24'LÜ, 4'LÜ, TEKLİ)
    result = re.sub(r'\b(\d+)\s*[\'’`]?\s*(?:li|lı|lu|lü|l[iıuü])\b', r"\1'Lİ", result, flags=re.IGNORECASE)
    # Türkçedeki ses uyumuna göre düzeltme (örn: 6'LI, 24'LÜ, 4'LÜ)
    result = re.sub(r"\b([06])'Lİ\b", r"\1'LI", result)
    result = re.sub(r"\b([9])'Lİ\b", r"\1'U", result)
    result = re.sub(r"\b([34])'Lİ\b", r"\1'LÜ", result)
    result = re.sub(r"\b([24])'Lİ\b", r"\1'LÜ", result)
    result = re.sub(r"\b(24)'LÜ\b", r"24'LÜ", result)
    result = re.sub(r"\b(12)'Lİ\b", r"12'Lİ", result)
    result = re.sub(r"\b(6)'Lİ\b", r"6'LI", result)
    result = re.sub(r"\b(4)'Lİ\b", r"4'LÜ", result)
    result = re.sub(r"\b(8)'Lİ\b", r"8'Lİ", result)
    result = re.sub(r"\b(10)'Lİ\b", r"10'LU", result)
    result = re.sub(r"\b(20)'Lİ\b", r"20'Lİ", result)
    result = re.sub(r"\b(30)'Lİ\b", r"30'LU", result)
    result = re.sub(r"\b(40)'Lİ\b", r"40'LI", result)
    result = re.sub(r"\b(50)'Lİ\b", r"50'Lİ", result)
    result = re.sub(r"\b(100)'Lİ\b", r"100'LÜ", result)
    result = re.sub(r"\bTEKLI\b", "TEKLİ", result, flags=re.IGNORECASE)

    # 4.2 Kategori ve Marka Standart Format Kuralları (Redbull, Nescafe, Coca-Cola vb.)
    # REDBULL Standartlaştırması
    result = re.sub(r'\bRED\s*BULL\b', 'REDBULL', result, flags=re.IGNORECASE)
    result = re.sub(r'\bENERGY\s+DRINK\b', 'ENERJİ İÇECEĞİ', result, flags=re.IGNORECASE)
    result = re.sub(r'\bREDBULL\s+(\d+)\s+ENERJİ(?:\s+İÇECEĞİ)?\b', r'REDBULL ENERJİ İÇECEĞİ \1 ML', result, flags=re.IGNORECASE)
    result = re.sub(r'\bREDBULL\s+(\d+)\s*MLT\b', r'REDBULL ENERJİ İÇECEĞİ \1 ML', result, flags=re.IGNORECASE)
    result = re.sub(r'\bSUGARFREE\b', 'ŞEKERSİZ', result, flags=re.IGNORECASE)
    
    # NESCAFE Standartlaştırması
    result = re.sub(r'\bNESCAFE\s+3\s*[\/\-UuÜü]\s*1\s*(?:ARADA|BİRARADA)?\b', 'NESCAFE 3Ü1 ARADA', result, flags=re.IGNORECASE)
    result = re.sub(r'\bNESCAFE\s+3ON1\b', 'NESCAFE 3Ü1 ARADA', result, flags=re.IGNORECASE)
    result = re.sub(r'\bNESCAFE\s+2\s*[\/\-UuÜü]\s*1\s*(?:ARADA)?\b', 'NESCAFE 2Sİ1 ARADA', result, flags=re.IGNORECASE)
    result = re.sub(r'\bNESCAFE\s+CLASIC\b', 'NESCAFE CLASSIC', result, flags=re.IGNORECASE)
    result = re.sub(r'\bNESCAFE\s+EXPESS\b', 'NESCAFE XPRESS', result, flags=re.IGNORECASE)
    result = re.sub(r'\bNESCAFE\s+EXPRESS\b', 'NESCAFE XPRESS', result, flags=re.IGNORECASE)

    # COCA-COLA / FANTA / SPRITE Standartlaştırması
    result = re.sub(r'\bCOCA\s+COLA\b', 'COCA-COLA', result, flags=re.IGNORECASE)
    result = re.sub(r'\bCOCA-COLA\s+(\d+(?:\.\d+)?\s*(?:ML|LT))\s+KOLA(?:\s+KUTU)?\b', r'COCA-COLA \1 KUTU', result, flags=re.IGNORECASE)
    result = re.sub(r'\bCOCA-COLA\s+(\d+(?:\.\d+)?\s*(?:ML|LT))\s+KOLA\b', r'COCA-COLA \1', result, flags=re.IGNORECASE)
    result = re.sub(r'\bSPRITE\s+TENEKE\s+(\d+(?:\.\d+)?\s*(?:ML|LT))\b', r'SPRITE \1 KUTU', result, flags=re.IGNORECASE)
    result = re.sub(r'\bFUSE\s+TEA\s+ICE\s+TEA\b', 'FUSE TEA', result, flags=re.IGNORECASE)

    # 5. Temizlik ve normalizasyon
    result = re.sub(r'\s*--\s*', ' - ', result)
    result = re.sub(r'^[-\-_.:\s]+', '', result)
    result = re.sub(r'[\-_.:\s]+$', '', result)
    result = re.sub(r'\s+', ' ', result).strip()
    
    # Türkçe büyük harf dönüşümü
    return to_turkish_upper(result)

def fold_turkish_text(text: str) -> str:
    """Türkçe karakterleri normalize ederek 'ı/i', 'ş/s', 'ğ/g' vb. harfleri eşleştirir."""
    if not text:
        return ""
    tr_map = {
        'I': 'i', 'İ': 'i', 'ı': 'i',
        'Ş': 's', 'ş': 's',
        'Ğ': 'g', 'ğ': 'g',
        'Ü': 'u', 'ü': 'u',
        'Ö': 'o', 'ö': 'o',
        'Ç': 'c', 'ç': 'c'
    }
    s = str(text)
    for k, v in tr_map.items():
        s = s.replace(k, v)
    return s.lower()

def clean_barcode_text(val) -> str:
    """Barkodları daima temiz, sayısal ve standart formata dönüştürür (OYMAPOS motoruyla 1-1 aynı)."""
    if val is None:
        return ""
    s = str(val).strip()
    if s.startswith("bc_") or s.startswith("BC_"):
        s = s[3:]
    
    # Sondaki ,00 veya .00 veya ,0 veya .0 temizle
    if s.endswith(',00') or s.endswith('.00'):
        s = s[:-3]
    elif s.endswith(',0') or s.endswith('.0'):
        s = s[:-2]
    elif ',' in s:
        parts = s.split(',')
        if len(parts) == 2 and parts[1].isdigit() and int(parts[1]) == 0:
            s = parts[0]
    elif '.' in s:
        parts = s.split('.')
        if len(parts) == 2 and parts[1].isdigit() and int(parts[1]) == 0:
            s = parts[0]

    # Üstel / Bilimsel gösterim kontrolü (Örn: 8.69056E+12 veya 8,69056E+12)
    s_norm = s.replace(',', '.')
    if re.match(r'^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$', s_norm):
        try:
            f_val = float(s_norm)
            s = f"{int(round(f_val))}"
        except Exception:
            pass

    # Rakam ve tirelerden oluşan barkodlardaki tireleri temizle (Örn: 869-0504-114925 -> 8690504114925)
    if '-' in s:
        s_nodash = s.replace('-', '')
        if s_nodash.isdigit():
            s = s_nodash

    return s.strip()

def parse_price(val) -> float:
    """Her türlü fiyat formatını (Türkçe 1.250,50 veya Uluslararası 1,250.50) temiz float'a çevirir."""
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace('TL', '').replace('tl', '').replace('₺', '').strip()
    if not s:
        return 0.0
    if '.' in s and ',' in s:
        last_comma = s.rfind(',')
        last_dot = s.rfind('.')
        if last_comma > last_dot:  # Örn: 1.250,50 (Türkçe format)
            s = s[:last_comma].replace('.', '').replace(',', '') + '.' + s[last_comma+1:]
        else:  # Örn: 1,250.50 (Uluslararası format)
            s = s[:last_dot].replace(',', '').replace('.', '') + '.' + s[last_dot+1:]
    elif s.count(',') > 1:
        last_comma = s.rfind(',')
        s = s[:last_comma].replace(',', '') + '.' + s[last_comma+1:]
    elif s.count('.') > 1:
        last_dot = s.rfind('.')
        s = s[:last_dot].replace('.', '') + '.' + s[last_dot+1:]
    elif ',' in s:
        s = s.replace(',', '.')
    try:
        return round(float(s), 2)
    except Exception:
        return 0.0

def decode_scale_barcode(barcode: str) -> Optional[dict]:
    """
    20-29 serisi tüm terazi, manav, kasap ve şarküteri barkodlarını OYMAPOS algoritmasıyla akıllıca çözümler.
    Prefixler: 27/20-26 (Gramajlı), 28/29 (Gömülü Fiyatlı/Tutarlı)
    """
    if not barcode:
        return None
    raw_s = str(barcode).strip()
    clean_bc = re.sub(r'[^0-9]', '', raw_s)
    
    if len(clean_bc) < 12 or len(clean_bc) > 14:
        return None

    prefix = clean_bc[:2]
    if prefix not in ("20", "21", "22", "23", "24", "25", "26", "27", "28", "29"):
        return None

    plu_candidates = []
    try:
        p1 = int(clean_bc[2:7].lstrip("0") or "0")
        if p1 > 0: plu_candidates.append(p1)
    except Exception:
        pass

    try:
        p2 = int(clean_bc[4:7].lstrip("0") or "0")
        if p2 > 0 and p2 not in plu_candidates: plu_candidates.append(p2)
    except Exception:
        pass

    try:
        p3 = int(clean_bc[2:6].lstrip("0") or "0")
        if p3 > 0 and p3 not in plu_candidates: plu_candidates.append(p3)
    except Exception:
        pass

    plu_clean = str(plu_candidates[0]) if plu_candidates else "1"
    num_block = int(clean_bc[7:12]) if len(clean_bc) >= 12 else 0

    is_weight = prefix in ("27", "20", "21", "22", "23", "24", "25", "26")
    weight_kg = round(num_block / 1000.0, 3) if is_weight else None
    embedded_price = round(num_block / 100.0, 2) if not is_weight else None

    return {
        "is_scale": True,
        "prefix": prefix,
        "plu_raw": clean_bc[2:7],
        "plu_clean": plu_clean,
        "plu_candidates": plu_candidates,
        "is_weight": is_weight,
        "weight_kg": weight_kg,
        "embedded_price": embedded_price,
        "full_barcode": clean_bc
    }

def format_product_dict(row: dict) -> dict:
    """Veritabanından dönen satırı standart temiz formata dönüştürür."""
    if not row:
        return {}
    d = dict(row)
    price_val = d.get('price') if d.get('price') is not None else d.get('price_num')
    d['price'] = parse_price(price_val)
    d['barcode'] = clean_barcode_text(d.get('barcode', ''))
    raw_title = str(d.get('title') or d.get('title1') or '').strip()
    raw_sys = str(d.get('raw_system_title') or raw_title).strip()
    brand_val = str(d.get('brand') or '').strip()
    
    # Veritabanında zaten temizlenip kaydedilmiş title varsa doğrudan kullan
    d['title'] = raw_title if raw_title else unify_product_title(raw_title, raw_sys, brand_val)
    d['raw_system_title'] = raw_sys
    d['brand'] = brand_val
    d['stock_code'] = str(d.get('stock_code') or '').strip()
    d['unit'] = str(d.get('unit') or 'ADET').strip()
    d['is_new'] = bool(d.get('is_new', False))
    d['last_printed_at'] = d.get('last_printed_at') or ''
    d['price_updated_at'] = d.get('price_updated_at') or d.get('updated_at') or ''
    d['updated_at'] = d.get('updated_at') or ''
    d['created_at'] = d.get('created_at') or ''

    if d.get('label_price') is not None and d.get('label_price') != '':
        d['label_price'] = parse_price(d['label_price'])
        d['has_price_diff'] = abs(d['price'] - d['label_price']) > 0.001
        d['price_diff_amount'] = round(d['price'] - d['label_price'], 2)
    else:
        d['label_price'] = None
        d['has_price_diff'] = True if not d['last_printed_at'] else False
        d['price_diff_amount'] = 0.0

    return d

def get_blacklist_data() -> dict:
    """Kara liste ayar ve kurallarını döndürür."""
    import json
    from backend.config import BLACKLIST_FILE
    default_rules = {
        "words": [
            "DENEME", "TEST", "1TL", "2TL", "2.5TL", "FİYAT FARKI", "KASA ARTI", "KASA EKSİ", 
            "İPTAL", "DUMMY", "ÖRNEK", "TEMP", "GEÇİCİ", "SİGARA", "SIGARA",
            "MNV ", "MANAV", "12Lİ SU", "12LI SU", "19LUKSU", "19LUK SU", "10LUK SU", "10LUKSU"
        ],
        "barcodes": ["00", "01", "000", "01000", "01001", "01002", "01003", "01004", "000DENEME", "12Lİ SU", "12LI SU", "19LUKSU", "10LUK SU"],
        "min_barcode_length": 3,
        "block_negative_prices": True,
        "block_zero_prices": True,
        "block_scale_products": True,   # Teraziye bağlı 27, 28, 29 ile başlayan gramajlı ürünler
        "block_cigarettes": True        # Sigaralar
    }
    if not os.path.exists(BLACKLIST_FILE):
        try:
            with open(BLACKLIST_FILE, "w", encoding="utf-8") as f:
                json.dump(default_rules, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
        return default_rules

    try:
        with open(BLACKLIST_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return {**default_rules, **data}
    except Exception:
        return default_rules

def save_blacklist_data(data: dict) -> bool:
    """Kara liste kurallarını dosyaya kaydeder."""
    import json
    from backend.config import BLACKLIST_FILE
    try:
        with open(BLACKLIST_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False

def check_blacklist_with_reason(barcode: str, title: str = "", price: float = 0.0) -> tuple:
    """Ürünün kara listede olup olmadığını ve engellenme nedenini döndürür: (is_blocked, reason)"""
    b = str(barcode or "").strip()
    t = str(title or "").strip().upper()
    t_folded = fold_turkish_text(t)

    cfg = get_blacklist_data()

    # 1. Barkod kontrolleri
    min_len = cfg.get("min_barcode_length", 3)
    if not b or len(b) < min_len:
        return True, "Geçersiz veya Çok Kısa Barkod"

    # 12li su, 19luksu gibi
    if re.search(r'^(?:10|12|19|24|50)[\s\-_]*(?:LU|LI|Lİ|LUK|LÜK)?[\s\-_]*(?:SU|BARDAK)$', b, re.IGNORECASE):
        return True, "Koli/Paket Test Barkodu"
    
    if re.match(r'^0+[0-9]{1,4}$', b) and len(b) <= 5:
        return True, "Test/Sıfır Serisi Barkod"

    # Terazi / Manav
    if cfg.get("block_scale_products", False):
        if (len(b) == 13 or len(b) == 7) and b.startswith(('27', '28', '29')) and b.isdigit():
            return True, "Terazi/Gramaj Barkodu (27-29)"

    # Sigara Kontrolü
    if cfg.get("block_cigarettes", True):
        # Kesinlikle sigara olmayan gıda / temizlik / kozmetik istisna kelimeleri
        non_cig_keywords = [
            'ŞEKER', 'SEKER', 'TOFİTA', 'TOFITA', 'OLİPS', 'OLIPS', 'JELİBON', 'JELIBON',
            'ŞİPŞEVDI', 'SİPSEVDİ', 'SIPSEVDI', 'KARBONAT', 'ELEGAN', 'BONBON', 'TOFY', 'MEYBON',
            'SAKIZ', 'ÇİKOLATA', 'CIKOLATA', 'KAHVE', 'KAHVESİ', 'KAHVESI', 'BİSKÜVİ', 'BISKUVI',
            'KEK', 'GIDA', 'SABUN', 'ŞAMPUAN', 'SAMPUAN', 'DİŞ', 'DIS', 'MACUN', 'ROLL-ON', 'ROLL ON',
            'BOYA', 'MANTAR', 'ÇORAP', 'CORAP', 'ÇAY', 'CAY', 'GOFRET', 'KRAKER', 'PASTİL', 'PASTIL',
            'VİVİDENT', 'VIVIDENT', 'FALIM', 'MENTOS', 'FIRST', 'TCHIBO', 'NESCAFE', 'NESCAFÉ', 'JACOBS',
            'ORÇAY', 'ORCAY', 'DOĞUŞ', 'DOGUS', 'CLEAR', 'HEAD & SHOULDERS', 'HEAD SHOULDERS', 'LUX',
            'SIGNAL', 'COLGATE', 'IPANA', 'DURU', 'HACI ŞAKİR', 'HACISAKIR', 'OLD SPICE', 'CANGA',
            'BROWNİ', 'BROWNI', 'INTENSE', 'TUTKU', 'DİDO', 'DIDO', 'CAFE CROWN', 'PUF', 'CORN FLAKES',
            'FLAKES', 'MÜSLİ', 'MUSLI'
        ]
        is_food_or_cosmetic = any(kw in t for kw in non_cig_keywords)

        if not is_food_or_cosmetic:
            # 1. Genel sigara markaları (kelime sınırıyla)
            cig_brands = [
                r'\bMARLBORO\b', r'\bPARLIAMENT\b', r'\bWINSTON\b', r'\bCAMEL\b', r'\bCHESTERFIELD\b',
                r'\bMURATTI\b', r'\bROTHMANS\b', r'\bLUCKY\s*STRIKE\b', r'\bPALL\s*MALL\b', r'\bDAVIDOFF\b',
                r'\bMONTE\s*CARLO\b', r'\bVICEROY\b', r'\bTEKEL\s*(?:2000|2001)?\b', r'\bLARK\b', r'\bL&M\b',
                r'\bLM\s*(?:RED|BLUE|LABEL)\b', r'\bESSE\b', r'\bRAISON\b', r'\bPRESIDENT\b', r'\bPRESİDENT\b',
                r'\bWINNER\b', r'\bWİNNER\b', r'\bHD\s*(?:BLUE|SLIMS|SLİMS|RED)\b', r'\bWEST\b', r'\bPOLO\s*SLIMS\b',
                r'\bCLIPPER\s*SIGARA\b', r'\bSİGARA\b', r'\bSIGARA\b'
            ]
            for pat in cig_brands:
                if re.search(pat, t, re.IGNORECASE):
                    return True, "Sigara Ürünü (Yazdırılmaz)"

            # 2. KENT (Sadece sigara modelleri: SWITCH, SLIMS, D-RANGE, BLUE, GREY, WHITE, DARK BLUE, NANO vb.)
            if 'KENT' in t:
                if re.search(r'\bKENT\b.*\b(SWITCH|SLIMS|SLİMS|D[\s\-_]*RANGE|DRANGE|BLUE|GREY|WHITE|DARK[\s\-_]*BLUE|NANO|LINE|LİNE|BLACK|SILVER)\b', t, re.IGNORECASE):
                    return True, "Sigara Ürünü (Kent)"

            # 3. LD (Sadece sigara LD serisi, Gold/Bold bisküvi veya çikolatalar değil)
            if re.search(r'(?:^|\s)LD\s+(?:KISA|UZUN|BLUE|RED|SLIMS|SLİMS|SLENDER|LODOS)', t, re.IGNORECASE):
                return True, "Sigara Ürünü (LD)"

            # 4. TOUCH (Sadece Marlboro Touch veya Touch Blue/Gray vb.)
            if re.search(r'\b(?:MARLBORO\s+TOUCH|TOUCH\s+(?:BLUE|GRAY|GREY|WHITE|SLIMS|SLİMS|AQUA))\b', t, re.IGNORECASE):
                return True, "Sigara Ürünü (Touch)"

    # Özel tanımlı kara liste
    for blocked_b in cfg.get("barcodes", []):
        if str(blocked_b).strip().upper() == b.upper():
            return True, "Kara Listede Tanımlı Barkod"

    blacklist_patterns = [
        r'DENEME', r'TEST', r'^0+$', r'^0+[0-9]+$',
        r'^[0-9]+(?:\.[0-9]+)?\s*(?:TL|₺)$',
        r'^F[İI]YAT\s*FARKI', r'^KASA\s*ARTI', r'^KASA\s*EKSI', r'^IPTAL', r'^S[İI]L[İI]ND[İI]',
        r'^DUMMY', r'^ORNEK', r'^ÖRNEK', r'^TEMP', r'^GEÇİCİ', r'^GECICI',
        r'BO[ŞS]\s*STOK(?:\s*KARTI)?',
        r'TERAZ[İI]\s*BO[ŞS]',
        r'BARKODSUZ\s*BO[ŞS]'
    ]
    for pat in blacklist_patterns:
        if re.search(pat, t, re.IGNORECASE):
            return True, "Kara Liste / Boş Stok / Test Kaydı"

    for w in cfg.get("words", []):
        w_clean = str(w).strip().upper()
        if w_clean and w_clean in t:
            return True, f"Kara Liste Kelimesi ({w_clean})"

    clean_t = clean_product_title(t)
    if clean_t == b or re.match(r'^[0-9\.\-_]+$', clean_t):
        if len(clean_t) >= 6:
            return True, "Ürün Adı Yok (Sadece Barkod Yazılmış)"

    try:
        p_val = float(price)
        if cfg.get("block_negative_prices", True) and p_val < 0:
            return True, "Negatif Fiyat (< 0 TL)"
        if cfg.get("block_zero_prices", True) and p_val == 0.0 and (len(b) < 6 or re.search(r'DENEME|TEST|000', t)):
            return True, "Sıfır Fiyatlı Test Ürünü (0 TL)"
    except Exception:
        pass

    return False, ""

def is_invalid_or_blacklisted_product(barcode: str, title: str = "", price: float = 0.0) -> bool:
    """
    Kasa testleri, mantıksız/çöp barkodlar, negatif/sıfır fiyatlar, sigaralar, terazi/manav
    ürünleri veya 12li su / 19luk su gibi koli/paket test girdilerini kara listeye alır.
    """
    blocked, _ = check_blacklist_with_reason(barcode, title, price)
    return blocked

def parse_date_string(val) -> str:
    """
    DD.MM.YYYY HH:MM:SS, DD/MM/YYYY, YYYY-MM-DD veya datetime nesnelerini
    'YYYY-MM-DD HH:MM:SS' standart SQLite / ISO formatına çevirir.
    """
    if not val:
        return ""
    import datetime
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime("%Y-%m-%d %H:%M:%S")
    
    s = str(val).strip()
    if not s:
        return ""
    
    parts = s.split()
    date_part = parts[0]
    time_part = parts[1] if len(parts) > 1 else "00:00:00"
    
    if '.' in date_part:
        dp = date_part.split('.')
        if len(dp) == 3:
            day, month, year = dp[0].zfill(2), dp[1].zfill(2), dp[2]
            return f"{year}-{month}-{day} {time_part}"
    elif '/' in date_part:
        dp = date_part.split('/')
        if len(dp) == 3:
            day, month, year = dp[0].zfill(2), dp[1].zfill(2), dp[2]
            return f"{year}-{month}-{day} {time_part}"
    elif '-' in date_part:
        return f"{date_part} {time_part}"
        
    return s



