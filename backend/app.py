#!/usr/bin/env python3
"""
Flask backend server for Stories App
Handles audio transcription using OpenAI Whisper API
"""

import os
import sys
import time

VERSION = "0.9.8"
import tempfile
import sqlite3
from datetime import datetime
from flask import Flask, request, jsonify, after_this_request
from flask_cors import CORS
from dotenv import load_dotenv
import logging
from logging.handlers import RotatingFileHandler

# Configure logging to file for debugging packaged app
LOG_DIR = os.path.expanduser('~/Library/Application Support/Stories')
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, 'backend.log')

# Setup logging with rotation (max 5MB per file, keep 3 backups)
# This prevents the log file from growing too large
log_formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s')

# Rotating file handler: 5MB max, 3 backup files
# Files will be: backend.log, backend.log.1, backend.log.2, backend.log.3
file_handler = RotatingFileHandler(
    LOG_FILE, 
    maxBytes=5*1024*1024,  # 5 MB
    backupCount=3,          # Keep 3 old logs
    encoding='utf-8'
)
file_handler.setFormatter(log_formatter)
file_handler.setLevel(logging.INFO)

# Console handler
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(log_formatter)
console_handler.setLevel(logging.INFO)

# Configure root logger
logging.basicConfig(
    level=logging.INFO,
    handlers=[file_handler, console_handler],
    force=True
)

logger = logging.getLogger(__name__)
logger.info("="*80)
logger.info("🚀 Backend Starting...")
logger.info(f"📝 Log file: {LOG_FILE}")
logger.info("="*80)

# Load environment variables
load_dotenv()

# Import retry logic
from retry_logic import transcribe_with_retry, create_retry_notification, get_user_friendly_error, get_audio_duration

# Import audio storage
from audio_storage import get_default_storage_manager, save_temp_audio_with_metadata, save_temp_audio_with_metadata_safe

# Import configuration manager
from config_manager import get_default_config_manager, validate_openai_key

# Import dictionary manager
from dictionary_manager import get_default_dictionary_manager

# Import window manager
from window_manager import get_shared_window_manager, WindowType, RecordingState

# ============================================================================
# ERROR MESSAGE HELPERS
# ============================================================================

def get_user_friendly_api_error(error, audio_id=None):
    """
    Convert OpenAI API errors into user-friendly messages.
    
    Args:
        error: The exception object from OpenAI API
        audio_id: Optional audio ID if audio was saved
        
    Returns:
        str: User-friendly error message
    """
    error_str = str(error)
    error_lower = error_str.lower()
    
    # Note about saved audio
    audio_saved_note = " You can download the audio file." if audio_id else ""
    
    # Detect specific error types
    if "does not have access to model" in error_lower or "model_not_found" in error_lower:
        return f"Your OpenAI project does not have access to the Whisper model. Please create a new API key with Whisper enabled or contact OpenAI support.{audio_saved_note}"
    
    elif "exceeded your current quota" in error_lower or "insufficient_quota" in error_lower:
        return f"Your OpenAI account has no credits remaining. Please add credits at platform.openai.com/account/billing.{audio_saved_note}"
    
    elif "incorrect api key" in error_lower or "invalid_api_key" in error_lower:
        return f"Invalid API key. Please check your API key in Settings and make sure it's correct.{audio_saved_note}"
    
    elif "api key has been deactivated" in error_lower or "api_key_disabled" in error_lower:
        return f"Your API key has been deactivated. Please create a new API key at platform.openai.com/api-keys.{audio_saved_note}"
    
    elif "organization has been suspended" in error_lower or "organization_suspended" in error_lower:
        return f"Your OpenAI organization has been suspended. Please contact OpenAI support at help.openai.com.{audio_saved_note}"
    
    elif "organization has been deactivated" in error_lower or "organization_deactivated" in error_lower:
        return f"Your OpenAI account has been deactivated. Please reactivate it at platform.openai.com.{audio_saved_note}"
    
    elif "service unavailable" in error_lower or "503" in error_lower or "temporarily unavailable" in error_lower:
        return f"OpenAI service is temporarily unavailable. Please try again in a few minutes.{audio_saved_note}"
    
    elif "rate_limit" in error_lower or "too many requests" in error_lower:
        return f"Too many requests. Please wait a moment and try again.{audio_saved_note}"
    
    elif "timeout" in error_lower or "timed out" in error_lower:
        return f"Request timed out. Please check your internet connection and try again.{audio_saved_note}"
    
    elif "connection" in error_lower or "network" in error_lower:
        return f"Network error. Please check your internet connection and try again.{audio_saved_note}"
    
    elif "audio file is too" in error_lower or "413" in error_lower or "request entity too large" in error_lower:
        return f"Audio file exceeds maximum size (25MB). Please record a shorter message.{audio_saved_note}"
    
    elif "audio is too short" in error_lower or "audio file is empty" in error_lower or "no audio data" in error_lower:
        return f"Audio is too short or empty. Please record for at least 1 second.{audio_saved_note}"
    
    elif "corrupted" in error_lower or "invalid audio" in error_lower or "cannot decode" in error_lower or "unsupported format" in error_lower:
        return f"Audio file is corrupted or unreadable. Please check your microphone and try again.{audio_saved_note}"
    
    else:
        # Default message for unknown errors
        return f"An unexpected error occurred during transcription. Please try again.{audio_saved_note}"


def get_user_friendly_server_error(error, audio_id=None):
    """
    Convert server/system errors into user-friendly messages.
    
    Args:
        error: The exception object
        audio_id: Optional audio ID if audio was saved
        
    Returns:
        str: User-friendly error message
    """
    error_str = str(error)
    error_lower = error_str.lower()
    
    # Note about saved audio
    audio_saved_note = " You can download the audio file." if audio_id else ""
    
    # Detect specific error types
    if "permission denied" in error_lower or "access denied" in error_lower:
        return f"Permission error. The app doesn't have access to required resources. Please restart the app.{audio_saved_note}"
    
    elif "disk" in error_lower or "space" in error_lower:
        return f"Insufficient disk space. Please free up some space and try again.{audio_saved_note}"
    
    elif "memory" in error_lower:
        return f"Insufficient memory. Please close some applications and try again.{audio_saved_note}"
    
    elif "audio is too short" in error_lower or "audio file is empty" in error_lower or "no audio data" in error_lower:
        return f"Audio is too short or empty. Please record for at least 1 second.{audio_saved_note}"
    
    elif "corrupted" in error_lower or "invalid audio" in error_lower or "cannot decode" in error_lower:
        return f"Audio file is corrupted or unreadable. Please check your microphone and try again.{audio_saved_note}"
    
    else:
        # Default message
        return f"A server error occurred during transcription. Please try again.{audio_saved_note}"

# ============================================================================
# DICTIONARY HELPERS
# ============================================================================

def generate_whisper_prompt_from_dictionary() -> str:
    """
    Generate a Whisper API prompt from custom dictionary
    
    Returns prompt string with custom terms, limited to ~200 words
    to stay within Whisper's token limit (~244 tokens)
    """
    try:
        dictionary = get_default_dictionary_manager()
        
        # Check if dictionary is enabled
        if not dictionary.is_enabled():
            return None
        
        # Get all words from dictionary
        words = dictionary.get_all_words()
        
        if not words or len(words) == 0:
            return None
        
        # Extract just the word text, limit to 50 most recent
        # (Whisper prompt has ~244 token limit, ~200 words safe)
        word_list = [w['word'] for w in words[:50]]
        
        # Create clear, concise prompt in English
        prompt = f"Vocabulary: {', '.join(word_list)}"
        
        # Ensure prompt doesn't exceed reasonable length
        if len(prompt) > 400:
            # Truncate word list if needed
            word_list = word_list[:30]
            prompt = f"Vocabulary: {', '.join(word_list)}"
        
        return prompt
        
    except Exception as e:
        print(f"⚠️  Failed to generate Whisper prompt: {e}")
        return None

app = Flask(__name__)
CORS(app, origins=["*"], allow_headers=["*"], methods=["*"])  # Enable CORS for all origins

# Configure OpenAI API - Modern syntax (2025)
# Try to get API key from new configuration system first, then fallback to .env
def get_api_key():
    """Get API key from configuration system or .env file"""
    try:
        # Try new configuration system first
        config_manager = get_default_config_manager()
        api_key = config_manager.get_api_key()
        if api_key:
            return api_key
    except Exception as e:
        print(f"⚠️  Could not load from config system: {e}")
    
    # Fallback to .env file
    env_key = os.getenv('OPENAI_API_KEY')
    if env_key and env_key != 'your_openai_api_key_here':
        print("📄 Using API key from .env file")
        return env_key
    
    return None

OPENAI_API_KEY = get_api_key()

# Database configuration
DATABASE_PATH = os.path.expanduser('~/Library/Application Support/Stories/transcriptions.db')

