"""
Fluid Transcription Module
Handles real-time chunk-by-chunk transcription during recording.
Two endpoints:
  - POST /api/transcribe/chunk   → transcribe a single WAV chunk
  - POST /api/transcribe/fluid-complete → save final assembled transcription
"""

import os
import json
import tempfile
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from flask import request, jsonify

from retry_logic import create_openai_transcription
from audio_storage import save_temp_audio_with_metadata_safe
from config_manager import get_default_config_manager

logger = logging.getLogger(__name__)

# ============================================================================
# REAL-TIME FEED WRITER
# ============================================================================

FEEDS_DIR = Path(os.path.expanduser('~/Library/Application Support/Stories/feeds'))


def _get_feed_dir(session_id):
    """Get or create the feed directory for a session."""
    feed_dir = FEEDS_DIR / session_id
    feed_dir.mkdir(parents=True, exist_ok=True)
    return feed_dir


def _write_meta(feed_dir, session_id):
    """Write meta.json on first segment (only if it doesn't exist yet)."""
    meta_path = feed_dir / 'meta.json'
    if not meta_path.exists():
        meta = {
            'session_id': session_id,
            'started_at': datetime.now(timezone.utc).isoformat(),
            'format': 'jsonl',
            'version': 2,
            'files': {'stories': 'stories-feed.jsonl', 'agent': 'agent-feed.jsonl'}
        }
        meta_path.write_text(json.dumps(meta, indent=2))
        logger.info(f"📡 Feed meta written: {meta_path}")


def _append_to_feed(session_id, segment_index, text, language, duration):
    """Append a single JSONL line to the feed file (runs in background thread)."""
    try:
        feed_dir = _get_feed_dir(session_id)
        _write_meta(feed_dir, session_id)

        line = json.dumps({
            'seg': segment_index,
            't': datetime.now(timezone.utc).isoformat(),
            'text': text,
            'lang': language,
            'dur': duration
        })

        feed_path = feed_dir / 'stories-feed.jsonl'
        with open(feed_path, 'a', encoding='utf-8') as f:
            f.write(line + '\n')

        logger.info(f"📡 Feed append: session={session_id}, seg={segment_index}, chars={len(text)}")
    except Exception as e:
        logger.error(f"❌ Feed append error: {e}")


def _append_session_end(session_id, total_segments, total_duration):
    """Append session_end marker and update the 'latest' pointer."""
    try:
        feed_dir = _get_feed_dir(session_id)

        line = json.dumps({
            'event': 'session_end',
            't': datetime.now(timezone.utc).isoformat(),
            'total_segments': total_segments,
            'total_duration': total_duration
        })

        feed_path = feed_dir / 'stories-feed.jsonl'
        with open(feed_path, 'a', encoding='utf-8') as f:
            f.write(line + '\n')

        # Write latest pointer for easy discovery
        latest_path = FEEDS_DIR / 'latest'
        latest_path.write_text(session_id)

        logger.info(f"📡 Feed session_end: session={session_id}, segments={total_segments}")
    except Exception as e:
        logger.error(f"❌ Feed session_end error: {e}")


def append_to_feed_async(session_id, segment_index, text, language, duration):
    """Non-blocking feed append — fires and forgets in a daemon thread."""
    t = threading.Thread(
        target=_append_to_feed,
        args=(session_id, segment_index, text, language, duration),
        daemon=True
    )
    t.start()


def append_session_end_async(session_id, total_segments, total_duration):
    """Non-blocking session_end append."""
    t = threading.Thread(
        target=_append_session_end,
        args=(session_id, total_segments, total_duration),
        daemon=True
    )
    t.start()


