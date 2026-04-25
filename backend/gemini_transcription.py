"""
Gemini STT wrapper.

Provides transcribe_with_gemini(audio_file_path, api_key, model, prompt, audio_duration)
returning a RetryResult-compatible object so the existing app flow does not change.
"""

import os
import logging
import mimetypes
from typing import Optional

from retry_logic import RetryResult, RetryReason

logger = logging.getLogger(__name__)


# Gemini models exposed in the UI. Keep ordering aligned with frontend.
GEMINI_MODELS = {
    'gemini-flash': 'gemini-3-flash-preview',
    'gemini-flash-lite': 'gemini-3.1-flash-lite-preview',
}

# Gemini audio pricing is not officially fixed for these preview models;
# leave cost at 0 to avoid misleading numbers in the UI.
GEMINI_COST_PER_MINUTE_USD = 0.0


def _audio_mime(path: str) -> str:
    ext = os.path.splitext(path)[1].lower().lstrip('.')
    mapping = {
        'wav': 'audio/wav',
        'mp3': 'audio/mp3',
        'aiff': 'audio/aiff',
        'aac': 'audio/aac',
        'ogg': 'audio/ogg',
        'flac': 'audio/flac',
        'webm': 'audio/ogg',  # Gemini doesn't list webm; ogg container is the closest
        'm4a': 'audio/aac',
    }
    return mapping.get(ext) or mimetypes.guess_type(path)[0] or 'audio/wav'


def transcribe_with_gemini(
    audio_file_path: str,
    api_key: str,
    model: str,
    prompt: Optional[str] = None,
    audio_duration: Optional[float] = None,
) -> RetryResult:
    """
    Transcribe an audio file using the Gemini API.

    Returns a RetryResult so callers can treat it the same way as Whisper output.
    """
    try:
        from google import genai  # lazy import — only needed when Gemini is selected
    except ImportError:
        return RetryResult(
            success=False,
            data=None,
            error=("google-genai package is not installed. "
                   "Install it with: pip install google-genai"),
            attempts=1,
            retry_reason=RetryReason.UNKNOWN_ERROR,
        )

    if not api_key:
        return RetryResult(
            success=False,
            data=None,
            error="Gemini API key not configured",
            attempts=1,
            retry_reason=RetryReason.AUTHENTICATION_ERROR,
        )

    base_instruction = (
        "Generate a verbatim transcript of the speech in the audio. "
        "Return only the transcript text, no preamble, no commentary, no timestamps."
    )
    if prompt:
        base_instruction += (
            "\n\nWhen you encounter the following proper nouns / domain terms, "
            "spell them exactly as written here: " + prompt
        )

    try:
        client = genai.Client(api_key=api_key)

        with open(audio_file_path, 'rb') as f:
            audio_bytes = f.read()
        mime = _audio_mime(audio_file_path)

        logger.info(f"🤖 Gemini transcription: model={model}, mime={mime}, "
                    f"size={len(audio_bytes)} bytes")

        # Inline audio bytes — works for files up to ~20 MB. Larger files would
        # need the Files API; Stories chunks/recordings are well below that.
        response = client.models.generate_content(
            model=model,
            contents=[
                base_instruction,
                {'inline_data': {'mime_type': mime, 'data': audio_bytes}},
            ],
        )

        text = (getattr(response, 'text', None) or '').strip()
        duration = audio_duration if audio_duration else None

        cost_usd = 0.0
        if duration and GEMINI_COST_PER_MINUTE_USD:
            cost_usd = (duration / 60.0) * GEMINI_COST_PER_MINUTE_USD

        return RetryResult(
            success=True,
            data={
                'text': text,
                'language': 'unknown',
                'duration': duration,
                'duration_seconds': duration,
                'cost': cost_usd,
                'cost_usd': cost_usd,
                'model': model,
                'engine': 'gemini',
            },
            error=None,
            attempts=1,
            retry_reason=None,
        )

    except Exception as e:
        msg = str(e)
        lowered = msg.lower()
        if 'api key' in lowered or 'unauthenticated' in lowered or '401' in lowered or '403' in lowered:
            reason = RetryReason.AUTHENTICATION_ERROR
        elif 'quota' in lowered or 'rate' in lowered or '429' in lowered:
            reason = RetryReason.RATE_LIMIT
        elif 'timeout' in lowered or 'timed out' in lowered:
            reason = RetryReason.API_TIMEOUT
        else:
            reason = RetryReason.UNKNOWN_ERROR

        logger.error(f"❌ Gemini transcription error ({reason.value}): {e}")
        return RetryResult(
            success=False,
            data=None,
            error=msg,
            attempts=1,
            retry_reason=reason,
        )
