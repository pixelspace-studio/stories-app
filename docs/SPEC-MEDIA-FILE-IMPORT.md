# Spec: Media File Import (Transcribe Existing Audio/Video Files) — v2

**Status:** Approved for implementation — supersedes v1
**Author:** Claude (architect)
**Date:** 2026-07-20 (v2), 2026-07-14 (v1)
**Related:** [SPEC-TRANSCRIPT-SUFFIX.md](SPEC-TRANSCRIPT-SUFFIX.md) · [SPEC-MP3-MIGRATION.md](SPEC-MP3-MIGRATION.md)

---

## 0. Why this document was rewritten (read this first)

v1 of this spec specified `ffmpeg` as a **hard requirement** for the import
feature. That was wrong and it shipped broken in `0.9.10-10`.

**What went wrong.** ffmpeg is not bundled with Stories and is not part of
macOS. It only exists on a machine if the user installed it (Homebrew). Worse,
macOS GUI apps do not inherit the shell `PATH`, so `/opt/homebrew/bin` is
invisible to the app: the feature fails **even on a machine that has ffmpeg
installed**. Verified empirically — launching the packaged `0.9.10-10` with a
Finder-equivalent environment (`PATH=/usr/bin:/bin:/usr/sbin:/sbin`) and POSTing
an MP3 returns:

```
{"error":"FFmpeg is required to import files. Install it with: brew install ffmpeg"}
```

Stories has never required ffmpeg. It appears in exactly two pre-existing
places, both optional with graceful degradation (`ffprobe` for duration →
falls back to a 60 s timeout; pydub for "download as MP3" → falls back to
WebM). v1 turned a months-old optional nicety into a blocking dependency.

**What v2 does instead.** Everything the feature needs is already inside the
app: Chromium decodes the media, and the existing fluid-mode JS resamples it.
Only MP3 encoding needs an addition, and that is a dependency-free vendored
JS library. No system binaries, no user installation, no PATH assumptions.

---

## 1. What we are building

The user hands Stories an existing media file — audio (MP3, WAV, M4A…) or video
(MP4, MOV…) — and gets it transcribed through the same engines as a live
recording (Whisper or Gemini, per the STT model selector, with existing
auto-fallback).

Three jobs, and nothing else:

1. **Get the audio out** of the file (for video: take the audio track, ignore
   the picture).
2. **Degrade it for voice** — mono, 16 kHz — so more minutes fit under the
   engine size ceilings.
3. **Send it** to the selected engine and save the result like any other
   transcription.

## 2. Verified facts this design rests on

Every number below was measured on this machine, not assumed.

**What Stories sends today (unchanged by this feature):**

| Path | Format sent to the engine | Measured |
|---|---|---|
| Standard recording | WebM/Opus, 48 kHz **mono**, ~129.5 kbps | Real recordings: 0.93 MB/min; a 17.6-min recording = 16.3 MB |
| Fluid (15 s chunks) | WAV, 16 kHz mono 16-bit | `FluidTranscriptionManager.js:24,254,401` |

Stories has **never** sent MP3 to an engine. MP3 only appears in the
"download audio from history" feature, which is for the user, not the engine.

**Why the recording path has never hit a limit:** `RECORDING_CONFIG.MAX_MINUTES
= 20` (`electron/main.js:137`) caps recordings, plus a 25 MB frontend guard
(`frontend/app.js:1788`). At 0.93 MB/min, 20 minutes ≈ 18.5 MB — just under
Whisper's 25 MB. The ceiling is ~27 minutes; the UI cap is what protects it.

**Why imports need a different format:** an imported file has no 20-minute cap.
A one-hour video is a normal thing to drop on the window. Measured options:

