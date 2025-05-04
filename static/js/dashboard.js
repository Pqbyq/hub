/**
 * dashboard.js - Skrypt do obsługi strony głównej domowego huba
 */

// Globalne zmienne do przechowywania danych pogodowych
let currentWeatherData = null;
let yesterdayWeatherData = null;
let tomorrowWeatherData = null;
let displayedDay = 'today'; // 'yesterday', 'today', 'tomorrow'

document.addEventListener('DOMContentLoaded', function() {
    // Inicjalizacja strony
    initDashboard();

    // Aktualizacja zegara co sekundę
    updateTime();
    setInterval(updateTime, 1000);
    
    // Aktualizacja danych co 30 minut
    setInterval(updateWeatherWidget, 30 * 60 * 1000);
    
    // Aktualizacja danych sieciowych co 5 minut
    setInterval(updateNetworkWidget, 5 * 60 * 1000);
    
    // Dodanie obsługi przycisku odświeżania danych sieci
    document.getElementById('refresh-network').addEventListener('click', function() {
        updateNetworkWidget();
    });
    
    // Obsługa zmiany lokalizacji
    document.getElementById('change-location-btn').addEventListener('click', showLocationModal);
    document.getElementById('close-location-modal').addEventListener('click', hideLocationModal);
    document.getElementById('cancel-location-btn').addEventListener('click', hideLocationModal);
    document.getElementById('search-city-btn').addEventListener('click', searchCities);
    
    // Obsługa wyszukiwania po naciśnięciu Enter
    document.getElementById('city-search').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchCities();
        }
    });
    
    // Zamykanie modalu po kliknięciu poza nim
    window.addEventListener('click', function(e) {
        const modal = document.getElementById('location-modal');
        if (e.target === modal) {
            hideLocationModal();
        }
    });
    
    // Obsługa klawisza Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            hideLocationModal();
        }
    });
});

/**
 * Inicjalizacja dashboardu
 */
async function initDashboard() {
    try {
        // Pobierz ustawienia użytkownika
        const settings = await getUserSettings();
        
        // Aktualizuj wyświetlaną lokalizację
        if (settings.default_city) {
            document.getElementById('current-city').textContent = settings.default_city;
        }
        
        // Pobieranie danych
        await Promise.all([
            updateWeatherWidget(),
            updateNetworkWidget()
        ]);
        
        console.log('Dashboard initialized successfully');
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showError('Wystąpił błąd podczas ładowania danych. Odśwież stronę, aby spróbować ponownie.');
    }
}

/**
 * Aktualizacja wszystkich danych na dashboardzie
 */
async function updateDashboardData() {
    try {
        await Promise.all([
            updateWeatherWidget(),
            updateNetworkWidget()
        ]);
    } catch (error) {
        console.error('Error updating dashboard data:', error);
    }
}

/**
 * Aktualizacja zegara
 */
function updateTime() {
    const now = new Date();
    
    const timeString = now.toLocaleTimeString('pl-PL');
    const dateString = now.toLocaleDateString('pl-PL', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
    });
    
    document.getElementById('currentTime').textContent = timeString;
    document.getElementById('currentDate').textContent = dateString;
}

/**
 * Pobieranie ustawień użytkownika
 * @returns {Promise<Object>} - Obiekt z ustawieniami
 */
