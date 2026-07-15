# Spec: Media File Import (Transcribe Existing Audio/Video Files)

**Status:** Approved for implementation
**Author:** Claude (architect) — implementation intended for a separate agent
**Date:** 2026-07-14
**Related spec:** [SPEC-TRANSCRIPT-SUFFIX.md](SPEC-TRANSCRIPT-SUFFIX.md) (Feature 1 — its `apply_transcript_suffix()` helper is also called from this pipeline)

---

## 1. What we are building

The user can hand the app an **existing media file** — audio (MP3, WAV, M4A, …)
or video (MP4, MOV, …) — and get it transcribed through the exact same engine
pipeline used for live recordings (Whisper or Gemini, per the STT model
selector, with the existing auto-fallback).

Rules, straight from the product ask:

- Input can be **audio or video**. For video we only need the audio track: the
  video stream is ignored/discarded during processing (the original file on
  disk is never touched).
- Before sending to the STT engine, the audio is **degraded for voice**: mono,
  low sample rate — the same philosophy the app already applies in fluid mode.
- No recording, no chunking: this is a single one-shot transcription of an
  already-complete file (like the standard "record everything, send one blob"
  path).

## 2. Current architecture — what actually happens today (verified)

Arturo's recollection was that "we compress / re-encode down to mono and a low
sample rate" before sending audio. **Verified reality:**

- **Fluid mode (15s chunks):** YES — the frontend captures at 48 kHz
  (`AudioContext({ sampleRate: 48000 })`), takes the first channel (mono), and
  downsamples to **16 kHz mono 16-bit WAV** before each chunk upload.
  See `frontend/components/FluidTranscriptionManager.js:24`
  (`targetSampleRate = 16000`), `:254` (downsample), `:401` (`_encodeWAV`, mono
  16-bit). Not 11 or 22 kHz — it's 16 kHz, "Whisper optimal".
- **Standard mode (whole recording):** NO re-encoding anywhere. MediaRecorder
  produces `audio/webm;codecs=opus` (`frontend/app.js:1267`), the blob is
  POSTed to `/api/transcribe` (`processRecording`, `app.js:1708`, with a 25 MB
  frontend guard), and the backend saves it to a temp `.webm` and sends it
  **as-is** to Whisper/Gemini (`backend/app.py:596-710`). Opus is already a
  voice-efficient lossy codec, so this is fine in practice — but there is no
  explicit mono/16kHz normalization in this path.

This feature therefore **introduces** the explicit normalization step (ffmpeg →
16 kHz mono) for imported files, matching the fluid-mode precedent of 16 kHz
mono.

Other verified facts the implementation relies on:

- **Engine dispatch is centralized:** `run_transcription()`
  (`backend/app.py:467`) reads `ui_settings.stt_model`, dispatches to Whisper
  (`retry_logic.transcribe_with_retry`) or Gemini
  (`gemini_transcription.transcribe_with_gemini`), and transparently falls back
  to the other engine on transient failures. Reuse it untouched.
- **ffmpeg is NOT bundled.** The app uses system ffmpeg opportunistically:
  `ffprobe` for duration (`backend/retry_logic.py:~209`, `get_audio_duration`)
  and pydub+ffmpeg for the "download as MP3" conversion
  (`backend/app.py:1513-1615`, with graceful WebM fallback). `pydub==0.25.1` is
  in `requirements.txt`. The PyInstaller spec (`backend/backend.spec`) bundles
  no ffmpeg binary.
- **Gemini path sends inline bytes** with a guessed mime type
  (`gemini_transcription.py:63` `_audio_mime`, `:170` `inline_data`) — inline
  requests have a ~20 MB total ceiling. Whisper's file ceiling is 25 MB.
- **DB is ready:** `transcriptions.source_type` column exists
  (`TEXT DEFAULT 'standard'`, `app.py:305`) and is threaded through
  `save_transcription(..., source_type=...)` (`app.py:992`) and returned by the
  history queries. We add the value `'imported'`.
- **Electron 33** (`package.json`): the renderer can upload a dropped/picked
  `File` object directly via `FormData` to the Flask backend — no IPC, no file
  paths needed (`File.path` no longer exists in Electron ≥32; do not try to use
  it).

## 3. Pipeline design