def init_database():
    """Initialize SQLite database for transcription history"""
    # Create directory if it doesn't exist
    db_dir = os.path.dirname(DATABASE_PATH)
    os.makedirs(db_dir, exist_ok=True)
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    # Create transcriptions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transcriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            language TEXT,
            duration REAL,
            audio_id TEXT,
            status TEXT DEFAULT 'success',
            error_message TEXT
        )
    ''')
    
    # Migration: Add audio_id column if it doesn't exist (for existing databases)
    try:
        cursor.execute("SELECT audio_id FROM transcriptions LIMIT 1")
    except sqlite3.OperationalError:
        # Column doesn't exist, add it
        print("🔄 Migrating database: Adding audio_id column...")
        cursor.execute("ALTER TABLE transcriptions ADD COLUMN audio_id TEXT")
        print("✅ Database migration completed")
    
    # Migration: Add status and error_message columns if they don't exist
    try:
        cursor.execute("SELECT status FROM transcriptions LIMIT 1")
    except sqlite3.OperationalError:
        print("🔄 Migrating database: Adding status and error_message columns...")
        cursor.execute("ALTER TABLE transcriptions ADD COLUMN status TEXT DEFAULT 'success'")
        cursor.execute("ALTER TABLE transcriptions ADD COLUMN error_message TEXT")
        print("✅ Status migration completed")
    
    # Create indexes for performance optimization
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_transcriptions_created_at 
        ON transcriptions(created_at DESC)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_transcriptions_audio_id 
        ON transcriptions(audio_id)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_transcriptions_status 
        ON transcriptions(status)
    ''')
    
    conn.commit()
    conn.close()
    print(f"✅ Database initialized at: {DATABASE_PATH}")

# Initialize database on startup
init_database()

# Lazy-loaded OpenAI client (initialized on first use)
openai_client = None
_openai_client_initialized = False

def get_openai_client():
    """Get or initialize OpenAI client (lazy loading)"""
    global openai_client, _openai_client_initialized, API_AVAILABLE
    
    if _openai_client_initialized:
        return openai_client
    
    _openai_client_initialized = True
    api_key = get_api_key()
    
    if api_key:
        try:
            from openai import OpenAI
            openai_client = OpenAI(api_key=api_key)
            API_AVAILABLE = True
            print("✅ OpenAI client initialized")
            return openai_client
        except ImportError:
            API_AVAILABLE = False
            print("⚠️  OpenAI package not available")
        except Exception as e:
            API_AVAILABLE = False
            print(f"⚠️  OpenAI initialization failed: {e}")
    else:
        API_AVAILABLE = False
        print("⚠️  No API Key configured")
    
    return None

# Check if API key is available at startup (but don't initialize client yet)
OPENAI_API_KEY = get_api_key()
API_AVAILABLE = bool(OPENAI_API_KEY)
if not API_AVAILABLE:
    print("💡 Configure API key in .env file or use the configuration API")

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "ok", 
        "service": "whisper-space-backend",
        "api_available": API_AVAILABLE
    })

