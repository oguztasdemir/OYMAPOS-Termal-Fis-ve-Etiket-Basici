
# 🏷️ OYMAPOS - Kurumsal Etiket & Fiş Otomasyon Merkezi

<div align="center">

---

## 📌 Proje Genel Bakışı

**OYMAPOS**, süpermarketler, şarküteriler, manavlar ve perakende satış noktaları için geliştirilmiş yüksek performanslı, bağımsız ve dayanıklı bir **Etiket ve Fiş Baskı Kontrol Merkezi**dir.

Herhangi bir özel POS veya ERP yazılımına bağımlı kalmadan; panodan kopyalanan listeleri, Excel/CSV dosyalarını veya barkod tarayıcı girişlerini **akıllı barkod algılama motoru** sayesinde otomatik ayrıştırır. Masaüstü yönetim paneli, reyon el terminali (mobil telefon kamerası) veya barkod okuyucu aracılığıyla tek tıkla termal / lazer yazıcılardan standartlara uygun etiket basılmasını sağlar.

---

## ✨ Özellikler & Yetenekler

### 🔍 Akıllı Barkod Algılama & Hızlı Veri Aktarımı

- **Otomatik Barkod ve Fiyat Ayrıştırma:** Panodan yapıştırılan veya yüklenen metinlerde barkod (EAN-13, EAN-8, Code-128) ve fiyat bilgisi format bağımsız olarak anında tespit edilir.
- **Panodan Doğrudan Aktarım (Ctrl + V):** Herhangi bir programdan veya tablodan kopyalanan ürün listesini ekrana yapıştırarak saniyeler içinde içeri alma.
- **Esnek Dosya Yükleme:** Excel (`.xlsx`), CSV, metin dosyaları (`.txt`) veya veritabanı yedeklerini sürükle-bırak yöntemiyle sisteme aktarma.
- **2 Aşamalı Güvenli Karşılaştırma Masası:** Aktarım öncesinde sistemdeki mevcut ürünler ve fiyatlar ile yeni veriler karşılaştırılır; zam, indirim ve yeni eklenen ürünler kullanıcı onayına sunulur.
- **Tek Tıkla Geri Alma (Rollback / Undo):** Hatalı veya istenmeyen aktarımlarda tek tıkla önceki fiyatlara anında geri dönebilme güvencesi.

### 🖨️ Hibrit Termal Baskı Motoru (ZPL + TSPL-II & A4 Grid)

