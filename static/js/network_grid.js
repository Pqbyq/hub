/**
 * network_grid.js - Skrypt do obsługi ulepszonego układu siatki dla szczegółów sieci
 */

document.addEventListener('DOMContentLoaded', function() {
    // Inicjalizacja strony
    initGridLayout();
    
    // Aktualizacja danych sieciowych co 30 sekund
    setInterval(updateNetworkData, 30000);
    
    // Przyciski odświeżania dla każdego widgeta
    document.getElementById('refresh-connection').addEventListener('click', function() {
        updateNetworkStatus();
        animateRefreshButton(this);
    });
    
    document.getElementById('refresh-speed').addEventListener('click', function() {
        updateSpeedData();
        animateRefreshButton(this);
    });
    
    // Przyciski akcji
    document.getElementById('test-speed-btn').addEventListener('click', showSpeedTestModal);
    document.getElementById('scan-network-btn').addEventListener('click', scanNetwork);
    
    // Obsługa modalu testu prędkości
    initSpeedTestModal();
    
    // Inicjalizacja filtrów dla urządzeń
    initDeviceFilters();
    
    // Wyszukiwanie urządzeń
    document.getElementById('device-search').addEventListener('input', filterDevices);
});

/**
 * Inicjalizacja układu siatki
 */
function initGridLayout() {
    console.log('Grid layout initialized');
    
    // Inicjalizacja danych
    updateNetworkData();
    
    // Rysowanie wykresu historii prędkości
    drawSpeedHistoryChart();
}

/**
 * Aktualizacja wszystkich danych sieciowych
 */
function updateNetworkData() {
    updateNetworkStatus();
    updateSpeedData();
    updateDevices();
    updateConnectionQuality();
    updateWifiInfo();
}

/**
 * Aktualizacja statusu sieci
 */
function updateNetworkStatus() {
    showWidgetLoading('connection-widget');
    
    fetch('/network/api/network')
        .then(response => response.json())
        .then(data => {
            document.getElementById('connection-status').textContent = data.status || 'Nieznany';
            document.getElementById('uptime').textContent = data.uptime || 'Nieznany';
            document.getElementById('external-ip').textContent = data.external_ip || 'Nieznany';
            document.getElementById('dns-server').textContent = data.dns_server || 'Nieznany';
            
            // Kolorowanie statusu
            const statusElem = document.getElementById('connection-status');
            if (data.status === 'ONLINE') {
                statusElem.style.color = 'var(--success-color)';
            } else {
                statusElem.style.color = 'var(--error-color)';
            }
            
            hideWidgetLoading('connection-widget');
        })
        .catch(error => {
            console.error('Error fetching network status:', error);
            hideWidgetLoading('connection-widget');
        });
}

/**
 * Aktualizacja danych o prędkości
 */
function updateSpeedData() {
    showWidgetLoading('speed-widget');
    
    fetch('/network/api/network')
        .then(response => response.json())
        .then(data => {
            document.getElementById('download-speed').textContent = data.download_speed || '0';
            document.getElementById('upload-speed').textContent = data.upload_speed || '0';
            
            hideWidgetLoading('speed-widget');
            
            // Aktualizacja wykresu historii
            updateSpeedHistoryChart(data.download_speed, data.upload_speed);
        })
        .catch(error => {
            console.error('Error fetching speed data:', error);
            hideWidgetLoading('speed-widget');
        });
}

/**
 * Aktualizacja jakości połączenia
 */
function updateConnectionQuality() {
    showWidgetLoading('quality-widget');
    
    fetch('/network/api/network/quality')
        .then(response => response.json())
        .then(data => {
            // Aktualizacja wartości
            document.getElementById('ping-value').textContent = `${data.ping} ms`;
            document.getElementById('jitter-value').textContent = `${data.jitter} ms`;
            document.getElementById('packet-loss').textContent = `${data.packet_loss}%`;
            
            // Kolorowanie wartości
            colorQualityValue('ping-value', data.ping, 50, 100);
            colorQualityValue('jitter-value', data.jitter, 10, 20);
            colorQualityValue('packet-loss', parseFloat(data.packet_loss), 1, 2);
            
            // Aktualizacja pasków mierników
            updateQualityMeter('ping-meter', data.ping, 150);
            updateQualityMeter('jitter-meter', data.jitter, 30);
            updateQualityMeter('packet-loss-meter', data.packet_loss, 5);
            
            hideWidgetLoading('quality-widget');
        })
        .catch(error => {
            console.error('Error fetching connection quality:', error);
            hideWidgetLoading('quality-widget');
        });
}