@app.route('/api/transcribe', methods=['POST'])
def transcribe_audio():
    """
    Transcribe audio file using OpenAI Whisper API with window management integration
    
    Expected: multipart/form-data with 'audio' file
    Returns: JSON with transcribed text, language, and duration
    """
    logger.info("\n" + "="*80)
    logger.info("🎙️  TRANSCRIPTION REQUEST RECEIVED")
    logger.info("="*80)
    
    window_manager = get_shared_window_manager()
    
    # Check if there's an active recording session, if not this is a legacy call
    recording_state = window_manager.get_recording_state()
    has_active_session = recording_state['state'] in ['recording', 'processing']
    
    logger.info(f"📊 Recording State: {recording_state['state']}")
    logger.info(f"🔗 Has Active Session: {has_active_session}")
    
    try:
        # CRITICAL: Always update API_AVAILABLE dynamically from config
        # Don't trust the global variable set at startup
        api_key = get_api_key()
        
        # Update API_AVAILABLE based on CURRENT API key status
        global API_AVAILABLE
        API_AVAILABLE = bool(api_key)
        
        logger.info(f"🔑 API Check: {'✅ Available' if API_AVAILABLE else '❌ Not Available'}")
        
        if api_key:
            masked_key = f"{api_key[:7]}...{api_key[-4:]}" if len(api_key) > 11 else "***"
            logger.info(f"   API Key: {masked_key}")
        else:
            logger.error(f"   ❌ API Key NOT SET - Please configure it in Settings")
        
        if not API_AVAILABLE:
            # Only complete recording if there was an active session
            if has_active_session:
                window_manager.complete_recording(False, {"error": "API not available"})
            return jsonify({
                "error": "OpenAI API not available",
                "details": "Please configure OPENAI_API_KEY in .env file"
            }), 503
        
        # Check if audio file is present
        logger.info(f"📦 Checking audio file in request...")
        logger.info(f"   Files in request: {list(request.files.keys())}")
        
        if 'audio' not in request.files:
            logger.error(f"❌ ERROR: No audio file in request")
            if has_active_session:
                window_manager.complete_recording(False, {"error": "No audio file provided"})
            return jsonify({"error": "No audio file provided"}), 400
        
        audio_file = request.files['audio']
        logger.info(f"✅ Audio file found: {audio_file.filename}")
        logger.info(f"   Content type: {audio_file.content_type}")
        logger.info(f"   Content length: {request.content_length} bytes")
        
        if audio_file.filename == '':
            logger.error(f"❌ ERROR: Empty filename")
            if has_active_session:
                window_manager.complete_recording(False, {"error": "No file selected"})
            return jsonify({"error": "No file selected"}), 400
        
        # Save uploaded file temporarily
        logger.info(f"💾 Saving audio to temporary file...")
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_file:
                audio_file.save(temp_file.name)
                temp_file_path = temp_file.name
            logger.info(f"✅ Temp file saved: {temp_file_path}")
            logger.info(f"   File size: {os.path.getsize(temp_file_path)} bytes")
        except Exception as save_error:
            logger.error(f"❌ ERROR saving temp file: {save_error}")
            logger.error(f"   Error type: {type(save_error).__name__}")
            raise
        
        try:
            logger.info(f"\n" + "="*80)
            logger.info(f"🔧 TRANSCRIPTION PROCESS STARTING")
            logger.info(f"="*80)
            
            # Step 1/6: Clean up previous temporary failed audio files
            logger.info(f"📍 Step 1/6: Cleanup temporary files")
            try:
                step_start = time.time()
                
                storage = get_default_storage_manager()
                
                # Use safe method with 10s timeout
                failed_audios = storage.list_audio_files_safe(status='failed', timeout=10)
                
                deleted_count = 0
                for failed_audio in failed_audios:
                    if failed_audio.get('is_temporary'):
                        audio_id = failed_audio.get('id')
                        # Use safe method with 5s timeout per delete
                        if storage.delete_audio_safe(audio_id, timeout=5):
                            deleted_count += 1
                
                step_elapsed = time.time() - step_start
                logger.info(f"✅ Step 1/6: Completed in {step_elapsed:.2f}s (deleted {deleted_count} temp files)")
            except Exception as cleanup_error:
                step_elapsed = time.time() - step_start if 'step_start' in locals() else 0
                logger.warning(f"⚠️ Step 1/6: Failed after {step_elapsed:.2f}s - {cleanup_error} (continuing anyway)")
                # Continue anyway - cleanup failure shouldn't block transcription
            
            # Step 2/6: Check audio save setting
            logger.info(f"📍 Step 2/6: Check audio save setting")
            config_manager = get_default_config_manager()
            save_audio = config_manager.get_setting('audio_settings.save_audio_files', True)
            logger.info(f"💾 Save audio setting: {save_audio}")
            
            audio_id = None
            saved_audio_path = None
            
            # Step 3/6: Save audio file locally if enabled
            logger.info(f"📍 Step 3/6: Save audio file")
            if save_audio:
                step_start = time.time()
                try:
                    audio_metadata = {
                        'original_filename': audio_file.filename,
                        'upload_timestamp': datetime.now().isoformat(),
                        'status': 'processing'
                    }
                    
                    # Use safe method with 15s timeout
                    audio_id, saved_audio_path = save_temp_audio_with_metadata_safe(
                        temp_path=temp_file_path,
                        metadata=audio_metadata,
                        is_failed=False,
                        timeout=15
                    )
                    
                    step_elapsed = time.time() - step_start
                    if audio_id:
                        logger.info(f"✅ Step 3/6: Completed in {step_elapsed:.2f}s (audio_id: {audio_id})")
                    else:
                        logger.warning(f"⚠️ Step 3/6: Timed out after {step_elapsed:.2f}s (continuing anyway)")
                except Exception as audio_save_error:
                    step_elapsed = time.time() - step_start
                    logger.warning(f"⚠️ Step 3/6: Failed after {step_elapsed:.2f}s - {audio_save_error} (continuing anyway)")
                    # Continue anyway - audio saving is optional
                    audio_id = None
            else:
                logger.info(f"⏭️ Step 3/6: Skipped (save_audio disabled)")
            
            # Step 4/6: Get audio duration for dynamic timeout calculation
            logger.info(f"📍 Step 4/6: Detect audio duration")
            step_start = time.time()
            audio_duration = get_audio_duration(temp_file_path)
            step_elapsed = time.time() - step_start
            if audio_duration:
                logger.info(f"✅ Step 4/6: Completed in {step_elapsed:.2f}s (duration: {audio_duration:.1f}s)")
            else:
                logger.warning(f"⚠️ Step 4/6: Could not detect duration after {step_elapsed:.2f}s (will use default timeout)")
            
            # Step 5/6: Generate dictionary prompt
            logger.info(f"📍 Step 5/6: Generate dictionary prompt")
            step_start = time.time()
            whisper_prompt = generate_whisper_prompt_from_dictionary()
            step_elapsed = time.time() - step_start
            if whisper_prompt:
                logger.info(f"✅ Step 5/6: Completed in {step_elapsed:.2f}s ({len(whisper_prompt)} chars)")
            else:
                logger.info(f"⏭️ Step 5/6: Completed in {step_elapsed:.2f}s (no dictionary words)")
            
            # Step 6/6: Transcribe using OpenAI Whisper API
            logger.info(f"📍 Step 6/6: OpenAI transcription (max attempts: 3)")
            step_start = time.time()
            
            try:
                openai_client = get_openai_client()
                print(f"   OpenAI client: {type(openai_client).__name__ if openai_client else 'None'}")
                
                retry_result = transcribe_with_retry(
                    audio_file_path=temp_file_path,
                    openai_client=openai_client,
                    max_attempts=3,
                    prompt=whisper_prompt,
                    audio_duration=audio_duration
                )
                
                step_elapsed = time.time() - step_start
                if retry_result.success:
                    logger.info(f"✅ Step 6/6: Completed in {step_elapsed:.2f}s (attempts: {retry_result.attempts})")
                else:
                    logger.error(f"❌ Step 6/6: Failed after {step_elapsed:.2f}s (attempts: {retry_result.attempts})")
                
            except Exception as transcribe_error:
                print(f"❌ ERROR during transcription:")
                print(f"   Error: {transcribe_error}")
                print(f"   Error type: {type(transcribe_error).__name__}")
                import traceback
                print(f"   Traceback:\n{traceback.format_exc()}")
                raise
            
            # Clean up temporary file
            os.unlink(temp_file_path)
            
            if retry_result.success:
                # Save transcription to database and get ID
                transcription_data = retry_result.data
                transcription_id = None
                
                # Apply custom dictionary corrections as fallback
                # (in case Whisper ignored some terms from the prompt)
                try:
                    original_text = transcription_data.get('text', '')
                    dictionary = get_default_dictionary_manager()
                    corrected_text = dictionary.apply_corrections(original_text)
                    
                    if corrected_text != original_text:
                        print(f"📖 Dictionary fallback corrections applied")
                        transcription_data['text'] = corrected_text
                    else:
                        print(f"✅ No fallback corrections needed (Whisper handled it)")
                except Exception as dict_error:
                    print(f"Warning: Failed to apply dictionary corrections: {dict_error}")
                    # Continue with original text if dictionary fails
                
                try:
                    transcription_id = save_transcription(transcription_data, audio_id)
                    print(f"📝 Transcription saved with ID: {transcription_id}")
                except Exception as db_error:
                    print(f"Warning: Failed to save transcription to database: {db_error}")
                
                # Update audio metadata with successful transcription (only if audio was saved)
                if audio_id:
                    storage = get_default_storage_manager()
                    transcription_metadata = {
                        'status': 'transcribed',
                        'transcription_text': transcription_data.get('text', ''),
                        'transcription_language': transcription_data.get('language', 'unknown'),
                        'transcription_duration': transcription_data.get('duration'),
                        'transcription_attempts': retry_result.attempts,
                        'transcription_timestamp': datetime.now().isoformat(),
                        'transcription_id': transcription_id
                    }
                    storage.update_audio_status(audio_id, 'transcribed', transcription_metadata)
                
                # Create notification for successful transcription
                notification = create_retry_notification(retry_result)
                
                # Complete recording session with success (only if there was an active session)
                if has_active_session:
                    window_manager.complete_recording(True, transcription_data)
                
                # Add notification to response
                response_data = transcription_data.copy()
                response_data["notification"] = notification
                response_data["attempts"] = retry_result.attempts
                response_data["audio_id"] = audio_id
                response_data["saved_audio_path"] = saved_audio_path
                response_data["transcription_id"] = transcription_id
                
                # DEBUG: Log cost_usd before returning to frontend
                print(f"🔍 DEBUG - Response data cost_usd: {response_data.get('cost_usd')}, duration_seconds: {response_data.get('duration_seconds')}")
                print(f"✅ Returning transcription response with ID: {transcription_id}")
                return jsonify(response_data)
            
            else:
                # Transcription failed after all retries
                user_friendly_error = get_user_friendly_error(retry_result.retry_reason, retry_result.error)
                error_reason = f"{retry_result.retry_reason.value if retry_result.retry_reason else 'unknown'}: {retry_result.error}"
                
                # If audio wasn't saved yet (because save_audio=OFF), save it temporarily for retry
                if not audio_id and os.path.exists(temp_file_path):
                    try:
                        logger.info(f"💾 Saving audio temporarily for retry (with 15s timeout)")
                        step_start = time.time()
                        
                        audio_metadata = {
                            'original_filename': audio_file.filename,
                            'upload_timestamp': datetime.now().isoformat(),
                            'status': 'failed',
                            'is_temporary': True,
                            'note': 'Saved temporarily for retry - will be deleted on next recording'
                        }
                        
                        # Use safe method with timeout
                        audio_id, saved_audio_path = save_temp_audio_with_metadata_safe(
                            temp_path=temp_file_path,
                            metadata=audio_metadata,
                            is_failed=True,
                            timeout=15
                        )
                        
                        step_elapsed = time.time() - step_start
                        if audio_id:
                            logger.info(f"✅ Audio saved temporarily in {step_elapsed:.2f}s: {audio_id}")
                        else:
                            logger.warning(f"⚠️ Failed to save audio temporarily (timeout after {step_elapsed:.2f}s)")
                    except Exception as audio_save_error:
                        step_elapsed = time.time() - step_start if 'step_start' in locals() else 0
                        logger.error(f"❌ Error saving audio temporarily after {step_elapsed:.2f}s: {audio_save_error}")
                
                # Move audio to failed directory (if audio was saved or just saved temporarily)
                if audio_id:
                    storage = get_default_storage_manager()
                    storage.move_to_failed(audio_id, error_reason)
                    
                    # Update metadata with failure details
                    failure_metadata = {
                        'status': 'failed',
                        'error_reason': error_reason,
                        'failed_attempts': retry_result.attempts,
                        'failed_timestamp': datetime.now().isoformat(),
                        'retry_reason': retry_result.retry_reason.value if retry_result.retry_reason else None
                    }
                    storage.update_audio_status(audio_id, 'failed', failure_metadata)
                
                # Save failed transcription to database for UI display
                transcription_id = None
                try:
                    # Add "Download audio file" hint to user-friendly message
                    display_message = f"{user_friendly_error} You can download the audio file."
                    failed_data = {
                        'text': display_message,  # Show user-friendly message
                        'language': None,
                        'duration': None
                    }
                    transcription_id = save_transcription(
                        failed_data, 
                        audio_id=audio_id, 
                        status='error', 
                        error_message=error_reason
                    )
                    print(f"📝 Failed transcription saved with ID: {transcription_id}")
                except Exception as db_error:
                    print(f"Warning: Failed to save error transcription to database: {db_error}")
                
                # Complete recording session with failure (only if there was an active session)
                if has_active_session:
                    window_manager.complete_recording(False, {
                        "error": retry_result.error,
                        "retry_reason": retry_result.retry_reason.value if retry_result.retry_reason else None,
                        "attempts": retry_result.attempts
                    })
                
                # Create notification for failed transcription
                notification = create_retry_notification(retry_result)
                
                return jsonify({
                    "error": "Transcription failed after retries",
                    "details": retry_result.error,
                    "user_message": user_friendly_error,
                    "notification": notification,
                    "attempts": retry_result.attempts,
                    "retry_reason": retry_result.retry_reason.value if retry_result.retry_reason else None,
                    "audio_id": audio_id,
                    "saved_audio_path": saved_audio_path,
                    "transcription_id": transcription_id,
                    "can_download": True
                }), 500
        
        except Exception as api_error:
            # Save failed transcription to database with specific error message
            transcription_id = None
            
            # Generate user-friendly message using helper function
            user_friendly_message = get_user_friendly_api_error(api_error, audio_id)
            
            # Save to database only if audio_id exists
            if audio_id:
                try:
                    error_message = f"API Error: {str(api_error)}"
                    failed_data = {
                        'text': user_friendly_message,
                        'language': None,
                        'duration': None
                    }
                    transcription_id = save_transcription(
                        failed_data, 
                        audio_id=audio_id, 
                        status='error', 
                        error_message=error_message
                    )
                    print(f"📝 Failed transcription saved with ID: {transcription_id}")
                except Exception as db_error:
                    print(f"Warning: Failed to save error transcription to database: {db_error}")
            
            # Complete recording session with failure (only if there was an active session)
            if has_active_session:
                window_manager.complete_recording(False, {"error": str(api_error)})
            
            # Clean up temporary file on error
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
            
            # Return user-friendly message if available, otherwise generic message
            error_response = user_friendly_message if user_friendly_message else "Transcription failed"
            
            return jsonify({
                "error": error_response,
                "details": str(api_error),
                "audio_id": audio_id,
                "transcription_id": transcription_id,
                "can_download": bool(audio_id)
            }), 500
    
    except Exception as e:
        logger.error(f"\n{'='*80}")
        logger.error(f"❌ CRITICAL ERROR IN /api/transcribe")
        logger.error(f"{'='*80}")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Error message: {str(e)}")
        
        # Print full traceback for debugging
        import traceback
        logger.error(f"\n📋 Full Traceback:")
        logger.error(traceback.format_exc())
        logger.error(f"{'='*80}\n")
        
        # Save failed transcription to database if audio was saved
        transcription_id = None
        audio_id = locals().get('audio_id')
        
        # Generate user-friendly message using helper function
        user_friendly_message = get_user_friendly_server_error(e, audio_id)
        
        # Save to database only if audio_id exists
        if audio_id:
            try:
                error_message = f"Server Error: {str(e)}"
                failed_data = {
                    'text': user_friendly_message,
                    'language': None,
                    'duration': None
                }
                transcription_id = save_transcription(
                    failed_data, 
                    audio_id=audio_id, 
                    status='error', 
                    error_message=error_message
                )
                print(f"📝 Failed transcription saved with ID: {transcription_id}")
            except Exception as db_error:
                print(f"Warning: Failed to save error transcription to database: {db_error}")
        
        # Complete recording session with failure (only if there was an active session)
        if 'has_active_session' in locals() and has_active_session:
            window_manager = get_shared_window_manager()
            window_manager.complete_recording(False, {"error": str(e)})
        
        # Return user-friendly message if available, otherwise generic message
        error_response = user_friendly_message if user_friendly_message else "Server error"
        
        return jsonify({
            "error": error_response,
            "details": str(e),
            "audio_id": audio_id,
            "transcription_id": transcription_id,
            "can_download": bool(audio_id)
        }), 500