| Candidate | Size | Minutes in 25 MB | Verdict |
|---|---|---|---|
| WAV 16 kHz mono (fluid's format) | 1.92 MB/min | **13** | Too small for long media |
| WebM/Opus (recording's format) | 0.24 MB/min | ~104 | **Encoding is real-time only** — MediaRecorder has no faster-than-real-time mode, so a 1-hour file would take 1 hour |
| **MP3 16 kHz mono 48 kbps** | **0.343 MB/min** | **73** | ✅ chosen |

**Engine format support** (from vendor docs, 2026-07-20):

| Engine | Accepts | Size ceiling |
|---|---|---|
| Whisper | `mp3, mp4, mpeg, mpga, m4a, wav, webm` | 25 MB |
| Gemini | `wav, mp3, aiff, aac, ogg, flac` — **not** webm | 20 MB inline |

MP3 is the only compressed format both engines accept cleanly. (Note: the
existing Gemini path already works around this by labelling WebM as
`audio/ogg` — `gemini_transcription.py:73`. Out of scope here; see
SPEC-MP3-MIGRATION.md.)

**End-to-end pipeline proof** — a 3-minute MP4 (video+audio, 7.21 MB) run
through the exact proposed pipeline inside Electron:

```
decode 332 ms → resample 7 ms → MP3 encode 823 ms → total 1.16 s
= 155× faster than real time
output: 1.03 MB (0.343 MB/min) → 73 min fits in 25 MB
```

Chromium decoded `.mp4`, `.mov`, `.mp3`, `.m4a` and `.wav` in this probe —
including pulling the audio track out of video containers — with no external
binary. Extrapolated: a 1-hour video processes in ~23 s and yields ~20.6 MB.

## 3. Architecture

**All media processing moves to the renderer** (the Chromium/JS side). The
local Flask backend receives a ready-made MP3 and does what it already does
for recordings.

```
User drops/picks a file  (renderer)
  1. Validate extension against the allowlist
  2. AudioContext.decodeAudioData()      ← Chromium; video picture discarded
  3. Downsample to 16 kHz mono            ← same math as fluid mode
  4. Encode MP3 48 kbps                   ← lamejs, vendored, local
  5. Size guard against the engine ceiling
  6. POST the MP3 + duration → /api/import/transcribe

Backend (local Flask)
  7. Credential gate                      [existing]
  8. Dictionary prompt                    [existing]
  9. run_transcription()                  [existing dispatch + fallback]
 10. Dictionary corrections               [existing]
 11. apply_transcript_suffix()            [Feature 1]
 12. Save audio if enabled + save_transcription(source_type='imported')
```

Decisions (settled — do not re-open):

- **The backend keeps no media knowledge.** No ffmpeg, no `subprocess`, no
  `-vn`, no 503 gate, no temp-conversion dance. Deleting that code is part of
  this work, not a follow-up.
- **MP3 is only for this feature.** Recording, fluid, retries and settings are
  untouched. This is not the MP3 migration (that is its own spec).
- **Duration is computed in the renderer** from the decoded buffer and sent
  with the upload. This is strictly better than the existing `ffprobe` path,
  which returns `N/A` on MediaRecorder WebM and has silently fallen back to a
  60 s timeout 12,394 times in this machine's logs.
- **No auto-paste for imports** (unchanged from v1) — the user is in the app
  looking at history.
- **No chunking of over-long files in v1.** Files exceeding the ceiling after
  encoding get a clear, minutes-based error. Chunking is future work and would
  reuse fluid's proven approach.

## 4. Frontend implementation

### 4.1 Vendoring the MP3 encoder

Add `@breezystack/lamejs` **as a vendored file**, not a runtime npm import:

- Source: `@breezystack/lamejs@1.2.7`, `dist/lamejs.iife.js`
- Copy to `frontend/vendor/lamejs.js`
- Load in `electron/index.html` with a plain `<script src="../frontend/vendor/lamejs.js"></script>`
  placed **before** `app.js`

Why this shape: the page CSP is `script-src 'self' 'unsafe-inline' …`, so a
local file loads cleanly; `frontend/` is already packaged (it is not in
`forge.config.js`'s `ignore` list); and vendoring keeps the exact audited bytes
in-tree instead of resolving a dependency at build time.

**Audit performed on the package (record it in the commit message):** zero
dependencies; zero occurrences of `fetch`, `XMLHttpRequest`, `WebSocket`,
`sendBeacon`, `eval`, `child_process`, `process.env`. The only URL in the code
is the string `"http://www.mp3dev.org/"`, the LAME project stamp written into
MP3 headers — not a network call. License LGPL-3.0, unmodified. It is pure
arithmetic over sample arrays; nothing leaves the machine.

### 4.2 The conversion module

Create `frontend/components/MediaImportConverter.js` — a small class with one
public method. Keep it separate from `app.js` (which is already ~4000 lines)
and mirror the style of `FluidTranscriptionManager`.

```javascript
/**
 * Converts an arbitrary audio/video File into MP3 bytes ready for the STT
 * engines: 16 kHz mono, 48 kbps. Runs entirely in the renderer — Chromium
 * decodes the container (video picture is discarded), the same resampling
 * math fluid mode uses reduces it to 16 kHz mono, and lamejs encodes MP3.
 * No external binaries, no network.
 */
class MediaImportConverter {
    constructor() {
        this.targetSampleRate = 16000; // matches fluid mode
        this.bitrateKbps = 48;         // 0.343 MB/min measured
    }

    /**
     * @param {File} file
     * @param {(stage: string, ratio: number) => void} [onProgress]
     * @returns {Promise<{blob: Blob, durationSeconds: number}>}
     */
    async convert(file, onProgress) {
        onProgress?.('decoding', 0);
        const bytes = await file.arrayBuffer();

        const ctx = new AudioContext();
        let audioBuffer;
        try {
            audioBuffer = await ctx.decodeAudioData(bytes);
        } catch (e) {
            throw new Error('NO_AUDIO'); // caller maps to a friendly message
        } finally {
            ctx.close();
        }
        if (!audioBuffer.length) throw new Error('NO_AUDIO');

        onProgress?.('converting', 0);
        const pcm = this._toMono16k(audioBuffer);
        const blob = this._encodeMp3(pcm, onProgress);
        return { blob, durationSeconds: audioBuffer.duration };
    }

    // Average all channels down to mono, then decimate to 16 kHz.
    // (Fluid mode takes channel 0 because a mic stream is already mono —
    // an imported file can be genuinely stereo, so we average instead of
    // discarding a channel.)
    _toMono16k(audioBuffer) {
        const chans = [];
        for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
            chans.push(audioBuffer.getChannelData(c));
        }
        const ratio = audioBuffer.sampleRate / this.targetSampleRate;
        const outLen = Math.floor(chans[0].length / ratio);
        const pcm = new Int16Array(outLen);
        for (let i = 0; i < outLen; i++) {
            const idx = Math.floor(i * ratio);
            let sum = 0;
            for (let c = 0; c < chans.length; c++) sum += chans[c][idx];
            const s = Math.max(-1, Math.min(1, sum / chans.length));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return pcm;
    }

    _encodeMp3(pcm, onProgress) {
        const encoder = new lamejs.Mp3Encoder(1, this.targetSampleRate, this.bitrateKbps);
        const parts = [];
        const BLOCK = 1152; // one MP3 frame
        for (let i = 0; i < pcm.length; i += BLOCK) {
            const chunk = encoder.encodeBuffer(pcm.subarray(i, i + BLOCK));
            if (chunk.length) parts.push(new Uint8Array(chunk));
            if ((i / BLOCK) % 400 === 0) onProgress?.('converting', i / pcm.length);
        }
        const tail = encoder.flush();
        if (tail.length) parts.push(new Uint8Array(tail));
        return new Blob(parts, { type: 'audio/mpeg' });
    }
}
```

Register it in `index.html` with the other components, before `app.js`.

### 4.3 `importMediaFile(file)` in `frontend/app.js`

Replace the v1 implementation. Keep both entry points (header button + drag &
drop on `#appContainer`) and the extension allowlist exactly as they are.

```javascript
async importMediaFile(file) {
    if (this.isRecording) {
        this.showToast('Stop the current recording before importing a file.', 'error');
        return;
    }
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!IMPORT_ALLOWED_EXTENSIONS.includes(ext)) {
        this.showToast(`Unsupported file type: ${ext}`, 'error');
        return;
    }

    this.updateUIForTranscribing();
    window.electronAPI?.syncRecordingState?.('main_transcribing');

    try {
        // Decode + downsample + MP3, all local
        const converter = new MediaImportConverter();
        const { blob, durationSeconds } = await converter.convert(file);

        // Engine ceiling check BEFORE spending an API call
        const isGemini = (await this.getSttModel() || '').startsWith('gemini');
        const ceiling = isGemini ? 19 * 1024 * 1024 : 25 * 1024 * 1024;
        if (blob.size > ceiling) {
            const minutes = Math.round(durationSeconds / 60);
            const maxMinutes = Math.floor(ceiling / (0.343 * 1024 * 1024));
            throw new Error(
                `This file is too long (about ${minutes} minutes). ` +
                `The current engine accepts up to about ${maxMinutes} minutes.`
            );
        }

        const formData = new FormData();
        formData.append('file', blob, file.name.replace(/\.[^.]+$/, '') + '.mp3');
        formData.append('original_filename', file.name);
        formData.append('duration_seconds', String(durationSeconds));

        const result = await this.api.importTranscribe(formData, durationSeconds);
        if (!result || !result.text) throw new Error(result?.error || 'Import failed');

        if (window.soundManager) soundManager.playTranscriptionReady();
        await this.loadTranscriptionHistory();
        this.showToast('File transcribed.', 'success');
        // Deliberate: no attemptAutoPaste() for imports
    } catch (error) {
        const message = error.message === 'NO_AUDIO'
            ? 'No readable audio found in this file. It may be video-only, corrupted, or protected.'
            : (error.message || 'Import failed');
        this.showToast(message, 'error');
        await this.loadTranscriptionHistory(); // surface any failed-import card
    } finally {
        this.updateUIForIdle();
        window.electronAPI?.syncRecordingState?.('main_transcription_completed');
    }
}
```

Notes for the implementer:

- `getSttModel()` — read `ui_settings.stt_model` the way the settings panel
  already does; if a helper does not exist, fetch the setting inline.
- The `loadTranscriptionHistory()` call in `catch` fixes a real v1 gap: the
  backend persists a failed-import card that the UI never refreshed.
- `APIClient.importTranscribe(formData, durationSeconds)` keeps its generous
  timeout, but may now pass the known duration like `transcribe()` does.
- Telemetry: keep `file_imported` and add `source_extension`, `duration_seconds`,
  `output_mb`.

## 5. Backend implementation — mostly deletion

In `backend/app.py`, `/api/import/transcribe` becomes a thin sibling of
`transcribe_audio()`. **Delete** all of this:

- `ffmpeg_available()` and `extract_voice_audio()` helpers
- the `IMPORT_VIDEO_EXTENSIONS` / video handling and the `-vn` conversion step
- the ffmpeg 503 gate and its `brew install` message
- the two-temp-file conversion dance, its `subprocess` imports and stderr parsing
- `IMPORT_MIN_AUDIO_BYTES` and the ffmpeg-stderr string matching

**Keep and adjust:**

1. Credential gate (`stt_credentials_ok()`) → 503, unchanged.
2. Accept `file` (an MP3), plus optional `original_filename` and
   `duration_seconds` form fields.
3. Validate that the upload is present and non-empty → 400.
4. Size guard against the engine ceiling → 413 (defence in depth; the renderer
   checks first).
5. Duration: use the posted `duration_seconds` when present; only fall back to
   `get_audio_duration()` if absent.
6. Dictionary prompt → `run_transcription()` → dictionary corrections →
   `apply_transcript_suffix()` — all existing calls, unchanged order.
7. Save the MP3 via `save_temp_audio_with_metadata_safe()` when
   `audio_settings.save_audio_files` is on; metadata keeps
   `original_filename` (the user's real filename) and `import_source: True`.
8. `save_transcription(..., source_type='imported')` on success; on failure
   mirror `transcribe_audio()`'s failed-card + temporary-audio-for-retry path.
9. Delete the temp file in `finally`.
10. Never touch `window_manager`.

The extension allowlist stays **frontend-only** now (the backend only ever
receives MP3). Keep `IMPORT_ALLOWED_EXTENSIONS` in the frontend and in the
`<input accept="…">`, and keep them identical to each other.

## 6. Edge cases (test each)

1. **Video with no audio track** → `decodeAudioData` rejects → `NO_AUDIO` →
   friendly toast, no API call, no cost.
2. **Corrupt / DRM / renamed file** (a `.mp3` that is a PDF) → same path.
3. **Stereo source** → averaged to mono, not half-discarded (verify a
   hard-panned stereo file keeps both sides audible).
4. **Exotic container Chromium cannot decode** (`.mkv`, `.avi`, `.wma`) →
   `NO_AUDIO` with the friendly message. Decide per-format whether to keep it
   in the allowlist; prefer honesty — remove extensions Chromium cannot open
   rather than offering them and failing.
5. **Very long file over the ceiling** → minutes-based error before any API
   call. Verify the number quoted is derived, not hardcoded.
6. **Import while recording** → blocked with a toast.
7. **Suffix enabled** → imported transcript gets the suffix.
8. **`save_audio_files` off** → transcription saved, `audio_id` null.
9. **Unicode / emoji filename** → survives to history metadata intact.
10. **Regression sweep — must be untouched:** record normally, record with
    fluid on, retry from history, and change settings. All exactly as before.
11. **The ffmpeg proof:** run the packaged app with
    `env -i HOME=$HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin` and import a file
    successfully. This is the test v1 failed.

## 7. Out of scope

- Chunking long files (would reuse fluid's approach) — future work.
- Batch import of several files at once.
- Any change to how live recordings are captured or encoded — see
  [SPEC-MP3-MIGRATION.md](SPEC-MP3-MIGRATION.md).