/**
 * Aktualizacja listy urządzeń
 */
function updateDevices() {
    showWidgetLoading('devices-widget');
    
    fetch('/network/api/devices')
        .then(response => response.json())
        .then(devices => {
            const tbody = document.querySelector('#devices-table tbody');
            tbody.innerHTML = '';
            
            // Aktualizacja licznika urządzeń
            document.getElementById('device-count').textContent = `Znaleziono ${devices.length} urządzeń`;
            
            if (devices.length === 0) {
                // Pokaż informację o braku urządzeń
                const row = document.createElement('tr');
                const cell = document.createElement('td');
                cell.colSpan = 4;
                cell.textContent = 'Nie znaleziono urządzeń w sieci';
                cell.style.textAlign = 'center';
                cell.style.padding = '2rem';
                cell.style.color = 'var(--text-light)';
                row.appendChild(cell);
                tbody.appendChild(row);
            } else {
                // Wyświetl urządzenia
                devices.forEach((device, index) => {
                    const row = document.createElement('tr');
                    row.dataset.mac = device.mac_address;
                    row.dataset.status = device.status || 'unknown';
                    row.dataset.favorite = device.favorite ? 'true' : 'false';
                    
                    // Wybór ikony na podstawie typu urządzenia
                    const deviceIcon = getDeviceIcon(device.device_type || 'unknown');
                    
                    // Nazwa urządzenia
                    const nameCell = document.createElement('td');
                    nameCell.innerHTML = `<div class="device-name">
                        <span class="device-icon">${deviceIcon}</span>
                        ${device.name || `Urządzenie-${index + 1}`}
                    </div>`;
                    
                    // Adres IP
                    const ipCell = document.createElement('td');
                    ipCell.textContent = device.ip_address || 'Nieznany';
                    
                    // Adres MAC
                    const macCell = document.createElement('td');
                    macCell.textContent = device.mac_address || 'Nieznany';
                    
                    // Status
                    const statusCell = document.createElement('td');
                    statusCell.textContent = device.status === 'active' ? 'Aktywne' : 'Nieaktywne';
                    statusCell.style.color = device.status === 'active' ? 'var(--success-color)' : 'var(--text-light)';
                    
                    // Dodanie komórek do wiersza
                    row.appendChild(nameCell);
                    row.appendChild(ipCell);
                    row.appendChild(macCell);
                    row.appendChild(statusCell);
                    
                    // Dodanie wiersza do tabeli
                    tbody.appendChild(row);
                });
            }
            
            hideWidgetLoading('devices-widget');
        })
        .catch(error => {
            console.error('Error fetching devices:', error);
            
            // Obsługa błędu
            const tbody = document.querySelector('#devices-table tbody');
            tbody.innerHTML = '';
            
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 4;
            cell.textContent = 'Wystąpił błąd podczas pobierania urządzeń';
            cell.style.textAlign = 'center';
            cell.style.padding = '2rem';
            cell.style.color = 'var(--error-color)';
            row.appendChild(cell);
            tbody.appendChild(row);
            
            document.getElementById('device-count').textContent = 'Błąd pobierania urządzeń';
            
            hideWidgetLoading('devices-widget');
        });
}

/**
 * Określanie ikony urządzenia na podstawie jego typu
 */
function getDeviceIcon(deviceType) {
    switch(deviceType.toLowerCase()) {
        case 'computer':
        case 'pc':
        case 'laptop':
            return '💻';
        case 'phone':
        case 'smartphone':
            return '📱';
        case 'tablet':
            return '📱';
        case 'tv':
        case 'television':
        case 'smart-tv':
            return '📺';
        case 'iot':
        case 'smarthome':
            return '🏠';
        default:
            return '📟';
    }
}