# Database helper functions
def save_transcription(data, audio_id=None, status='success', error_message=None):
    """Save transcription to database and return the ID
    
    Args:
        data: Dictionary with transcription data (text, language, duration)
        audio_id: ID of the saved audio file
        status: 'success' or 'error'
        error_message: Error message if status is 'error'
    """
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    # Use local timestamp instead of SQLite's CURRENT_TIMESTAMP
    local_timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    cursor.execute('''
        INSERT INTO transcriptions (text, created_at, language, duration, audio_id, status, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (data['text'], local_timestamp, data.get('language'), data.get('duration'), audio_id, status, error_message))
    
    transcription_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    print(f"✅ Transcription saved with ID: {transcription_id} at {local_timestamp} (status: {status}, audio_id: {audio_id})")
    return transcription_id

def get_transcriptions():
    """Get all transcriptions ordered by newest first"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, text, created_at, language, duration, audio_id, status, error_message
        FROM transcriptions
        ORDER BY created_at DESC
    ''')
    
    rows = cursor.fetchall()
    conn.close()
    
    transcriptions = []
    for row in rows:
        transcriptions.append({
            'id': row[0],
            'text': row[1],
            'created_at': row[2],
            'language': row[3],
            'duration': row[4],
            'audio_id': row[5],
            'status': row[6] if len(row) > 6 else 'success',  # Default to success for old records
            'error_message': row[7] if len(row) > 7 else None
        })
    
    return transcriptions

