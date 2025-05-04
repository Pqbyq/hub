/**
 * media_center.js - Skrypt główny modułu Media Center
 */

document.addEventListener('DOMContentLoaded', function() {
    // Inicjalizacja Media Center
    initMediaCenter();
    
    // Obsługa zakładek typu mediów
    document.querySelectorAll('.media-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            // Usunięcie aktywnej klasy z pozostałych zakładek
            document.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
            
            // Dodanie aktywnej klasy do klikniętej zakładki
            this.classList.add('active');
            
            // Pobranie typu mediów
            const mediaType = this.dataset.type;
            
            // Odświeżenie listy mediów
            loadMediaItems(mediaType);
        });
    });
    
    // Obsługa przycisku skanowania mediów
    document.getElementById('scan-media-btn').addEventListener('click', showScanMediaModal);
    
    // Obsługa przycisku tworzenia playlisty
    document.getElementById('create-playlist-btn').addEventListener('click', showPlaylistModal);
    
    // Obsługa modalu skanowania mediów
    initScanMediaModal();
    
    // Obsługa modalu playlisty
    initPlaylistModal();
    
    // Obsługa odtwarzacza mediów
    initMediaPlayer();
});

/**
 * Inicjalizacja Media Center
 */
function initMediaCenter() {
    console.log('Inicjalizacja Media Center');
    
    // Domyślne załadowanie wszystkich mediów
    loadMediaItems('all');
    
    // Załadowanie playlist
    loadPlaylists();
}

/**
 * Ładowanie elementów mediów z serwera
 */
