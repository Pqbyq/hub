"""
network_discovery.py - Zaawansowane metody wykrywania urządzeń w sieci
Zawiera funkcje wykorzystujące UPnP, SNMP oraz inne metody do wykrywania urządzeń.
"""

import socket
import struct
import subprocess
import re
import logging
import platform
import ipaddress
import threading
import time
import xml.etree.ElementTree as ET
from urllib.request import urlopen
from urllib.error import URLError
import http.client
from datetime import datetime

# Konfiguracja logowania
logger = logging.getLogger('network_discovery')
logger.setLevel(logging.DEBUG)

# Handler do zapisu logów do pliku
file_handler = logging.FileHandler('logs/network_discovery.log')
file_handler.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

# Handler do wyświetlania logów w konsoli
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

def get_local_ip():
    """Pobiera lokalny adres IP maszyny"""
    try:
        # Próba utworzenia połączenia, aby sprawdzić lokalny adres IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception as e:
        logger.error(f"Błąd podczas pobierania lokalnego IP: {str(e)}")
        # Alternatywna metoda
        try:
            hostname = socket.gethostname()
            local_ip = socket.gethostbyname(hostname)
            return local_ip
        except Exception as e:
            logger.error(f"Alternatywna metoda pobierania IP również nie powiodła się: {str(e)}")
            return "127.0.0.1"

def get_network_prefix():
    """Określa prefiks sieci na podstawie lokalnego IP"""
    local_ip = get_local_ip()
    if local_ip == "127.0.0.1":
        return "192.168.1.0/24"  # Domyślny prefiks, jeśli nie można określić
    
    # Próba określenia prefiksu sieci
    try:
        # Zakładając maskę /24
        ip_parts = local_ip.split('.')
        network_prefix = f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}.0/24"
        return network_prefix
    except Exception as e:
        logger.error(f"Błąd podczas określania prefiksu sieci: {str(e)}")
        return "192.168.1.0/24"  # Domyślny prefiks w przypadku błędu