def delete_transcription(transcription_id):
    """Delete a transcription by ID"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM transcriptions WHERE id = ?', (transcription_id,))
    
    conn.commit()
    affected_rows = cursor.rowcount
    conn.close()
    
    return affected_rows > 0

def get_transcription_by_audio_id(audio_id):
    """Get a transcription by its audio_id
    
    Args:
        audio_id: ID of the audio file
        
    Returns:
        Dictionary with transcription data or None if not found
    """
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, text, created_at, language, duration, audio_id, status, error_message
        FROM transcriptions
        WHERE audio_id = ?
        ORDER BY created_at DESC
        LIMIT 1
    ''', (audio_id,))
    
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return {
            'id': row[0],
            'text': row[1],
            'created_at': row[2],
            'language': row[3],
            'duration': row[4],
            'audio_id': row[5],
            'status': row[6] if len(row) > 6 else 'success',
            'error_message': row[7] if len(row) > 7 else None
        }
    return None

def update_transcription(transcription_id, data, status='success', error_message=None):
    """Update an existing transcription
    
    Args:
        transcription_id: ID of the transcription to update
        data: Dictionary with transcription data (text, language, duration)
        status: 'success' or 'error'
        error_message: Error message if status is 'error'
        
    Returns:
        True if update was successful, False otherwise
    """
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        UPDATE transcriptions 
        SET text = ?, language = ?, duration = ?, status = ?, error_message = ?
        WHERE id = ?
    ''', (data['text'], data.get('language'), data.get('duration'), status, error_message, transcription_id))
    
    affected_rows = cursor.rowcount
    conn.commit()
    conn.close()
    
    print(f"✅ Transcription {transcription_id} updated (status: {status})")
    return affected_rows > 0

# New API endpoints for transcription history
@app.route('/api/history', methods=['GET'])
def get_history():
    """Get transcription history"""
    try:
        transcriptions = get_transcriptions()
        return jsonify({
            "transcriptions": transcriptions,
            "count": len(transcriptions)
        })
    except Exception as e:
        return jsonify({
            "error": "Failed to fetch history",
            "details": str(e)
        }), 500

@app.route('/api/history/<int:transcription_id>', methods=['DELETE'])
def delete_history_item(transcription_id):
    """Delete a specific transcription"""
    try:
        success = delete_transcription(transcription_id)
        if success:
            return jsonify({"message": "Transcription deleted successfully"})
        else:
            return jsonify({"error": "Transcription not found"}), 404
    except Exception as e:
        return jsonify({
            "error": "Failed to delete transcription",
            "details": str(e)
        }), 500

@app.route('/api/transcribe/retry', methods=['POST'])
def retry_transcription():
    """
    Manually retry transcription for a failed audio file
    
    Expected: multipart/form-data with 'audio' file and optional 'max_attempts'
    Returns: JSON with transcribed text or error details
    """
    try:
        # Check if API is available
        if not API_AVAILABLE:
            return jsonify({
                "error": "OpenAI API not available",
                "details": "Please configure OPENAI_API_KEY in .env file"
            }), 503
        
        # Check if audio file is present
        if 'audio' not in request.files:
            return jsonify({"error": "No audio file provided"}), 400
        
        audio_file = request.files['audio']
        if audio_file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Get max attempts from form data (default to 5 for manual retry)
        max_attempts = int(request.form.get('max_attempts', 5))
        max_attempts = min(max_attempts, 10)  # Cap at 10 attempts
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_file:
            audio_file.save(temp_file.name)
            temp_file_path = temp_file.name
        
        try:
            # Get audio duration for dynamic timeout calculation
            audio_duration = get_audio_duration(temp_file_path)
            
            # Generate prompt from dictionary
            whisper_prompt = generate_whisper_prompt_from_dictionary()
            
            # Retry transcription with more attempts for manual retry
            retry_result = transcribe_with_retry(
                audio_file_path=temp_file_path,
                openai_client=get_openai_client(),
                max_attempts=max_attempts,
                prompt=whisper_prompt,
                audio_duration=audio_duration
            )
            
            # Clean up temporary file
            os.unlink(temp_file_path)
            
            if retry_result.success:
                # Save transcription to database and get ID
                transcription_data = retry_result.data
                transcription_id = None
                
                try:
                    transcription_id = save_transcription(transcription_data)
                    print(f"📝 Manual retry transcription saved with ID: {transcription_id}")
                except Exception as db_error:
                    print(f"Warning: Failed to save transcription to database: {db_error}")
                
                # Create notification for successful manual retry
                notification = create_retry_notification(retry_result)
                notification["type"] = "manual_retry_success"
                notification["title"] = "Manual Retry Successful"
                
                # Add notification to response
                response_data = transcription_data.copy()
                response_data["notification"] = notification
                response_data["attempts"] = retry_result.attempts
                response_data["manual_retry"] = True
                response_data["transcription_id"] = transcription_id
                
                print(f"✅ Returning manual retry response with ID: {transcription_id}")
                return jsonify(response_data)
            
            else:
                # Manual retry also failed
                notification = create_retry_notification(retry_result)
                notification["type"] = "manual_retry_failed"
                notification["title"] = "Manual Retry Failed"
                
                user_friendly_error = get_user_friendly_error(retry_result.retry_reason, retry_result.error)
                
                return jsonify({
                    "error": "Manual retry failed",
                    "details": retry_result.error,
                    "user_message": user_friendly_error,
                    "notification": notification,
                    "attempts": retry_result.attempts,
                    "retry_reason": retry_result.retry_reason.value if retry_result.retry_reason else None,
                    "manual_retry": True
                }), 500
        
        except Exception as api_error:
            # Clean up temporary file on error
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
            
            return jsonify({
                "error": "Manual retry failed",
                "details": str(api_error),
                "manual_retry": True
            }), 500
    
    except Exception as e:
        return jsonify({
            "error": "Server error during manual retry",
            "details": str(e)
        }), 500

@app.route('/api/audio/<audio_id>/retry', methods=['POST'])
def retry_audio_transcription(audio_id):
    """
    Retry transcription for a failed audio file by audio_id
    
    More efficient than /api/transcribe/retry as it uses the stored audio file
    directly without requiring re-upload.
    
    Args:
        audio_id: ID of the stored audio file
        
    JSON body (optional):
        - max_attempts: Maximum retry attempts (default: 3, max: 5)
        
    Returns:
        JSON with updated transcription or error details
    """
    try:
        # Check if API is available
        if not API_AVAILABLE:
            return jsonify({
                "error": "OpenAI API not available",
                "details": "Please configure OPENAI_API_KEY in .env file"
            }), 503
        
        # Get audio metadata
        storage = get_default_storage_manager()
        audio_info = storage.get_audio_info(audio_id)
        
        if not audio_info:
            return jsonify({
                "error": "Audio file not found",
                "details": f"No audio file with ID {audio_id}"
            }), 404
        
        # Get audio file path
        audio_path = audio_info.get('saved_path')
        if not audio_path or not os.path.exists(audio_path):
            return jsonify({
                "error": "Audio file not accessible",
                "details": "Audio file path is invalid or file has been deleted"
            }), 404
        
        # Get existing transcription
        existing_transcription = get_transcription_by_audio_id(audio_id)
        if not existing_transcription:
            return jsonify({
                "error": "Transcription not found",
                "details": "No transcription found for this audio file"
            }), 404
        
        transcription_id = existing_transcription['id']
        
        # Get max attempts from request body (default to 3 for UI retry, cap at 5)
        data = request.get_json() or {}
        max_attempts = int(data.get('max_attempts', 3))
        max_attempts = min(max_attempts, 5)  # Cap at 5 attempts
        
        print(f"🔄 Retrying transcription for audio_id: {audio_id}, transcription_id: {transcription_id}, max_attempts: {max_attempts}")
        
        # Get audio duration for dynamic timeout calculation
        audio_duration = get_audio_duration(audio_path)
        
        # Generate prompt from dictionary
        whisper_prompt = generate_whisper_prompt_from_dictionary()
        
        # Retry transcription
        retry_result = transcribe_with_retry(
            audio_file_path=audio_path,
            openai_client=get_openai_client(),
            max_attempts=max_attempts,
            prompt=whisper_prompt,
            audio_duration=audio_duration
        )
        
        if retry_result.success:
            # Update existing transcription with success
            transcription_data = retry_result.data
            update_success = update_transcription(
                transcription_id=transcription_id,
                data=transcription_data,
                status='success',
                error_message=None
            )
            
            if not update_success:
                print(f"⚠️ Warning: Failed to update transcription {transcription_id}")
            
            # Create notification for successful retry
            notification = create_retry_notification(retry_result)
            notification["type"] = "retry_success"
            notification["title"] = "Retry Successful"
            
            # Build response
            response_data = transcription_data.copy()
            response_data["notification"] = notification
            response_data["attempts"] = retry_result.attempts
            response_data["retry"] = True
            response_data["transcription_id"] = transcription_id
            response_data["audio_id"] = audio_id
            response_data["status"] = "success"
            
            print(f"✅ Retry successful for transcription {transcription_id}")
            return jsonify(response_data)
        
        else:
            # Retry failed - update transcription with error
            user_friendly_error = get_user_friendly_error(retry_result.retry_reason, retry_result.error)
            
            error_data = {
                'text': user_friendly_error,
                'language': None,
                'duration': audio_info.get('duration')
            }
            
            update_success = update_transcription(
                transcription_id=transcription_id,
                data=error_data,
                status='error',
                error_message=retry_result.error
            )
            
            if not update_success:
                print(f"⚠️ Warning: Failed to update transcription {transcription_id} with error")
            
            # Create notification for failed retry
            notification = create_retry_notification(retry_result)
            notification["type"] = "retry_failed"
            notification["title"] = "Retry Failed"
            
            print(f"❌ Retry failed for transcription {transcription_id}: {user_friendly_error}")
            
            return jsonify({
                "error": "Retry failed",
                "details": retry_result.error,
                "user_message": user_friendly_error,
                "notification": notification,
                "attempts": retry_result.attempts,
                "retry_reason": retry_result.retry_reason.value if retry_result.retry_reason else None,
                "retry": True,
                "transcription_id": transcription_id,
                "audio_id": audio_id,
                "status": "error",
                "text": user_friendly_error
            }), 500
    
    except Exception as e:
        print(f"❌ Error during retry for audio_id {audio_id}: {str(e)}")
        return jsonify({
            "error": "Server error during retry",
            "details": str(e),
            "audio_id": audio_id
        }), 500

@app.route('/api/audio/list', methods=['GET'])
def list_audio_files():
    """
    List stored audio files with optional filtering
    
    Query parameters:
    - status: Filter by status ('saved', 'failed', 'transcribed')
    - limit: Maximum number of files to return
    """
    try:
        storage = get_default_storage_manager()
        
        # Get query parameters
        status = request.args.get('status')
        limit = request.args.get('limit', type=int)
        
        # Get audio files
        audio_files = storage.list_audio_files(status=status, limit=limit)
        
        return jsonify({
            "audio_files": audio_files,
            "count": len(audio_files),
            "status_filter": status,
            "limit": limit
        })
        
    except Exception as e:
        return jsonify({
            "error": "Failed to list audio files",
            "details": str(e)
        }), 500

@app.route('/api/audio/<audio_id>', methods=['GET'])
def get_audio_info(audio_id):
    """Get information about a specific audio file"""
    try:
        storage = get_default_storage_manager()
        audio_info = storage.get_audio_info(audio_id)
        
        if not audio_info:
            return jsonify({"error": "Audio file not found"}), 404
        
        return jsonify(audio_info)
        
    except Exception as e:
        return jsonify({
            "error": "Failed to get audio info",
            "details": str(e)
        }), 500

@app.route('/api/audio/<audio_id>/download', methods=['GET'])
def download_audio_file(audio_id):
    """Download audio file converted to MP3 format"""
    temp_mp3_path = None
    try:
        storage = get_default_storage_manager()
        audio_info = storage.get_audio_info(audio_id)
        
        if not audio_info:
            return jsonify({"error": "Audio file not found"}), 404
        
        audio_path = audio_info['saved_path']
        if not os.path.exists(audio_path):
            return jsonify({"error": "Audio file not found on disk"}), 404
        
        # Try to convert WebM to MP3 (if FFmpeg available)
        logger.info(f"🎵 Attempting audio download: {audio_id}")
        logger.info(f"   Source: {audio_path}")
        
        # Check if FFmpeg is available
        ffmpeg_available = False
        try:
            import subprocess
            result = subprocess.run(['ffmpeg', '-version'], 
                                  capture_output=True, 
                                  timeout=2)
            if result.returncode == 0:
                ffmpeg_available = True
                logger.info("✅ FFmpeg available - will convert to MP3")
        except (FileNotFoundError, subprocess.TimeoutExpired):
            logger.info("ℹ️ FFmpeg not found - will download as WebM")
        
        # If FFmpeg available, try MP3 conversion
        if ffmpeg_available:
            try:
                from pydub import AudioSegment
                
                # Load WebM audio
                temp_mp3_path = None
                try:
                    audio = AudioSegment.from_file(audio_path, format="webm")
                    logger.info(f"   Duration: {len(audio)/1000:.2f}s")
                except Exception as load_error:
                    logger.info(f"ℹ️ Failed to load WebM for conversion: {load_error}")
                    raise
                
                # Create temporary MP3 file
                temp_mp3_path = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3').name
                
                # Export as MP3 with 128kbps (good quality, universal compatibility)
                try:
                    audio.export(temp_mp3_path, format="mp3", bitrate="128k")
                    mp3_size = os.path.getsize(temp_mp3_path)
                    logger.info(f"✅ MP3 created: {mp3_size / 1024:.2f} KB")
                except Exception as export_error:
                    logger.info(f"ℹ️ Failed to export MP3: {export_error}")
                    if os.path.exists(temp_mp3_path):
                        os.remove(temp_mp3_path)
                    raise
                
                # Generate MP3 filename
                original_filename = audio_info['saved_filename']
                mp3_filename = original_filename.replace('.webm', '.mp3')
                
                from flask import send_file
                
                # Send file and schedule cleanup
                @after_this_request
                def cleanup_temp_file(response):
                    try:
                        if temp_mp3_path and os.path.exists(temp_mp3_path):
                            os.remove(temp_mp3_path)
                            logger.info(f"🧹 Cleaned up temporary MP3: {temp_mp3_path}")
                    except Exception as e:
                        logger.warning(f"⚠️ Could not clean up temp file: {e}")
                    return response
                
                logger.info(f"📥 Downloading as MP3: {mp3_filename}")
                return send_file(
                    temp_mp3_path,
                    as_attachment=True,
                    download_name=mp3_filename,
                    mimetype='audio/mpeg'
                )
                
            except (ImportError, Exception) as conversion_error:
                # MP3 conversion failed - fallback to WebM silently
                logger.info(f"ℹ️ MP3 conversion not possible, falling back to WebM")
                if temp_mp3_path and os.path.exists(temp_mp3_path):
                    try:
                        os.remove(temp_mp3_path)
                    except:
                        pass
        
        # Fallback: Download original WebM (either FFmpeg not available or conversion failed)
        from flask import send_file
        logger.info(f"📥 Downloading as WebM: {audio_info['saved_filename']}")
        return send_file(
            audio_path,
            as_attachment=True,
            download_name=audio_info['saved_filename'],
            mimetype='audio/webm'
        )
        
    except Exception as e:
        # Cleanup temp file on error
        if temp_mp3_path and os.path.exists(temp_mp3_path):
            try:
                os.remove(temp_mp3_path)
            except:
                pass
        
        # Generate user-friendly error message
        error_str = str(e)
        error_lower = error_str.lower()
        
        if "permission" in error_lower or "access denied" in error_lower:
            user_message = "Cannot access the audio file. Please check file permissions."
        elif "disk" in error_lower or "space" in error_lower:
            user_message = "Insufficient disk space. Please free up some space and try again."
        elif "not found" in error_lower or "no such file" in error_lower:
            user_message = "Audio file not found. It may have been deleted."
        else:
            user_message = "Failed to download audio file. Please try again."
        
        return jsonify({
            "error": user_message,
            "details": str(e)
        }), 500

@app.route('/api/audio/<audio_id>', methods=['DELETE'])
def delete_audio_file(audio_id):
    """Delete a specific audio file"""
    try:
        storage = get_default_storage_manager()
        success = storage.delete_audio(audio_id)
        
        if success:
            return jsonify({"message": "Audio file deleted successfully"})
        else:
            return jsonify({"error": "Audio file not found"}), 404
            
    except Exception as e:
        return jsonify({
            "error": "Failed to delete audio file",
            "details": str(e)
        }), 500

@app.route('/api/audio/stats', methods=['GET'])
def get_storage_stats():
    """Get storage statistics"""
    try:
        storage = get_default_storage_manager()
        # Pass cleanup_days=14 to calculate eligible files
        stats = storage.get_storage_stats(cleanup_days=14)
        
        return jsonify(stats)
        
    except Exception as e:
        return jsonify({
            "error": "Failed to get storage stats",
            "details": str(e)
        }), 500

@app.route('/api/audio/cleanup', methods=['POST'])
def cleanup_old_files():
    """
    Clean up old audio files and update transcriptions database
    
    JSON body:
    - days_old: Delete files older than this many days (default: 30)
    - keep_failed: Whether to keep failed files (default: true)
    """
    try:
        data = request.get_json() or {}
        days_old = data.get('days_old', 30)
        keep_failed = data.get('keep_failed', True)
        
        storage = get_default_storage_manager()
        deleted_count, deleted_audio_ids = storage.cleanup_old_files(days_old, keep_failed)
        
        # Update transcriptions database: set audio_id to NULL for deleted files
        if deleted_audio_ids:
            conn = sqlite3.connect(DATABASE_PATH)
            cursor = conn.cursor()
            
            # Create placeholders for SQL IN clause
            placeholders = ','.join('?' * len(deleted_audio_ids))
            cursor.execute(f'''
                UPDATE transcriptions 
                SET audio_id = NULL 
                WHERE audio_id IN ({placeholders})
            ''', deleted_audio_ids)
            
            updated_count = cursor.rowcount
            conn.commit()
            conn.close()
            
            print(f"✅ Updated {updated_count} transcriptions to remove deleted audio references")
        
        return jsonify({
            "message": "Cleanup completed successfully",
            "deleted_count": deleted_count,
            "days_old": days_old,
            "kept_failed": keep_failed
        })
        
    except Exception as e:
        # Generate user-friendly error message
        error_str = str(e)
        error_lower = error_str.lower()
        
        if "permission" in error_lower or "access denied" in error_lower:
            user_message = "Cannot delete files. Please check application permissions."
        elif "in use" in error_lower or "being used" in error_lower:
            user_message = "Some files are in use. Please close other apps and try again."
        else:
            user_message = "Failed to clean up files. Please try again."
        
        return jsonify({
            "error": user_message,
            "details": str(e)
        }), 500

# ==========================
# DICTIONARY ENDPOINTS
# ==========================

@app.route('/api/dictionary/words', methods=['GET'])
def get_dictionary_words():
    """Get all words from custom dictionary"""
    try:
        dictionary = get_default_dictionary_manager()
        words = dictionary.get_all_words()
        
        return jsonify({
            "words": words,
            "count": len(words)
        })
        
    except Exception as e:
        # Generate user-friendly error message
        error_str = str(e)
        error_lower = error_str.lower()
        
        if "permission" in error_lower or "access denied" in error_lower:
            user_message = "Cannot access dictionary. Please check application permissions."
        elif "not found" in error_lower or "no such file" in error_lower:
            user_message = "Dictionary file not found. It will be created when you add a word."
        else:
            user_message = "Failed to load dictionary. Please try again."
        
        return jsonify({
            "error": user_message,
            "details": str(e)
        }), 500

@app.route('/api/dictionary/words', methods=['POST'])
def add_dictionary_word():
    """
    Add a word to custom dictionary
    
    JSON body:
    - word: The word to add (required)
    - case_sensitive: Whether to preserve exact case (default: true)
    """
    try:
        data = request.get_json()
        
        if not data or 'word' not in data:
            return jsonify({
                "error": "Missing required field: word"
            }), 400
        
        word = data.get('word')
        case_sensitive = data.get('case_sensitive', True)
        
        dictionary = get_default_dictionary_manager()
        word_entry = dictionary.add_word(word, case_sensitive)
        
        if not word_entry:
            return jsonify({
                "error": "Failed to add word. It may already exist or dictionary is full."
            }), 400
        
        return jsonify({
            "message": "Word added successfully",
            "word": word_entry
        }), 201
        
    except Exception as e:
        # Generate user-friendly error message
        error_str = str(e)
        error_lower = error_str.lower()
        
        if "permission" in error_lower or "access denied" in error_lower:
            user_message = "Cannot save to dictionary. Please check application permissions."
        elif "disk" in error_lower or "space" in error_lower:
            user_message = "Insufficient disk space. Please free up some space."
        else:
            user_message = "Failed to add word. Please try again."
        
        return jsonify({
            "error": user_message,
            "details": str(e)
        }), 500

@app.route('/api/dictionary/words/<word_id>', methods=['PUT'])
def update_dictionary_word(word_id):
    """
    Update a word in custom dictionary
    
    JSON body:
    - word: The updated word (required)
    - case_sensitive: Whether to preserve exact case (default: true)
    """
    try:
        data = request.get_json()
        
        if not data or 'word' not in data:
            return jsonify({
                "error": "Missing required field: word"
            }), 400
        
        word = data.get('word')
        case_sensitive = data.get('case_sensitive', True)
        
        dictionary = get_default_dictionary_manager()
        word_entry = dictionary.update_word(word_id, word, case_sensitive)
        
        if not word_entry:
            return jsonify({
                "error": "Failed to update word. It may not exist or conflict with another word."
            }), 400
        
        return jsonify({
            "message": "Word updated successfully",
            "word": word_entry
        })
        
    except Exception as e:
        return jsonify({
            "error": "Failed to update word",
            "details": str(e)
        }), 500

@app.route('/api/dictionary/words/<word_id>', methods=['DELETE'])
def delete_dictionary_word(word_id):
    """Delete a word from custom dictionary"""
    try:
        dictionary = get_default_dictionary_manager()
        success = dictionary.delete_word(word_id)
        
        if not success:
            return jsonify({
                "error": "Word not found"
            }), 404
        
        return jsonify({
            "message": "Word deleted successfully"
        })
        
    except Exception as e:
        return jsonify({
            "error": "Failed to delete word",
            "details": str(e)
        }), 500

@app.route('/api/dictionary/stats', methods=['GET'])
def get_dictionary_stats():
    """Get dictionary statistics"""
    try:
        dictionary = get_default_dictionary_manager()
        stats = dictionary.get_stats()
        
        return jsonify(stats)
        
    except Exception as e:
        return jsonify({
            "error": "Failed to get dictionary stats",
            "details": str(e)
        }), 500

@app.route('/api/dictionary/enabled', methods=['PUT'])
def set_dictionary_enabled():
    """
    Enable or disable dictionary
    
    JSON body:
    - enabled: true/false
    """
    try:
        data = request.get_json()
        
        if not data or 'enabled' not in data:
            return jsonify({
                "error": "Missing required field: enabled"
            }), 400
        
        enabled = data.get('enabled')
        
        dictionary = get_default_dictionary_manager()
        success = dictionary.set_enabled(enabled)
        
        if not success:
            return jsonify({
                "error": "Failed to update dictionary enabled state"
            }), 500
        
        return jsonify({
            "message": f"Dictionary {'enabled' if enabled else 'disabled'} successfully",
            "enabled": enabled
        })
        
    except Exception as e:
        return jsonify({
            "error": "Failed to set dictionary enabled state",
            "details": str(e)
        }), 500

# ==========================
# CONFIG ENDPOINTS
# ==========================

@app.route('/api/config/settings', methods=['GET'])
def get_all_settings():
    """Get all application settings"""
    try:
        config_manager = get_default_config_manager()
        settings = config_manager.get_all_settings()
        
        return jsonify({
            "settings": settings,
            "message": "Settings retrieved successfully"
        })
        
    except Exception as e:
        return jsonify({
            "error": "Failed to get settings",
            "details": str(e)
        }), 500

@app.route('/api/config/settings', methods=['POST'])
def update_settings():
    """Update application settings"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No settings provided"}), 400
        
        config_manager = get_default_config_manager()
        
        # Update each setting
        updated_keys = []
        errors = []
        
        for key, value in data.items():
            try:
                success = config_manager.set_setting(key, value)
                if success:
                    updated_keys.append(key)
                else:
                    errors.append(f"Failed to update {key}")
            except Exception as e:
                errors.append(f"Error updating {key}: {str(e)}")
        
        return jsonify({
            "message": "Settings updated",
            "updated_keys": updated_keys,
            "errors": errors if errors else None,
            "success": len(errors) == 0
        })
        
    except Exception as e:
        # Generate user-friendly error message
        error_str = str(e)
        error_lower = error_str.lower()
        
        if "permission" in error_lower or "access denied" in error_lower:
            user_message = "Cannot save settings. Please check application permissions."
        elif "disk" in error_lower or "space" in error_lower:
            user_message = "Insufficient disk space. Please free up some space."
        else:
            user_message = "Failed to save settings. Please try again."
        
        return jsonify({
            "error": user_message,
            "details": str(e)
        }), 500