function loadMediaItems(mediaType = 'all', page = 1, perPage = 20) {
    console.log(`Ładowanie mediów typu: ${mediaType}, strona: ${page}`);
    
    // Pokaż wskaźnik ładowania
    const mediaGrid = document.getElementById('media-items-grid');
    mediaGrid.innerHTML = '<div class="loading-indicator"></div>';
    
    // Parametry zapytania
    const params = new URLSearchParams();
    if (mediaType !== 'all') {
        params.append('type', mediaType);
    }
    params.append('page', page);
    params.append('per_page', perPage);
    
    // Pobranie danych z API
    fetch(`/api/media/list?${params.toString()}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Błąd pobierania mediów');
            }
            return response.json();
        })
        .then(data => {
            // Wyczyszczenie siatki mediów
            mediaGrid.innerHTML = '';
            
            if (data.length === 0) {
                mediaGrid.innerHTML = `
                    <div class="no-media-message">
                        <p>Nie znaleziono mediów typu ${mediaType}</p>
                        <button id="scan-now-btn" class="btn btn-primary">Skanuj teraz</button>
                    </div>
                `;
                
                // Dodanie obsługi przycisku skanowania
                document.getElementById('scan-now-btn').addEventListener('click', showScanMediaModal);
                return;
            }
            
            // Dodanie elementów mediów do siatki
            data.forEach(item => {
                const mediaElement = createMediaElement(item);
                mediaGrid.appendChild(mediaElement);
            });
            
            // Aktualizacja paginacji
            updatePagination(page, Math.ceil(data.length / perPage), mediaType);
        })
        .catch(error => {
            console.error('Błąd:', error);
            mediaGrid.innerHTML = `
                <div class="error-message">
                    <p>Wystąpił błąd podczas ładowania mediów.</p>
                    <button id="retry-btn" class="btn btn-primary">Spróbuj ponownie</button>
                </div>
            `;
            
            // Dodanie obsługi przycisku ponowienia próby
            document.getElementById('retry-btn').addEventListener('click', () => {
                loadMediaItems(mediaType, page, perPage);
            });
        });
}

/**
 * Tworzenie elementu medium
 */
function createMediaElement(item) {
    const mediaItem = document.createElement('div');
    mediaItem.className = 'media-item';
    mediaItem.dataset.id = item.id;
    mediaItem.dataset.type = item.media_type;
    
    // Określenie miniatury
    let thumbnailSrc = item.thumbnail_path ? `/api/media/thumbnail/${item.id}` : getDefaultThumbnail(item.media_type);
    
    // Utworzenie HTML elementu
    mediaItem.innerHTML = `
        <div class="media-thumbnail-container">
            <img src="${thumbnailSrc}" alt="${item.title}" class="media-thumbnail">
            <div class="media-play-button" data-id="${item.id}" data-type="${item.media_type}">
                <i class="icon">${getPlayIcon(item.media_type)}</i>
            </div>
        </div>
        <div class="media-info">
            <div class="media-title">${item.title}</div>
            <div class="media-meta">
                ${getMediaMeta(item)}
            </div>
        </div>
    `;
    
    // Dodanie obsługi kliknięcia
    mediaItem.querySelector('.media-play-button').addEventListener('click', function() {
        playMedia(item.id, item.media_type);
    });
    
    return mediaItem;
}

/**
 * Pobranie ikony odtwarzania dla typu mediów
 */
function getPlayIcon(mediaType) {
    switch (mediaType) {
        case 'video':
            return '▶️';
        case 'audio':
            return '🎵';
        case 'image':
            return '🖼️';
        default:
            return '▶️';
    }
}

/**
 * Pobranie domyślnej miniatury dla typu mediów
 */
function getDefaultThumbnail(mediaType) {
    switch (mediaType) {
        case 'video':
            return '/static/img/media/video_thumbnail.jpg';
        case 'audio':
            return '/static/img/media/audio_thumbnail.jpg';
        case 'image':
            return '/static/img/media/image_thumbnail.jpg';
        default:
            return '/static/img/media/default_thumbnail.jpg';
    }
}

/**
 * Pobranie metadanych dla elementu medium
 */
function getMediaMeta(item) {
    let meta = '';
    
    switch (item.media_type) {
        case 'video':
            if (item.metadata) {
                meta += item.metadata.resolution ? `${item.metadata.resolution} · ` : '';
            }
            
            // Dodanie czasu trwania, jeśli dostępny
            if (item.duration) {
                meta += formatDuration(item.duration);
            }
            break;
            
        case 'audio':
            if (item.metadata) {
                meta += item.metadata.artist ? `${item.metadata.artist} · ` : '';
                meta += item.metadata.album ? `${item.metadata.album} · ` : '';
            }
            
            // Dodanie czasu trwania, jeśli dostępny
            if (item.duration) {
                meta += formatDuration(item.duration);
            }
            break;
            
        case 'image':
            // Dodanie rozmiaru pliku
            if (item.file_size) {
                meta += formatFileSize(item.file_size);
            }
            break;
            
        default:
            break;
    }
    
    return meta;
}

/**
 * Formatowanie czasu trwania
 */
function formatDuration(seconds) {
    seconds = Math.floor(seconds);
    const minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
        return `${hours}:${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
        return `${mins}:${seconds.toString().padStart(2, '0')}`;
    }
}

/**
 * Formatowanie rozmiaru pliku
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Inicjalizacja modalu skanowania mediów
 */
function initScanMediaModal() {
    const modal = document.getElementById('scan-media-modal');
    
    // Przyciski zamykania
    document.getElementById('close-scan-modal').addEventListener('click', () => {
        modal.classList.remove('show');
    });
    
    document.getElementById('cancel-scan-btn').addEventListener('click', () => {
        modal.classList.remove('show');
    });
    
    // Przycisk rozpoczęcia skanowania
    document.getElementById('start-scan-btn').addEventListener('click', startMediaScan);
    
    // Zamykanie modalu po kliknięciu poza zawartością
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
    
    // Obsługa klawisza Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            modal.classList.remove('show');
        }
    });
}

/**
 * Pokazanie modalu skanowania mediów
 */
function showScanMediaModal() {
    const modal = document.getElementById('scan-media-modal');
    modal.classList.add('show');
    
    // Zresetowanie stanu skanowania
    document.getElementById('scan-status').style.display = 'none';
    document.getElementById('start-scan-btn').disabled = false;
}

/**
 * Rozpoczęcie skanowania mediów
 */
