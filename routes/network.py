from flask import Blueprint, request, jsonify, render_template, g, current_app
import random
import socket
import psutil
import subprocess
import re
import requests
import platform
import os
import time
import threading
import json
from datetime import datetime, timedelta

# Funkcja do pobierania bazy danych
def get_db():
    from app import get_db as app_get_db
    return app_get_db()

# Import dekoratora login_required
def login_required(f):
    from auth_helpers import login_required as auth_login_required
    return auth_login_required(f)

# Tworzenie blueprintu dla tras sieciowych
network_bp = Blueprint('network', __name__)

# Tworzenie folderu dla danych
scan_data_dir = 'data'
os.makedirs(scan_data_dir, exist_ok=True)
last_scan_file = os.path.join(scan_data_dir, 'last_network_scan.json')

# Strona szczegółów sieci
@network_bp.route('/network/network-details')
@login_required
def network_details():
    # Pobieranie preferencji użytkownika
    db = get_db()
    settings = db.execute('SELECT theme FROM user_settings WHERE user_id = ?',
                          (g.user_id,)).fetchone()
    
    theme = settings['theme'] if settings else 'light'
    
    return render_template('network_details.html', 
                          app_name=current_app.config['APP_NAME'],
                          username=g.username,
                          role=g.role,
                          theme=theme)

# API - pobieranie statusu sieci
@network_bp.route('/network/api/network', methods=['GET'])
@login_required
def get_network_status():
    try:
        # Pobieranie statystyk interfejsu sieciowego
        net_io = psutil.net_io_counters()
        
        # Sprawdzenie połączenia internetowego
        is_connected = False
        try:
            # Timeout zmniejszony dla szybszej odpowiedzi
            socket.create_connection(("8.8.8.8", 53), timeout=2)
            is_connected = True
        except:
            # Próba alternatywnego serwera, jeśli pierwszy zawiedzie
            try:
                socket.create_connection(("1.1.1.1", 53), timeout=2)
                is_connected = True
            except:
                current_app.logger.warning("Nie można połączyć się z internetem")
        
        # Pobierz uptime systemu w sposób zgodny z różnymi systemami operacyjnymi
        uptime = get_system_uptime()
        
        # Pobranie adresu IP zewnętrznego z timeoutem
        external_ip = "Nieznany"
        try:
            external_ip = requests.get('https://api.ipify.org', timeout=2).text
        except:
            try:
                # Alternatywny serwis jeśli pierwszy zawiedzie
                external_ip = requests.get('https://ifconfig.me', timeout=2).text
            except:
                current_app.logger.warning("Nie można pobrać zewnętrznego IP")
        
        # Pobieranie informacji o DNS zgodnie z systemem operacyjnym
        dns_server = get_dns_servers()
        
        # Obliczanie prędkości na podstawie liczników sieciowych
        download_speed = round(net_io.bytes_recv / 1024 / 1024 * 8, 1)  # Mbps
        upload_speed = round(net_io.bytes_sent / 1024 / 1024 * 8, 1)    # Mbps
        
        # Pobierz liczbę podłączonych urządzeń
        connected_devices = 0
        try:
            devices = get_devices()
            connected_devices = len(devices)
        except:
            current_app.logger.error("Nie można pobrać liczby urządzeń")
        
        network_data = {
            'download_speed': download_speed,
            'upload_speed': upload_speed,
            'connected_devices': connected_devices,
            'status': 'ONLINE' if is_connected else 'OFFLINE',
            'uptime': uptime,
            'external_ip': external_ip,
            'dns_server': dns_server
        }
        
        current_app.logger.info(f"Pomyślnie zebrano dane o sieci: {network_data}")
        return jsonify(network_data)
    except Exception as e:
        current_app.logger.error(f"Błąd podczas pobierania statusu sieci: {str(e)}")
        # Dane awaryjne w przypadku błędu, ale bez wartości testowych
        network_data = {
            'download_speed': 0,
            'upload_speed': 0,
            'connected_devices': 0,
            'status': 'NIEZNANY',
            'uptime': "Nieznany",
            'external_ip': "Nieznany",
            'dns_server': "Nieznany"
        }
        return jsonify(network_data)