def discover_devices_arp():
    """Wykrywa urządzenia za pomocą tablicy ARP"""
    logger.info("Rozpoczęcie wykrywania urządzeń przez ARP")
    devices = []
    
    try:
        os_name = platform.system()
        arp_output = ""
        
        if os_name == 'Windows':
            # Windows - użyj arp -a
            logger.debug("Wykrywanie ARP na systemie Windows")
            process = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=5)
            if process.returncode == 0:
                arp_output = process.stdout
                logger.debug(f"Otrzymano dane ARP: {len(arp_output)} bajtów")
            else:
                logger.error(f"Błąd wykonania arp -a: {process.stderr}")
        else:
            # Linux/macOS - próba kilku metod
            logger.debug("Wykrywanie ARP na systemie Linux/macOS")
            try:
                process = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=5)
                if process.returncode == 0:
                    arp_output = process.stdout
                    logger.debug(f"Otrzymano dane ARP: {len(arp_output)} bajtów")
                else:
                    # Spróbuj alternatywnej metody
                    logger.warning("arp -a nie powiodło się, próba ip neighbor")
                    process = subprocess.run(["ip", "neighbor"], capture_output=True, text=True, timeout=5)
                    if process.returncode == 0:
                        arp_output = process.stdout
                        logger.debug(f"Otrzymano dane ip neighbor: {len(arp_output)} bajtów")
                    else:
                        logger.error("Wszystkie metody ARP zawiodły")
            except Exception as e:
                logger.error(f"Wyjątek podczas wykonywania komend ARP: {str(e)}")
        
        # Parsowanie wyników
        for line in arp_output.split('\n'):
            if not line.strip():
                continue
                
            logger.debug(f"Analiza linii ARP: {line}")
            # Próba wyodrębnienia adresu IP i MAC
            ip_match = re.search(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})', line)
            mac_match = re.search(r'([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})', line)
            
            if ip_match and mac_match:
                ip_address = ip_match.group(1)
                mac_address = mac_match.group(1).upper()
                
                # Podstawowe informacje o urządzeniu
                device = {
                    'ip_address': ip_address,
                    'mac_address': mac_address,
                    'source': 'arp',
                    'last_seen': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    'status': 'active'
                }
                
                devices.append(device)
                logger.info(f"Wykryto urządzenie przez ARP: IP={ip_address}, MAC={mac_address}")
    
    except Exception as e:
        logger.error(f"Błąd podczas wykrywania urządzeń przez ARP: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
    
    logger.info(f"Zakończono wykrywanie przez ARP. Znaleziono {len(devices)} urządzeń.")
    return devices

def discover_devices_ping_sweep(network_prefix=None):
    """Wykrywa urządzenia przez skanowanie ping w danym zakresie sieci"""
    if network_prefix is None:
        network_prefix = get_network_prefix()
    
    logger.info(f"Rozpoczęcie wykrywania urządzeń przez ping sweep dla sieci {network_prefix}")
    devices = []
    
    try:
        network = ipaddress.IPv4Network(network_prefix)
        active_threads = []
        result_lock = threading.Lock()
        
        def ping_host(ip):
            try:
                ip_str = str(ip)
                os_name = platform.system()
                
                if os_name == "Windows":
                    cmd = ["ping", "-n", "1", "-w", "500", ip_str]
                else:  # Linux/macOS
                    cmd = ["ping", "-c", "1", "-W", "1", ip_str]
                
                logger.debug(f"Wykonywanie ping dla {ip_str}")
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=2)
                
                if result.returncode == 0:
                    logger.debug(f"Ping udany dla {ip_str}")
                    # Próba pobrania adresu MAC dla tego IP
                    mac_address = get_mac_from_ip(ip_str)
                    
                    if mac_address:
                        with result_lock:
                            device = {
                                'ip_address': ip_str,
                                'mac_address': mac_address,
                                'source': 'ping',
                                'last_seen': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                'status': 'active'
                            }
                            devices.append(device)
                            logger.info(f"Wykryto urządzenie przez ping: IP={ip_str}, MAC={mac_address}")
            except Exception as e:
                logger.debug(f"Błąd podczas ping dla {ip}: {str(e)}")
        
        # Ograniczenie liczby hostów do skanowania (dla bezpieczeństwa i wydajności)
        max_hosts = 254  # Maksymalna liczba hostów w sieci /24
        hosts_to_scan = list(network.hosts())[:max_hosts]
        
        # Uruchomienie wątków dla ping sweep
        for ip in hosts_to_scan:
            thread = threading.Thread(target=ping_host, args=(ip,))
            thread.daemon = True
            active_threads.append(thread)
            thread.start()
            
            # Limit aktywnych wątków
            if len(active_threads) >= 10:
                for t in active_threads:
                    t.join(timeout=0.1)
                active_threads = [t for t in active_threads if t.is_alive()]
        
        # Czekanie na zakończenie wszystkich wątków
        for thread in active_threads:
            thread.join(timeout=1.0)
    
    except Exception as e:
        logger.error(f"Błąd podczas ping sweep: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
    
    logger.info(f"Zakończono ping sweep. Znaleziono {len(devices)} urządzeń.")
    return devices

def get_mac_from_ip(ip_address):
    """Pobiera adres MAC dla danego adresu IP"""
    try:
        os_name = platform.system()
        
        if os_name == "Windows":
            # Windows - użyj arp -a
            cmd = ["arp", "-a", ip_address]
        else:
            # Linux/macOS
            cmd = ["arp", "-n", ip_address]
        
        output = subprocess.check_output(cmd, universal_newlines=True, timeout=2)
        
        # Szukanie adresu MAC w wyjściu
        mac_match = re.search(r'([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})', output)
        if mac_match:
            return mac_match.group(1).upper()
        
        return None
    except Exception as e:
        logger.debug(f"Błąd podczas pobierania MAC dla IP {ip_address}: {str(e)}")
        return None

def discover_devices_upnp():
    """Wykrywa urządzenia za pomocą protokołu UPnP"""
    logger.info("Rozpoczęcie wykrywania urządzeń przez UPnP")
    devices = []
    
    try:
        # Przygotowanie zapytania SSDP discovery
        ssdp_request = (
            'M-SEARCH * HTTP/1.1\r\n' +
            'HOST: 239.255.255.250:1900\r\n' +
            'MAN: "ssdp:discover"\r\n' +
            'MX: 3\r\n' +
            'ST: ssdp:all\r\n' +
            '\r\n'
        )
        
        # Utworzenie gniazda UDP
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.settimeout(5)
        
        # Konfiguracja gniazda
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        
        # Wysłanie zapytania discovery
        logger.debug("Wysyłanie zapytania UPnP discovery")
        sock.sendto(ssdp_request.encode(), ('239.255.255.250', 1900))
        
        # Słuchanie odpowiedzi
        start_time = time.time()
        timeout = 5  # Czas słuchania odpowiedzi w sekundach
        discovered_locations = set()
        
        while time.time() - start_time < timeout:
            try:
                data, addr = sock.recvfrom(1024)
                response = data.decode('utf-8')
                logger.debug(f"Otrzymano odpowiedź UPnP z {addr}")
                
                # Wyodrębnienie URL do opisu urządzenia
                location_match = re.search(r'LOCATION: (http://.*?)\r\n', response, re.IGNORECASE)
                if location_match:
                    location = location_match.group(1)
                    if location not in discovered_locations:
                        discovered_locations.add(location)
                        logger.debug(f"Znaleziono nową lokalizację UPnP: {location}")
                        
                        # Pobieranie szczegółów urządzenia
                        device_info = get_upnp_device_info(location, addr[0])
                        if device_info:
                            devices.append(device_info)
            except socket.timeout:
                continue
            except Exception as e:
                logger.debug(f"Błąd podczas przetwarzania odpowiedzi UPnP: {str(e)}")
    
    except Exception as e:
        logger.error(f"Błąd podczas wykrywania urządzeń przez UPnP: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
    
    logger.info(f"Zakończono wykrywanie przez UPnP. Znaleziono {len(devices)} urządzeń.")
    return devices

def get_upnp_device_info(location, ip_address):
    """Pobiera informacje o urządzeniu UPnP z podanego URL"""
    try:
        logger.debug(f"Pobieranie informacji o urządzeniu UPnP z {location}")
        
        response = urlopen(location, timeout=3)
        xml_content = response.read().decode('utf-8')
        
        # Parsowanie XML
        root = ET.fromstring(xml_content)
        
        # Szukanie informacji o urządzeniu
        device_element = root.find('.//device')
        if device_element is not None:
            # Pobranie nazwy urządzenia
            friendly_name = device_element.find('friendlyName')
            model_name = device_element.find('modelName')
            manufacturer = device_element.find('manufacturer')
            device_type = device_element.find('deviceType')
            
            name = friendly_name.text if friendly_name is not None else "Urządzenie UPnP"
            model = model_name.text if model_name is not None else "Nieznany model"
            brand = manufacturer.text if manufacturer is not None else "Nieznany producent"
            type_str = device_type.text if device_type is not None else "upnp:unknown"
            
            # Określenie typu urządzenia
            device_category = "unknown"
            if "MediaRenderer" in type_str or "MediaServer" in type_str:
                device_category = "media"
            elif "InternetGatewayDevice" in type_str:
                device_category = "router"
            elif "Basic" in type_str and ("Device" in type_str or "device" in type_str):
                device_category = "iot"
            
            # Próba pobrania adresu MAC
            mac_address = get_mac_from_ip(ip_address)
            
            # Jeśli nie znaleziono adresu MAC, tworzymy pseudo-MAC na podstawie IP
            if not mac_address:
                ip_parts = ip_address.split('.')
                pseudo_mac = f"00:00:{ip_parts[0]:02X}:{ip_parts[1]:02X}:{ip_parts[2]:02X}:{ip_parts[3]:02X}"
                mac_address = pseudo_mac
            
            device = {
                'ip_address': ip_address,
                'mac_address': mac_address,
                'name': name,
                'model': model,
                'manufacturer': brand,
                'device_type': device_category,
                'source': 'upnp',
                'last_seen': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'status': 'active',
                'additional_info': {
                    'upnp_type': type_str,
                    'location': location
                }
            }
            
            logger.info(f"Wykryto urządzenie przez UPnP: {name} ({ip_address})")
            return device
    
    except Exception as e:
        logger.debug(f"Błąd podczas pobierania informacji o urządzeniu UPnP: {str(e)}")
    
    return None

def discover_devices_mdns():
    """Wykrywa urządzenia za pomocą protokołu mDNS (Multicast DNS)"""
    logger.info("Rozpoczęcie wykrywania urządzeń przez mDNS")
    devices = []
    
    try:
        # Sprawdzenie, czy system ma zainstalowane narzędzia mDNS
        if shutil.which('avahi-browse') or shutil.which('dns-sd'):
            # Użyj dostępnego narzędzia
            if shutil.which('avahi-browse'):
                # Linux z Avahi
                logger.debug("Użycie avahi-browse do wykrywania mDNS")
                cmd = ["avahi-browse", "-alrp"]
            else:
                # macOS lub inne systemy z dns-sd
                logger.debug("Użycie dns-sd do wykrywania mDNS")
                cmd = ["dns-sd", "-B", "_services._dns-sd._udp", "local."]
            
            process = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            output = process.stdout
            
            # Parsowanie wyników
            for line in output.split('\n'):
                # Szukanie adresu IP i nazwy hosta
                ip_match = re.search(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})', line)
                name_match = re.search(r'name\[([^\]]+)\]', line)
                
                if ip_match:
                    ip_address = ip_match.group(1)
                    name = name_match.group(1) if name_match else f"mDNS Device ({ip_address})"
                    
                    # Pobierz adres MAC dla tego IP
                    mac_address = get_mac_from_ip(ip_address)
                    
                    # Jeśli nie znaleziono adresu MAC, kontynuuj
                    if not mac_address:
                        continue
                    
                    # Określenie typu urządzenia na podstawie usługi
                    device_type = "unknown"
                    if "_airplay" in line.lower() or "_raop" in line.lower():
                        device_type = "media"
                    elif "_printer" in line.lower():
                        device_type = "printer"
                    elif "_ssh" in line.lower() or "_workstation" in line.lower():
                        device_type = "computer"
                    elif "_googlecast" in line.lower():
                        device_type = "media"
                    
                    device = {
                        'ip_address': ip_address,
                        'mac_address': mac_address,
                        'name': name,
                        'device_type': device_type,
                        'source': 'mdns',
                        'last_seen': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        'status': 'active'
                    }
                    
                    devices.append(device)
                    logger.info(f"Wykryto urządzenie przez mDNS: {name} ({ip_address})")
        else:
            logger.warning("Brak narzędzi do wykrywania mDNS (avahi-browse lub dns-sd)")
    
    except Exception as e:
        logger.error(f"Błąd podczas wykrywania urządzeń przez mDNS: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
    
    logger.info(f"Zakończono wykrywanie przez mDNS. Znaleziono {len(devices)} urządzeń.")
    return devices

def merge_device_info(devices_list):
    """Łączy informacje o urządzeniach z różnych źródeł"""
    logger.info("Łączenie informacji o urządzeniach z różnych źródeł")
    merged_devices = {}
    
    for device in devices_list:
        mac = device.get('mac_address')
        if not mac:
            continue
        
        # Jeśli urządzenie już istnieje, aktualizuj informacje
        if mac in merged_devices:
            # Zachowaj najbardziej szczegółowe informacje
            if not merged_devices[mac].get('name') or merged_devices[mac].get('name').startswith('Urządzenie-'):
                merged_devices[mac]['name'] = device.get('name')
            
            if device.get('device_type') != 'unknown':
                merged_devices[mac]['device_type'] = device.get('device_type')
            
            if device.get('manufacturer'):
                merged_devices[mac]['manufacturer'] = device.get('manufacturer')
            
            if device.get('model'):
                merged_devices[mac]['model'] = device.get('model')
            
            # Dodaj informacje o źródle wykrycia
            sources = merged_devices[mac].get('sources', [])
            if device.get('source') not in sources:
                sources.append(device.get('source'))
                merged_devices[mac]['sources'] = sources
            
            # Aktualizuj czas ostatniego wykrycia
            merged_devices[mac]['last_seen'] = device.get('last_seen')
        else:
            # Dodaj nowe urządzenie
            merged_devices[mac] = device.copy()
            merged_devices[mac]['sources'] = [device.get('source')]
    
    # Konwersja słownika z powrotem na listę
    result = list(merged_devices.values())
    logger.info(f"Po połączeniu informacji mamy {len(result)} unikalnych urządzeń")
    
    return result

def scan_network(include_upnp=True, include_mdns=False, include_ping=True):
    """Główna funkcja skanowania sieci, wykorzystująca wszystkie dostępne metody"""
    logger.info("Rozpoczęcie pełnego skanowania sieci")
    all_devices = []
    
    # Podstawowe skanowanie ARP
    arp_devices = discover_devices_arp()
    all_devices.extend(arp_devices)
    
    # Skanowanie UPnP
    if include_upnp:
        upnp_devices = discover_devices_upnp()
        all_devices.extend(upnp_devices)
    
    # Skanowanie mDNS
    if include_mdns:
        try:
            import shutil
            mdns_devices = discover_devices_mdns()
            all_devices.extend(mdns_devices)
        except ImportError:
            logger.warning("Nie można importować modułu shutil, skanowanie mDNS pominięte")
    
    # Ping sweep
    if include_ping:
        ping_devices = discover_devices_ping_sweep()
        all_devices.extend(ping_devices)
    
    # Łączenie informacji o urządzeniach
    merged_devices = merge_device_info(all_devices)
    
    logger.info(f"Zakończono pełne skanowanie sieci. Znaleziono {len(merged_devices)} unikalnych urządzeń")
    return merged_devices

if __name__ == "__main__":
    # Test funkcji skanowania, gdy skrypt jest uruchomiony bezpośrednio
    print("Rozpoczęcie testów skanowania sieci...")
    
    # Pełne skanowanie
    devices = scan_network()
    
    print(f"Wykryto {len(devices)} urządzeń:")
    for device in devices:
        print(f"- {device.get('name', 'Nieznane urządzenie')}: IP={device.get('ip_address')}, MAC={device.get('mac_address')}")
        if 'sources' in device:
            print(f"  Źródła: {', '.join(device['sources'])}")
        print()