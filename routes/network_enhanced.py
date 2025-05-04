from flask import Blueprint, request, jsonify, render_template, g, current_app
import socket
import psutil
import subprocess
import re
import requests
import json
import os
from datetime import datetime, timedelta
import random

# Importy funkcji pomocniczych
def get_db():
    from app import get_db as app_get_db
    return app_get_db()

def login_required(f):
    from auth_helpers import login_required as auth_login_required
    return auth_login_required(f)

# Tworzenie blueprintu dla rozszerzonych funkcji sieciowych
network_enhanced_bp = Blueprint('network_enhanced', __name__)

# Ścieżka do pliku z historią prędkości
SPEED_HISTORY_FILE = 'data/speed_history.json'

# Upewnij się, że katalog istnieje
os.makedirs('data', exist_ok=True)

# Funkcja do zapisu historii prędkości
def save_speed_history(download_speed, upload_speed):
    try:
        # Stwórz wpis
        entry = {
            'timestamp': datetime.now().isoformat(),
            'download': download_speed,
            'upload': upload_speed
        }
        
        # Wczytaj istniejącą historię
        history = []
        if os.path.exists(SPEED_HISTORY_FILE):
            with open(SPEED_HISTORY_FILE, 'r') as f:
                try:
                    history = json.load(f)
                except json.JSONDecodeError:
                    current_app.logger.error('Nieprawidłowy format pliku historii')
        
        # Dodaj nowy wpis
        history.append(entry)
        
        # Ogranicz historię do ostatnich 200 wpisów
        if len(history) > 200:
            history = history[-200:]
        
        # Zapisz historię
        with open(SPEED_HISTORY_FILE, 'w') as f:
            json.dump(history, f)
            
    except Exception as e:
        current_app.logger.error(f'Błąd podczas zapisywania historii prędkości: {str(e)}')

# Strona szczegółów sieci
@network_enhanced_bp.route('/network/enhanced')
@login_required
def network_enhanced():
    # Pobieranie preferencji użytkownika
    db = get_db()
    settings = db.execute('SELECT theme FROM user_settings WHERE user_id = ?',
                          (g.user_id,)).fetchone()
    
    theme = settings['theme'] if settings else 'light'
    
    return render_template('network_enhanced.html', 
                          app_name=current_app.config['APP_NAME'],
                          username=g.username,
                          role=g.role,
                          theme=theme)

# API - pobieranie historii prędkości
@network_enhanced_bp.route('/network/api/history', methods=['GET'])
@login_required
def get_speed_history():
    try:
        # Pobierz parametry zapytania
        hours = request.args.get('hours', default=24, type=int)
        
        # Ogranicz maksymalną liczbę godzin
        if hours > 168:  # maksymalnie tydzień
            hours = 168
        
        # Oblicz datę graniczną
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        # Wczytaj historię
        history = []
        if os.path.exists(SPEED_HISTORY_FILE):
            with open(SPEED_HISTORY_FILE, 'r') as f:
                try:
                    all_history = json.load(f)
                    
                    # Filtruj według czasu
                    history = [entry for entry in all_history 
                              if datetime.fromisoformat(entry['timestamp']) >= cutoff_time]
                except Exception as e:
                    current_app.logger.error(f'Błąd podczas odczytu historii: {str(e)}')
                    # Wygeneruj przykładowe dane
                    history = generate_sample_history(hours)
        else:
            # Brak pliku historii, wygeneruj przykładowe dane
            history = generate_sample_history(hours)
        
        return jsonify(history)
    except Exception as e:
        current_app.logger.error(f'Błąd podczas pobierania historii prędkości: {str(e)}')
        return jsonify({'error': 'Wystąpił błąd podczas pobierania historii'}), 500

# Generowanie przykładowej historii
def generate_sample_history(hours):
    history = []
    now = datetime.now()
    
    # Bazowe wartości
    base_download = 60
    base_upload = 25
    
    # Generuj dane dla każdej godziny
    for i in range(hours):
        timestamp = now - timedelta(hours=hours-i-1)
        
        # Dodaj losowe wahania do wartości bazowych
        download = max(10, base_download + random.uniform(-15, 15))
        upload = max(5, base_upload + random.uniform(-8, 8))
        
        # Symuluj spadki w godzinach wieczornych
        hour = timestamp.hour
        if 19 <= hour <= 23:
            download *= 0.8
            upload *= 0.9
        
        history.append({
            'timestamp': timestamp.isoformat(),
            'download': round(download, 1),
            'upload': round(upload, 1)
        })
    
    return history

# API - informacje o sieci WiFi
@network_enhanced_bp.route('/network/api/wifi', methods=['GET'])
@login_required
def get_wifi_info():
    try:
        # W rzeczywistej aplikacji dane byłyby pobierane z systemu
        # Na potrzeby demonstracji zwracamy przykładowe dane
        
        # Losowe wahania siły sygnału
        signal_strength = random.randint(-75, -50)
        
        wifi_info = {
            'ssid': 'HomeHub_WiFi',
            'channel': 6,
            'frequency': '2.4 GHz',
            'signal_strength': signal_strength,
            'noise_level': -92,
            'security': 'WPA2-PSK',
            'connected_clients': random.randint(3, 8),
            'max_rate': '300 Mbps',
            'encryption': 'AES',
            'mac_address': '00:11:22:33:44:55'
        }
        
        return jsonify(wifi_info)
    except Exception as e:
        current_app.logger.error(f'Błąd podczas pobierania informacji o WiFi: {str(e)}')
        return jsonify({'error': 'Wystąpił błąd podczas pobierania informacji o WiFi'}), 500

