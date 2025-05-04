/**
 * Improved file_sharing.js with file preview functionality
 */

document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const fileList = document.getElementById('file-list-body');
    const uploadModal = document.getElementById('upload-modal');
    const createFolderModal = document.getElementById('create-folder-modal');
    const uploadFileBtn = document.getElementById('upload-file-btn');
    const createFolderBtn = document.getElementById('create-folder-btn');
    const uploadForm = document.getElementById('upload-form');
    const createFolderForm = document.getElementById('create-folder-form');
    const currentPathDisplay = document.getElementById('current-path');

    // Current directory path - IMPORTANT FIX: Starting with path that works with backend
    let currentPath = 'HomeHubShared';

    // Modal do podglądu plików
    let previewModal = null;

    // Initialize file browser
    initializeFileBrowser();

    // Helper Functions
    function closeModal(modal) {
        modal.classList.remove('show');
    }

    function showModal(modal) {
        modal.classList.add('show');
    }

    function showLoading() {
        // Add loading indicator to file list
        fileList.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;"><div class="loading-indicator"></div><p>Ładowanie...</p></td></tr>';
    }

    function showSuccess(message) {
        const alert = document.createElement('div');
        alert.className = 'alert alert-success';
        alert.textContent = message;
        
        const content = document.querySelector('.content');
        content.insertBefore(alert, content.firstChild);
        
        setTimeout(() => {
            alert.remove();
        }, 3000);
    }

    function showError(message) {
        const alert = document.createElement('div');
        alert.className = 'alert alert-error';
        alert.textContent = message;
        
        const content = document.querySelector('.content');
        content.insertBefore(alert, content.firstChild);
        
        setTimeout(() => {
            alert.remove();
        }, 3000);
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Initialize file browser
    function initializeFileBrowser() {
        // Initialize modals
        initModals();
        
        // Initialize preview modal
        initPreviewModal();
        
        // Set up event listeners
        uploadFileBtn.addEventListener('click', () => showModal(uploadModal));
        createFolderBtn.addEventListener('click', () => showModal(createFolderModal));
        
        // Set up form handlers
        setupForms();
        
        // Load files
        loadFiles(currentPath);
        
        // Add style for preview
        addPreviewStyles();
    }

    // Initialize modals
    function initModals() {
        // Upload modal
        const closeUploadModal = document.getElementById('close-upload-modal');
        const cancelUploadBtn = document.getElementById('cancel-upload-btn');
        
        closeUploadModal.addEventListener('click', () => closeModal(uploadModal));
        cancelUploadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal(uploadModal);
        });
        
        // Create folder modal
        const closeFolderModal = document.getElementById('close-folder-modal');
        const cancelFolderBtn = document.getElementById('cancel-folder-btn');
        
        closeFolderModal.addEventListener('click', () => closeModal(createFolderModal));
        cancelFolderBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal(createFolderModal);
        });
        
        // Close modals when clicking outside or pressing Escape
        window.addEventListener('click', (e) => {
            if (e.target === uploadModal) closeModal(uploadModal);
            if (e.target === createFolderModal) closeModal(createFolderModal);
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal(uploadModal);
                closeModal(createFolderModal);
            }
        });
    }

    // Inicjalizacja modalu podglądu plików
    function initPreviewModal() {
        // Sprawdź czy modal już istnieje
        if (document.getElementById('preview-modal')) {
            previewModal = document.getElementById('preview-modal');
            return;
        }
        
        // Utwórz modal
        const modal = document.createElement('div');
        modal.id = 'preview-modal';
        modal.className = 'modal';
        
        // Zawartość modalu
        modal.innerHTML = `
            <div class="modal-content preview-modal-content">
                <div class="modal-header">
                    <h2 id="preview-title">Podgląd pliku</h2>
                    <button class="close" id="close-preview-modal">&times;</button>
                </div>
                <div class="modal-body" id="preview-body">
                    <div class="preview-container" id="preview-container">
                        <!-- Tu będzie wyświetlany podgląd pliku -->
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="download-file-btn" class="btn btn-primary">Pobierz</button>
                    <button id="close-preview-btn" class="btn btn-danger">Zamknij</button>
                </div>
            </div>
        `;
        
        // Dodaj modal do DOM
        document.body.appendChild(modal);
        previewModal = modal;
        
        // Obsługa zamykania
        const closeBtn = document.getElementById('close-preview-modal');
        const cancelBtn = document.getElementById('close-preview-btn');
        const downloadBtn = document.getElementById('download-file-btn');
        
        closeBtn.addEventListener('click', closePreviewModal);
        cancelBtn.addEventListener('click', closePreviewModal);
        
        // Obsługa pobierania pliku
        downloadBtn.addEventListener('click', function() {
            const path = this.dataset.path;
            if (path) {
                downloadFile(path);
            }
        });
        
        // Zamykanie modalu po kliknięciu poza zawartością
        window.addEventListener('click', function(e) {
            if (e.target === previewModal) {
                closePreviewModal();
            }
        });
        
        // Zamykanie modalu po naciśnięciu Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && previewModal.classList.contains('show')) {
                closePreviewModal();
            }
        });
    }

    // Zamykanie modalu podglądu
    function closePreviewModal() {
        if (previewModal) {
            previewModal.classList.remove('show');
            // Wyczyść zawartość kontenera
            const container = document.getElementById('preview-container');
            if (container) {
                container.innerHTML = '';
            }
        }
    }

    // Set up form handlers
    function setupForms() {
        // Upload form
        uploadForm.addEventListener('submit', handleFileUpload);
        
        // Create folder form
        createFolderForm.addEventListener('submit', handleCreateFolder);
    }

    // Load files from server - with better path handling
    async function loadFiles(path) {
        console.log('Loading files from path:', path);
        
        // If path is empty, use the default path
        if (!path) {
            path = currentPath;
        }
        
        // Update current path
        currentPath = path;
        
        // Update path display if available
        if (currentPathDisplay) {
            currentPathDisplay.textContent = currentPath;
        }
        
        // Show loading indicator
        showLoading();
        
        try {
            // Fetch files from server - properly encoding the path
            let url = `/api/files/list`;
            if (path) {
                url += `?path=${encodeURIComponent(path)}`;
            }
            
            console.log('Fetching URL:', url);
            const response = await fetch(url);
            
            // Handle non-OK response
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to load files');
            }
            
            // Parse response
            const files = await response.json();
            console.log('Files loaded:', files);
            
            // Clear file list
            fileList.innerHTML = '';
            
            // Add parent directory button if not in root
            if (path !== 'HomeHubShared') {
                let parentDir = path.split('/').slice(0, -1).join('/');
                if (!parentDir) parentDir = 'HomeHubShared';
                
                const parentRow = document.createElement('tr');
                parentRow.classList.add('parent-directory');
                parentRow.innerHTML = `
                    <td colspan="4">
                        <button class="btn btn-link parent-dir-btn" data-path="${parentDir}">
                            <i class="icon">📁</i> Powrót
                        </button>
                    </td>
                `;
                fileList.appendChild(parentRow);
                
                // Add event listener
                parentRow.querySelector('.parent-dir-btn').addEventListener('click', function() {
                    loadFiles(this.dataset.path);
                });
            }
            
            // Add files to list
            if (files.length === 0) {
                // Show empty message
                const emptyRow = document.createElement('tr');
                emptyRow.innerHTML = `
                    <td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-light);">
                        Ten folder jest pusty
                    </td>
                `;
                fileList.appendChild(emptyRow);
            } else {
                // Add files and folders
                files.forEach(file => {
                    const row = document.createElement('tr');
                    
                    // Icon and name
                    const nameCell = document.createElement('td');
                    const icon = file.is_dir ? '📁' : getFileIcon(file.name);
                    nameCell.innerHTML = `<span class="${file.is_dir ? 'directory-name' : 'file-name'}">${icon} ${file.name}</span>`;
                    
                    // Add click handler for directories or files
                    if (file.is_dir) {
                        nameCell.querySelector('.directory-name').style.cursor = 'pointer';
                        nameCell.querySelector('.directory-name').addEventListener('click', () => {
                            loadFiles(file.path);
                        });
                    } else {
                        // Dla plików, dodaj możliwość podglądu
                        nameCell.querySelector('.file-name').style.cursor = 'pointer';
                        nameCell.querySelector('.file-name').title = 'Kliknij, aby podejrzeć plik';
                        nameCell.querySelector('.file-name').addEventListener('click', () => {
                            openFilePreview(file.path, file.name);
                        });
                    }
                    
                    // Size
                    const sizeCell = document.createElement('td');
                    sizeCell.textContent = file.is_dir ? '-' : formatFileSize(file.size);
                    
                    // Modified date
                    const dateCell = document.createElement('td');
                    dateCell.textContent = new Date(file.modified).toLocaleString();
                    
                    // Actions
                    const actionsCell = document.createElement('td');
                    actionsCell.innerHTML = `
                        <div class="file-actions-btn">
                            ${!file.is_dir ? `
                            <button class="btn btn-primary btn-sm download-btn" data-path="${file.path}">
                                Pobierz
                            </button>
                            ` : ''}
                            <button class="btn btn-danger btn-sm delete-btn" data-path="${file.path}">
                                Usuń
                            </button>
                        </div>
                    `;
                    
                    // Add cells to row
                    row.appendChild(nameCell);
                    row.appendChild(sizeCell);
                    row.appendChild(dateCell);
                    row.appendChild(actionsCell);
                    
                    // Add row to table
                    fileList.appendChild(row);
                });
                
                // Add event listeners for file actions
                attachFileActions();
            }
        } catch (error) {
            console.error('Error loading files:', error);
            showError('Nie udało się załadować plików: ' + error.message);
            
            // Show error message in file list
            fileList.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; padding: 2rem; color: var(--error-color);">
                        Wystąpił błąd podczas ładowania plików<br>
                        <button class="btn btn-primary btn-sm retry-btn" style="margin-top: 1rem;">Spróbuj ponownie</button>
                    </td>
                </tr>
            `;
            
            // Add event listener for retry button
            fileList.querySelector('.retry-btn').addEventListener('click', () => {
                loadFiles(currentPath);
            });
        }
    }
    
    // Get icon for file based on extension
    function getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        
        // Map extensions to icons
        const iconMap = {
            // Documents
            'pdf': '📄',
            'doc': '📝',
            'docx': '📝',
            'txt': '📄',
            'rtf': '📄',
            'odt': '📝',
            
            // Spreadsheets
            'xls': '📊',
            'xlsx': '📊',
            'csv': '📊',
            'ods': '📊',
            
            // Presentations
            'ppt': '📊',
            'pptx': '📊',
            'odp': '📊',
            
            // Images
            'jpg': '🖼️',
            'jpeg': '🖼️',
            'png': '🖼️',
            'gif': '🖼️',
            'bmp': '🖼️',
            'svg': '🖼️',
            
            // Audio
            'mp3': '🎵',
            'wav': '🎵',
            'ogg': '🎵',
            'flac': '🎵',
            
            // Video
            'mp4': '🎬',
            'avi': '🎬',
            'mkv': '🎬',
            'mov': '🎬',
            'wmv': '🎬',
            
            // Archives
            'zip': '🗄️',
            'rar': '🗄️',
            'tar': '🗄️',
            'gz': '🗄️',
            '7z': '🗄️',
            
            // Code
            'html': '💻',
            'css': '💻',
            'js': '💻',
            'php': '💻',
            'py': '💻',
            'java': '💻',
            'c': '💻',
            'cpp': '💻',
            'h': '💻',
            'sh': '💻',
            'json': '💻',
            'xml': '💻',
        };
        
        return iconMap[ext] || '📄'; // Default to generic document icon
    }
    
    // Funkcja określająca kategorię pliku na podstawie rozszerzenia
    function getFileCategoryByExt(ext) {
        // Kategorie plików
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'];
        const textExts = ['txt', 'md', 'html', 'xml', 'json', 'csv', 'py', 'js', 'css', 'c', 'cpp', 'h', 'java', 'php', 'log'];
        const pdfExts = ['pdf'];
        const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
        const videoExts = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'webm'];
        
        if (imageExts.includes(ext)) {
            return 'image';
        } else if (textExts.includes(ext)) {
            return 'text';
        } else if (pdfExts.includes(ext)) {
            return 'pdf';
        } else if (audioExts.includes(ext)) {
            return 'audio';
        } else if (videoExts.includes(ext)) {
            return 'video';
        } else {
            return 'other';
        }
    }
    
    // Funkcja do otwierania podglądu pliku
    async function openFilePreview(path, filename) {
        console.log('Opening preview for:', path);
        
        // Pokaż tytuł z nazwą pliku
        document.getElementById('preview-title').textContent = 'Podgląd: ' + filename;
        
        // Ustaw ścieżkę dla przycisku pobierania
        document.getElementById('download-file-btn').dataset.path = path;
        
        // Kontener podglądu
        const container = document.getElementById('preview-container');
        container.innerHTML = '<div class="loading-indicator"></div><p>Ładowanie podglądu...</p>';
        
        // Pokaż modal
        previewModal.classList.add('show');
        
        try {
            // Pobierz rozszerzenie pliku
            const ext = filename.split('.').pop().toLowerCase();
            
            // Sprawdź kategorię pliku na podstawie rozszerzenia
            const fileCategory = getFileCategoryByExt(ext);
            
            // W zależności od kategorii, wyświetl odpowiedni podgląd
            if (fileCategory === 'image') {
                // Dla obrazów, użyj tagu <img>
                showImagePreview(path, container);
            } else if (fileCategory === 'text') {
                // Dla plików tekstowych, pobierz zawartość z serwera
                showTextPreview(path, container);
            } else if (fileCategory === 'pdf') {
                // Dla PDF, użyj tagu <iframe> lub <object>
                showPdfPreview(path, container);
            } else if (fileCategory === 'audio') {
                // Dla audio, użyj tagu <audio>
                showAudioPreview(path, container);
            } else if (fileCategory === 'video') {
                // Dla wideo, użyj tagu <video>
                showVideoPreview(path, container);
            } else {
                // Dla innych typów, pokaż komunikat, że podgląd nie jest obsługiwany
                container.innerHTML = `
                    <div class="preview-unsupported">
                        <div class="preview-icon">📄</div>
                        <h3>Podgląd nie jest obsługiwany</h3>
                        <p>Ten typ pliku (${ext}) nie może być wyświetlony w przeglądarce.</p>
                        <p>Możesz pobrać ten plik, aby go otworzyć lokalnie.</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error opening file preview:', error);
            container.innerHTML = `
                <div class="preview-error">
                    <div class="preview-icon">⚠️</div>
                    <h3>Błąd podglądu</h3>
                    <p>${error.message || 'Nie udało się wczytać podglądu pliku.'}</p>
                </div>
            `;
        }
    }
    
    // Funkcje do wyświetlania różnych typów plików
    
    // Podgląd obrazu
    function showImagePreview(path, container) {
        const url = `/api/files/preview?path=${encodeURIComponent(path)}`;
        container.innerHTML = `
            <div class="image-preview">
                <img src="${url}" alt="Podgląd obrazu" />
            </div>
        `;
    }
    
    // Podgląd tekstu
    async function showTextPreview(path, container) {
        try {
            const response = await fetch(`/api/files/preview?path=${encodeURIComponent(path)}`);
            
            if (!response.ok) {
                throw new Error('Nie udało się pobrać zawartości pliku');
            }
            
            const data = await response.json();
            
            if (data.type === 'text') {
                // Przygotuj zawartość z zachowaniem formatowania i zawijaniem linii
                const content = data.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                container.innerHTML = `
                    <div class="text-preview">
                        <pre>${content}</pre>
                    </div>
                `;
            } else {
                throw new Error('Ten plik nie jest plikiem tekstowym');
            }
        } catch (error) {
            console.error('Error showing text preview:', error);
            container.innerHTML = `
                <div class="preview-error">
                    <div class="preview-icon">⚠️</div>
                    <h3>Błąd podglądu</h3>
                    <p>${error.message || 'Nie udało się wczytać podglądu pliku tekstowego.'}</p>
                </div>
            `;
        }
    }
    
    // Podgląd PDF
    function showPdfPreview(path, container) {
        const url = `/api/files/preview?path=${encodeURIComponent(path)}`;
        container.innerHTML = `
            <div class="pdf-preview">
                <iframe src="${url}" width="100%" height="500px" frameborder="0"></iframe>
            </div>
        `;
    }
    
    // Podgląd audio
    function showAudioPreview(path, container) {
        const url = `/api/files/preview?path=${encodeURIComponent(path)}`;
        container.innerHTML = `
            <div class="audio-preview">
                <audio controls>
                    <source src="${url}" type="audio/mpeg">
                    Twoja przeglądarka nie obsługuje tagu audio.
                </audio>
            </div>
        `;
    }
    
    // Podgląd wideo
    function showVideoPreview(path, container) {
        const url = `/api/files/preview?path=${encodeURIComponent(path)}`;
        container.innerHTML = `
            <div class="video-preview">
                <video controls width="100%">
                    <source src="${url}" type="video/mp4">
                    Twoja przeglądarka nie obsługuje tagu video.
                </video>
            </div>
        `;
    }
    
    // Attach action handlers to file buttons
    function attachFileActions() {
        // Download buttons
        document.querySelectorAll('.download-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const path = this.dataset.path;
                downloadFile(path);
            });
        });

        // Delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const path = this.dataset.path;
                console.log('Deleting file/folder:', path);
                
                // Confirm deletion
                if (!confirm('Czy na pewno chcesz usunąć ten plik/folder?')) {
                    return;
                }
                
                try {
                    // Send delete request
                    const response = await fetch('/api/files/delete', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ path })
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Failed to delete file/folder');
                    }
                    
                    // Show success message
                    showSuccess('Plik/folder został usunięty');
                    
                    // Reload file list
                    loadFiles(currentPath);
                } catch (error) {
                    console.error('Error deleting file/folder:', error);
                    showError('Nie udało się usunąć pliku/folderu: ' + error.message);
                }
            });
        });
    }
    
    // Funkcja do pobierania pliku
    function downloadFile(path) {
        console.log('Downloading file:', path);
        
        try {
            // Utwórz ukryty element <a>
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = `/api/files/download?path=${encodeURIComponent(path)}`;
            a.download = path.split('/').pop();
            
            // Dodaj do DOM, kliknij i usuń
            document.body.appendChild(a);
            a.click();
            
            // Małe opóźnienie przed usunięciem, aby upewnić się, że pobieranie się rozpoczęło
            setTimeout(() => {
                document.body.removeChild(a);
            }, 100);
        } catch (error) {
            console.error('Error downloading file:', error);
            showError('Nie udało się pobrać pliku');
        }
    }
    
    // Handle file upload - with improved path handling
    async function handleFileUpload(e) {
        e.preventDefault();
        
        const fileInput = document.getElementById('file-input');
        const file = fileInput.files[0];
        
        if (!file) {
            showError('Wybierz plik do przesłania');
            return;
        }
        
        console.log('Uploading file:', file.name, 'to path:', currentPath);
        
        // Create form data
        const formData = new FormData();
        formData.append('file', file);
        
        // Show loading message
        const uploadBtn = uploadForm.querySelector('button[type="submit"]');
        const originalText = uploadBtn.textContent;
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Przesyłanie...';
        
        try {
            // Build the URL with proper path encoding
            let uploadUrl = '/api/files/upload';
            if (currentPath) {
                uploadUrl += `?path=${encodeURIComponent(currentPath)}`;
            }
            
            console.log('Upload URL:', uploadUrl);
            
            // Send upload request
            const response = await fetch(uploadUrl, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to upload file');
            }
            
            // Parse response
            const data = await response.json();
            console.log('Upload response:', data);
            
            // Show success message
            showSuccess(data.message || 'Plik został przesłany');
            
            // Reset form and close modal
            fileInput.value = '';
            closeModal(uploadModal);
            
            // Reload file list
            loadFiles(currentPath);
        } catch (error) {
            console.error('Error uploading file:', error);
            showError('Nie udało się przesłać pliku: ' + error.message);
        } finally {
            // Reset button
            uploadBtn.disabled = false;
            uploadBtn.textContent = originalText;
        }
    }
    
    // Handle folder creation - with improved path handling
    async function handleCreateFolder(e) {
        e.preventDefault();
        
        const folderNameInput = document.getElementById('folder-name');
        const folderName = folderNameInput.value.trim();
        
        if (!folderName) {
            showError('Podaj nazwę folderu');
            return;
        }
        
        console.log('Creating folder:', folderName, 'in path:', currentPath);
        
        // Show loading message
        const createBtn = createFolderForm.querySelector('button[type="submit"]');
        const originalText = createBtn.textContent;
        createBtn.disabled = true;
        createBtn.textContent = 'Tworzenie...';
        
        try {
            // Build the URL with proper path encoding
            let folderUrl = '/api/files/create-folder';
            if (currentPath) {
                folderUrl += `?path=${encodeURIComponent(currentPath)}`;
            }
            
            console.log('Create folder URL:', folderUrl);
            
            // Send create folder request
            const response = await fetch(folderUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: folderName })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create folder');
            }
            
            // Parse response
            const data = await response.json();
            console.log('Create folder response:', data);
            
            // Show success message
            showSuccess(data.message || 'Folder został utworzony');
            
            // Reset form and close modal
            folderNameInput.value = '';
            closeModal(createFolderModal);
            
            // Reload file list
            loadFiles(currentPath);
        } catch (error) {
            console.error('Error creating folder:', error);
            showError('Nie udało się utworzyć folderu: ' + error.message);
        } finally {
            // Reset button
            createBtn.disabled = false;
            createBtn.textContent = originalText;
        }
    }
    
    // Add style for preview
    function addPreviewStyles() {
        // Sprawdź czy style już istnieją
        if (document.getElementById('preview-styles')) {
            return;
        }
        
        // Utwórz element <style>
        const style = document.createElement('style');
        style.id = 'preview-styles';
        style.textContent = `
            .preview-modal-content {
                max-width: 90%;
                width: 800px;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
            }
            
            #preview-body {
                flex: 1;
                overflow: auto;
                padding: 0;
            }
            
            .preview-container {
                height: 100%;
                min-height: 300px;
                display: flex;
                justify-content: center;
                align-items: center;
                overflow: auto;
            }
            
            .image-preview {
                text-align: center;
                max-height: 100%;
                overflow: auto;
            }
            
            .image-preview img {
                max-width: 100%;
                height: auto;
                object-fit: contain;
            }
            
            .text-preview {
                width: 100%;
                height: 100%;
                overflow: auto;
                padding: 1rem;
                background-color: var(--card-bg);
                border-radius: 4px;
            }
            
            .text-preview pre {
                white-space: pre-wrap;
                word-wrap: break-word;
                font-family: monospace;
                margin: 0;
                padding: 0;
            }
            
            .pdf-preview, .video-preview {
                width: 100%;
                height: 100%;
                min-height: 500px;
            }
            
            .audio-preview {
                width: 100%;
                padding: 2rem;
                text-align: center;
            }
            
            .audio-preview audio {
                width: 100%;
                max-width: 400px;
            }
            
            .preview-unsupported, .preview-error {
                text-align: center;
                padding: 2rem;
                color: var(--text-color);
            }
            
            .preview-icon {
                font-size: 3rem;
                margin-bottom: 1rem;
            }
            
            .preview-error .preview-icon {
                color: var(--error-color);
            }
        `;
        
        // Dodaj style do <head>
        document.head.appendChild(style);
    }
 });