/**
 * Inicjalizacja filtrów urządzeń
 */
function initDeviceFilters() {
    const filterButtons = document.querySelectorAll('.devices-filters .btn');
    
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Usuń aktywną klasę ze wszystkich przycisków
            filterButtons.forEach(btn => btn.classList.remove('active'));
            
            // Dodaj aktywną klasę do klikniętego przycisku
            this.classList.add('active');
            
            // Filtruj urządzenia
            const filterType = this.classList.contains('filter-active') ? 'active' : 
                              this.classList.contains('filter-favorites') ? 'favorites' : 'all';
            
            filterDevicesByType(filterType);
        });
    });
}

/**
 * Filtrowanie urządzeń według typu
 */
function filterDevicesByType(filterType) {
    const rows = document.querySelectorAll('#devices-table tbody tr');
    
    rows.forEach(row => {
        // Pomiń wiersze z komunikatami (brak urządzeń, błędy)
        if (!row.dataset.mac) return;
        
        if (filterType === 'all') {
            row.style.display = '';
        } else if (filterType === 'active') {
            row.style.display = row.dataset.status === 'active' ? '' : 'none';
        } else if (filterType === 'favorites') {
            row.style.display = row.dataset.favorite === 'true' ? '' : 'none';
        }
    });
}

/**
 * Filtrowanie urządzeń według wyszukiwania
 */
function filterDevices() {
    const searchText = document.getElementById('device-search').value.toLowerCase();
    const rows = document.querySelectorAll('#devices-table tbody tr');
    
    rows.forEach(row => {
        // Pomiń wiersze z komunikatami (brak urządzeń, błędy)
        if (!row.dataset.mac) return;
        
        const deviceName = row.querySelector('.device-name')?.textContent.toLowerCase() || '';
        const ipAddress = row.cells[1]?.textContent.toLowerCase() || '';
        const macAddress = row.cells[2]?.textContent.toLowerCase() || '';
        
        if (deviceName.includes(searchText) || 
            ipAddress.includes(searchText) || 
            macAddress.includes(searchText)) {
            // Sprawdź czy nie jest ukryte przez filtr
            const activeFilter = document.querySelector('.devices-filters .active');
            const filterType = activeFilter.classList.contains('filter-active') ? 'active' : 
                              activeFilter.classList.contains('filter-favorites') ? 'favorites' : 'all';
            
            if (filterType === 'all' || 
                (filterType === 'active' && row.dataset.status === 'active') ||
                (filterType === 'favorites' && row.dataset.favorite === 'true')) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        } else {
            row.style.display = 'none';
        }
    });
}

/**
 * Aktualizacja informacji o WiFi
 */
function updateWifiInfo() {
    // W rzeczywistej aplikacji, dane byłyby pobierane z API
    // Na potrzeby demonstracji, używamy przykładowych danych
    
    // Symulacja siły sygnału
    const signalStrength = -65;
    
    // Aktualizacja wskaźnika siły sygnału
    updateSignalStrength(signalStrength);
}

/**
 * Aktualizacja wskaźnika siły sygnału
 */
function updateSignalStrength(signalDbm) {
    // Konwersja dBm na poziomy siły sygnału
    // Typowe wartości: -50 dBm = doskonała, -60 dBm = dobra, -70 dBm = przeciętna, -80 dBm = słaba
    
    document.getElementById('wifi-bar-1').classList.toggle('active', signalDbm > -90);
    document.getElementById('wifi-bar-2').classList.toggle('active', signalDbm > -75);
    document.getElementById('wifi-bar-3').classList.toggle('active', signalDbm > -65);
    document.getElementById('wifi-bar-4').classList.toggle('active', signalDbm > -55);
}

/**
 * Rysowanie wykresu historii prędkości
 */