@app.route('/api/config/api-key', methods=['GET'])
def get_api_key_status():
    """Get API key status (masked)"""
    try:
        config_manager = get_default_config_manager()
        api_key = config_manager.get_api_key()
        
        if api_key:
            # Return masked version with middle dots (·)
            masked = f"sk-·······{api_key[-4:]}" if len(api_key) > 10 else "sk-····****"
            return jsonify({
                "has_api_key": True,
                "api_key_masked": masked,
                "status": "configured"
            })
        else:
            return jsonify({
                "has_api_key": False,
                "status": "not_configured"
            })
            
    except Exception as e:
        return jsonify({
            "error": "Failed to get API key status",
            "details": str(e)
        }), 500

@app.route('/api/config/api-key', methods=['POST'])
def set_api_key():
    """Set and validate API key"""
    global API_AVAILABLE, _openai_client_initialized, openai_client
    
    try:
        data = request.get_json()
        if not data or 'api_key' not in data:
            return jsonify({"error": "API key not provided"}), 400
        
        api_key = data['api_key'].strip()
        config_manager = get_default_config_manager()
        
        # Validate and save
        result = config_manager.set_api_key(api_key)
        
        if result['valid']:
            # Update API_AVAILABLE flag and reset OpenAI client
            API_AVAILABLE = True
            _openai_client_initialized = False
            openai_client = None
            logger.info("✅ API_AVAILABLE flag updated to True")
            
            return jsonify({
                "message": "API key saved and validated successfully",
                "validation": result,
                "success": True
            })
        else:
            return jsonify({
                "error": "Invalid API key",
                "validation": result,
                "success": False
            }), 400
            
    except Exception as e:
        # Generate user-friendly error message
        error_str = str(e)
        error_lower = error_str.lower()
        
        if "permission" in error_lower or "access denied" in error_lower:
            user_message = "Cannot save API key. Please check application permissions."
        elif "disk" in error_lower or "space" in error_lower:
            user_message = "Insufficient disk space. Please free up some space."
        elif "network" in error_lower or "connection" in error_lower:
            user_message = "Network error. Please check your internet connection."
        else:
            user_message = "Failed to save API key. Please try again."
        
        return jsonify({
            "error": user_message,
            "details": str(e)
        }), 500