async function getUserSettings() {
    try {
        const response = await fetch('/api/user/settings');
        if (!response.ok) {
            throw new Error('Nie udało się pobrać ustawień');
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching user settings:', error);
        return { default_city: 'Warsaw' };
    }
}

/**
 * Zapisywanie nowej domyślnej lokalizacji
 * @param {string} city - Nazwa miasta
 * @returns {Promise<Object>} - Odpowiedź serwera
 */
async function updateDefaultCity(city) {
    try {
        const response = await fetch('/api/user/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ default_city: city })
        });
        
        if (!response.ok) {
            throw new Error('Nie udało się zapisać ustawień');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error updating default city:', error);
        showError('Nie udało się zapisać lokalizacji');
    }
}

/**
 * Aktualizacja widgetu pogodowego - nowa implementacja
 * @param {string} city - Opcjonalna nazwa miasta
 */
async function updateWeatherWidget(city) {
    const weatherWidget = document.getElementById('weather-widget');
    
    try {
        // Ustawienie stanu ładowania
        weatherWidget.classList.add('widget-loading');
        
        // Pobieranie danych pogodowych dla aktualnego dnia
        console.log('Fetching weather data...', city);
        const weatherData = city 
            ? await api.getWeather(city) 
            : await api.getWeather();
        
        console.log('Weather data received:', weatherData);
        
        // Zapisz dane pogodowe globalnie
        currentWeatherData = weatherData;
        
        // Symulacja danych dla wczoraj i jutra (w rzeczywistym API należałoby pobrać dane historyczne i prognozę)
        simulateOtherDaysWeather();
        
        // Aktualizacja nazwy miasta w widgecie
        document.getElementById('current-city').textContent = weatherData.city;
        
        // Aktualizacja daty
        updateWeatherDate();
        
        // Aktualizuj kartę dla aktualnie wybranego dnia
        updateWeatherCard();
        
        // Zakończenie ładowania
        weatherWidget.classList.remove('widget-loading');
        
        // Obsługa przycisków nawigacji
        setupWeatherNavigation();
    } catch (error) {
        console.error('Error updating weather widget:', error);
        console.error('Error details:', error.message, error.stack);
        weatherWidget.classList.remove('widget-loading');
        
        // Wyświetl informację o błędzie
        document.getElementById('weather-condition').textContent = 'Błąd pobierania danych';
        document.getElementById('weather-temp').textContent = '--°C';
    }
}

/**
 * Symulacja danych pogodowych dla wczoraj i jutra
 * W rzeczywistej aplikacji należałoby użyć API do pobrania historii i prognozy
 */
function simulateOtherDaysWeather() {
    if (!currentWeatherData) return;
    
    // Symulacja danych dla wczoraj (nieco niższa temperatura)
    yesterdayWeatherData = { ...currentWeatherData };
    yesterdayWeatherData.temperature = Math.max(0, currentWeatherData.temperature - Math.random() * 3).toFixed(1);
    
    // Symulacja danych dla jutra (nieco wyższa temperatura)
    tomorrowWeatherData = { ...currentWeatherData };
    tomorrowWeatherData.temperature = (currentWeatherData.temperature + Math.random() * 3).toFixed(1);
}

/**
 * Aktualizacja daty na karcie pogodowej
 */
function updateWeatherDate() {
    const dateElement = document.getElementById('weather-date');
    const dayElement = document.getElementById('weather-day');
    
    const now = new Date();
    let displayDate = now;
    
    // Ustaw odpowiednią datę w zależności od wybranego dnia
    if (displayedDay === 'yesterday') {
        displayDate = new Date(now);
        displayDate.setDate(now.getDate() - 1);
        dayElement.textContent = 'Wczoraj';
    } else if (displayedDay === 'today') {
        dayElement.textContent = 'Dziś';
    } else if (displayedDay === 'tomorrow') {
        displayDate = new Date(now);
        displayDate.setDate(now.getDate() + 1);
        dayElement.textContent = 'Jutro';
    }
    
    // Format daty: DD.MM
    const day = displayDate.getDate().toString().padStart(2, '0');
    const month = (displayDate.getMonth() + 1).toString().padStart(2, '0');
    dateElement.textContent = `${day}.${month}`;
}

/**
 * Aktualizacja karty pogodowej dla aktualnie wybranego dnia
 */
function updateWeatherCard() {
    let data;
    
    // Wybierz dane dla odpowiedniego dnia
    if (displayedDay === 'yesterday') {
        data = yesterdayWeatherData;
    } else if (displayedDay === 'today') {
        data = currentWeatherData;
    } else if (displayedDay === 'tomorrow') {
        data = tomorrowWeatherData;
    }
    
    // Jeśli brak danych, wyświetl placeholder
    if (!data) {
        document.getElementById('weather-condition').textContent = 'Brak danych';
        document.getElementById('weather-temp').textContent = '--°C';
        document.getElementById('weather-humidity').textContent = '--%';
        document.getElementById('weather-wind').textContent = '-- km/h';
        document.getElementById('weather-pressure').textContent = '-- hPa';
        document.getElementById('weather-icon-img').src = '';
        return;
    }
    
    // Aktualizacja treści karty
    document.getElementById('weather-condition').textContent = data.condition || 'Brak danych';
    document.getElementById('weather-temp').textContent = `${data.temperature}°C`;
    document.getElementById('weather-humidity').textContent = `${data.humidity}%`;
    document.getElementById('weather-wind').textContent = `${data.wind_speed} km/h`;
    document.getElementById('weather-pressure').textContent = `${data.pressure} hPa`;
    
    // Aktualizacja ikony
    const iconElement = document.getElementById('weather-icon-img');
    if (data.icon) {
        // Użyj ikony z OpenWeatherMap
        iconElement.src = `https://openweathermap.org/img/wn/${data.icon}@2x.png`;
        iconElement.alt = data.condition;
    } else {
        // Lub użyj emoji jako fallbacku
        const weatherIcon = getWeatherIcon(data.condition);
        iconElement.src = '';
        iconElement.alt = '';
        
        // Alternatywny sposób wyświetlenia emoji jako ikony
        const iconContainer = document.getElementById('weather-icon');
        if (iconElement.src === '') {
            iconContainer.innerHTML = `<div class="weather-emoji">${weatherIcon}</div>`;
        }
    }
    
    // Dodanie animacji przejścia
    const card = document.getElementById('current-weather-card');
    card.classList.remove('slide-up', 'slide-down');
    void card.offsetWidth; // Trigger reflow (potrzebne, aby ponownie uruchomić animację)
    
    // Zastosuj odpowiednią animację
    if (displayedDay === 'yesterday') {
        card.classList.add('slide-down');
    } else if (displayedDay === 'tomorrow') {
        card.classList.add('slide-up');
    } else {
        card.classList.add('slide-down'); // Domyślnie od góry
    }
}

/**
 * Konfiguracja przycisków nawigacji w widgecie pogodowym
 */
function setupWeatherNavigation() {
    const prevBtn = document.getElementById('prev-day-btn');
    const nextBtn = document.getElementById('next-day-btn');
    
    // Aktualizacja stanu przycisków
    updateNavButtonsState();
    
    // Dodaj obsługę zdarzeń
    prevBtn.onclick = navigateToPrevDay;
    nextBtn.onclick = navigateToNextDay;
}

/**
 * Aktualizacja stanu przycisków nawigacji
 */
function updateNavButtonsState() {
    const prevBtn = document.getElementById('prev-day-btn');
    const nextBtn = document.getElementById('next-day-btn');
    
    // Wyłącz przycisk "poprzedni" jeśli jesteśmy na wczoraj
    prevBtn.disabled = displayedDay === 'yesterday';
    
    // Wyłącz przycisk "następny" jeśli jesteśmy na jutro
    nextBtn.disabled = displayedDay === 'tomorrow';
}

/**
 * Nawigacja do poprzedniego dnia
 */
function navigateToPrevDay() {
    if (displayedDay === 'today') {
        displayedDay = 'yesterday';
    } else if (displayedDay === 'tomorrow') {
        displayedDay = 'today';
    }
    
    updateWeatherDate();
    updateWeatherCard();
    updateNavButtonsState();
}

/**
 * Nawigacja do następnego dnia
 */
function navigateToNextDay() {
    if (displayedDay === 'yesterday') {
        displayedDay = 'today';
    } else if (displayedDay === 'today') {
        displayedDay = 'tomorrow';
    }
    
    updateWeatherDate();
    updateWeatherCard();
    updateNavButtonsState();
}

/**
 * Aktualizacja danych o sieci
 */
async function updateNetworkWidget() {
    const networkWidget = document.getElementById('network-widget');
    
    try {
        // Ustawienie stanu ładowania
        networkWidget.classList.add('widget-loading');
        
        // Dodaj szczegółowe logowanie
        console.log('Attempting to fetch network status...');
        
        // Pobranie danych o sieci
        const networkData = await api.getNetworkStatus();
        
        // Więcej logowania
        console.log('Network data received:', networkData);
        
        // Sprawdzenie, czy dane są prawidłowe
        if (!networkData) {
            console.error('Received empty network data');
            throw new Error('Brak danych o sieci');
        }
        
        // Aktualizacja widżetu
        const downloadSpeedElem = document.getElementById('download-speed');
        const uploadSpeedElem = document.getElementById('upload-speed');
        const connectedDevicesElem = document.getElementById('connected-devices');
        const statusElem = document.getElementById('connection-status');
        
        // Sprawdzenie, czy elementy istnieją
        if (!downloadSpeedElem || !uploadSpeedElem || !connectedDevicesElem || !statusElem) {
            console.error('One or more network widget elements not found');
            throw new Error('Nie znaleziono elementów widżetu sieci');
        }
        
        // Bezpieczna aktualizacja danych
        downloadSpeedElem.textContent = `${networkData.download_speed || '--'} Mbps`;
        uploadSpeedElem.textContent = `${networkData.upload_speed || '--'} Mbps`;
        connectedDevicesElem.textContent = networkData.connected_devices || '--';
        
        statusElem.textContent = networkData.status || 'Nieznany';
        
        // Kolorowanie statusu
        if (networkData.status === 'ONLINE') {
            statusElem.style.color = 'var(--success-color)';
        } else {
            statusElem.style.color = 'var(--error-color)';
        }
        
        // Zakończenie ładowania
        networkWidget.classList.remove('widget-loading');
    } catch (error) {
        console.error('Błąd podczas aktualizacji widżetu sieci:', error);
        
        // Wyświetl szczegółowe informacje o błędzie
        if (error.response) {
            // Błąd z odpowiedzi serwera
            console.error('Odpowiedź serwera:', error.response);
        }
        
        // Przywróć domyślne wartości
        document.getElementById('download-speed').textContent = '--';
        document.getElementById('upload-speed').textContent = '--';
        document.getElementById('connected-devices').textContent = '--';
        document.getElementById('connection-status').textContent = 'Błąd';
        
        networkWidget.classList.remove('widget-loading');
    }
}

/**
 * Wybór ikony pogodowej na podstawie warunków
 * @param {string} condition - Warunki pogodowe
 * @returns {string} - Emoji odpowiadające pogodzie
 */
function getWeatherIcon(condition) {
    if (!condition) return '🌤️';
    
    condition = condition.toLowerCase();
    
    if (condition.includes('słońce') || condition.includes('pogodnie')) {
        return '☀️';
    } else if (condition.includes('chmury') || condition.includes('zachmurzenie')) {
        return '⛅';
    } else if (condition.includes('deszcz')) {
        return '🌧️';
    } else if (condition.includes('burza')) {
        return '⛈️';
    } else if (condition.includes('śnieg')) {
        return '❄️';
    } else if (condition.includes('mgła')) {
        return '🌫️';
    } else {
        return '🌤️';
    }
}

/**
 * Pokazanie modalu zmiany lokalizacji
 */
function showLocationModal() {
    document.getElementById('location-modal').classList.add('show');
    document.getElementById('city-search').focus();
}

/**
 * Ukrycie modalu zmiany lokalizacji
 */
function hideLocationModal() {
    document.getElementById('location-modal').classList.remove('show');
    document.getElementById('city-results').innerHTML = '';
    document.getElementById('city-search').value = '';
}

/**
 * Wyszukiwanie miast
 */
async function searchCities() {
    const query = document.getElementById('city-search').value.trim();
    const resultsContainer = document.getElementById('city-results');
    
    if (query.length < 3) {
        resultsContainer.innerHTML = '<div class="alert alert-warning">Wpisz co najmniej 3 znaki</div>';
        return;
    }
    
    try {
        resultsContainer.innerHTML = '<div class="loading-indicator"></div>';
        
        const response = await fetch(`/api/cities/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error('Nie udało się wyszukać miast');
        }
        
        const cities = await response.json();
        
        if (cities.length === 0) {
            resultsContainer.innerHTML = '<div class="alert alert-info">Nie znaleziono miast</div>';
            return;
        }
        
        let html = '';
        cities.forEach(city => {
            html += `
                <div class="city-item" data-city="${city.name}">
                    <span class="city-name">${city.name}</span>
                    <span class="city-country">${city.country}</span>
                </div>
            `;
        });
        
        resultsContainer.innerHTML = html;
        
        // Dodaj obsługę kliknięcia na wyniki
        document.querySelectorAll('.city-item').forEach(item => {
            item.addEventListener('click', function() {
                const cityName = this.dataset.city;
                selectCity(cityName);
            });
        });
    } catch (error) {
        console.error('Error searching cities:', error);
        resultsContainer.innerHTML = '<div class="alert alert-error">Błąd podczas wyszukiwania</div>';
    }
}

/**
 * Wybór miasta
 * @param {string} cityName - Nazwa wybranego miasta
 */
async function selectCity(cityName) {
    // Aktualizuj widżet
    document.getElementById('current-city').textContent = cityName;
    
    // Zamknij modal
    hideLocationModal();
    
    // Zapisz ustawienie
    await updateDefaultCity(cityName);
    
    // Odśwież dane pogodowe dla nowego miasta
    await updateWeatherWidget(cityName);
    
    // Pokaż potwierdzenie
    showSuccess(`Zmieniono lokalizację na: ${cityName}`);
}

/**
 * Wyświetlanie komunikatu o błędzie
 * @param {string} message - Treść komunikatu
 */
function showError(message) {
    // Tworzenie elementu alertu
    const alert = document.createElement('div');
    alert.className = 'alert alert-error';
    alert.textContent = message;
    
    // Dodanie do DOM
    const content = document.querySelector('.content');
    content.insertBefore(alert, content.firstChild);
    
    // Usunięcie alertu po 5 sekundach
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

/**
 * Wyświetlanie komunikatu o sukcesie
 * @param {string} message - Treść komunikatu
 */
function showSuccess(message) {
    // Tworzenie elementu alertu
    const alert = document.createElement('div');
    alert.className = 'alert alert-success';
    alert.textContent = message;
    
    // Dodanie do DOM
    const content = document.querySelector('.content');
    content.insertBefore(alert, content.firstChild);
    
    // Usunięcie alertu po 5 sekundach
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

// Generowanie kalendarza
function generateCalendar() {
    const now = new Date();
    let currentMonth = now.getMonth();
    let currentYear = now.getFullYear();
    
    // Funkcja generująca miesiąc
    function generateMonth(month, year) {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        
        // Dzień tygodnia dla pierwszego dnia miesiąca (0 = niedziela, 1 = poniedziałek, itd.)
        let firstDayOfWeek = firstDay.getDay();
        firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Przekształć na poniedziałek = 0
        
        // Ustawienie tytułu miesiąca
        document.getElementById('currentMonth').textContent = 
            firstDay.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        
        const calendarBody = document.getElementById('calendarBody');
        calendarBody.innerHTML = '';
        
        // Tworzenie wierszy kalendarza
        let date = 1;
        for (let i = 0; i < 6; i++) {
            // Przerwij jeśli już wygenerowaliśmy wszystkie dni
            if (date > daysInMonth) break;
            
            const row = document.createElement('tr');
            
            // Tworzenie komórek w wierszu
            for (let j = 0; j < 7; j++) {
                const cell = document.createElement('td');
                
                if (i === 0 && j < firstDayOfWeek) {
                    // Puste komórki przed pierwszym dniem miesiąca
                    // Możemy tu też wstawić dni z poprzedniego miesiąca
                    const prevMonth = new Date(year, month, 0);
                    const prevMonthDays = prevMonth.getDate();
                    const prevMonthDay = prevMonthDays - (firstDayOfWeek - j - 1);
                    
                    cell.textContent = prevMonthDay;
                    cell.className = 'day other-month';
                } else if (date > daysInMonth) {
                    // Dni z następnego miesiąca
                    const nextMonthDay = date - daysInMonth;
                    cell.textContent = nextMonthDay;
                    cell.className = 'day other-month';
                    date++;
                } else {
                    // Bieżący miesiąc
                    cell.textContent = date;
                    cell.className = 'day';
                    
                    // Oznaczenie dzisiejszego dnia
                    if (date === now.getDate() && month === now.getMonth() && year === now.getFullYear()) {
                        cell.classList.add('today');
                    }
                    
                    date++;
                }
                
                row.appendChild(cell);
            }
            
            calendarBody.appendChild(row);
        }
    }
    
    // Generowanie początkowego miesiąca
    generateMonth(currentMonth, currentYear);
    
    // Obsługa przycisków nawigacji
    document.getElementById('prevMonth').addEventListener('click', function() {
        currentMonth--;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        }
        generateMonth(currentMonth, currentYear);
    });
    
    document.getElementById('nextMonth').addEventListener('click', function() {
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        generateMonth(currentMonth, currentYear);
    });
}

// Dodaj style dla emoji
document.addEventListener('DOMContentLoaded', function() {
    const style = document.createElement('style');
    style.textContent = `
        .weather-emoji {
            font-size: 3.5rem;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 80px;
        }
    `;
    document.head.appendChild(style);
    
    // Generowanie kalendarza
    generateCalendar();
});