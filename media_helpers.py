# media_helpers.py
import os
import subprocess
import json
import hashlib
import mimetypes
from datetime import datetime
import shutil
import re

# Inicjalizacja serwera DLNA/UPnP
def init_dlna_server(config):
    """
    Inicjalizuje serwer DLNA/UPnP dla udostępniania mediów w sieci
    """
    # Tu zaimplementuj inicjalizację serwera DLNA
    # Możesz użyć minidlna, coherence lub podobnych bibliotek
    try:
        # Przykład dla minidlna
        config_file = os.path.join(os.path.dirname(__file__), 'minidlna.conf')
        with open(config_file, 'w') as f:
            f.write(f"media_dir={','.join(config['MEDIA_DIRS'])}\n")
            f.write(f"port={config['DLNA_SERVER_PORT']}\n")
            f.write(f"friendly_name=HomeHub Media Server\n")
            f.write(f"inotify=yes\n")
            
        # Restart serwera minidlna
        subprocess.run(['service', 'minidlna', 'restart'], check=True)
        return True
    except Exception as e:
        print(f"Błąd inicjalizacji serwera DLNA: {str(e)}")
        return False

# Skanowanie mediów
def scan_media_directory(directory, db, recursive=True, generate_thumbnails=True, config=None):
    """
    Skanuje katalog w poszukiwaniu plików multimedialnych i dodaje je do bazy danych
    """
    if not os.path.exists(directory):
        raise FileNotFoundError(f"Katalog {directory} nie istnieje")
    
    media_formats = config.get('MEDIA_FORMATS', {
        'video': ['mp4', 'mkv', 'avi', 'mov'],
        'audio': ['mp3', 'flac', 'ogg', 'wav'],
        'image': ['jpg', 'jpeg', 'png', 'gif', 'webp']
    }) if config else {
        'video': ['mp4', 'mkv', 'avi', 'mov'],
        'audio': ['mp3', 'flac', 'ogg', 'wav'],
        'image': ['jpg', 'jpeg', 'png', 'gif', 'webp']
    }
    
    # Funkcja zwracająca typ mediów na podstawie rozszerzenia
    def get_media_type(file_path):
        ext = os.path.splitext(file_path)[1].lower().lstrip('.')
        for media_type, extensions in media_formats.items():
            if ext in extensions:
                return media_type
        return None
    
    found_files = []
    
    # Skanowanie katalogu
    if recursive:
        for root, _, files in os.walk(directory):
            for file in files:
                file_path = os.path.join(root, file)
                media_type = get_media_type(file_path)
                if media_type:
                    found_files.append((file_path, media_type))
    else:
        for item in os.listdir(directory):
            file_path = os.path.join(directory, item)
            if os.path.isfile(file_path):
                media_type = get_media_type(file_path)
                if media_type:
                    found_files.append((file_path, media_type))
    
    # Dodawanie plików do bazy danych
    cursor = db.cursor()
    
    added_count = 0
    for file_path, media_type in found_files:
        file_size = os.path.getsize(file_path)
        file_name = os.path.basename(file_path)
        
        # Sprawdzenie czy plik już istnieje w bazie
        cursor.execute("SELECT id FROM media_items WHERE file_path = ?", (file_path,))
        existing = cursor.fetchone()
        
        if existing:
            # Aktualizacja rozmiaru pliku i innych metadanych
            cursor.execute(
                "UPDATE media_items SET file_size = ? WHERE file_path = ?",
                (file_size, file_path)
            )
        else:
            # Generowanie miniatury
            thumbnail_path = None
            if generate_thumbnails:
                thumbnail_path = generate_thumbnail(file_path, media_type, config)
            
            # Pobieranie metadanych
            metadata = get_media_metadata(file_path, media_type)
            
            # Domyślny tytuł to nazwa pliku bez rozszerzenia
            title = os.path.splitext(file_name)[0]
            duration = metadata.get('duration', 0)
            
            # Dodanie do bazy danych
            cursor.execute(
                """INSERT INTO media_items 
                (title, file_path, media_type, format, duration, file_size, thumbnail_path, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (title, file_path, media_type, os.path.splitext(file_path)[1][1:], 
                duration, file_size, thumbnail_path, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            )
            
            # Pobieranie ID dodanego pliku
            media_id = cursor.lastrowid
            
            # Dodawanie specyficznych metadanych
            if media_type == 'audio' and 'audio_metadata' in metadata:
                audio_meta = metadata['audio_metadata']
                cursor.execute(
                    """INSERT INTO audio_metadata 
                    (media_id, artist, album, genre, track_number, year, bitrate, sample_rate) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (media_id, audio_meta.get('artist'), audio_meta.get('album'), 
                     audio_meta.get('genre'), audio_meta.get('track_number'), 
                     audio_meta.get('year'), audio_meta.get('bitrate'), 
                     audio_meta.get('sample_rate'))
                )
            
            elif media_type == 'video' and 'video_metadata' in metadata:
                video_meta = metadata['video_metadata']
                cursor.execute(
                    """INSERT INTO video_metadata 
                    (media_id, director, resolution, framerate, codec, subtitle_paths) 
                    VALUES (?, ?, ?, ?, ?, ?)""",
                    (media_id, video_meta.get('director'), video_meta.get('resolution'), 
                     video_meta.get('framerate'), video_meta.get('codec'), 
                     json.dumps(video_meta.get('subtitle_paths', [])))
                )
                
            added_count += 1
    
    db.commit()
    return added_count