def register_fluid_routes(app, get_openai_client, generate_whisper_prompt, save_transcription_fn, DATABASE_PATH,
                          transcribe_chunk_fn=None, stt_credentials_check=None):
    """
    Register fluid transcription routes on the Flask app.

    Args:
        app: Flask app instance
        get_openai_client: callable that returns an OpenAI client (legacy fallback)
        generate_whisper_prompt: callable that returns whisper prompt string
        save_transcription_fn: callable to save transcription to DB
        DATABASE_PATH: path to SQLite database
        transcribe_chunk_fn: optional unified transcription dispatcher
            (audio_file_path, prompt, audio_duration, max_attempts) -> RetryResult
            When provided, used instead of calling Whisper directly so the active
            STT engine selected in settings drives chunk transcription.
        stt_credentials_check: optional callable returning (ok, error_msg) for the active engine
    """

    @app.route('/api/transcribe/chunk', methods=['POST'])
    def transcribe_chunk():
        """
        Transcribe a single WAV audio chunk.
        Lightweight — no DB write, no audio storage.

        Request: multipart/form-data { audio: WAV, session_id: str, segment_index: int }
        Response: { text: str, segment_index: int, language: str, duration: float }
        """
        try:
            # Validate audio file
            if 'audio' not in request.files:
                return jsonify({"error": "No audio file provided", "segment_index": -1, "retryable": False}), 400

            audio_file = request.files['audio']
            session_id = request.form.get('session_id', 'unknown')
            segment_index = int(request.form.get('segment_index', 0))

            logger.info(f"🔄 Fluid chunk received: session={session_id}, segment={segment_index}")

            # Verify the active STT engine has credentials configured
            if stt_credentials_check is not None:
                ok, err = stt_credentials_check()
                if not ok:
                    return jsonify({
                        "error": err,
                        "segment_index": segment_index,
                        "retryable": False
                    }), 401
            else:
                # Legacy path: only Whisper is available
                if not get_openai_client():
                    return jsonify({
                        "error": "OpenAI API key not configured",
                        "segment_index": segment_index,
                        "retryable": False
                    }), 401

            # Save audio to temp file for transcription API
            temp_path = None
            try:
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                    audio_file.save(tmp)
                    temp_path = tmp.name

                # Get dictionary prompt
                prompt = generate_whisper_prompt()

                if transcribe_chunk_fn is not None:
                    retry_result = transcribe_chunk_fn(
                        audio_file_path=temp_path,
                        prompt=prompt,
                        audio_duration=None,
                        max_attempts=2,
                    )
                    if not retry_result.success:
                        raise Exception(retry_result.error or "Transcription failed")
                    result = retry_result.data
                else:
                    # Legacy: direct Whisper call
                    result = create_openai_transcription(
                        audio_file_path=temp_path,
                        client=get_openai_client(),
                        model="whisper-1",
                        response_format="verbose_json",
                        prompt=prompt,
                        audio_duration=None  # Let Whisper detect from WAV
                    )

                logger.info(f"✅ Fluid chunk transcribed: session={session_id}, segment={segment_index}, "
                          f"chars={len(result.get('text', ''))}")

                # Async append to real-time feed if enabled
                config_manager = get_default_config_manager()
                if config_manager.get_setting('ui_settings.realtime_feed', False):
                    chunk_text = result.get("text", "")
                    if chunk_text.strip():
                        append_to_feed_async(
                            session_id=session_id,
                            segment_index=segment_index,
                            text=chunk_text,
                            language=result.get("language", "unknown"),
                            duration=result.get("duration", 0)
                        )

                return jsonify({
                    "text": result.get("text", ""),
                    "segment_index": segment_index,
                    "language": result.get("language", "unknown"),
                    "duration": result.get("duration", 0)
                })

            finally:
                # Always clean up temp file
                if temp_path and os.path.exists(temp_path):
                    try:
                        os.unlink(temp_path)
                    except OSError:
                        pass

        except Exception as e:
            logger.error(f"❌ Fluid chunk error: session={request.form.get('session_id', '?')}, "
                        f"segment={request.form.get('segment_index', '?')}, error={e}")

            error_str = str(e).lower()
            retryable = not any(x in error_str for x in ['api key', 'auth', '401', '403'])

            return jsonify({
                "error": str(e),
                "segment_index": int(request.form.get('segment_index', 0)),
                "retryable": retryable
            }), 500


    @app.route('/api/transcribe/fluid-complete', methods=['POST'])
    def fluid_complete():
        """
        Save final assembled transcription from fluid mode.

        Request JSON:
            text: str               - Full assembled text with <seg> tags
            session_id: str         - Recording session ID
            total_segments: int     - Total number of chunks
            failed_segments: int    - Number of failed chunks
            total_duration: float   - Total recording duration in seconds
            language: str           - Detected language
            audio_id: str|null      - ID of saved audio file (from MediaRecorder WebM)

        Response: { transcription_id: int, text: str, status: str }
        """
        try:
            data = request.get_json()
            if not data:
                return jsonify({"error": "No JSON data provided"}), 400

            text = data.get('text', '')
            session_id = data.get('session_id', 'unknown')
            total_segments = data.get('total_segments', 0)
            failed_segments = data.get('failed_segments', 0)
            total_duration = data.get('total_duration', 0)
            language = data.get('language', 'unknown')
            audio_id = data.get('audio_id', None)

            if not text.strip():
                return jsonify({"error": "No transcription text provided"}), 400

            # Determine status
            if failed_segments > 0:
                status = 'partial'
            else:
                status = 'success'

            logger.info(f"📝 Fluid complete: session={session_id}, segments={total_segments}, "
                       f"failed={failed_segments}, status={status}, duration={total_duration:.1f}s")

            # Strip <seg> tags for clean text storage
            clean_text = text
            import re
            clean_text = re.sub(r'<seg[^>]*>', '', clean_text)
            clean_text = re.sub(r'</seg>', ' ', clean_text)
            clean_text = re.sub(r'\s+', ' ', clean_text).strip()

            # Look up active STT model so we can label this transcription
            stt_model_setting = get_default_config_manager().get_setting('ui_settings.stt_model', 'whisper') or 'whisper'
            stt_model_label = {
                'whisper': 'Whisper',
                'gemini-flash': 'Gemini Flash',
                'gemini-flash-lite': 'Gemini Flash Lite',
            }.get(stt_model_setting, stt_model_setting)

            # Save to database using existing function
            transcription_data = {
                'text': clean_text,
                'language': language,
                'duration': total_duration,
                'stt_model': stt_model_label,
            }

            error_message = None
            if failed_segments > 0:
                error_message = f"Fluid transcription: {failed_segments}/{total_segments} segments failed"

            transcription_id = save_transcription_fn(
                transcription_data,
                audio_id=audio_id,
                status=status,
                error_message=error_message,
                source_type='fluid'
            )

            logger.info(f"✅ Fluid transcription saved: id={transcription_id}, status={status}")

            # Async append session_end marker to feed if enabled
            config_manager = get_default_config_manager()
            if config_manager.get_setting('ui_settings.realtime_feed', False):
                append_session_end_async(
                    session_id=session_id,
                    total_segments=total_segments,
                    total_duration=total_duration
                )

            return jsonify({
                "transcription_id": transcription_id,
                "text": clean_text,
                "status": status
            })

        except Exception as e:
            logger.error(f"❌ Fluid complete error: {e}")
            return jsonify({"error": str(e)}), 500


    @app.route('/api/transcribe/save-audio', methods=['POST'])
    def save_audio_only():
        """
        Save audio file without transcribing.
        Used by fluid mode to persist the full WebM recording.

        Request: multipart/form-data { audio: webm file }
        Response: { audio_id: str, saved_path: str }
        """
        try:
            if 'audio' not in request.files:
                return jsonify({"error": "No audio file provided"}), 400

            audio_file = request.files['audio']

            # Save to temp file first
            with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as tmp:
                audio_file.save(tmp.name)
                temp_path = tmp.name

            try:
                audio_metadata = {
                    'original_filename': audio_file.filename,
                    'upload_timestamp': datetime.now().isoformat(),
                    'status': 'saved',
                    'source': 'fluid_transcription'
                }

                audio_id, saved_path = save_temp_audio_with_metadata_safe(
                    temp_path=temp_path,
                    metadata=audio_metadata,
                    is_failed=False,
                    timeout=15
                )

                if audio_id:
                    logger.info(f"✅ Fluid audio saved: {audio_id}")
                    return jsonify({
                        "audio_id": audio_id,
                        "saved_path": saved_path
                    })
                else:
                    return jsonify({"error": "Audio save timed out", "audio_id": None}), 500

            finally:
                # Clean up temp file
                if os.path.exists(temp_path):
                    try:
                        os.unlink(temp_path)
                    except OSError:
                        pass

        except Exception as e:
            logger.error(f"❌ Fluid save-audio error: {e}")
            return jsonify({"error": str(e)}), 500