function startMediaScan() {
    const mediaDirectory = document.getElementById('media-directory').value;
    const scanRecursive = document.getElementById('scan-recursive').checked;
    const generateThumbnails = document.getElementById('scan-generate-thumbnails').checked;
    
    if (!mediaDirectory) {
        alert('Podaj katalog z mediami');
        return;
    }
    
    // Pokaż status skanowania
    const statusElement = document.getElementById('scan-status');
    statusElement.style.display = 'block';
    
    const progressBar = document.getElementById('scan-progress-bar');
    progressBar.style.width = '0%';
    
    const infoElement = document.getElementById('scan-info');
    infoElement.textContent = 'Rozpoczynanie skanowania...';
    
    // Wyłącz przycisk rozpoczęcia skanowania
    document.getElementById('start-scan-btn').disabled = true;
    
    // Wywołanie API skanowania
    fetch('/api/media/scan', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            directory: mediaDirectory,
            recursive: scanRecursive,
            generate_thumbnails: generateThumbnails
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Błąd skanowania mediów');
        }
        return response.json();
    })
    .then(data => {
        // Aktualizacja statusu skanowania
        infoElement.textContent = `Skanowanie rozpoczęte. ID zadania: ${data.task_id}`;
        
        // Rozpoczęcie monitorowania postępu
        monitorScanProgress(data.task_id);
    })
    .catch(error => {
        console.error('Błąd:', error);
        infoElement.textContent = 'Wystąpił błąd podczas skanowania mediów.';
        document.getElementById('start-scan-btn').disabled = false;
    });
}

/**
 * Monitorowanie postępu skanowania
 */
function monitorScanProgress(taskId) {
    const progressBar = document.getElementById('scan-progress-bar');
    const infoElement = document.getElementById('scan-info');
    
    // Funkcja do sprawdzania postępu
    function checkProgress() {
        fetch(`/api/media/scan/status/${taskId}`)
            .then(response => response.json())
            .then(data => {
                // Aktualizacja paska postępu
                progressBar.style.width = `${data.progress}%`;
                
                // Aktualizacja informacji
                infoElement.textContent = data.status;
                
                // Jeśli skanowanie jest ukończone
                if (data.status === 'complete') {
                    // Odświeżenie listy mediów
                    loadMediaItems('all');
                    
                    // Wyświetlenie komunikatu o ukończeniu
                    infoElement.textContent = `Skanowanie zakończone. Znaleziono ${data.found_files} plików.`;
                    
                    // Włączenie przycisku skanowania
                    document.getElementById('start-scan-btn').disabled = false;
                    
                    // Zamknięcie modalu po 3 sekundach
                    setTimeout(() => {
                        document.getElementById('scan-media-modal').classList.remove('show');
                    }, 3000);
                }
                // Jeśli wystąpił błąd
                else if (data.status === 'error') {
                    infoElement.textContent = `Błąd: ${data.error}`;
                    document.getElementById('start-scan-btn').disabled = false;
                }
                // Jeśli skanowanie jest w trakcie
                else {
                    // Sprawdź ponownie za 1 sekundę
                    setTimeout(checkProgress, 1000);
                }
            })
            .catch(error => {
                console.error('Błąd:', error);
                infoElement.textContent = 'Wystąpił błąd podczas sprawdzania postępu skanowania.';
                document.getElementById('start-scan-btn').disabled = false;
            });
    }
    
    // Rozpoczęcie sprawdzania postępu
    checkProgress();
}

/**
 * Inicjalizacja odtwarzacza mediów
 */
