# -*- coding: utf-8 -*-
"""
⚡ Ana Başlatıcı main.py
FastAPI Sunucusu, Otomatik Port Yönetimi, No-Spam Terminal, Live-Reload ve Web Zarif Kapanış
"""
import sys
import os
import time
import socket
import signal
import threading
import webbrowser
import uvicorn

# 1. Windows UTF-8 Konsol ve Karakter Koruması
if sys.platform.startswith('win'):
    try:
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        if hasattr(sys.stderr, 'reconfigure'):
            sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# Proje dizinini PYTHONPATH ve çalışma dizinine ekle
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.utils.network_utils import get_local_ip

def safe_print(msg: str):
    """UTF-8 güvenli konsol çıktısı."""
    try:
        print(msg)
    except Exception:
        try:
            print(msg.encode('ascii', errors='replace').decode('ascii'))
        except Exception:
            pass

# 2. Otomatik Port Çakışma Çözücü
def find_available_port(start_port: int = 8000, max_attempts: int = 20) -> int:
    """Belirtilen port doluysa bir sonraki boş portu bulur."""
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('0.0.0.0', port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"{start_port} ile {start_port + max_attempts} arasında boş port bulunamadı.")

# 3. Otomatik Tarayıcı Açıcı (Sunucu tamamen hazır olana kadar bekler)
def open_browser_delayed(host: str, port: int, max_wait: float = 15.0):
    def _open():
        start_time = time.time()
        # Sunucu portu yanıt verene kadar bekle (ERR_CONNECTION_REFUSED engellenir)
        while time.time() - start_time < max_wait:
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                    break
            except (OSError, ConnectionRefusedError):
                time.sleep(0.3)
        # Port açıldıktan sonra ekstra 0.2 sn bekle ve tarayıcıyı aç
        time.sleep(0.2)
        try:
            webbrowser.open(f"http://127.0.0.1:{port}")
        except Exception:
            pass
    threading.Thread(target=_open, daemon=True).start()

if __name__ == "__main__":
    port = find_available_port(8000)
    local_ip = get_local_ip()

    print("\n" + "=" * 60)
    print(" 🏷️  ETİKET VE FİŞ YAZDIRICI (FastAPI & Live-Reload)")
    print("=" * 60)
    print(f" 🖥️  Ana Bilgisayar Paneli   : http://localhost:{port}")
    print(f" 💻  Katılan Dükkan PC Linki : http://{local_ip}:{port}/sync")
    print(f" 📱  Reyon Mobil Terminali   : http://{local_ip}:{port}/mobile")
    print("=" * 60)
    print(" [Sunucu kesintisiz modda çalışıyor. Web panelindeki 'Sunucuyu Kapat' ile kapatabilirsiniz]\n")

    # CTRL+C veya beklenmeyen sinyallerle sunucunun aniden kapanmasını engelle
    try:
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        if hasattr(signal, "SIGBREAK"):
            signal.signal(signal.SIGBREAK, signal.SIG_IGN)
    except Exception:
        pass

    open_browser_delayed("127.0.0.1", port)

    # Uvicorn Server yapılandırması (Sinyal yakalaması uvicorn tarafından iptal edilip sunucunun ayakta kalması garanti edilir)
    import contextlib
    @contextlib.contextmanager
    def _ignore_signals():
        yield

    # 4. HTTPS Canlı Mobil Kamera Servisi için SSL Hazırlığı
    cert_path = os.path.join(BASE_DIR, "data", "sertifikalar", "cert.pem")
    key_path = os.path.join(BASE_DIR, "data", "sertifikalar", "key.pem")
    has_ssl = os.path.exists(cert_path) and os.path.exists(key_path)

    if has_ssl:
        https_port = port + 1
        print(f" 🔒  Canlı Mobil Kamera (HTTPS): https://{local_ip}:{https_port}/mobile")
        print("=" * 60)

        def run_https_server():
            try:
                from backend.app import app as https_app
                https_config = uvicorn.Config(
                    https_app,
                    host="0.0.0.0",
                    port=https_port,
                    ssl_certfile=cert_path,
                    ssl_keyfile=key_path,
                    log_level="warning",
                    access_log=False
                )
                https_server = uvicorn.Server(https_config)
                https_server.capture_signals = _ignore_signals
                https_server.run()
            except Exception as e:
                safe_print(f"[⚠️ HTTPS Kamera Sunucusu Hatası]: {e}")

        threading.Thread(target=run_https_server, daemon=True).start()

    while True:
        try:
            from backend.app import app
            config = uvicorn.Config(
                app,
                host="0.0.0.0",
                port=port,
                log_level="warning",
                access_log=False
            )
            server = uvicorn.Server(config)
            server.capture_signals = _ignore_signals
            server.run()
            time.sleep(1)
        except (KeyboardInterrupt, SystemExit):
            break
        except Exception as e:
            safe_print(f"\n[⚠️ Sunucu Beklenmeyen Durum] Yeniden başlatılıyor: {e}")
            time.sleep(1)