```
User picks/drops file (renderer)
  └─ POST multipart /api/import/transcribe  (field: 'file')
       1. Validate extension + size ceiling
       2. Save to temp file (original extension preserved)
       3. Require ffmpeg (shutil.which) → 503 with friendly message if missing
       4. Normalize: ffmpeg → 16 kHz mono MP3 48 kbps, video stream dropped (-vn)
       5. Post-conversion size guard (engine ceilings)
       6. get_audio_duration(converted)          [existing, ffprobe]
       7. generate_whisper_prompt_from_dictionary()  [existing]
       8. run_transcription(converted, prompt, duration)  [existing dispatch + fallback]
       9. dictionary.apply_corrections(text)     [existing]
      10. apply_transcript_suffix(text)          [Feature 1 helper]
      11. save audio (converted mp3) if audio_settings.save_audio_files  [existing storage]
      12. save_transcription(..., source_type='imported')
      13. JSON response (same shape as /api/transcribe)
```

Design decisions (already made — do not re-open):

- **Always normalize through ffmpeg**, even if the input is already an MP3.
  One uniform pipeline: guarantees mono/16 kHz degradation, guarantees an
  engine-accepted format regardless of input container, and makes the size
  guard meaningful. Cost is a few seconds of CPU.
- **Target format: MP3, 16 kHz, mono, 48 kbps** (`libmp3lame`). Why not WAV
  like fluid mode: WAV 16 kHz mono 16-bit is ~1.9 MB/min → 25 MB caps at ~13
  minutes. MP3 48 kbps is ~0.36 MB/min → ~69 min under Whisper's 25 MB, ~54 min
  under Gemini's ~20 MB. Voice at 48 kbps mono is transparent for STT purposes.
- **ffmpeg is a hard requirement for this feature** (not for the rest of the
  app). If missing, return a clear actionable error (see §4.3). Bundling ffmpeg
  in the app is future work — note it, don't do it.