function initMediaPlayer() {
    // Inicjalizacja kontrolek odtwarzacza
    const playerPlay = document.getElementById('player-play');
    const playerPrev = document.getElementById('player-prev');
    const playerNext = document.getElementById('player-next');
    const playerVolume = document.getElementById('player-volume');
    const playerFullscreen = document.getElementById('player-fullscreen');
    const progressBar = document.getElementById('player-progress-bar');
    const currentTimeElement = document.getElementById('player-current-time');
    const totalTimeElement = document.getElementById('player-total-time');
    
    // Zmienna przechowująca aktualnie odtwarzany element
    let currentMediaId = null;
    let currentMediaType = null;
    let isPlaying = false;
    let player = null;
    
    // Obsługa przycisku odtwarzania/pauzy
    playerPlay.addEventListener('click', function() {
        if (!currentMediaId) return;
        
        if (isPlaying) {
            pauseMedia();
        } else {
            resumeMedia();
        }
    });
    
    // Obsługa przycisku poprzedniego elementu
    playerPrev.addEventListener('click', function() {
        // Logika przejścia do poprzedniego elementu
        // To wymaga implementacji playlisty
    });
    
    // Obsługa przycisku następnego elementu
    playerNext.addEventListener('click', function() {
        // Logika przejścia do następnego elementu
        // To wymaga implementacji playlisty
    });
    
    // Obsługa przycisku głośności
    playerVolume.addEventListener('click', function() {
        if (player && player.muted) {
            player.muted = false;
            playerVolume.textContent = '🔊';
        } else if (player) {
            player.muted = true;
            playerVolume.textContent = '🔇';
        }
    });
    
    // Obsługa przycisku pełnego ekranu
    playerFullscreen.addEventListener('click', function() {
        if (player && currentMediaType === 'video') {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                player.requestFullscreen();
            }
        }
    });
    
    // Funkcja odtwarzania mediów
    window.playMedia = function(mediaId, mediaType) {
        currentMediaId = mediaId;
        currentMediaType = mediaType;
        
        const playerContainer = document.getElementById('player-container');
        
        // Wyczyść kontener odtwarzacza
        playerContainer.innerHTML = '';
        
        // Utwórz odpowiedni element odtwarzacza
        if (mediaType === 'video') {
            player = document.createElement('video');
            player.src = `/api/media/stream/${mediaId}`;
            player.controls = false;
            player.autoplay = true;
            player.width = '100%';
            player.height = '100%';
            
            // Obsługa zakończenia odtwarzania
            player.onended = function() {
                isPlaying = false;
                playerPlay.textContent = '▶️';
            };
            
            // Obsługa aktualizacji czasu
            player.ontimeupdate = function() {
                updatePlayerTime(player.currentTime, player.duration);
                updateProgressBar(player.currentTime, player.duration);
            };
            
            // Dodanie do kontenera
            playerContainer.appendChild(player);
            
            // Aktualizacja stanu
            isPlaying = true;
            playerPlay.textContent = '⏸';
            
            // Przewinięcie do odtwarzacza
            document.getElementById('media-player').scrollIntoView({ behavior: 'smooth' });
            
        } else if (mediaType === 'audio') {
            player = document.createElement('audio');
            player.src = `/api/media/stream/${mediaId}`;
            player.controls = false;
            player.autoplay = true;
            
            // Obsługa zakończenia odtwarzania
            player.onended = function() {
                isPlaying = false;
                playerPlay.textContent = '▶️';
            };
            
            // Obsługa aktualizacji czasu
            player.ontimeupdate = function() {
                updatePlayerTime(player.currentTime, player.duration);
                updateProgressBar(player.currentTime, player.duration);
            };
            
            // Dodanie do kontenera
            playerContainer.appendChild(player);
            
            // Dodanie wizualizacji audio (opcjonalnie)
            const visualizer = document.createElement('div');
            visualizer.className = 'audio-visualizer';
            playerContainer.appendChild(visualizer);
            
            // Aktualizacja stanu
            isPlaying = true;
            playerPlay.textContent = '⏸';
            
            // Przewinięcie do odtwarzacza
            document.getElementById('media-player').scrollIntoView({ behavior: 'smooth' });
            
        } else if (mediaType === 'image') {
            player = document.createElement('img');
            player.src = `/api/media/stream/${mediaId}`;
            player.alt = 'Image preview';
            player.style.maxWidth = '100%';
            player.style.maxHeight = '100%';
            player.style.objectFit = 'contain';
            
            // Dodanie do kontenera
            playerContainer.appendChild(player);
            
            // Aktualizacja stanu (dla obrazów nie ma odtwarzania)
            isPlaying = false;
            playerPlay.textContent = '▶️';
            playerPlay.disabled = true;
            
            // Przewinięcie do odtwarzacza
            document.getElementById('media-player').scrollIntoView({ behavior: 'smooth' });
        }
    };
    
    // Funkcja pauzowania mediów
    function pauseMedia() {
        if (player && (currentMediaType === 'video' || currentMediaType === 'audio')) {
            player.pause();
            isPlaying = false;
            playerPlay.textContent = '▶️';
        }
    }
    
    // Funkcja wznawiania odtwarzania
    function resumeMedia() {
        if (player && (currentMediaType === 'video' || currentMediaType === 'audio')) {
            player.play();
            isPlaying = true;
            playerPlay.textContent = '⏸';
        }
    }
    
    // Funkcja aktualizacji wyświetlanego czasu
    function updatePlayerTime(currentTime, duration) {
        currentTimeElement.textContent = formatPlayerTime(currentTime);
        totalTimeElement.textContent = formatPlayerTime(duration);
    }
    
    // Funkcja aktualizacji paska postępu
    function updateProgressBar(currentTime, duration) {
        if (duration) {
            const percentage = (currentTime / duration) * 100;
            progressBar.style.width = `${percentage}%`;
        } else {
            progressBar.style.width = '0%';
        }
    }
    
    // Funkcja formatowania czasu odtwarzacza
    function formatPlayerTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        
        seconds = Math.floor(seconds);
        const minutes = Math.floor(seconds / 60);
        seconds = seconds % 60;
        
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // Obsługa kliknięcia w pasek postępu
    document.querySelector('.player-progress').addEventListener('click', function(e) {
        if (!player || !player.duration) return;
        
        const rect = this.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const percentage = offsetX / rect.width;
        
        // Ustaw nowy czas odtwarzania
        player.currentTime = percentage * player.duration;
    });
}