@app.route('/api/config/api-key', methods=['DELETE'])
def delete_api_key():
    """Delete API key from configuration"""
    global API_AVAILABLE, _openai_client_initialized, openai_client
    
    try:
        config_manager = get_default_config_manager()
        
        # Check if API key exists
        current_key = config_manager.get_api_key()
        if not current_key:
            return jsonify({"error": "No API key configured"}), 404
        
        # Delete the API key
        success = config_manager.delete_api_key()
        
        if success:
            # Update API_AVAILABLE flag and reset OpenAI client
            API_AVAILABLE = False
            _openai_client_initialized = False
            openai_client = None
            logger.info("⚠️  API_AVAILABLE flag updated to False (key removed)")
            
            return jsonify({
                "success": True,
                "message": "API key removed successfully"
            }), 200
        else:
            return jsonify({
                "error": "Failed to remove API key"
            }), 500
            
    except Exception as e:
        return jsonify({
            "error": "Failed to remove API key",
            "details": str(e)
        }), 500

@app.route('/api/config/api-key/validate', methods=['POST'])
def validate_api_key():
    """Validate API key without saving"""
    try:
        data = request.get_json()
        if not data or 'api_key' not in data:
            return jsonify({"error": "API key not provided"}), 400
        
        api_key = data['api_key'].strip()
        result = validate_openai_key(api_key)
        
        return jsonify({
            "validation": result,
            "message": "API key validation completed"
        })
        
    except Exception as e:
        return jsonify({
            "error": "Failed to validate API key",
            "details": str(e)
        }), 500

@app.route('/api/config/settings/<setting_key>', methods=['GET'])
def get_setting(setting_key):
    """Get a specific setting"""
    try:
        config_manager = get_default_config_manager()
        value = config_manager.get_setting(setting_key)
        
        return jsonify({
            "key": setting_key,
            "value": value,
            "message": "Setting retrieved successfully"
        })
        
    except Exception as e:
        return jsonify({
            "error": "Failed to get setting",
            "details": str(e)
        }), 500

@app.route('/api/config/settings/<setting_key>', methods=['PUT'])
def update_setting(setting_key):
    """Update a specific setting"""
    try:
        data = request.get_json()
        if not data or 'value' not in data:
            return jsonify({"error": "Setting value not provided"}), 400
        
        config_manager = get_default_config_manager()
        success = config_manager.set_setting(setting_key, data['value'])
        
        if success:
            return jsonify({
                "message": f"Setting '{setting_key}' updated successfully",
                "key": setting_key,
                "value": data['value']
            })
        else:
            return jsonify({
                "error": f"Failed to update setting '{setting_key}'"
            }), 500
            
    except Exception as e:
        return jsonify({
            "error": "Failed to update setting",
            "details": str(e)
        }), 500

@app.route('/api/config/reset', methods=['POST'])
def reset_settings():
    """Reset settings to defaults"""
    try:
        data = request.get_json() or {}
        keep_api_key = data.get('keep_api_key', True)
        
        config_manager = get_default_config_manager()
        success = config_manager.reset_to_defaults(keep_api_key)
        
        if success:
            return jsonify({
                "message": "Settings reset to defaults successfully",
                "kept_api_key": keep_api_key
            })
        else:
            return jsonify({
                "error": "Failed to reset settings"
            }), 500
            
    except Exception as e:
        return jsonify({
            "error": "Failed to reset settings",
            "details": str(e)
        }), 500

@app.route('/api/config/export', methods=['GET'])
def export_settings():
    """Export settings for backup"""
    try:
        include_api_key = request.args.get('include_api_key', 'false').lower() == 'true'
        
        config_manager = get_default_config_manager()
        export_data = config_manager.export_settings(include_api_key)
        
        return jsonify(export_data)
        
    except Exception as e:
        return jsonify({
            "error": "Failed to export settings",
            "details": str(e)
        }), 500