function drawSpeedHistoryChart() {
    const chartContainer = document.getElementById('speed-history-chart');
    
    // Przykładowe dane
    const data = {
        labels: ["12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "00:00"],
        download: [50, 65, 55, 75, 60, 80, 70],
        upload: [20, 25, 22, 30, 25, 35, 28]
    };
    
    // Wygenerowanie prostego wykresu
    let chartHTML = '<div class="simple-chart">';
    
    // Oś Y
    chartHTML += '<div class="chart-y-axis">';
    chartHTML += '<div>100 Mbps</div>';
    chartHTML += '<div>75 Mbps</div>';
    chartHTML += '<div>50 Mbps</div>';
    chartHTML += '<div>25 Mbps</div>';
    chartHTML += '<div>0 Mbps</div>';
    chartHTML += '</div>';
    
    // Słupki wykresu
    chartHTML += '<div class="chart-content">';
    
    for (let i = 0; i < data.labels.length; i++) {
        chartHTML += '<div class="chart-column">';
        chartHTML += `<div class="chart-bar download" style="height: ${data.download[i]}%;"></div>`;
        chartHTML += `<div class="chart-bar upload" style="height: ${data.upload[i]}%;"></div>`;
        chartHTML += `<div class="chart-label">${data.labels[i]}</div>`;
        chartHTML += '</div>';
    }
    
    chartHTML += '</div>'; // chart-content
    chartHTML += '</div>'; // simple-chart
    
    chartContainer.innerHTML = chartHTML;
    
    // Dodanie stylów dla wykresu
    const style = document.createElement('style');
    style.textContent = `
        .simple-chart {
            display: flex;
            height: 100%;
            padding: 10px 0;
        }
        .chart-y-axis {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding-right: 10px;
            font-size: 0.7rem;
            color: var(--text-light);
        }
        .chart-content {
            display: flex;
            flex: 1;
            align-items: flex-end;
            gap: 10px;
            height: 80%;
        }
        .chart-column {
            flex: 1;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            position: relative;
        }
        .chart-bar {
            width: 8px;
            position: absolute;
            bottom: 20px;
            border-radius: 2px;
        }
        .chart-bar.download {
            background-color: #3498db;
            left: calc(50% - 8px);
        }
        .chart-bar.upload {
            background-color: #2ecc71;
            left: calc(50% + 0px);
        }
        .chart-label {
            position: absolute;
            bottom: 0;
            font-size: 0.7rem;
            color: var(--text-light);
        }
    `;
    document.head.appendChild(style);
}

/**
 * Aktualizacja wykresu historii prędkości
 */
function updateSpeedHistoryChart(downloadSpeed, uploadSpeed) {
    // W rzeczywistej aplikacji, te dane byłyby dodawane do istniejącego wykresu
    // Na potrzeby demonstracji, wykres jest statyczny
}

/**
 * Kolorowanie wartości jakości połączenia
 */
function colorQualityValue(elementId, value, warnThreshold, errorThreshold) {
    const element = document.getElementById(elementId);
    
    if (value < warnThreshold) {
        element.style.color = 'var(--success-color)';
    } else if (value < errorThreshold) {
        element.style.color = 'var(--warning-color)';
    } else {
        element.style.color = 'var(--error-color)';
    }
}

/**
 * Aktualizacja paska miernika jakości
 */
function updateQualityMeter(meterId, value, maxValue) {
    const meter = document.getElementById(meterId);
    const percentage = Math.min(value / maxValue * 100, 100);
    meter.style.width = `${percentage}%`;
}

/**
 * Skanowanie sieci
 */
function scanNetwork() {
    showNotification('Rozpoczęto skanowanie sieci...', 'info');
    
    // Animacja przycisku
    const button = document.getElementById('scan-network-btn');
    button.disabled = true;
    button.innerHTML = '<i class="icon">🔄</i> Skanowanie...';
    
    // Pokaż ładowanie widgetu
    showWidgetLoading('devices-widget');
    
    // Symulacja czasu skanowania (w rzeczywistej aplikacji byłoby to zapytanie do API)
    setTimeout(() => {
        updateDevices();
        
        button.disabled = false;
        button.innerHTML = '<i class="icon">🔍</i> Skanuj sieć';
        
        showNotification('Skanowanie sieci zakończone', 'success');
    }, 2000);
}

/**
 * Inicjalizacja modalu testu prędkości
 */
function initSpeedTestModal() {
    const modal = document.getElementById('speed-test-modal');
    
    // Przyciski zamykania
    document.getElementById('close-speed-test-modal').addEventListener('click', () => {
        modal.classList.remove('show');
    });
    
    document.getElementById('cancel-speed-test').addEventListener('click', () => {
        modal.classList.remove('show');
    });
    
    // Przycisk rozpoczęcia testu
    document.getElementById('start-speed-test').addEventListener('click', startSpeedTest);
    
    // Zamykanie modalu po kliknięciu poza zawartością
    window.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
    
    // Obsługa klawisza Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            modal.classList.remove('show');
        }
    });
}