/**
 * Ładowanie playlist
 */
function loadPlaylists() {
    fetch('/api/media/playlists')
        .then(response => {
            if (!response.ok) {
                throw new Error('Błąd pobierania playlist');
            }
            return response.json();
        })
        .then(data => {
            const playlistsList = document.getElementById('playlists-list');
            playlistsList.innerHTML = '';
            
            if (data.length === 0) {
                playlistsList.innerHTML = '<li class="no-playlists">Brak playlist</li>';
                return;
            }
            
            // Dodaj playlisty do listy
            data.forEach(playlist => {
                const listItem = document.createElement('li');
                listItem.innerHTML = `
                    <a href="#" data-playlist-id="${playlist.id}">${playlist.name}</a>
                `;
                
                // Obsługa kliknięcia playlisty
                listItem.querySelector('a').addEventListener('click', function(e) {
                    e.preventDefault();
                    loadPlaylistItems(playlist.id);
                });
                
                playlistsList.appendChild(listItem);
            });
        })
        .catch(error => {
            console.error('Błąd:', error);
            const playlistsList = document.getElementById('playlists-list');
            playlistsList.innerHTML = '<li class="error-message">Błąd ładowania playlist</li>';
        });
}

/**
 * Ładowanie elementów playlisty
 */
function loadPlaylistItems(playlistId) {
    fetch(`/api/media/playlists/${playlistId}/items`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Błąd pobierania elementów playlisty');
            }
            return response.json();
        })
        .then(data => {
            // Ładowanie elementów playlisty do siatki mediów
            const mediaGrid = document.getElementById('media-items-grid');
            mediaGrid.innerHTML = '';
            
            if (data.length === 0) {
                mediaGrid.innerHTML = '<div class="no-media-message">Ta playlista jest pusta</div>';
                return;
            }
            
            // Dodanie elementów playlisty do siatki
            data.forEach(item => {
                const mediaElement = createMediaElement(item);
                mediaGrid.appendChild(mediaElement);
            });
        })
        .catch(error => {
            console.error('Błąd:', error);
            const mediaGrid = document.getElementById('media-items-grid');
            mediaGrid.innerHTML = '<div class="error-message">Błąd ładowania elementów playlisty</div>';
        });
}

/**
 * Aktualizacja paginacji
 */