@app.route('/api/config/import', methods=['POST'])
def import_settings():
    """Import settings from backup"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No settings data provided"}), 400
        
        config_manager = get_default_config_manager()
        result = config_manager.import_settings(data)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
            
    except Exception as e:
        return jsonify({
            "error": "Failed to import settings",
            "details": str(e)
        }), 500

# =============================================================================
# WINDOW MANAGEMENT ENDPOINTS
# =============================================================================

@app.route('/api/window/state', methods=['GET'])
def get_application_state():
    """Get complete application state (recording, windows, widget)"""
    try:
        window_manager = get_shared_window_manager()
        state = window_manager.get_full_state()
        
        return jsonify({
            "state": state,
            "message": "Application state retrieved successfully"
        })
        
    except Exception as e:
        return jsonify({
            "error": "Failed to get application state",
            "details": str(e)
        }), 500

@app.route('/api/window/widget/position', methods=['GET'])
def get_widget_position():
    """Get current widget position"""
    try:
        window_manager = get_shared_window_manager()
        position = window_manager.get_widget_position()
        
        return jsonify({
            "position": position,
            "message": "Widget position retrieved successfully"
        })
        
    except Exception as e:
        return jsonify({
            "error": "Failed to get widget position",
            "details": str(e)
        }), 500

@app.route('/api/window/widget/position', methods=['POST'])
def set_widget_position():
    """Set widget position"""
    try:
        data = request.get_json()
        if not data or 'x' not in data or 'y' not in data:
            return jsonify({"error": "Position coordinates (x, y) required"}), 400
        
        x = int(data['x'])
        y = int(data['y'])
        
        window_manager = get_shared_window_manager()
        success = window_manager.set_widget_position(x, y)
        
        if success:
            return jsonify({
                "message": "Widget position updated successfully",
                "position": {"x": x, "y": y}
            })
        else:
            return jsonify({
                "error": "Failed to update widget position"
            }), 500
            
    except (ValueError, TypeError) as e:
        return jsonify({
            "error": "Invalid position coordinates",
            "details": str(e)
        }), 400
    except Exception as e:
        return jsonify({
            "error": "Failed to set widget position",
            "details": str(e)
        }), 500

@app.route('/api/window/recording/start', methods=['POST'])
def start_recording_session():
    """Start recording session from a specific window"""
    try:
        data = request.get_json()
        if not data or 'initiated_by' not in data:
            return jsonify({"error": "Window type (initiated_by) required"}), 400
        
        window_type_str = data['initiated_by']
        try:
            window_type = WindowType(window_type_str)
        except ValueError:
            return jsonify({
                "error": "Invalid window type",
                "valid_types": [wt.value for wt in WindowType]
            }), 400
        
        window_manager = get_shared_window_manager()
        result = window_manager.start_recording(window_type)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 409  # Conflict - recording already in progress
            
    except Exception as e:
        return jsonify({
            "error": "Failed to start recording session",
            "details": str(e)
        }), 500

@app.route('/api/window/recording/stop', methods=['POST'])
def stop_recording_session():
    """Stop current recording session"""
    try:
        window_manager = get_shared_window_manager()
        result = window_manager.stop_recording()
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 409  # Conflict - no recording in progress
            
    except Exception as e:
        return jsonify({
            "error": "Failed to stop recording session",
            "details": str(e)
        }), 500

@app.route('/api/window/recording/state', methods=['GET'])
def get_recording_state():
    """Get current recording state"""
    try:
        window_manager = get_shared_window_manager()
        recording_state = window_manager.get_recording_state()
        
        return jsonify({
            "recording_state": recording_state,
            "message": "Recording state retrieved successfully"
        })
        
    except Exception as e:
        return jsonify({
            "error": "Failed to get recording state",
            "details": str(e)
        }), 500

@app.route('/api/window/buttons', methods=['GET'])
def get_button_states():
    """Get button states for both windows"""
    try:
        window_manager = get_shared_window_manager()
        button_states = window_manager.get_button_states()
        
        return jsonify({
            "button_states": button_states,
            "message": "Button states retrieved successfully"
        })
        
    except Exception as e:
        return jsonify({
            "error": "Failed to get button states",
            "details": str(e)
        }), 500

@app.route('/api/window/reset', methods=['POST'])
def reset_application_state():
    """Reset all application state (emergency reset)"""
    try:
        window_manager = get_shared_window_manager()
        result = window_manager.reset_state()
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 500
            
    except Exception as e:
        return jsonify({
            "error": "Failed to reset application state",
            "details": str(e)
        }), 500


# =============================================================================
# PERMISSIONS TRACKING ENDPOINTS
# =============================================================================

@app.route('/api/permissions/status', methods=['GET'])
def get_permissions_status():
    """Get current permissions status"""
    try:
        config_manager = get_default_config_manager()
        
        # Get saved permissions state
        permissions = config_manager.get_setting('permissions_state', {})
        
        return jsonify({
            "permissions": permissions,
            "message": "Permissions status retrieved successfully"
        })
        
    except Exception as e:
        return jsonify({
            "error": "Failed to get permissions status",
            "details": str(e)
        }), 500

@app.route('/api/permissions/update', methods=['POST'])
def update_permission_status():
    """Update permission status
    
    JSON body:
    - permission_type: 'microphone' or 'accessibility'
    - granted: true/false
    - requested_at: timestamp when permission was requested
    """
    try:
        data = request.get_json()
        
        if not data or 'permission_type' not in data:
            return jsonify({
                "error": "Missing required field: permission_type"
            }), 400
        
        permission_type = data.get('permission_type')
        granted = data.get('granted', False)
        requested_at = data.get('requested_at')
        
        # Validate permission type
        if permission_type not in ['microphone', 'accessibility']:
            return jsonify({
                "error": "Invalid permission_type. Must be 'microphone' or 'accessibility'"
            }), 400
        
        config_manager = get_default_config_manager()
        
        # Get current permissions state
        permissions = config_manager.get_setting('permissions_state', {})
        
        # Update permission
        permissions[permission_type] = {
            'granted': granted,
            'requested_at': requested_at,
            'last_checked': datetime.now().isoformat()
        }
        
        # Save updated permissions
        success = config_manager.set_setting('permissions_state', permissions)
        
        if success:
            return jsonify({
                "message": f"Permission '{permission_type}' status updated",
                "permission": permissions[permission_type]
            })
        else:
            return jsonify({
                "error": "Failed to save permission status"
            }), 500
            
    except Exception as e:
        return jsonify({
            "error": "Failed to update permission status",
            "details": str(e)
        }), 500


if __name__ == '__main__':
    # Check for API key
    if not os.getenv('OPENAI_API_KEY'):
        print("⚠️  Warning: OPENAI_API_KEY not found in environment variables")
        print("   Please add your OpenAI API key to the .env file")
    
    print("🚀 Starting Whisper Space Backend Server...")
    sys.stdout.flush()
    print("📍 Server will be available at: http://127.0.0.1:5002")
    print("🔧 API Status:", "Available" if API_AVAILABLE else "Not Available (missing API key)")
    print(f"💾 Database: {DATABASE_PATH}")
    print("📍 Endpoints available:")
    print("   - GET  /api/health")
    print("   - POST /api/transcribe")
    print("   - POST /api/transcribe/retry")
    print("   - GET  /api/history")
    print("   - DELETE /api/history/<id>")
    print("   - GET  /api/audio/list")
    print("   - GET  /api/audio/<id>")
    print("   - GET  /api/audio/<id>/download")
    print("   - DELETE /api/audio/<id>")
    print("   - GET  /api/audio/stats")
    print("   - POST /api/audio/cleanup")
    print("   - GET  /api/dictionary/words")
    print("   - POST /api/dictionary/words")
    print("   - PUT  /api/dictionary/words/<id>")
    print("   - DELETE /api/dictionary/words/<id>")
    print("   - GET  /api/dictionary/stats")
    print("   - PUT  /api/dictionary/enabled")
    print("   - GET  /api/config/settings")
    print("   - POST /api/config/settings")
    print("   - GET  /api/config/api-key")
    print("   - POST /api/config/api-key")
    print("   - POST /api/config/api-key/validate")
    print("   - GET  /api/config/settings/<key>")
    print("   - PUT  /api/config/settings/<key>")
    print("   - POST /api/config/reset")
    print("   - GET  /api/config/export")
    print("   - POST /api/config/import")
    print("   - GET  /api/window/state")
    print("   - GET  /api/window/widget/position")
    print("   - POST /api/window/widget/position")
    print("   - POST /api/window/recording/start")
    print("   - POST /api/window/recording/stop")
    print("   - GET  /api/window/recording/state")
    print("   - GET  /api/window/buttons")
    print("   - POST /api/window/reset")
    print("   - GET  /api/permissions/status")
    print("   - POST /api/permissions/update")
    print("=" * 50)
    
    # Port fallback configuration
    PORTS_TO_TRY = [57002, 57003, 57004, 57005, 57006]
    
    # Try each port until one works
    for port in PORTS_TO_TRY:
        try:
            print(f"\n🔌 Attempting to start backend on port {port}...")
            
            # Print port for Electron to detect (MUST be before app.run)
            print(f"BACKEND_PORT={port}")
            sys.stdout.flush()  # Critical: flush immediately so Electron can detect port
            print(f"✅ Backend server starting on http://127.0.0.1:{port}")
            sys.stdout.flush()  # Flush immediately
            
            # Run Flask development server (debug=False to prevent 403 errors)
            app.run(
                host='127.0.0.1',
                port=port,
                debug=False,
                use_reloader=False
            )
            
            # If we reach here, server started successfully
            break
            
        except OSError as e:
            if "Address already in use" in str(e) or "errno 48" in str(e):
                print(f"⚠️  Port {port} is already in use, trying next port...")
                continue
            else:
                print(f"❌ Failed to start server on port {port}: {e}")
                raise
        except Exception as e:
            print(f"❌ Unexpected error starting server on port {port}: {e}")
            raise
    else:
        # All ports failed
        print(f"\n❌ ERROR: All ports are in use. Tried: {', '.join(map(str, PORTS_TO_TRY))}")
        print("Please close any applications using these ports and try again.")
        raise RuntimeError(f"Could not start backend: all ports {PORTS_TO_TRY} are in use")