# Funkcja do pobierania uptime zgodnie z systemem operacyjnym
def get_system_uptime():
    try:
        # Sprawdź system operacyjny
        os_name = platform.system()
        
        if os_name == 'Linux':
            # Linux - czytaj z /proc/uptime
            try:
                with open('/proc/uptime', 'r') as f:
                    uptime_seconds = float(f.readline().split()[0])
                    days = int(uptime_seconds // 86400)
                    hours = int((uptime_seconds % 86400) // 3600)
                    return f"{days} dni, {hours} godz"
            except:
                current_app.logger.error("Nie udało się odczytać /proc/uptime")
        
        # Używamy psutil jako uniwersalnej metody
        boot_time = psutil.boot_time()
        uptime_seconds = time.time() - boot_time
        days = int(uptime_seconds // 86400)
        hours = int((uptime_seconds % 86400) // 3600)
        return f"{days} dni, {hours} godz"
    
    except Exception as e:
        current_app.logger.error(f"Błąd podczas pobierania uptime: {str(e)}")
        return "Nieznany"

# Funkcja do pobierania serwerów DNS zgodnie z systemem operacyjnym
def get_dns_servers():
    try:
        # Sprawdź system operacyjny
        os_name = platform.system()
        dns_servers = []
        
        if os_name == 'Windows':
            # Windows - użyj ipconfig /all
            try:
                output = subprocess.check_output("ipconfig /all", shell=True).decode('utf-8', errors='ignore')
                for line in output.split('\n'):
                    if "DNS Servers" in line or "Serwery DNS" in line:
                        # Znajdź adres IP w linii
                        ip_match = re.search(r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}', line)
                        if ip_match:
                            dns_servers.append(ip_match.group(0))
            except:
                current_app.logger.error("Nie udało się wykonać ipconfig /all")
        
        elif os_name == 'Linux':
            # Linux - spróbuj kilka metod
            # 1. Sprawdź /etc/resolv.conf
            try:
                with open('/etc/resolv.conf', 'r') as f:
                    for line in f:
                        if line.startswith('nameserver'):
                            dns_servers.append(line.split()[1])
            except:
                current_app.logger.warning("Nie udało się odczytać /etc/resolv.conf")
            
            # 2. Jeśli nie znaleziono, spróbuj nmcli
            if not dns_servers:
                try:
                    output = subprocess.check_output("nmcli dev show | grep DNS", shell=True).decode('utf-8')
                    for line in output.split('\n'):
                        ip_match = re.search(r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}', line)
                        if ip_match:
                            dns_servers.append(ip_match.group(0))
                except:
                    current_app.logger.warning("Nie udało się wykonać nmcli")
        
        # Jeśli nie znaleziono serwerów DNS, zwróć Nieznany
        if not dns_servers:
            return "Nieznany"
        
        return ', '.join(dns_servers)
    
    except Exception as e:
        current_app.logger.error(f"Błąd podczas pobierania DNS: {str(e)}")
        return "Nieznany"

# Funkcja do zapisywania wyników skanowania
def save_scan_results(devices):
    """Zapisuje wyniki skanowania do pliku JSON"""
    try:
        with open(last_scan_file, 'w') as f:
            json.dump(devices, f, indent=2)
        current_app.logger.info(f"Zapisano wyniki skanowania: {len(devices)} urządzeń")
    except Exception as e:
        current_app.logger.error(f"Błąd podczas zapisywania wyników skanowania: {str(e)}")

# Funkcja do odczytywania poprzednich wyników skanowania
def load_scan_results():
    """Odczytuje wyniki poprzedniego skanowania z pliku"""
    try:
        if os.path.exists(last_scan_file):
            with open(last_scan_file, 'r') as f:
                devices = json.load(f)
            current_app.logger.info(f"Wczytano wyniki poprzedniego skanowania: {len(devices)} urządzeń")
            return devices
        else:
            current_app.logger.info("Brak poprzednich wyników skanowania")
            return []
    except Exception as e:
        current_app.logger.error(f"Błąd podczas odczytywania wyników skanowania: {str(e)}")
        return []

# API - pobieranie urządzeń w sieci
@network_bp.route('/network/api/devices', methods=['GET'])
@login_required
def get_devices():
    try:
        # Sprawdź, czy istnieją zapisane wyniki skanowania
        cached_devices = load_scan_results()
        if cached_devices:
            current_app.logger.info(f"Użycie {len(cached_devices)} urządzeń z poprzedniego skanowania")
            
            # Mapowanie na format odpowiedzi API
            devices = []
            for device in cached_devices:
                devices.append({
                    'id': device.get('id', len(devices) + 1),
                    'name': device.get('name', f'Urządzenie-{len(devices) + 1}'),
                    'mac_address': device.get('mac_address', 'Nieznany'),
                    'ip_address': device.get('ip_address', 'Nieznany'),
                    'device_type': device.get('device_type', 'unknown'),
                    'status': device.get('status', 'active')
                })
            
            # Jeśli mamy urządzenia z cache, zwróć je od razu
            if devices:
                current_app.logger.info(f"Zwracanie {len(devices)} urządzeń z cache")
                # Uruchom skanowanie w tle, aby odświeżyć dane
                threading.Thread(target=background_scan_network, daemon=True).start()
                return jsonify(devices)

        # Pobierz istniejące urządzenia z bazy danych
        db = get_db()
        
        # Log the database query
        current_app.logger.info("Attempting to fetch devices from database")
        
        # Sprawdź, czy baza danych zwraca jakiekolwiek dane
        db_devices = db.execute('SELECT * FROM devices').fetchall()
        current_app.logger.info(f"Found {len(db_devices)} devices in database")
        
        # Pobierz aktualny stan sieci
        devices = []
        
        # Próba użycia arp -a do wykrycia urządzeń w sieci
        try:
            # Wykonaj skanowanie sieci używając różnych metod w zależności od systemu
            current_app.logger.info("Attempting to scan network")
            
            # Sprawdź system operacyjny
            os_name = platform.system()
            arp_output = ""
            
            if os_name == 'Windows':
                try:
                    # Na Windows używamy 'arp -a'
                    process = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=5)
                    if process.returncode == 0:
                        arp_output = process.stdout
                    else:
                        current_app.logger.error(f"arp -a failed with code {process.returncode}: {process.stderr}")
                except Exception as e:
                    current_app.logger.error(f"Error executing 'arp -a': {str(e)}")
            else:
                try:
                    # Na Linux/Unix używamy 'arp -a'
                    process = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=5)
                    if process.returncode == 0:
                        arp_output = process.stdout
                    else:
                        # Spróbuj alternatywnego podejścia
                        process = subprocess.run(["ip", "neighbor"], capture_output=True, text=True, timeout=5)
                        if process.returncode == 0:
                            arp_output = process.stdout
                        else:
                            current_app.logger.error(f"Network scan commands failed")
                except Exception as e:
                    current_app.logger.error(f"Error executing network scan: {str(e)}")
            
            # Log the output for debugging
            current_app.logger.debug(f"Network scan output: {arp_output[:200]}...")
            
            # Przetwarzanie wyników
            found_devices = []
            
            # Przetwarzanie wyników arp -a
            for line in arp_output.split('\n'):
                if not line.strip():
                    continue
                
                # Log each line for debugging
                current_app.logger.debug(f"Processing line: {line}")
                
                # Próba wyodrębnienia adresu IP i MAC
                ip_match = re.search(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})', line)
                mac_match = re.search(r'([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})', line)
                
                if ip_match and mac_match:
                    ip_address = ip_match.group(1)
                    mac_address = mac_match.group(1).upper()
                    
                    # Log each device found
                    current_app.logger.info(f"Found device: IP {ip_address}, MAC {mac_address}")
                    
                    # Sprawdź czy urządzenie jest już w bazie
                    device = next((dict(d) for d in db_devices if d['mac_address'] == mac_address), {
                        'name': f'Urządzenie-{len(found_devices) + 1}',
                        'device_type': 'unknown'
                    })
                    
                    found_devices.append({
                        'id': device.get('id', len(found_devices) + 1),
                        'name': device.get('name', f'Urządzenie-{len(found_devices) + 1}'),
                        'mac_address': mac_address,
                        'ip_address': ip_address,
                        'device_type': device.get('device_type', 'unknown'),
                        'status': 'active'
                    })
            
            current_app.logger.info(f"Total devices discovered via scan: {len(found_devices)}")
            
            # Jeśli znaleziono urządzenia przez skan, zwróć je
            if found_devices:
                # Zapisz wyniki skanowania do pliku cache
                save_scan_results(found_devices)
                return jsonify(found_devices)
            
            # Jeśli nie znaleziono urządzeń przez skan, ale są w bazie, użyj tych z bazy
            if db_devices:
                for device in db_devices:
                    devices.append({
                        'id': device['id'],
                        'name': device['name'],
                        'mac_address': device['mac_address'],
                        'ip_address': device.get('ip_address', 'Nieznany'),
                        'device_type': device.get('device_type', 'unknown'),
                        'status': device.get('status', 'inactive')
                    })
                return jsonify(devices)
            
            # Jeśli nie znaleziono żadnych urządzeń, zwróć pustą listę
            return jsonify([])
            
        except Exception as e:
            current_app.logger.error(f"Error during network scan: {str(e)}")
            # Dodaj więcej szczegółów o błędzie
            import traceback
            current_app.logger.error(traceback.format_exc())
            
            # W przypadku błędu skanowania, ale są urządzenia w bazie, zwróć je
            if db_devices:
                for device in db_devices:
                    devices.append({
                        'id': device['id'],
                        'name': device['name'],
                        'mac_address': device['mac_address'],
                        'ip_address': device.get('ip_address', 'Nieznany'),
                        'device_type': device.get('device_type', 'unknown'),
                        'status': device.get('status', 'inactive')
                    })
                return jsonify(devices)
            
            # Jeśli brak urządzeń, zwróć pustą listę
            return jsonify([])
        
    except Exception as e:
        current_app.logger.error(f"Błąd podczas pobierania urządzeń: {str(e)}")
        import traceback
        current_app.logger.error(traceback.format_exc())
        
        # W przypadku poważnego błędu, zwróć pustą listę
        return jsonify([])

# Funkcja skanowania w tle
def background_scan_network():
    """Wykonuje skanowanie sieci w tle i zapisuje wyniki"""
    current_app.logger.info("Rozpoczęcie skanowania sieci w tle")
    try:
        # Tutaj byłoby wywołanie zaawansowanego skanowania
        # Dla prostoty używamy standardowej metody skanowania
        
        # Pobieranie urządzeń
        db = get_db()
        devices = []
        
        try:
            # Skanowanie sieci
            os_name = platform.system()
            arp_output = ""
            
            if os_name == 'Windows':
                process = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=5)
                if process.returncode == 0:
                    arp_output = process.stdout
            else:
                process = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=5)
                if process.returncode == 0:
                    arp_output = process.stdout
                else:
                    process = subprocess.run(["ip", "neighbor"], capture_output=True, text=True, timeout=5)
                    if process.returncode == 0:
                        arp_output = process.stdout
            
            # Przetwarzanie wyników
            for line in arp_output.split('\n'):
                if not line.strip():
                    continue
                
                # Próba wyodrębnienia adresu IP i MAC
                ip_match = re.search(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})', line)
                mac_match = re.search(r'([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})', line)
                
                if ip_match and mac_match:
                    ip_address = ip_match.group(1)
                    mac_address = mac_match.group(1).upper()
                    
                    # Sprawdź czy urządzenie istnieje w bazie
                    device = db.execute('SELECT * FROM devices WHERE mac_address = ?', (mac_address,)).fetchone()
                    
                    if device:
                        # Aktualizuj urządzenie w bazie
                        db.execute(
                            'UPDATE devices SET ip_address = ?, last_seen = ?, status = ? WHERE mac_address = ?',
                            (ip_address, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), 'active', mac_address)
                        )
                        
                        # Dodaj do listy urządzeń
                        devices.append({
                            'id': device['id'],
                            'name': device['name'],
                            'mac_address': mac_address,
                            'ip_address': ip_address,
                            'device_type': device['device_type'],
                            'status': 'active',
                            'last_seen': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                        })
                    else:
                        # Dodaj nowe urządzenie do bazy
                        cursor = db.execute(
                            'INSERT INTO devices (name, mac_address, device_type, ip_address, last_seen, status) VALUES (?, ?, ?, ?, ?, ?)',
                            (f'Urządzenie-{mac_address[-5:]}', mac_address, 'unknown', ip_address, 
                             datetime.now().strftime('%Y-%m-%d %H:%M:%S'), 'active')
                        )
                        
                        # Dodaj do listy urządzeń
                        devices.append({
                            'id': cursor.lastrowid,
                            'name': f'Urządzenie-{mac_address[-5:]}',
                            'mac_address': mac_address,
                            'ip_address': ip_address,
                            'device_type': 'unknown',
                            'status': 'active',
                            'last_seen': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                        })
            
            db.commit()
            
            # Zapisz wyniki do pliku
            save_scan_results(devices)
            current_app.logger.info(f"Zakończenie skanowania sieci w tle. Znaleziono {len(devices)} urządzeń")
            
        except Exception as e:
            current_app.logger.error(f"Błąd podczas skanowania sieci: {str(e)}")
    except Exception as e:
        current_app.logger.error(f"Błąd podczas skanowania sieci w tle: {str(e)}")
        import traceback
        current_app.logger.error(traceback.format_exc())

