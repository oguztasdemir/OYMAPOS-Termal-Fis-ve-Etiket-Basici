# 🏷️ OYMAPOS - Kurumsal Etiket & Fiş Otomasyon Merkezi

**OYMAPOS**, süpermarketler, şarküteriler, manavlar ve perakende satış noktaları için geliştirilmiş; bağımsız, yüksek performanslı ve modern bir **Etiket ve Fiş Baskı Kontrol Merkezi**dir.

Herhangi bir özel POS veya ERP yazılımına bağımlı kalmadan; panodan kopyalanan listeleri, Excel/CSV dosyalarını, kasa verilerini veya barkod tarayıcı girişlerini **akıllı barkod algılama motoru** sayesinde otomatik ayrıştırır. Masaüstü yönetim paneli, reyon el terminali (mobil telefon kamerası) veya barkod okuyucu aracılığıyla tek tıkla termal / lazer yazıcılardan standartlara uygun etiket basılmasını sağlar.

---

## 📱 Mobil Reyon Terminali (Telefon ile Kablosuz Denetim)

Akıllı telefonunuzu herhangi bir uygulama yüklemeden reyon el terminaline dönüştürün. Kamera ile barkod okutma, anlık ürün sorgulama, fiyat değiştirme ve kasadaki yazıcıya tek tıkla yazdırma imkanı sunar.

| 1. Fiyat Gör & Ürün Kartı | 2. Basım Kuyruğu & Gönderim | 3. Günlük Değişenler Listesi |
| :---: | :---: | :---: |
| <img src="frontend/assets/screenshots/mobile_scan_active.png" width="280" alt="Mobil Fiyat Gör ve Ürün Kartı"> | <img src="frontend/assets/screenshots/mobile_queue.png" width="280" alt="Mobil Basım Kuyruğu"> | <img src="frontend/assets/screenshots/mobile_changes.png" width="280" alt="Mobil Değişenler Listesi"> |
| **Barkod Okutma & Detay:**<br>Kamera veya manuel aramayla anında satış fiyatı, etiket fiyatı ve piyasa karşılaştırması. | **Kuyruk Yönetimi:**<br>Okutulan ürünler ters kronolojik sırayla toplanır; toplu olarak kasadaki termal yazıcıya iletilir. | **Reyon Denetimi:**<br>Günün fiyatı değişen ürünlerini listeler, tek tıkla barkod dökümü ve PDF indirme sağlar. |

---

## 🖥️ Masaüstü Yönetim Masası & Temel Paneller

OYMAPOS Masaüstü Arayüzü, yoğun market temposunda hızlı işlem yapabilmek için klavye odaklı, sade ve güçlü araçlarla donatılmıştır.

### 1. 🏠 Ana Kontrol Paneli (Dashboard)
Toplam stok durumu, fiyatı değişen ürün sayısı, aktif yazıcı bağlantısı ve hızlı yönlendirme kartları.
<p align="center">
  <img src="frontend/assets/screenshots/desktop_dashboard.png" width="920" alt="Masaüstü Dashboard Paneli">
</p>

---

### 2. 📦 Ürünler & Hızlı Etiket Masası (Excel Grid)
4.900+ ürünün anlık arandığı, fiyat farkı olanların tek tıkla süzüldüğü ve `Shift/Ctrl + Tık` ile çoklu etiket basıldığı ana merkez.
<p align="center">
  <img src="frontend/assets/screenshots/desktop_products.png" width="920" alt="Masaüstü Ürünler Masası">
</p>

---

### 3. ⚡ Fiyat Güncelleme Masası (Ctrl+V & Excel)
Muhasebe programından veya toptancı listesinden kopyalanan verileri anında yapıştırın. Zam gelenler yeşil/kırmızı renk kodlarıyla gösterilir ve güvenle aktarılır.
<p align="center">
  <img src="frontend/assets/screenshots/desktop_price_update.png" width="920" alt="Fiyat Güncelleme Masası">
</p>

---

### 4. 📊 Günlük Fiyat Değişim Raporları & A4 Barkod PDF Dökümü
Günün veya geçmiş günlerin fiyat değişimlerini kaynak bazlı (mobil, masaüstü, dosya) filtreleyin. Reyonda okutulabilecek A4 büyük barkodlu PDF dökümü alın.
<p align="center">
  <img src="frontend/assets/screenshots/desktop_price_reports.png" width="920" alt="Fiyat Değişim Raporları">
</p>

---

### 5. 🎨 Etiket Düzenle & Şablonlar (Stüdyo)
76x40mm Standart Market Rafı ve 60x40mm Kompakt şablonları canlı önizleyin. Resmi Yerli Üretim Logosu, Birim Fiyat Kutusu ve Reyon Kodu alanlarını özelleştirin.
<p align="center">
  <img src="frontend/assets/screenshots/desktop_studio.png" width="920" alt="Etiket Tasarım Stüdyosu">
</p>

---

## ⌨️ Klavye Kısayolları

| Kısayol | Açıklama |
| :--- | :--- |
| **`F2`** | Hızlı Fiyat Gör & Barkod / Stok Sorgulama penceresini açar. |
| **`Shift + Tık`** | Ürün tablosunda seçilen iki ürün arasındaki tüm satırları seçer (Aralık Seçimi). |
| **`Ctrl + Tık`** | Ürün tablosunda istenen ürünleri tek tek çoklu seçime ekler/çıkarır. |
| **`Ctrl + K`** | Doğrudan ürün arama çubuğuna odaklanır. |
| **`ESC`** | Açık olan önizleme, düzenleme ve arama pencerelerini kapatır. |

---

## 🚀 Kurulum ve Başlatma

### 1. Tek Tıkla Başlatma (Tavsiye Edilen)
Proje ana dizinindeki **`BASLAT.bat`** dosyasına çift tıklayın. Sistem Python ortamını ve bağımlılıkları kontrol ederek sunucuyu otomatik başlatır.

### 2. Manuel Başlatma (Geliştirici Modu)
```bash
# Gerekli kütüphaneleri yükleyin
pip install -r requirements.txt

# Sunucuyu başlatın
python main.py
```
Tarayıcınızda arayüz `http://localhost:8000` adresinde açılacaktır.

---

## 🌐 Ağ ve Cihaz Portalı

| Modül | Yerel Adres | Açıklama |
| :--- | :--- | :--- |
| 🖥️ **Masaüstü Kontrol Merkezi** | `http://localhost:8000/` | Ürünler, şablonlar, fiyat değişimi ve raporlama masası. |
| 💻 **Veri Aktarım Masası** | `http://[IP_ADRESI]:8000/sync` | Yerel ağdaki diğer bilgisayarlardan dosya ve pano aktarımı. |
| 📱 **Reyon Mobil Terminali** | `http://[IP_ADRESI]:8000/mobile` | Telefon kamerasıyla kablosuz reyon denetimi ve anlık etiket basımı. |
