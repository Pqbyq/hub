# routes/media_center.py
from flask import Blueprint, request, jsonify, render_template, g, current_app, send_file
import os
import json
import mimetypes
from datetime import datetime
import subprocess

# Inicjalizacja blueprint
media_center_bp = Blueprint('media_center', __name__)

# Główna strona Media Center
@media_center_bp.route('/media-center')
@login_required
def media_center_page():
    # Pobierz ustawienia użytkownika
    db = get_db()
    settings = db.execute('SELECT theme FROM user_settings WHERE user_id = ?',
                         (g.user_id,)).fetchone()
    theme = settings['theme'] if settings else 'light'
    
    return render_template('media_center.html', 
                         app_name=current_app.config['APP_NAME'],
                         username=g.username,
                         role=g.role,
                         theme=theme)

# API - Pobieranie listy mediów
@media_center_bp.route('/api/media/list')
@login_required
def list_media():
    media_type = request.args.get('type', 'all')  # 'all', 'video', 'audio', 'image'
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    # Budowanie zapytania SQL
    query = 'SELECT * FROM media_items'
    params = []
    
    if media_type != 'all':
        query += ' WHERE media_type = ?'
        params.append(media_type)
    
    query += ' ORDER BY title LIMIT ? OFFSET ?'
    params.extend([per_page, (page-1) * per_page])
    
    # Wykonanie zapytania
    db = get_db()
    items = db.execute(query, params).fetchall()
    
    # Konwersja na format JSON
    result = []
    for item in items:
        media_item = dict(item)
        
        # Pobierz dodatkowe metadane
        if item['media_type'] == 'audio':
            metadata = db.execute('SELECT * FROM audio_metadata WHERE media_id = ?', 
                                (item['id'],)).fetchone()
            if metadata:
                media_item['metadata'] = dict(metadata)
        elif item['media_type'] == 'video':
            metadata = db.execute('SELECT * FROM video_metadata WHERE media_id = ?', 
                                (item['id'],)).fetchone()
            if metadata:
                media_item['metadata'] = dict(metadata)
        
        result.append(media_item)
    
    return jsonify(result)

# API - Pobieranie strumienia mediów
@media_center_bp.route('/api/media/stream/<int:media_id>')
@login_required
def stream_media(media_id):
    db = get_db()
    media = db.execute('SELECT * FROM media_items WHERE id = ?', (media_id,)).fetchone()
    
    if not media:
        return jsonify({'error': 'Media not found'}), 404
    
    # Sprawdź, czy plik istnieje
    if not os.path.exists(media['file_path']):
        return jsonify({'error': 'Media file not found'}), 404
    
    # Aktualizuj statystyki odtwarzania
    db.execute('''
        UPDATE media_items 
        SET play_count = play_count + 1, 
            last_accessed = ? 
        WHERE id = ?
    ''', (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), media_id))
    db.commit()
    
    # Zwróć plik lub przekieruj do transkodowania
    return send_file(media['file_path'])

# API - Transkodowanie na żądanie
@media_center_bp.route('/api/media/transcode/<int:media_id>')
@login_required
def transcode_media(media_id):
    format = request.args.get('format', 'mp4')
    resolution = request.args.get('resolution', '720p')
    
    # Pobierz informacje o mediach
    db = get_db()
    media = db.execute('SELECT * FROM media_items WHERE id = ?', (media_id,)).fetchone()
    
    if not media:
        return jsonify({'error': 'Media not found'}), 404
    
    # Ścieżka do transkodowanego pliku
    transcoded_dir = os.path.join(current_app.config['TRANSCODE_DIR'], str(media_id))
    os.makedirs(transcoded_dir, exist_ok=True)
    transcoded_file = os.path.join(transcoded_dir, f"{os.path.splitext(os.path.basename(media['file_path']))[0]}_{resolution}.{format}")
    
    # Sprawdź, czy transkodowany plik już istnieje
    if os.path.exists(transcoded_file):
        return send_file(transcoded_file)
    
    # Uruchom transkodowanie w tle - tutaj potrzebny byłby system kolejkowania zadań
    # Dla uproszczenia, zwracamy informację o rozpoczęciu transkodowania
    return jsonify({'status': 'transcoding_started', 'message': 'Transkodowanie rozpoczęte'})

# Pozostałe endpointy API dla playlist, wyszukiwania, itp.