function updatePagination(currentPage, totalPages, mediaType) {
    const paginationElement = document.getElementById('media-pagination');
    paginationElement.innerHTML = '';
    
    if (totalPages <= 1) {
        return;
    }
    
    // Dodanie przycisków paginacji
    for (let i = 1; i <= totalPages; i++) {
        const pageButton = document.createElement('button');
        pageButton.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
        pageButton.textContent = i;
        
        // Obsługa kliknięcia przycisku strony
        pageButton.addEventListener('click', function() {
            loadMediaItems(mediaType, i);
        });
        
        paginationElement.appendChild(pageButton);
    }
}

/**
 * Inicjalizacja modalu playlisty
 */
function initPlaylistModal() {
    const modal = document.getElementById('playlist-modal');
    if (!modal) return;
    
    // Przyciski zamykania
    document.getElementById('close-playlist-modal').addEventListener('click', () => {
        modal.classList.remove('show');
    });
    
    document.getElementById('cancel-playlist-btn').addEventListener('click', () => {
        modal.classList.remove('show');
    });
    
    // Przycisk zapisania playlisty
    document.getElementById('save-playlist-btn').addEventListener('click', savePlaylist);
    
    // Zamykanie modalu po kliknięciu poza zawartością
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
    
    // Obsługa klawisza Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            modal.classList.remove('show');
        }
    });
}

/**
 * Pokazanie modalu tworzenia playlisty
 */
function showPlaylistModal() {
    const modal = document.getElementById('playlist-modal');
    modal.classList.add('show');
    
    // Zresetowanie formularza
    document.getElementById('playlist-name').value = '';
    document.getElementById('playlist-items').innerHTML = '';
}

/**
 * Zapisanie playlisty
 */
function savePlaylist() {
    const playlistName = document.getElementById('playlist-name').value.trim();
    
    if (!playlistName) {
        alert('Podaj nazwę playlisty');
        return;
    }
    
    // Pobranie elementów playlisty
    const playlistItems = [];
    document.querySelectorAll('#playlist-items .playlist-item').forEach((item, index) => {
        playlistItems.push({
            media_id: parseInt(item.dataset.id),
            position: index + 1
        });
    });
    
    if (playlistItems.length === 0) {
        alert('Dodaj elementy do playlisty');
        return;
    }
    
    // Zapisanie playlisty
    fetch('/api/media/playlists', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: playlistName,
            items: playlistItems
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Błąd zapisywania playlisty');
        }
        return response.json();
    })
    .then(data => {
        // Zamknięcie modalu
        document.getElementById('playlist-modal').classList.remove('show');
        
        // Odświeżenie listy playlist
        loadPlaylists();
        
        // Wyświetlenie komunikatu o sukcesie
        alert('Playlista została zapisana');
    })
    .catch(error => {
        console.error('Błąd:', error);
        alert('Wystąpił błąd podczas zapisywania playlisty');
    });
}

/**
 * Inicjalizacja obsługi wyszukiwania
 */
document.getElementById('media-search-input').addEventListener('input', function() {
    const searchTerm = this.value.trim();
    if (searchTerm.length >= 3) {
        // Wykonaj wyszukiwanie po wprowadzeniu co najmniej 3 znaków
        searchMedia(searchTerm);
    } else if (searchTerm.length === 0) {
        // Jeśli pole wyszukiwania jest puste, pokaż wszystkie media
        loadMediaItems('all');
    }
});

/**
 * Wyszukiwanie mediów
 */
function searchMedia(query) {
    fetch(`/api/media/search?q=${encodeURIComponent(query)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Błąd wyszukiwania mediów');
            }
            return response.json();
        })
        .then(data => {
            // Aktualizacja siatki mediów
            const mediaGrid = document.getElementById('media-items-grid');
            mediaGrid.innerHTML = '';
            
            if (data.length === 0) {
                mediaGrid.innerHTML = `<div class="no-media-message">Nie znaleziono mediów dla zapytania "${query}"</div>`;
                return;
            }
            
            // Dodanie znalezionych elementów do siatki
            data.forEach(item => {
                const mediaElement = createMediaElement(item);
                mediaGrid.appendChild(mediaElement);
            });
        })
        .catch(error => {
            console.error('Błąd:', error);
            const mediaGrid = document.getElementById('media-items-grid');
            mediaGrid.innerHTML = '<div class="error-message">Wystąpił błąd podczas wyszukiwania mediów</div>';
        });
}