/**
 * Pokazanie modalu testu prędkości
 */
function showSpeedTestModal() {
    const modal = document.getElementById('speed-test-modal');
    modal.classList.add('show');
    
    // Reset stanu testu
    resetSpeedTest();
}

/**
 * Reset stanu testu prędkości
 */
function resetSpeedTest() {
    document.getElementById('test-phase').textContent = 'Przygotowanie...';
    document.getElementById('test-progress').style.width = '0%';
    document.getElementById('test-download').textContent = '--';
    document.getElementById('test-upload').textContent = '--';
    document.getElementById('test-ping').textContent = '--';
    
    document.getElementById('start-speed-test').disabled = false;
}

/**
 * Rozpoczęcie testu prędkości
 */
function startSpeedTest() {
    const startButton = document.getElementById('start-speed-test');
    startButton.disabled = true;
    startButton.textContent = 'Testowanie...';
    
    // W rzeczywistej aplikacji, byłoby to zapytanie do API
    // Symulacja testu prędkości
    
    // Test ping
    document.getElementById('test-phase').textContent = 'Testowanie ping...';
    updateProgress(10);
    
    setTimeout(() => {
        const ping = Math.floor(Math.random() * 30) + 10;
        document.getElementById('test-ping').textContent = `${ping} ms`;
        
        // Test prędkości pobierania
        document.getElementById('test-phase').textContent = 'Testowanie prędkości pobierania...';
        updateProgress(30);
        
        setTimeout(() => {
            const downloadSpeed = (Math.random() * 80 + 40).toFixed(1);
            document.getElementById('test-download').textContent = `${downloadSpeed} Mbps`;
            
            // Test prędkości wysyłania
            document.getElementById('test-phase').textContent = 'Testowanie prędkości wysyłania...';
            updateProgress(70);
            
            setTimeout(() => {
                const uploadSpeed = (Math.random() * 20 + 10).toFixed(1);
                document.getElementById('test-upload').textContent = `${uploadSpeed} Mbps`;
                
                // Zakończenie testu
                document.getElementById('test-phase').textContent = 'Test zakończony';
                updateProgress(100);
                
                startButton.disabled = false;
                startButton.textContent = 'Rozpocznij test';
                
                // Aktualizacja głównego widgetu prędkości
                document.getElementById('download-speed').textContent = downloadSpeed;
                document.getElementById('upload-speed').textContent = uploadSpeed;
                
                showNotification('Test prędkości zakończony', 'success');
            }, 2000);
        }, 3000);
    }, 1000);
}

/**
 * Aktualizacja paska postępu testu
 */
function updateProgress(percentage) {
    document.getElementById('test-progress').style.width = `${percentage}%`;
}

/**
 * Wyświetla animację ładowania w widgecie
 */