# Generowanie miniatury
def generate_thumbnail(file_path, media_type, config):
    """
    Generuje miniaturę dla pliku multimedialnego
    """
    thumbnail_dir = config.get('THUMBNAIL_DIR', '/tmp/homehub/thumbnails') if config else '/tmp/homehub/thumbnails'
    os.makedirs(thumbnail_dir, exist_ok=True)
    
    # Generowanie unikalnej nazwy dla miniatury na podstawie ścieżki pliku
    file_hash = hashlib.md5(file_path.encode()).hexdigest()
    thumbnail_path = os.path.join(thumbnail_dir, f"{file_hash}.jpg")
    
    try:
        if media_type == 'video':
            # Użycie FFmpeg do wyodrębnienia klatki z filmu
            subprocess.run([
                'ffmpeg',
                '-i', file_path,
                '-ss', '00:00:05',  # 5 sekunda filmu
                '-vframes', '1',
                '-vf', 'scale=320:-1',
                '-y',
                thumbnail_path
            ], stderr=subprocess.PIPE, check=True)
            
        elif media_type == 'audio':
            # Próba wyodrębnienia okładki z pliku audio
            try:
                subprocess.run([
                    'ffmpeg',
                    '-i', file_path,
                    '-an',
                    '-vcodec', 'copy',
                    '-y',
                    thumbnail_path
                ], stderr=subprocess.PIPE, check=False)
                
                # Sprawdź czy miniatura została wygenerowana
                if not os.path.exists(thumbnail_path) or os.path.getsize(thumbnail_path) == 0:
                    # Użyj domyślnej miniatury dla audio
                    default_audio_thumbnail = os.path.join(os.path.dirname(__file__), 'static/img/media/audio_thumbnail.jpg')
                    shutil.copy(default_audio_thumbnail, thumbnail_path)
            except:
                # Użyj domyślnej miniatury dla audio
                default_audio_thumbnail = os.path.join(os.path.dirname(__file__), 'static/img/media/audio_thumbnail.jpg')
                shutil.copy(default_audio_thumbnail, thumbnail_path)
                
        elif media_type == 'image':
            # Utwórz miniaturę obrazu
            subprocess.run([
                'convert',
                file_path,
                '-thumbnail', '320x240>',
                thumbnail_path
            ], stderr=subprocess.PIPE, check=True)
            
        return thumbnail_path
    except Exception as e:
        print(f"Błąd generowania miniatury dla {file_path}: {str(e)}")
        return None

