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

# Gemini occasionally leaves a request hanging server-side (observed: 73s for
# a chunk while sibling chunks of the same recording finished in 3s). Cap each
# attempt and retry rather than blocking fluid-complete waiting on one slow
# call. After GEMINI_MAX_ATTEMPTS we surface the timeout so the cross-engine
# fallback in app.run_transcription() can take over (Whisper).
GEMINI_TIMEOUT_MS = 10_000
GEMINI_MAX_ATTEMPTS = 3


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
        # `prompt` arrives in Whisper-prompt format, typically the literal
        # string "Vocabulary: Foo, Bar, Baz". Whisper treats that as soft
        # context and rarely emits the words verbatim. Gemini is a chat
        # model and will echo the list at the end of the transcript unless
        # we tell it very forcefully NOT to. So:
        #   1. Strip the "Vocabulary:" prefix so it reads as a clean list.
        #   2. Wrap it in an explicit hint block that bans inclusion.
        vocab = prompt
        for prefix in ("Vocabulary:", "vocabulary:"):
            if vocab.startswith(prefix):
                vocab = vocab[len(prefix):]
                break
        vocab = vocab.strip()
        if vocab:
            base_instruction += (
                "\n\n=== VOCABULARY HINT — DO NOT TRANSCRIBE THIS LIST ===\n"
                "The list of words below is a SPELLING REFERENCE for proper nouns "
                "and domain terms the speaker may use. Use these rules:\n"
                "  • DO NOT include any of these words in the transcript unless "
                "the speaker actually says them in the audio.\n"
                "  • DO NOT append the list to the transcript.\n"
                "  • DO NOT mention this hint, the word 'vocabulary', or anything "
                "about a reference list.\n"
                "  • ONLY use these spellings if you hear sounds that match them, "
                "and ONLY in place of the matching words you would otherwise write.\n"
                f"Reference spellings: {vocab}\n"
                "=== END OF VOCABULARY HINT ==="
            )

    try:
        from google.genai import types as genai_types

        client = genai.Client(
            api_key=api_key,
            http_options=genai_types.HttpOptions(timeout=GEMINI_TIMEOUT_MS),
        )

        with open(audio_file_path, 'rb') as f:
            audio_bytes = f.read()
        mime = _audio_mime(audio_file_path)

        logger.info(f"🤖 Gemini transcription: model={model}, mime={mime}, "
                    f"size={len(audio_bytes)} bytes")

        # Inline audio bytes — works for files up to ~20 MB. Larger files would
        # need the Files API; Stories chunks/recordings are well below that.
        response = None
        last_exc: Optional[Exception] = None
        for attempt in range(1, GEMINI_MAX_ATTEMPTS + 1):
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=[
                        base_instruction,
                        {'inline_data': {'mime_type': mime, 'data': audio_bytes}},
                    ],
                )
                if attempt > 1:
                    logger.info(f"✅ Gemini recovered on attempt {attempt}/{GEMINI_MAX_ATTEMPTS}")
                break
            except Exception as e:
                msg = str(e).lower()
                is_timeout = ('timeout' in msg or 'timed out' in msg
                              or 'deadline' in msg or 'read timed out' in msg)
                if is_timeout and attempt < GEMINI_MAX_ATTEMPTS:
                    logger.warning(
                        f"⏱️ Gemini timeout after {GEMINI_TIMEOUT_MS}ms "
                        f"(attempt {attempt}/{GEMINI_MAX_ATTEMPTS}), retrying..."
                    )
                    last_exc = e
                    continue
                raise
        if response is None:
            raise last_exc if last_exc else RuntimeError("Gemini returned no response")

        # Detect blocked / refused responses BEFORE returning success.
        # Without this check, a safety-blocked response yields empty text but
        # success=True, which silently bypasses the cross-engine fallback.
        block_reason = getattr(getattr(response, 'prompt_feedback', None), 'block_reason', None)
        block_name = getattr(block_reason, 'name', None) or (str(block_reason) if block_reason else None)
        candidates = getattr(response, 'candidates', None) or []
        finish_reason = getattr(candidates[0], 'finish_reason', None) if candidates else None
        finish_name = getattr(finish_reason, 'name', None) or (str(finish_reason) if finish_reason else None)
        BLOCKED_FINISH = {'SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'OTHER'}

        if block_name or (finish_name and finish_name in BLOCKED_FINISH):
            reason_code = block_name or finish_name
            REASON_MESSAGES = {
                'SAFETY': "Gemini's safety filter blocked the audio (it flagged content as unsafe — e.g. harassment, hate, sexual, or dangerous).",
                'PROHIBITED_CONTENT': "Gemini blocked the audio for violating its content policy.",
                'RECITATION': "Gemini blocked the response because it would have reproduced copyrighted or memorized material.",
                'BLOCKLIST': "Gemini blocked the response because it matched terms in a configured blocklist.",
                'SPII': "Gemini blocked the response because it contained sensitive personal information.",
                'OTHER': "Gemini refused the request without a specific reason.",
            }
            friendly = REASON_MESSAGES.get(reason_code, f"Gemini refused the request (reason: {reason_code}).")
            logger.warning(f"⚠️ Gemini refused transcription ({reason_code}) — triggering fallback")
            return RetryResult(
                success=False,
                data=None,
                error=friendly,
                attempts=1,
                retry_reason=RetryReason.UNKNOWN_ERROR,
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
        elif ('unavailable' in lowered or 'overloaded' in lowered
              or '503' in lowered or '502' in lowered or '504' in lowered
              or 'internal error' in lowered or '500' in lowered):
            reason = RetryReason.SERVER_ERROR
        elif 'connection' in lowered or 'network' in lowered:
            reason = RetryReason.NETWORK_ERROR
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