function showWidgetLoading(widgetId) {
    const widget = document.getElementById(widgetId);
    
    // Sprawdź czy nakładka już istnieje
    if (widget.querySelector('.widget-loading-overlay')) return;
    
    // Utwórz nakładkę ładowania
    const overlay = document.createElement('div');
    overlay.className = 'widget-loading-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '100';
    overlay.style.borderRadius = '10px';
    
    // Dodaj spinner
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.style.width = '30px';
    spinner.style.height = '30px';
    spinner.style.border = '3px solid rgba(0, 0, 0, 0.1)';
    spinner.style.borderRadius = '50%';
    spinner.style.borderTopColor = 'var(--primary-color)';
    spinner.style.animation = 'spin 1s linear infinite';
    
    overlay.appendChild(spinner);
    
    // Dodaj style dla animacji, jeśli jeszcze nie istnieją
    if (!document.getElementById('spinner-style')) {
        const style = document.createElement('style');
        style.id = 'spinner-style';
        style.textContent = `
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Ustaw względne pozycjonowanie dla widgetu, jeśli nie jest ustawione
    if (window.getComputedStyle(widget).position === 'static') {
        widget.style.position = 'relative';
    }
    
    // Dodaj nakładkę do widgetu
    widget.appendChild(overlay);
}

/**
 * Ukrywa animację ładowania w widgecie
 */
function hideWidgetLoading(widgetId) {
    const widget = document.getElementById(widgetId);
    const overlay = widget.querySelector('.widget-loading-overlay');
    
    if (overlay) {
        // Animacja zanikania
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s';
        
        // Usuń po zakończeniu animacji
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }
}

/**
 * Animacja przycisku odświeżania
 */
function animateRefreshButton(button) {
    // Dodanie klasy animacji
    button.classList.add('refreshing');
    
    // Dodanie stylów dla animacji, jeśli jeszcze nie istnieją
    if (!document.getElementById('refresh-animation-style')) {
        const style = document.createElement('style');
        style.id = 'refresh-animation-style';
        style.textContent = `
            .refreshing {
                animation: rotate-refresh 1s linear;
            }
            @keyframes rotate-refresh {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Usunięcie klasy po zakończeniu animacji
    setTimeout(() => {
        button.classList.remove('refreshing');
    }, 1000);
}

/**
 * Wyświetlanie powiadomień
 */
function showNotification(message, type = 'info') {
    // Sprawdź czy element powiadomień istnieje
    let notifications = document.getElementById('notifications-container');
    
    if (!notifications) {
        // Utwórz kontener na powiadomienia
        notifications = document.createElement('div');
        notifications.id = 'notifications-container';
        notifications.style.position = 'fixed';
        notifications.style.top = '20px';
        notifications.style.right = '20px';
        notifications.style.zIndex = '9999';
        notifications.style.display = 'flex';
        notifications.style.flexDirection = 'column';
        notifications.style.gap = '10px';
        document.body.appendChild(notifications);
    }
    
    // Utwórz powiadomienie
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Style dla powiadomienia
    notification.style.padding = '10px 15px';
    notification.style.borderRadius = '4px';
    notification.style.marginBottom = '10px';
    notification.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.1)';
    notification.style.minWidth = '250px';
    notification.style.transform = 'translateX(120%)';
    notification.style.transition = 'transform 0.3s ease-out';
    
    // Ustaw kolor tła w zależności od typu
    switch (type) {
        case 'success':
            notification.style.backgroundColor = 'var(--success-color, #2ecc71)';
            notification.style.color = 'white';
            break;
        case 'error':
            notification.style.backgroundColor = 'var(--error-color, #e74c3c)';
            notification.style.color = 'white';
            break;
        case 'warning':
            notification.style.backgroundColor = 'var(--warning-color, #f39c12)';
            notification.style.color = 'white';
            break;
        default: // info
            notification.style.backgroundColor = 'var(--primary-color, #3498db)';
            notification.stylenotification.style.backgroundColor = 'var(--primary-color, #3498db)';
            notification.style.color = 'white';
    }
    
    // Dodaj powiadomienie do kontenera
    notifications.appendChild(notification);
    
    // Animacja wejścia
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 10);
    
    // Automatyczne usunięcie po określonym czasie
    setTimeout(() => {
        notification.style.transform = 'translateX(120%)';
        notification.style.opacity = '0';
        
        // Usunięcie elementu po zakończeniu animacji
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 5000);
}