# Pobieranie metadanych
def get_media_metadata(file_path, media_type):
    """
    Pobiera metadane z pliku multimedialnego
    """
    metadata = {}
    
    try:
        if media_type == 'video':
            # Użycie FFprobe do pobrania metadanych wideo
            result = subprocess.run([
                'ffprobe',
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                file_path
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
            
            info = json.loads(result.stdout)
            
            # Podstawowe metadane
            format_info = info.get('format', {})
            duration = float(format_info.get('duration', 0))
            metadata['duration'] = duration
            
            # Metadane wideo
            video_metadata = {}
            for stream in info.get('streams', []):
                if stream.get('codec_type') == 'video':
                    width = stream.get('width', 0)
                    height = stream.get('height', 0)
                    video_metadata['resolution'] = f"{width}x{height}"
                    
                    if 'r_frame_rate' in stream:
                        rate_parts = stream['r_frame_rate'].split('/')
                        if len(rate_parts) == 2 and int(rate_parts[1]) != 0:
                            video_metadata['framerate'] = float(rate_parts[0]) / float(rate_parts[1])
                    
                    video_metadata['codec'] = stream.get('codec_name', '')
                    break
            
            # Wyszukanie ścieżek napisów
            subtitle_paths = []
            base_name = os.path.splitext(file_path)[0]
            for ext in ['.srt', '.sub', '.vtt']:
                potential_subtitle = base_name + ext
                if os.path.exists(potential_subtitle):
                    subtitle_paths.append(potential_subtitle)
            
            video_metadata['subtitle_paths'] = subtitle_paths
            metadata['video_metadata'] = video_metadata
            
        elif media_type == 'audio':
            # Użycie FFprobe do pobrania metadanych audio
            result = subprocess.run([
                'ffprobe',
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                file_path
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
            
            info = json.loads(result.stdout)
            
            # Podstawowe metadane
            format_info = info.get('format', {})
            duration = float(format_info.get('duration', 0))
            metadata['duration'] = duration
            
            # Metadane tagu
            audio_metadata = {}
            tags = format_info.get('tags', {})
            
            audio_metadata['artist'] = tags.get('artist', '')
            audio_metadata['album'] = tags.get('album', '')
            audio_metadata['genre'] = tags.get('genre', '')
            audio_metadata['track_number'] = tags.get('track', '')
            audio_metadata['year'] = tags.get('date', '')
            
            # Metadane strumienia audio
            for stream in info.get('streams', []):
                if stream.get('codec_type') == 'audio':
                    audio_metadata['bitrate'] = int(stream.get('bit_rate', 0))
                    audio_metadata['sample_rate'] = int(stream.get('sample_rate', 0))
                    break
            
            metadata['audio_metadata'] = audio_metadata
    
    except Exception as e:
        print(f"Błąd pobierania metadanych dla {file_path}: {str(e)}")
    
    return metadata

# Transkodowanie mediów
def transcode_media(input_file, output_file, format='mp4', resolution='720p'):
    """
    Transkoduje plik multimedialny do określonego formatu i rozdzielczości
    """
    # Określanie parametrów na podstawie żądanej rozdzielczości
    resolution_params = {
        '480p': ['-vf', 'scale=-1:480', '-b:v', '1M'],
        '720p': ['-vf', 'scale=-1:720', '-b:v', '2.5M'],
        '1080p': ['-vf', 'scale=-1:1080', '-b:v', '5M'],
    }
    
    params = resolution_params.get(resolution, resolution_params['720p'])
    
    # Parametry wyjściowego formatu
    format_params = {
        'mp4': ['-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart'],
        'webm': ['-c:v', 'libvpx-vp9', '-c:a', 'libopus'],
        'mp3': ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'],
    }
    
    output_params = format_params.get(format, format_params['mp4'])
    
    # Budowanie pełnego polecenia
    command = ['ffmpeg', '-i', input_file, '-y']
    command.extend(params)
    command.extend(output_params)
    command.append(output_file)
    
    # Uruchomienie procesu transkodowania
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = process.communicate()
    
    if process.returncode != 0:
        raise Exception(f"FFmpeg error: {stderr.decode()}")
    
    return output_file