# API - pobieranie jakości połączenia
@network_bp.route('/network/api/network/quality', methods=['GET'])
@login_required
def get_network_quality():
    try:
        # W rzeczywistości tutaj byłby faktyczny kod do pomiaru jakości
        # Możemy spróbować ping do znanych serwerów
        quality_data = {}
        
        # Próba wykonania ping
        try:
            if platform.system() == 'Windows':
                ping_cmd = ['ping', '-n', '4', '8.8.8.8']
            else:
                ping_cmd = ['ping', '-c', '4', '8.8.8.8']
                
            process = subprocess.run(ping_cmd, capture_output=True, text=True, timeout=10)
            output = process.stdout
            
            # Parsowanie wyniku
            if process.returncode == 0:
                # Próba znalezienia średniego czasu ping
                ping_match = re.search(r'Average = (\d+)ms|avg = (\d+\.\d+)\/(\d+\.\d+)\/(\d+\.\d+)', output)
                if ping_match:
                    if ping_match.group(1):  # Format Windows
                        quality_data['ping'] = int(ping_match.group(1))
                    else:  # Format Linux
                        quality_data['ping'] = float(ping_match.group(2))
                
                # Dla pozostałych wartości użyjemy oszacowania
                if 'ping' in quality_data:
                    # Jitter jest zwykle mniejszy niż ping
                    quality_data['jitter'] = round(quality_data['ping'] * 0.3, 1)
                    
                    # Packet loss - sprawdź czy jest informacja w wyjściu
                    loss_match = re.search(r'(\d+)% (packet )?loss', output)
                    if loss_match:
                        quality_data['packet_loss'] = float(loss_match.group(1))
                    else:
                        quality_data['packet_loss'] = 0.0
        except:
            current_app.logger.error("Nie udało się wykonać pinga")
        
        # Jeśli nie udało się zebrać danych, użyj wartości domyślnych
        if not quality_data:
            quality_data = {
                'ping': 0,
                'jitter': 0,
                'packet_loss': 0
            }
        
        return jsonify(quality_data)
    except Exception as e:
        current_app.logger.error(f"Błąd podczas pobierania jakości sieci: {str(e)}")
        return jsonify({'ping': 0, 'jitter': 0, 'packet_loss': 0})