- **No auto-paste for imports.** Auto-paste exists for the record-and-paste
  flow; when importing, the user is already inside the app looking at history.
  The result lands in history like any transcription. (Trivial to flip later —
  it's one `attemptAutoPaste` call.)
- **No chunking/splitting of long files in v1.** Files whose *converted* audio
  exceeds the engine ceiling get a clear error telling the user the limit
  (see §6). Splitting is future work.
- **This endpoint does not touch `window_manager`** — there is no recording
  session, no widget state. Keep it out.

## 4. Backend implementation

All in `backend/app.py` unless noted. Follow the logging style of
`transcribe_audio()` (step banners, per-step timing).

### 4.1 Constants + validation

```python
IMPORT_AUDIO_EXTENSIONS = {'.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.webm', '.wma'}
IMPORT_VIDEO_EXTENSIONS = {'.mp4', '.mov', '.mkv', '.avi', '.m4v'}
IMPORT_ALLOWED_EXTENSIONS = IMPORT_AUDIO_EXTENSIONS | IMPORT_VIDEO_EXTENSIONS
IMPORT_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024   # 2 GB — videos are big; audio is extracted anyway
```

Note: `.webm` appears once — it can carry audio-only or audio+video; ffmpeg
with `-vn` handles both identically, so no special-casing. (The product ask
mentioned "WebP" — that's an image format; the intended format is WebM.)

### 4.2 ffmpeg helpers

```python
import shutil

def ffmpeg_available() -> bool:
    return shutil.which('ffmpeg') is not None

def extract_voice_audio(input_path: str, output_path: str, timeout: int = 600) -> None:
    """
    Normalize any audio/video input to STT-ready audio:
    drop video stream, downmix to mono, resample to 16 kHz, MP3 48 kbps.
    Raises subprocess.CalledProcessError / TimeoutExpired on failure.
    """
    cmd = [
        'ffmpeg', '-y',
        '-i', input_path,
        '-vn',                    # ignore/discard video stream
        '-ac', '1',               # mono
        '-ar', '16000',           # 16 kHz — matches fluid-mode precedent
        '-c:a', 'libmp3lame',
        '-b:a', '48k',
        output_path,
    ]
    subprocess.run(cmd, capture_output=True, timeout=timeout, check=True)
```

On `CalledProcessError`, include a tail of `e.stderr` (last ~500 chars) in the
log — ffmpeg errors are only diagnosable from stderr. A corrupt/unsupported
file surfaces here → return HTTP 422 with a friendly message ("Could not read
audio from this file. The file may be corrupted or DRM-protected.").

### 4.3 Endpoint

```python
@app.route('/api/import/transcribe', methods=['POST'])
def import_and_transcribe():
    """
    Transcribe an existing audio/video file uploaded by the user.
    Expected: multipart/form-data with 'file'.
    Returns: same JSON shape as /api/transcribe (text, language, duration,
             stt_model, cost fields, transcription_id, audio_id, notification).
    """
```

Flow (mirror `transcribe_audio()`'s structure; deltas listed):

1. `stt_credentials_ok()` gate — identical to `transcribe_audio()` (503 on
   missing key).
2. Validate: file present, extension in `IMPORT_ALLOWED_EXTENSIONS` (else 415
   with the allowed list in the message), `request.content_length` under
   `IMPORT_MAX_UPLOAD_BYTES` (else 413).
3. `if not ffmpeg_available(): return 503` with:
   `"FFmpeg is required to import files. Install it with: brew install ffmpeg"`.
   The frontend shows this string verbatim in a toast.
4. Save upload to `tempfile.NamedTemporaryFile(delete=False, suffix=<original ext>)`
   — the real extension matters so ffmpeg picks the right demuxer.
5. `extract_voice_audio(...)` into a second temp file `... suffix='.mp3'`.
   Delete the raw upload temp file immediately after conversion succeeds
   (videos can be huge; don't hold both).
6. Post-conversion size guard:

   ```python
   GEMINI_INLINE_CEILING = 19 * 1024 * 1024   # keep margin under the ~20 MB request cap
   WHISPER_FILE_CEILING  = 25 * 1024 * 1024
   ceiling = GEMINI_INLINE_CEILING if get_stt_model() in GEMINI_MODELS else WHISPER_FILE_CEILING
   ```

   If exceeded → 413 with a duration-oriented message ("This file is too long
   (~N minutes of audio). Maximum is about 50–65 minutes."). Compute N from
   `get_audio_duration()`. Note: fallback could switch engines mid-request, so
   using the *smaller* ceiling unconditionally is also acceptable — implementer's
   choice; document which in a comment.
7. Duration + dictionary prompt + `run_transcription(...)` — copy the
   step 4/5/6 sequence from `transcribe_audio()` (`app.py:680-710`).
8. On success: dictionary `apply_corrections`, then
   `apply_transcript_suffix` (Feature 1), then — if
   `audio_settings.save_audio_files` is on — store the **converted MP3** via
   `save_temp_audio_with_metadata_safe(...)` with metadata
   `{'original_filename': file.filename, 'import_source': True, ...}`, then
   `save_transcription(transcription_data, audio_id, source_type='imported')`.
9. On failure: reuse `get_user_friendly_error(...)`; save a failed history
   entry the same way `transcribe_audio()` does. Keeping the converted MP3 as a
   temporary failed audio (for the existing retry-from-audio flow) is a nice
   bonus — reuse the `is_temporary` metadata pattern (`app.py:800-830`).
10. `finally`: delete every temp file that still exists.

This is a long-running synchronous request (upload + ffmpeg + STT). That is
exactly how `/api/transcribe` already behaves — acceptable. Flask runs
threaded, so the UI stays responsive.

### 4.4 What NOT to change

- `run_transcription`, `retry_logic`, `gemini_transcription` — no changes.
  The converted file is a plain MP3; `_audio_mime` already maps `.mp3`.
- `/api/transcribe` — untouched.
- `window_manager` — untouched (no session).

## 5. Frontend implementation

### 5.1 Entry points (two)

1. **Header button** — an icon button next to the existing dictionary/settings
   buttons (`electron/index.html:60-63`, `header-icon-button` class,
   Phosphor icon `ph-file-arrow-up`, `title="Import audio or video file"`),
   which clicks a hidden `<input type="file" id="importFileInput"
   accept=".mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.webm,.wma,.mp4,.mov,.mkv,.avi,.m4v">`.
2. **Drag & drop** onto the main window: `dragover`/`dragleave`/`drop` on
   `#appContainer`; on `dragover` add a CSS class that shows a subtle
   full-window drop affordance (a 1px inset outline + "Drop to transcribe"
   label — boxless, monochrome, consistent with the app's register; no giant
   overlay illustration). Take `event.dataTransfer.files[0]` — single file
   only in v1; if multiple are dropped, take the first and toast
   "One file at a time."

Both funnel into one method.

### 5.2 `importMediaFile(file)` in `frontend/app.js`

```javascript
async importMediaFile(file) {
    if (this.isRecording) {
        this.showToast('Stop the current recording before importing a file.', 'error');
        return;
    }
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    // Keep this list in sync with IMPORT_ALLOWED_EXTENSIONS (backend)
    if (!IMPORT_ALLOWED_EXTENSIONS.includes(ext)) {
        this.showToast(`Unsupported file type: ${ext}`, 'error');
        return;
    }

    this.updateUIForTranscribing();          // reuse existing state
    if (window.electronAPI?.syncRecordingState) {
        window.electronAPI.syncRecordingState('main_transcribing');
    }

    try {
        const formData = new FormData();
        formData.append('file', file);
        const result = await this.api.importTranscribe(formData);

        if (result && result.text) {
            if (window.soundManager) soundManager.playTranscriptionReady();
            await this.loadTranscriptionHistory();
            this.showToast('File transcribed.', 'success');
            // Deliberate: no attemptAutoPaste() for imports (see spec §3)
        } else {
            throw new Error(result?.error || 'Import failed');
        }
    } catch (error) {
        this.showToast(error.message || 'Import failed', 'error');
    } finally {
        this.updateUIForIdle();
        if (window.electronAPI?.syncRecordingState) {
            window.electronAPI.syncRecordingState('main_transcription_completed');
        }
    }
}
```

Telemetry: `track('file_imported', { extension: ext, size_mb, duration_seconds,
success })` following the existing event style.

### 5.3 `APIClient.importTranscribe(formData)`

Mirror `APIClient.transcribe()` (`frontend/components/APIClient.js:103`): same
AbortController/timeout pattern, but the duration is unknown before upload —
use a generous fixed timeout (suggest 15 minutes) since it covers upload +
ffmpeg + STT of potentially an hour of audio.

### 5.4 History display

`source_type: 'imported'` already flows through the history API. Optional but
cheap: in the history item renderer, when `source_type === 'imported'`, show a
small `ph-file-arrow-up` icon beside the timestamp (same treatment as any
existing per-item metadata; no new visual language).

## 6. Edge cases (test these)

1. **Video with no audio track** — ffmpeg `-vn` on a silent MP4 fails or emits
   an empty file → detect zero/near-zero output size or ffmpeg error → 422
   "No audio track found in this file."
2. **ffmpeg missing** → 503 with the brew message; frontend toast shows it.
3. **Huge video (e.g. 1.5 GB MOV)** → passes upload guard, converts, and the
   *converted audio* decides transcribability. Temp raw file deleted right
   after conversion.
4. **Converted audio over engine ceiling** → 413 with minutes-based message;
   no STT call is made (don't waste API cost).
5. **Corrupt/DRM/renamed file** (a `.mp3` that is actually a PDF) → ffmpeg
   fails → 422 friendly message; stderr tail in backend log.
6. **Import while recording** → blocked in frontend (§5.2 guard).
7. **Suffix feature enabled** → imported transcripts get the suffix too
   (uniform pipeline, Feature 1 §4.2 call site 5).
8. **`save_audio_files` off** → nothing stored, transcription still saved to
   history (audio_id null) — same semantics as standard path.
9. **Filename with spaces/unicode/emoji** — only used as metadata and temp-file
   suffix source; use `os.path.splitext` on the werkzeug filename for the
   extension, never trust it for paths.

## 7. Out of scope for v1 (explicitly noted future work)

- **Bundling ffmpeg** with the app (electron resources or PyInstaller binaries)
  so the feature works without Homebrew.
- **Chunked transcription of long files** (split converted audio into segments,
  transcribe serially, join) to lift the ~1 hour ceiling.
- **Batch import** (multiple files / a folder).
- **Keeping video association** (Stories v2 multi-track territory).