- **Doğrudan Windows RAW Spooler:** Yazıcı sürücüsü gecikmesi olmaksızın milisaniyeler içinde doğrudan termal donanıma ham komut iletimi.
- **Çift Protokol Desteği (ZPL & TSPL-II):** Zebra, Xprinter, Argox, HPRT, Bixolon vb. piyasadaki tüm termal yazıcılarla tak-çalıştır uyumluluk.
- **Dinamik Raf Etiketi Standartları:** Birim fiyat kutusu, gramaj/miktar rozeti, resmi Yerli Üretim logosu, reyon kodları ve kampanya alanları.
- **Çoklu Boyut Desteği:** 40x20 mm, 60x40 mm, 76x40 mm (Standart Market), 85x45 mm ve özel şablonlar.
- **A4 Çoklu Çıkartma Dizgisi:** Lazer veya mürekkep püskürtmeli ofis yazıcıları için A4 yapışkanlı etiket kağıtlarına (24'lü, 40'lı, 65'li) baskı imkanı.
- **Canlı Baskı Geçmişi:** Yapılan tüm baskı işlemlerinin anlık loglanması ve arayüzdeki "Baskı Geçmişi" sekmesinden izlenebilmesi.

### 📱 Mobil Barkod Terminali (Reyon Asistanı)

- Herhangi bir uygulama yüklemeden, aynı Wi-Fi ağına bağlı akıllı telefon kamerasından barkod okutma.
- Reyonda gezerken raf fiyatı ile güncel fiyatı denetleme ve tek tıkla kasadaki yazıcıya etiket gönderme.

### ⚖️ Terazi / Manav Barkod Çözücü

- `27`, `28` ve `29` prefixli terazi barkodlarını (`27[PLU][Gramaj/Tutar][C]`) otomatik ayrıştırma.
- Gramajlı ürünlerin birim fiyatını ve paket tutarını otomatik hesaplama.

### 🛡️ Kararlı ve Çökme Önleyici Mimari

- **SQLite WAL (Write-Ahead Logging):** Eşzamanlı okuma/yazma kilitlenmelerini önleyen yüksek hızlı veritabanı motoru.
- **Türkçe Karakter Katlaması (`fold_tr`):** `I/ı`, `İ/i`, `Ş/ş`, `Ğ/ğ`, `Ü/ü`, `Ö/ö`, `Ç/ç` harflerinde %100 arama doğruluğu.
- **Zaman Damgalı Tek Tıkla Yedekleme:** Veritabanı ve ayarları `.zip` formatında yedekleme ve geri yükleme.

---

## 🚀 Hızlı Başlatma (Tüm Windows Sürümleri)

Windows 7, 8, 10 veya 11 (32-bit / 64-bit) fark etmeksizin sistemi çalıştırmak için:

### 1. Tek Tıkla Başlatma (Tavsiye Edilen)

Proje ana dizinindeki **`BASLAT.bat`** dosyasına çift tıklayın.

> **Ne Yapar?**
>
> * Bilgisayarınızda Python olup olmadığını otomatik kontrol eder.
> * Eğer Python yoksa; Windows sürümünüze ve mimarinize (32/64-bit) uygun Python motorunu resmi kaynaktan arka planda sessizce kurar.
> * Gerekli kütüphaneleri [requirements.txt](requirements.txt) üzerinden otomatik tamamlar.
> * Web sunucusunu başlatır ve tarayıcınızı otomatik olarak açar.

### 2. Geliştirici Modu (Manuel Kurulum)

```bash
# 1. Proje dizinine girin
cd "Etiket Yazdirici"

# 2. Gereksinimleri yukleyin
pip install -r requirements.txt

# 3. Sunucuyu calistirin
python main.py
```

Tarayıcınızda arayüz otomatik olarak `http://localhost:8000` adresinde açılacaktır.

---

## 🌐 Ağ ve Cihaz Erişimi

| Modül                                                 | Yerel Adres                        | Açıklama                                                                            |
| ------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------- |
| 🖥️**Ana Yönetim & Etiket Masası**            | `http://localhost:8000/`         | Stok arama, tekli/toplu etiket basımı, baskı geçmişi.                            |
| 💻**Veri Aktarım & Karşılaştırma Portalı** | `http://[IP_ADRESI]:8000/sync`   | Panodan yapıştırma (Ctrl+V) veya dosya yükleme ile hızlı veri aktarım masası. |
| 📱**Reyon Mobil Terminali**                      | `http://[IP_ADRESI]:8000/mobile` | Telefon kamerası ile kablosuz reyon etiket denetimi.                                 |

---

## 📂 Proje Mimarisi

```
Etiket Yazdırıcı/
├── BASLAT.bat                      # Tüm Windows'lar için Otomatik Kurulum ve Başlatıcı
├── main.py                         # Ana Başlatıcı & Dinamik Port Yönetimi
├── requirements.txt                # Python Bağımlılıkları
├── README.md                       # Proje Dokümantasyonu
├── LICENSE                         # MIT Lisansı
├── backend/
│   ├── app.py                      # FastAPI Sunucusu & Anti-Cache Middleware
│   ├── config.py                   # Uygulama Dizin ve Konfigürasyon Sabitleri
│   ├── controllers/                # REST API Denetleyicileri
│   │   ├── api_controller.py       # Router Birleştirici
│   │   ├── network_controller.py   # Ağ Bilgisi & IP API
│   │   ├── print_controller.py     # Tekli, Toplu ve Mobil Baskı API
│   │   ├── printer_controller.py   # Yazıcı Donanım & Ayar API
│   │   ├── product_controller.py   # Ürün Listeleme & Arama API
│   │   ├── system_controller.py    # Yedekleme & Geri Yükleme API
│   │   ├── template_controller.py  # Etiket Tasarım Şablonları API
│   │   └── vegawin_controller.py   # Veri İçe Aktarım & Karşılaştırma API
│   ├── models/
│   │   └── schemas.py              # Pydantic Veri Modelleri
│   ├── services/
│   │   ├── db/                     # SQLite Veritabanı ve Repository Katmanı
│   │   ├── printer_service.py      # RAW Spooler, ZPL & TSPL-II Baskı Servisi
│   │   ├── zpl_etiket_kodlayici.py # Standart ZPL Raf Etiketi Kodlayıcı Motor
│   │   ├── template_service.py     # Etiket Şablon Motoru
│   │   └── vegawin/                # Veri Ayrıştırıcı & Akıllı Karşılaştırma Motoru
│   └── utils/
│       ├── network_utils.py        # Yerel IP & Dinamik QR Kod Üretici
│       ├── response_utils.py       # Standart JSON Yanıt Yardımcıları
│       └── text_utils.py           # Türkçe Karakter ve Metin Temizleyici
├── frontend/
│   ├── css/                        # Responsive Arayüz Tasarım Stilleri
│   ├── js/
│   │   ├── api.js                  # Backend REST API İstemcisi
│   │   ├── main.js                 # Frontend Başlatıcı & Sekme Yönetimi
│   │   ├── mobile.js               # Mobil Terminal Kamera Okuyucu
│   │   └── modules/                # JS Modülleri (products, print, sync vb.)
│   ├── partials/                   # Dinamik Sekmeler ve Modal Şablonları
│   ├── index.html                  # Ana Masaüstü Kontrol Masası
│   ├── sync.html                   # Veri Aktarım & Karşılaştırma Portalı
│   └── mobile.html                 # Mobil Reyon Barkod Terminali
└── data/
    ├── ayarlar.json                # Yazıcı ve Kalibrasyon Ayarları
    ├── etiket_sablonlari.json      # Etiket Tasarım Şablonları
    ├── kara_liste.json             # Otomatik Temizleme Kuralları
    └── uploads/                    # Geçici Yükleme Klasörü (.gitkeep ile korunur)
```

---

## ⌨️ Klavye Kısayolları

| Kısayol                | İşlev                                       |
| ----------------------- | --------------------------------------------- |
| `Ctrl + K` veya `/` | Ürün arama kutusuna anında odaklan         |
| `Ctrl + S`            | Yazıcı ve kalibrasyon ayarlarını kaydet   |
| `F2`                  | Hızlı test etiketi yazdır                  |
| `Enter`               | Önizleme modalı açıkken doğrudan yazdır |
| `Escape`              | Modalı kapat veya arama kutusunu temizle     |

---

## 💡 Sorun Giderme

1. **Yazıcı Çıktı Vermiyorsa:**
   - Denetim Masası > Aygıtlar ve Yazıcılar bölümünden termal yazıcınızın adının arayüzdeki "Yazıcı Ayarları" sekmesindeki isimle birebir aynı olduğunu kontrol edin.
2. **Kuyrukta Yazdırma İşi Takılı Kalırsa:**
   - Arayüzdeki Yazıcı Ayarları bölümünden "Kuyruğu Temizle" butonunu kullanarak kilitlenmiş yazdırma işlerini tek tıkla boşaltabilirsiniz.
3. **Diğer Cihazlardan Bağlanılamıyorsa:**
   - Ana bilgisayarın Windows Güvenlik Duvarı ayarlarında Python için yerel ağ bağlantılarına izin verildiğinden emin olun.

---

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) kapsamında lisanslanmıştır.