# API - ręczne wywołanie skanowania sieci
@network_bp.route('/network/api/scan', methods=['POST'])
@login_required
def trigger_network_scan():
    """Endpoint API do ręcznego wywołania skanowania sieci"""
    try:
        # Uruchom skanowanie w oddzielnym wątku
        scan_thread = threading.Thread(target=background_scan_network, daemon=True)
        scan_thread.start()
        
        return jsonify({
            'success': True,
            'message': 'Rozpoczęto skanowanie sieci. Wyniki będą dostępne wkrótce.'
        })
    except Exception as e:
        current_app.logger.error(f"Błąd podczas uruchamiania skanowania sieci: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Wystąpił błąd podczas rozpoczynania skanowania sieci.',
            'error': str(e)
        }), 500

# API - pobieranie informacji o postępie i wynikach skanowania
@network_bp.route('/network/api/scan/status', methods=['GET'])
@login_required
def get_scan_status():
    """Endpoint API do pobierania informacji o statusie skanowania sieci"""
    try:
        # Sprawdź, czy istnieją zapisane wyniki
        if os.path.exists(last_scan_file):
            # Pobierz czas ostatniej modyfikacji pliku
            last_scan_time = datetime.fromtimestamp(os.path.getmtime(last_scan_file))
            time_diff = datetime.now() - last_scan_time
            
            # Wczytaj wyniki
            with open(last_scan_file, 'r') as f:
                devices = json.load(f)
            
            return jsonify({
                'success': True,
                'status': 'completed',
                'last_scan': last_scan_time.strftime('%Y-%m-%d %H:%M:%S'),
                'time_ago': f"{time_diff.seconds // 60} minut temu" if time_diff.seconds < 3600 else f"{time_diff.seconds // 3600} godzin temu",
                'device_count': len(devices)
            })
        else:
            return jsonify({
                'success': True,
                'status': 'never_run',
                'message': 'Skanowanie sieci nie zostało jeszcze wykonane.'
            })
    except Exception as e:
        current_app.logger.error(f"Błąd podczas pobierania statusu skanowania: {str(e)}")
        return jsonify({
            'success': False,
            'status': 'error',
            'message': 'Wystąpił błąd podczas pobierania statusu skanowania.',
            'error': str(e)
        }), 500