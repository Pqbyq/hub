from flask import Blueprint, request, jsonify, render_template, current_app, send_file, abort, g, send_from_directory
from werkzeug.utils import secure_filename
import os
import uuid
from datetime import datetime, timedelta
import mimetypes
import hashlib
import shutil

# Function to import get_db without circular imports
def get_db():
    from app import get_db as app_get_db
    return app_get_db()

# Function to import decorators without circular imports
def login_required(f):
    from auth_helpers import login_required as auth_login_required
    return auth_login_required(f)

# Create blueprint for file sharing
file_sharing_bp = Blueprint('file_sharing', __name__)

# Base directory for shared files - Using a directory in the application folder
BASE_SHARE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'HomeHubShared')
os.makedirs(BASE_SHARE_DIR, exist_ok=True)

def generate_secure_link():
    """Generate a secure, unique link for sharing"""
    return hashlib.sha256(str(uuid.uuid4()).encode()).hexdigest()[:16]

def init_file_sharing_tables():
    """Initialize tables for file sharing"""
    try:
        db = get_db()
        # Create shared_files table if not exists
        db.execute('''
            CREATE TABLE IF NOT EXISTS shared_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                file_path TEXT NOT NULL,
                filename TEXT NOT NULL,
                file_size INTEGER DEFAULT 0,
                is_directory BOOLEAN DEFAULT 0,
                shared_link TEXT UNIQUE,
                link_expiration DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_accessed DATETIME,
                access_count INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        db.commit()
        current_app.logger.info("File sharing tables initialized successfully")
        return True
    except Exception as e:
        current_app.logger.error(f"Error initializing file sharing tables: {str(e)}")
        return False

def ensure_dir_exists():
    """Ensure the shared directory exists and is writable"""
    try:
        os.makedirs(BASE_SHARE_DIR, exist_ok=True)
        # Make sure the directory is writeable
        test_file = os.path.join(BASE_SHARE_DIR, '.test_write')
        with open(test_file, 'w') as f:
            f.write('test')
        os.remove(test_file)
        current_app.logger.info(f"Directory {BASE_SHARE_DIR} is writable and ready")
        return True
    except Exception as e:
        current_app.logger.error(f"Error ensuring directory exists and is writable: {str(e)}")
        return False

# This replaces the before_app_first_request decorator that was causing the error
# We'll initialize the system when the blueprint is registered with the app
@file_sharing_bp.record_once
def on_load(state):
    """Initialize file sharing system when the blueprint is registered"""
    # We need to access the app to use its logger and db functions
    app = state.app
    
    with app.app_context():
        try:
            # Ensure the directory exists - używaj os.makedirs zamiast własnej funkcji
            app.logger.info(f"Creating base directory: {BASE_SHARE_DIR}")
            os.makedirs(BASE_SHARE_DIR, exist_ok=True)
            
            # Sprawdź, czy katalog został utworzony
            if os.path.exists(BASE_SHARE_DIR):
                app.logger.info(f"Base directory exists: {BASE_SHARE_DIR}")
            else:
                app.logger.error(f"Failed to create base directory: {BASE_SHARE_DIR}")
            
            # Initialize tables
            success_db = init_file_sharing_tables()
            if not success_db:
                app.logger.error("Failed to initialize file sharing tables")
                
            if os.path.exists(BASE_SHARE_DIR) and success_db:
                app.logger.info("File sharing system initialized successfully")
        except Exception as e:
            app.logger.error(f"Error initializing file sharing system: {str(e)}")

# Route for file sharing page
@file_sharing_bp.route('/file-sharing')
@login_required
def file_sharing_page():
    """Main file sharing page"""
    # Get user theme
    db = get_db()
    settings = db.execute('SELECT theme FROM user_settings WHERE user_id = ?',
                        (g.user_id,)).fetchone()
    theme = settings['theme'] if settings else 'light'
    
    # Also attempt to initialize tables on first access to the page
    init_file_sharing_tables()
    
    return render_template('file_sharing.html', 
                        app_name=current_app.config['APP_NAME'], 
                        username=g.username,
                        role=g.role,
                        theme=theme,
                        base_dir=BASE_SHARE_DIR)

# API - list files
@file_sharing_bp.route('/api/files/list', methods=['GET'])
@login_required
def list_files():
    """List files in a specified directory"""
    # Initialize tables
    init_file_sharing_tables()
    
    path_param = request.args.get('path', '')
    
    try:
        # If path is empty or None, use the base directory
        if not path_param:
            real_path = BASE_SHARE_DIR
        else:
            # POPRAWKA: Wyciągnij tylko nazwę katalogu z ścieżki, ignorując slashe
            # i załóż ją do BASE_SHARE_DIR
            path_parts = path_param.replace('\\', '/').strip('/').split('/')
            if len(path_parts) == 1 and path_parts[0] == 'HomeHubShared':
                # Jeśli to tylko sam katalog bazowy
                real_path = BASE_SHARE_DIR
            else:
                # Jeśli to podkatalog
                subdir = '/'.join(path_parts[1:]) if path_parts[0] == 'HomeHubShared' else '/'.join(path_parts)
                real_path = os.path.join(BASE_SHARE_DIR, subdir)
        
        # Dodatkowe logi dla debugowania
        current_app.logger.info(f"Requested path: {path_param}")
        current_app.logger.info(f"Normalized path: {real_path}")
        current_app.logger.info(f"BASE_SHARE_DIR: {BASE_SHARE_DIR}")
        
        # Sprawdź, czy katalog istnieje lub utwórz go jeśli nie
        if not os.path.exists(real_path):
            current_app.logger.info(f"Creating directory: {real_path}")
            os.makedirs(real_path, exist_ok=True)
        
        # Check if the normalized path is within BASE_SHARE_DIR
        if not os.path.realpath(real_path).startswith(os.path.realpath(BASE_SHARE_DIR)):
            current_app.logger.warning(f"Attempt to access path outside shared directory: {path_param}")
            return jsonify({'error': 'Invalid path'}), 403
        
        # List files safely
        files = []
        try:
            for item in os.scandir(real_path):
                try:
                    file_info = {
                        'name': item.name,
                        'is_dir': item.is_dir(),
                        'size': item.stat().st_size if not item.is_dir() else 0,
                        'path': item.path,
                        'modified': datetime.fromtimestamp(item.stat().st_mtime).isoformat()
                    }
                    files.append(file_info)
                except PermissionError:
                    # Skip files we don't have access to
                    current_app.logger.warning(f"Permission denied for file: {item.path}")
                    continue
        except PermissionError:
            current_app.logger.error(f"Permission denied for directory: {real_path}")
            return jsonify({'error': 'Permission denied'}), 403
        
        return jsonify(sorted(files, key=lambda x: (not x['is_dir'], x['name'])))
    except Exception as e:
        current_app.logger.error(f"Error listing files: {str(e)}")
        return jsonify({'error': 'Failed to list files: ' + str(e)}), 500

# API - upload file
@file_sharing_bp.route('/api/files/upload', methods=['POST'])
@login_required
def upload_file():
    """Upload a file"""
    try:
        # Check if file was uploaded
        if 'file' not in request.files:
            current_app.logger.warning("No file part in the request")
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        
        # Check if a file was selected
        if file.filename == '':
            current_app.logger.warning("No file selected")
            return jsonify({'error': 'No file selected'}), 400
        
        # POPRAWKA: Podobna logika jak w list_files
        path_param = request.args.get('path', '')
        
        if not path_param:
            base_path = BASE_SHARE_DIR
        else:
            # Wyciągnij tylko nazwę katalogu z ścieżki, ignorując slashe
            path_parts = path_param.replace('\\', '/').strip('/').split('/')
            if len(path_parts) == 1 and path_parts[0] == 'HomeHubShared':
                # Jeśli to tylko sam katalog bazowy
                base_path = BASE_SHARE_DIR
            else:
                # Jeśli to podkatalog
                subdir = '/'.join(path_parts[1:]) if path_parts[0] == 'HomeHubShared' else '/'.join(path_parts)
                base_path = os.path.join(BASE_SHARE_DIR, subdir)
        
        # Log the paths for debugging
        current_app.logger.info(f"Requested path: {path_param}")
        current_app.logger.info(f"Normalized path: {base_path}")
        current_app.logger.info(f"BASE_SHARE_DIR: {BASE_SHARE_DIR}")
        
        # Check if the normalized path is within BASE_SHARE_DIR
        # We're intentionally being less strict here - if the path doesn't exist yet or
        # is not a subdirectory, we'll use the BASE_SHARE_DIR
        if not os.path.exists(base_path) or not os.path.realpath(base_path).startswith(os.path.realpath(BASE_SHARE_DIR)):
            current_app.logger.warning(f"Path validation failed, using base directory instead. Path: {base_path}")
            base_path = BASE_SHARE_DIR
        
        # Secure the filename
        filename = secure_filename(file.filename)
        
        # Determine destination path
        destination_path = os.path.join(base_path, filename)
        
        # Handle file already exists
        counter = 1
        filename_base, filename_ext = os.path.splitext(filename)
        while os.path.exists(destination_path):
            new_filename = f"{filename_base}_{counter}{filename_ext}"
            destination_path = os.path.join(base_path, new_filename)
            counter += 1
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(destination_path), exist_ok=True)
        
        # Save the file
        try:
            file.save(destination_path)
            current_app.logger.info(f"File saved to {destination_path}")
        except Exception as e:
            current_app.logger.error(f"Error saving file: {str(e)}")
            return jsonify({'error': 'Failed to save file: ' + str(e)}), 500
        
        # Add entry to database
        try:
            db = get_db()
            db.execute(
                'INSERT INTO shared_files (user_id, file_path, filename, file_size, is_directory) VALUES (?, ?, ?, ?, ?)',
                (g.user_id, destination_path, os.path.basename(destination_path), 
                os.path.getsize(destination_path), 0)
            )
            db.commit()
            current_app.logger.info(f"File database entry created for {destination_path}")
        except Exception as e:
            current_app.logger.error(f"Error adding file to database: {str(e)}")
            # File was saved but database entry failed
            # We'll continue anyway to return success to the user
        
        return jsonify({
            'message': 'File uploaded successfully', 
            'filename': os.path.basename(destination_path)
        }), 201
    except Exception as e:
        current_app.logger.error(f"Error uploading file: {str(e)}")
        return jsonify({'error': 'Failed to upload file: ' + str(e)}), 500

# API - create folder
@file_sharing_bp.route('/api/files/create-folder', methods=['POST'])
@login_required
def create_folder():
    """Create a new folder"""
    try:
        # Get parent path if provided
        parent_path = request.args.get('path', '')
        
        # If path is empty or None, use the base directory
        if not parent_path:
            real_parent_path = BASE_SHARE_DIR
        else:
            # POPRAWKA: Podobna logika jak wyżej
            path_parts = parent_path.replace('\\', '/').strip('/').split('/')
            if len(path_parts) == 1 and path_parts[0] == 'HomeHubShared':
                # Jeśli to tylko sam katalog bazowy
                real_parent_path = BASE_SHARE_DIR
            else:
                # Jeśli to podkatalog
                subdir = '/'.join(path_parts[1:]) if path_parts[0] == 'HomeHubShared' else '/'.join(path_parts)
                real_parent_path = os.path.join(BASE_SHARE_DIR, subdir)
        
        # Validate parent path
        if not os.path.realpath(real_parent_path).startswith(os.path.realpath(BASE_SHARE_DIR)):
            current_app.logger.warning(f"Attempt to create folder outside shared directory: {parent_path}")
            return jsonify({'error': 'Invalid parent path'}), 403
        
        # Get folder name
        if not request.is_json:
            current_app.logger.warning("Request is not JSON")
            return jsonify({'error': 'Invalid request format'}), 400
        
        folder_name = request.json.get('name')
        if not folder_name:
            current_app.logger.warning("No folder name provided")
            return jsonify({'error': 'Folder name is required'}), 400
        
        # Secure the folder name
        safe_folder_name = secure_filename(folder_name)
        
        # Determine destination path
        destination_path = os.path.join(real_parent_path, safe_folder_name)
        
        # Handle folder already exists
        counter = 1
        original_path = destination_path
        while os.path.exists(destination_path):
            destination_path = f"{original_path}_{counter}"
            counter += 1
        
        # Ensure parent directory exists
        os.makedirs(os.path.dirname(destination_path), exist_ok=True)
        
        # Create folder
        try:
            os.makedirs(destination_path, exist_ok=False)
            current_app.logger.info(f"Folder created at {destination_path}")
        except Exception as e:
            current_app.logger.error(f"Error creating folder: {str(e)}")
            return jsonify({'error': 'Failed to create folder: ' + str(e)}), 500
        
        # Add entry to database
        try:
            db = get_db()
            db.execute(
                'INSERT INTO shared_files (user_id, file_path, filename, is_directory) VALUES (?, ?, ?, ?)',
                (g.user_id, destination_path, os.path.basename(destination_path), 1)
            )
            db.commit()
            current_app.logger.info(f"Folder database entry created for {destination_path}")
        except Exception as e:
            current_app.logger.error(f"Error adding folder to database: {str(e)}")
            # Folder was created but database entry failed
            # We'll continue anyway to return success to the user
        
        return jsonify({
            'message': 'Folder created successfully', 
            'folder': os.path.basename(destination_path)
        }), 201
    except Exception as e:
        current_app.logger.error(f"Error creating folder: {str(e)}")
        return jsonify({'error': 'Failed to create folder: ' + str(e)}), 500

# API - delete file or folder
@file_sharing_bp.route('/api/files/delete', methods=['POST'])
@login_required
def delete_file():
    """Delete a file or folder"""
    try:
        # Get path
        if not request.is_json:
            current_app.logger.warning("Request is not JSON")
            return jsonify({'error': 'Invalid request format'}), 400
        
        path = request.json.get('path')
        if not path:
            current_app.logger.warning("No path provided")
            return jsonify({'error': 'Path is required'}), 400
        
        # Validate path
        real_path = os.path.normpath(path)
        real_base_dir = os.path.realpath(BASE_SHARE_DIR)
        if not os.path.realpath(real_path).startswith(real_base_dir):
            current_app.logger.warning(f"Attempt to delete file outside shared directory: {path}")
            return jsonify({'error': 'Invalid path'}), 403
        
        # Delete file or folder
        try:
            if os.path.isdir(real_path):
                shutil.rmtree(real_path)
                current_app.logger.info(f"Folder deleted: {real_path}")
            else:
                os.remove(real_path)
                current_app.logger.info(f"File deleted: {real_path}")
        except Exception as e:
            current_app.logger.error(f"Error deleting file/folder: {str(e)}")
            return jsonify({'error': 'Failed to delete file/folder: ' + str(e)}), 500
        
        # Remove entry from database
        try:
            db = get_db()
            db.execute('DELETE FROM shared_files WHERE file_path = ?', (real_path,))
            db.commit()
            current_app.logger.info(f"Database entry deleted for {real_path}")
        except Exception as e:
            current_app.logger.error(f"Error removing file from database: {str(e)}")
            # File was deleted but database entry failed
            # We'll continue anyway to return success to the user
        
        return jsonify({'message': 'File/folder deleted successfully'}), 200
    except Exception as e:
        current_app.logger.error(f"Error deleting file: {str(e)}")
        return jsonify({'error': 'Failed to delete file/folder: ' + str(e)}), 500

# API - download file
@file_sharing_bp.route('/api/files/download', methods=['GET'])
@login_required
def download_file():
    """Download a file"""
    try:
        path = request.args.get('path')
        if not path:
            current_app.logger.warning("No path provided")
            return jsonify({'error': 'Path is required'}), 400
        
        # Validate path
        real_path = os.path.normpath(path)
        real_base_dir = os.path.realpath(BASE_SHARE_DIR)
        if not os.path.realpath(real_path).startswith(real_base_dir):
            current_app.logger.warning(f"Attempt to download file outside shared directory: {path}")
            return jsonify({'error': 'Invalid path'}), 403
        
        # Check if file exists
        if not os.path.exists(real_path):
            current_app.logger.warning(f"Attempt to download non-existent file: {path}")
            return jsonify({'error': 'File does not exist'}), 404
        
        # Get directory and filename
        directory = os.path.dirname(real_path)
        filename = os.path.basename(real_path)
        
        # Update last accessed and access count
        try:
            db = get_db()
            db.execute(
                'UPDATE shared_files SET last_accessed = ?, access_count = access_count + 1 WHERE file_path = ?',
                (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), real_path)
            )
            db.commit()
            current_app.logger.info(f"File access recorded for {real_path}")
        except Exception as e:
            current_app.logger.warning(f"Error updating file access: {str(e)}")
            # Continue with download even if update fails
        
        return send_from_directory(directory, filename, as_attachment=True)
    except Exception as e:
        current_app.logger.error(f"Error downloading file: {str(e)}")
        return jsonify({'error': 'Failed to download file: ' + str(e)}), 500

# API - podgląd pliku
@file_sharing_bp.route('/api/files/preview', methods=['GET'])
@login_required
def preview_file():
    """Wyświetl podgląd pliku"""
    try:
        path = request.args.get('path')
        if not path:
            current_app.logger.warning("No path provided")
            return jsonify({'error': 'Path is required'}), 400
        
        # Podobna logika jak w innych metodach - uzyskaj prawidłową ścieżkę
        path_parts = path.replace('\\', '/').strip('/').split('/')
        if len(path_parts) == 1 and path_parts[0] == 'HomeHubShared':
            # Jeśli to tylko sam katalog bazowy
            real_path = BASE_SHARE_DIR
        else:
            # Jeśli to podkatalog lub plik
            subdir = '/'.join(path_parts[1:]) if path_parts[0] == 'HomeHubShared' else '/'.join(path_parts)
            real_path = os.path.join(BASE_SHARE_DIR, subdir)
        
        # Sprawdź czy ścieżka jest w dozwolonym katalogu
        if not os.path.realpath(real_path).startswith(os.path.realpath(BASE_SHARE_DIR)):
            current_app.logger.warning(f"Attempt to preview file outside shared directory: {path}")
            return jsonify({'error': 'Invalid path'}), 403
        
        # Sprawdź czy plik istnieje
        if not os.path.exists(real_path) or os.path.isdir(real_path):
            current_app.logger.warning(f"File does not exist or is a directory: {real_path}")
            return jsonify({'error': 'File does not exist or is a directory'}), 404
        
        # Określ typ MIME pliku
        file_mime, encoding = mimetypes.guess_type(real_path)
        if not file_mime:
            file_mime = 'application/octet-stream'  # domyślny typ, jeśli nie można określić
        
        # Podziel typy plików na kategorie do obsługi podglądu
        file_category = get_file_category(real_path)
        
        # Aktualizuj statystyki dostępu
        try:
            db = get_db()
            db.execute(
                'UPDATE shared_files SET last_accessed = ?, access_count = access_count + 1 WHERE file_path = ?',
                (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), real_path)
            )
            db.commit()
        except Exception as e:
            current_app.logger.warning(f"Error updating file access: {str(e)}")
        
        # W zależności od kategorii pliku, zwróć odpowiedni response
        if file_category == 'image':
            return send_file(real_path, mimetype=file_mime)
        elif file_category == 'text':
            # Dla plików tekstowych, odczytaj zawartość i zwróć jako JSON
            try:
                with open(real_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                return jsonify({
                    'type': 'text',
                    'content': content,
                    'filename': os.path.basename(real_path)
                })
            except UnicodeDecodeError:
                # Jeśli nie udało się odczytać jako UTF-8, to może nie jest to plik tekstowy
                return jsonify({'error': 'File is not a text file or has unsupported encoding'}), 415
        elif file_category == 'pdf':
            # Dla PDF, zwróć plik z odpowiednim typem MIME
            return send_file(real_path, mimetype='application/pdf')
        elif file_category == 'audio':
            # Dla audio, zwróć plik z odpowiednim typem MIME
            return send_file(real_path, mimetype=file_mime)
        elif file_category == 'video':
            # Dla wideo, zwróć plik z odpowiednim typem MIME
            return send_file(real_path, mimetype=file_mime)
        else:
            # Dla innych typów plików, zwróć komunikat, że podgląd nie jest obsługiwany
            return jsonify({
                'type': 'unsupported',
                'mime': file_mime,
                'filename': os.path.basename(real_path)
            })
    except Exception as e:
        current_app.logger.error(f"Error previewing file: {str(e)}")
        return jsonify({'error': 'Failed to preview file: ' + str(e)}), 500

# Funkcja pomocnicza do określania kategorii pliku
def get_file_category(file_path):
    """Określa kategorię pliku na podstawie rozszerzenia"""
    ext = os.path.splitext(file_path)[1].lower()
    
    # Kategorie plików
    image_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp']
    text_extensions = ['.txt', '.md', '.html', '.xml', '.json', '.csv', '.py', '.js', '.css', '.c', '.cpp', '.h', '.java', '.php', '.log']
    pdf_extensions = ['.pdf']
    audio_extensions = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a']
    video_extensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.webm']
    
    if ext in image_extensions:
        return 'image'
    elif ext in text_extensions:
        return 'text'
    elif ext in pdf_extensions:
        return 'pdf'
    elif ext in audio_extensions:
        return 'audio'
    elif ext in video_extensions:
        return 'video'
    else:
        return 'other'

# API - generate share link
@file_sharing_bp.route('/api/files/generate-share-link', methods=['POST'])
@login_required
def generate_share_link():
    """Generate a link to share a file"""
    try:
        # Get path
        if not request.is_json:
            current_app.logger.warning("Request is not JSON")
            return jsonify({'error': 'Invalid request format'}), 400
        
        path = request.json.get('path')
        if not path:
            current_app.logger.warning("No path provided")
            return jsonify({'error': 'Path is required'}), 400
        
        # Validate path
        real_path = os.path.normpath(path)
        real_base_dir = os.path.realpath(BASE_SHARE_DIR)
        if not os.path.realpath(real_path).startswith(real_base_dir):
            current_app.logger.warning(f"Attempt to share file outside shared directory: {path}")
            return jsonify({'error': 'Invalid path'}), 403
        
        # Generate unique link
        share_link = generate_secure_link()
        
        # Save sharing information in database
        try:
            db = get_db()
            db.execute(
                'INSERT INTO shared_files (user_id, file_path, filename, shared_link, link_expiration) VALUES (?, ?, ?, ?, ?)',
                (g.user_id, real_path, os.path.basename(real_path), share_link, 
                datetime.now() + timedelta(days=7))  # Link valid for 7 days
            )
            db.commit()
            current_app.logger.info(f"Share link generated for {real_path}: {share_link}")
        except Exception as e:
            current_app.logger.error(f"Error generating share link: {str(e)}")
            return jsonify({'error': 'Failed to generate share link: ' + str(e)}), 500
        
        # Return share link
        return jsonify({
            'share_link': share_link,
            'expiration': (datetime.now() + timedelta(days=7)).isoformat()
        }), 200
    except Exception as e:
        current_app.logger.error(f"Error generating share link: {str(e)}")
        return jsonify({'error': 'Failed to generate share link: ' + str(e)}), 500

# Shared file access route (for accessing shared files via link)
@file_sharing_bp.route('/shared/<share_link>')
def access_shared_file(share_link):
    """Access a shared file via link"""
    try:
        # Get file information from database
        db = get_db()
        file_info = db.execute(
            'SELECT * FROM shared_files WHERE shared_link = ?', (share_link,)
        ).fetchone()
        
        if not file_info:
            current_app.logger.warning(f"Attempt to access non-existent share link: {share_link}")
            return render_template('error.html', error='Nieprawidłowy link udostępniania'), 404
        
        # Check if link has expired
        if file_info['link_expiration']:
            expiration = datetime.fromisoformat(file_info['link_expiration'])
            if expiration < datetime.now():
                current_app.logger.warning(f"Attempt to access expired share link: {share_link}")
                return render_template('error.html', error='Link udostępniania wygasł'), 410
        
        # Update last accessed and access count
        db.execute(
            'UPDATE shared_files SET last_accessed = ?, access_count = access_count + 1 WHERE shared_link = ?',
            (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), share_link)
        )
        db.commit()
        
        # Send file
        real_path = file_info['file_path']
        directory = os.path.dirname(real_path)
        filename = os.path.basename(real_path)
        
        return send_from_directory(directory, filename, as_attachment=True)
    except Exception as e:
        current_app.logger.error(f"Error accessing")