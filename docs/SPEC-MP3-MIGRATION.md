# Spec: Migrating Stories' Audio Pipeline to MP3

**Status:** Proposed — not scheduled. Its own project, deliberately deferred.
**Author:** Claude (architect)
**Date:** 2026-07-20
**Related:** [SPEC-MEDIA-FILE-IMPORT.md](SPEC-MEDIA-FILE-IMPORT.md) (already ships MP3, but only for imported files)

---

## 1. Why this document exists

While specifying the media-import feature we measured what Stories actually
sends to the transcription engines. Two findings were surprising enough to
write down before they are forgotten:

1. **Stories has never sent MP3 to an engine**, in any path.
2. **Live recordings are encoded at ~4× the bitrate speech needs**, which is
   the sole reason the app must cap recordings at 20 minutes.

Neither is breaking anything today. Both cost real capacity. This spec captures
the finding, the numbers, and what a migration would involve — so the decision
can be made deliberately later rather than discovered again by accident.

**This is not scheduled work.** Nothing here should be implemented as a side
effect of another task.

## 2. What Stories does today (measured, not assumed)

| Path | Encoder | Format sent to engine | Cost |
|---|---|---|---|
| Standard recording | Browser `MediaRecorder` | WebM/Opus, 48 kHz mono, **~129.5 kbps** | **0.93 MB/min** |
| Fluid (15 s chunks) | Hand-written JS in `FluidTranscriptionManager` | WAV, 16 kHz mono, 16-bit | 1.92 MB/min |
| Imported files | `MediaImportConverter` (lamejs) | MP3, 16 kHz mono, 48 kbps | 0.343 MB/min |
| "Download audio" from history | pydub + system ffmpeg | MP3 128 kbps | user-facing only, never sent to an engine |

Measurements come from real recordings in
`~/Library/Application Support/Stories/audio/`: e.g. a 17.6-minute recording
weighs 16.27 MB; three sampled files all land at 129.5 kbps.

### 2.1 The 20-minute cap is a consequence, not a product decision

`RECORDING_CONFIG.MAX_MINUTES = 20` (`electron/main.js:137`), backed by a 25 MB
guard in `frontend/app.js:1788`. At 0.93 MB/min:

- 20 minutes ≈ **18.5 MB** — comfortably inside Whisper's 25 MB, but only just.
- The true ceiling is ≈ **27 minutes**. A 30-minute recording would fail.
- Against Gemini's 20 MB inline limit the ceiling is ≈ **21 minutes** —
  a 20-minute recording is *at the edge* when Gemini is the selected engine.

So the UI cap is what has been silently protecting the product. It works, and
users have never complained — but the headroom is thinner than it looks,
especially on Gemini.

### 2.2 The Gemini format mismatch

Gemini's documented audio MIME types are `wav, mp3, aiff, aac, ogg, flac`.
**WebM is not among them.** The code already knows this and works around it by
declaring our WebM as OGG:

```python
'webm': 'audio/ogg',  # Gemini doesn't list webm; ogg container is the closest
```
`backend/gemini_transcription.py:73`

Both containers can carry Opus, so this works in practice today. It is
nonetheless an undocumented behaviour we depend on, and it would disappear if
we sent MP3 — the one compressed format both engines accept explicitly.

### 2.3 A dead diagnostic worth fixing regardless

`get_audio_duration()` shells out to `ffprobe`, but MediaRecorder's WebM output
carries no duration in its header, so `ffprobe` returns `N/A`. The parse fails
and the function returns `None`. Evidence from this machine's logs:

```
12394 × "⏱️ Using default timeout: 60s"
    1 × "⏱️ Timeout: 444s (audio: 207.4s)"
    7 × "❌ ffprobe: Invalid duration format … 'N/A'"
```

Every standard transcription has therefore used the 60-second minimum timeout
instead of a duration-derived one, since the first release. It has not caused
visible failures, but the dynamic-timeout logic is effectively dead code for
the main path. The renderer knows the duration exactly and could simply send
it — as the import feature now does.

## 3. What migrating would buy

Two independent wins, which can be taken separately:

**A. Lower the bitrate (biggest win, smallest change).** Speech does not need
129.5 kbps. Options, all measured or derived:

| Target | Size | 20 min weighs | Ceiling at 25 MB |
|---|---|---|---|
| Today: Opus 129.5 kbps | 0.93 MB/min | 18.5 MB | 27 min |
| Opus 32 kbps mono | ~0.24 MB/min | **4.6 MB** | ~104 min |
| MP3 16 kHz mono 48 kbps | 0.343 MB/min | 6.9 MB | 73 min |

`MediaRecorder` accepts `audioBitsPerSecond`, so lowering the Opus bitrate is
close to a one-line change — and would immediately allow raising or removing
the 20-minute cap.

**B. Standardise on MP3.** Removes the Gemini WebM/OGG fudge, makes all three
paths produce one format, and lets the import converter, fluid, and standard
recording share a single encoder.

Note the honest tension: **Opus is a better codec than MP3 for speech** — at
32 kbps it beats MP3 at 48 kbps on quality *and* size. MP3's advantage is
purely compatibility (Gemini). If Gemini ever documents WebM/Opus support, A
alone would be the better engineering answer and B becomes unnecessary.

## 4. What a migration would involve

Ordered by risk, lowest first:

1. **Send the real duration from the renderer** for standard recordings, and
   stop depending on `ffprobe` for the main path. Low risk, immediate benefit
   (correct dynamic timeouts). Arguably worth doing on its own.
2. **Lower the recording bitrate** via `MediaRecorder`'s `audioBitsPerSecond`.
   Requires listening tests against real dictation — Arturo's voice, his usual
   rooms, his usual mic — before and after, comparing transcription accuracy,
   not just file size. Accuracy is the acceptance criterion, not bytes.
3. **Re-encode to MP3.** Two possible shapes:
   - *Renderer-side*: reuse `MediaImportConverter` (lamejs) after the recording
     stops. Adds an encoding pass of a few seconds per 20 minutes (measured:
     155× real time), delaying the transcription slightly.
   - *Chunk-side*: have fluid mode emit MP3 instead of WAV, which also shrinks
     every 15-second chunk upload.
4. **Raise or retire the 20-minute cap** once the format change lands, and
   re-tune the frontend size guard to the new bitrate.
5. **Remove the Gemini MIME workaround** and send `audio/mp3` honestly.

### Risks and required tests

- **Transcription accuracy must not regress.** This is the whole product. Any
  bitrate change needs A/B transcription comparison on real dictation, in
  Spanish and English, including the dictionary terms.
- The saved-audio archive would change format mid-history; the history player
  and the "download as MP3" path must handle both old WebM and new MP3 files.
- Fluid mode's silence detection and 2-second overlap logic assume raw PCM;
  moving it to MP3 means encoding after those steps, not before.
- Whisper and Gemini both accept MP3, but their behaviour on *very* low
  bitrates is untested by us — do not go below 32 kbps without measuring
  accuracy.

## 5. Recommendation

If and when this is picked up: **do step 1 and step 2 first, measure accuracy,
and stop there if the numbers are good.** Lowering the bitrate captures most of
the available capacity with a fraction of the risk of a format migration. Step
3 onward is only justified if we want one uniform format across all paths or
if the Gemini workaround becomes a real problem.

Until then, the media-import feature stands alone as the only MP3 producer, by
necessity rather than by policy — see
[SPEC-MEDIA-FILE-IMPORT.md](SPEC-MEDIA-FILE-IMPORT.md) §2.