# API - Test prędkości
@network_enhanced_bp.route('/network/api/speed-test', methods=['POST'])
@login_required
def run_speed_test():
    try:
        # W rzeczywistej aplikacji wykonywalibyśmy faktyczny test prędkości
        # Na potrzeby demonstracji symulujemy test z losowymi wynikami
        
        # Symulujemy czas trwania testu
        import time
        time.sleep(2)
        
        # Generowanie realistycznych wyników
        download_speed = round(random.uniform(40, 120), 1)
        upload_speed = round(random.uniform(10, 30), 1)
        ping = round(random.uniform(10, 50), 1)
        
        # Zapisz wyniki do historii
        save_speed_history(download_speed, upload_speed)
        
        results = {
            'download': download_speed,
            'upload': upload_speed,
            'ping': ping,
            'jitter': round(random.uniform(1, 8), 1),
            'timestamp': datetime.now().isoformat(),
            'server': 'Nearest Test Server',
            'isp': 'Your ISP'
        }
        
        return jsonify(results)
    except Exception as e:
        current_app.logger.error(f'Błąd podczas testu prędkości: {str(e)}')
        return jsonify({'error': 'Wystąpił błąd podczas testu prędkości'}), 500

# API - Edycja urządzenia
@network_enhanced_bp.route('/network/api/devices/<mac_address>', methods=['PUT'])
@login_required
def update_device(mac_address):
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Brak danych urządzenia'}), 400
        
        db = get_db()
        
        # Sprawdź czy urządzenie istnieje
        device = db.execute('SELECT * FROM devices WHERE mac_address = ?', 
                          (mac_address,)).fetchone()
        
        if device is None:
            # Dodaj nowe urządzenie
            db.execute(
                'INSERT INTO devices (mac_address, name, device_type, owner_id, last_seen, status) VALUES (?, ?, ?, ?, ?, ?)',
                (mac_address, data.get('name', f'Urządzenie-{mac_address[-5:]}'), 
                 data.get('device_type', 'unknown'), g.user_id, 
                 datetime.now().strftime('%Y-%m-%d %H:%M:%S'), 'active')
            )
        else:
            # Aktualizuj istniejące urządzenie
            update_fields = []
            update_values = []
            
            if 'name' in data:
                update_fields.append('name = ?')
                update_values.append(data['name'])
            
            if 'device_type' in data:
                update_fields.append('device_type = ?')
                update_values.append(data['device_type'])
            
            if 'favorite' in data:
                # Tutaj możemy dodać pole 'favorite' do istniejącej tabeli devices
                # lub stworzyć nową tabelę dla ulubionych urządzeń
                update_fields.append('favorite = ?')
                update_values.append(1 if data['favorite'] else 0)
            
            if update_fields:
                update_values.append(mac_address)
                query = f"UPDATE devices SET {', '.join(update_fields)} WHERE mac_address = ?"
                db.execute(query, update_values)
        
        db.commit()
        
        return jsonify({'success': True, 'message': 'Urządzenie zaktualizowane pomyślnie'})
    except Exception as e:
        current_app.logger.error(f'Błąd podczas aktualizacji urządzenia: {str(e)}')
        return jsonify({'error': 'Wystąpił błąd podczas aktualizacji urządzenia'}), 500

# API - Skanowanie sieci
@network_enhanced_bp.route('/network/api/scan', methods=['POST'])
@login_required
def scan_network():
    try:
        # W rzeczywistej aplikacji wykonalibyśmy skanowanie sieci
        # Na potrzeby demonstracji, symulujemy czas skanowania i zwracamy wyniki
        
        # Symulujemy czas skanowania
        import time
        time.sleep(2)
        
        # Pobierz aktualne urządzenia z bazy
        db = get_db()
        existing_devices = db.execute('SELECT * FROM devices').fetchall()
        existing_macs = [device['mac_address'] for device in existing_devices]
        
        # Symulujemy znalezienie nowych urządzeń
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # Liczba nowych urządzeń do dodania
        new_device_count = random.randint(0, 3)
        added_devices = []
        
        for i in range(new_device_count):
            # Generuj losowy adres MAC
            mac = ':'.join(['%02x' % random.randint(0, 255) for _ in range(6)]).upper()
            
            # Sprawdź czy już istnieje
            if mac in existing_macs:
                continue
                
            # Losuj typ urządzenia
            device_types = ['computer', 'phone', 'tablet', 'tv', 'iot']
            device_type = random.choice(device_types)
            
            # Dodaj do bazy danych
            db.execute(
                'INSERT INTO devices (mac_address, name, device_type, ip_address, last_seen, status) VALUES (?, ?, ?, ?, ?, ?)',
                (mac, f'Nowe-Urządzenie-{i+1}', device_type, f'192.168.1.{random.randint(100, 200)}', 
                 now, 'active')
            )
            
            added_devices.append({
                'mac_address': mac,
                'name': f'Nowe-Urządzenie-{i+1}',
                'device_type': device_type
            })
        
        # Zaktualizuj istniejące urządzenia
        for device in existing_devices:
            # Z pewnym prawdopodobieństwem zmieniamy status urządzenia
            if random.random() < 0.2:
                new_status = 'inactive' if device['status'] == 'active' else 'active'
                db.execute(
                    'UPDATE devices SET status = ?, last_seen = ? WHERE mac_address = ?',
                    (new_status, now, device['mac_address'])
                )
        
        db.commit()
        
        return jsonify({
            'success': True, 
            'devices_found': len(existing_devices) + len(added_devices),
            'new_devices': len(added_devices),
            'new_device_list': added_devices
        })
    except Exception as e:
        current_app.logger.error(f'Błąd podczas skanowania sieci: {str(e)}')
        return jsonify({'error': 'Wystąpił błąd podczas skanowania sieci'}), 500