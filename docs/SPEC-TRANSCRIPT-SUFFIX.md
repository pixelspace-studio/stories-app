# Spec: Transcript Suffix (Quick Keywords Appended to Transcriptions)

**Status:** Approved for implementation
**Author:** Claude (architect) — implementation intended for a separate agent
**Date:** 2026-07-14
**Related spec:** [SPEC-MEDIA-FILE-IMPORT.md](SPEC-MEDIA-FILE-IMPORT.md) (Feature 2, shares the suffix pipeline)

---

## 1. What we are building

The user can define one or more short text snippets ("suffixes") — words or full
phrases, e.g. `/ blah` or `-- reviewed by Arturo`. When the feature is **enabled**,
the currently **active** suffix is appended to the end of every final transcription,
separated by a single space:

```
<transcribed text> <suffix text>
```

Rules, straight from the product ask:

- The user can store **several** suffixes but only **one is active** at a time.
- The feature has a global **on/off toggle**. Off = transcripts are untouched.
- **v1 is append-only** (end of transcript). Prepend is a possible future
  extension — the data model leaves room for it, but do NOT implement it now.
- The suffix applies to the **final assembled transcript only** — never to
  individual 15-second fluid chunks.

## 2. Current architecture (read this before coding)

There are two distinct transcription completion paths, plus two retry paths.
All of them must apply the suffix; the fluid *chunk* path must NOT.

| Path | Where the final text is assembled | File:line (approx) |
|---|---|---|
| Standard recording | `transcribe_audio()` — after dictionary corrections | `backend/app.py:737-748` |
| Fluid recording | `fluid_complete()` — after `<seg>` tag stripping | `backend/fluid_transcription.py:294-315` |
| Retry from history | `retry_transcription()` | `backend/app.py:1203` |
| Retry from audio file | `retry_audio_transcription()` | `backend/app.py:1313` |
| File import (Feature 2) | new `/api/import/transcribe` endpoint | see other spec |
| Fluid chunks — **do NOT touch** | `/api/transcribe/chunk` | `backend/fluid_transcription.py:139` |

Key architectural fact: **auto-paste is fed by the backend response text**
(`attemptAutoPaste(result.text)` in `frontend/app.js:1838` and `:4796`), and
history is fed by `save_transcription()` on the backend. Therefore appending
**on the backend, before save + response**, propagates the suffix everywhere
(pasted text, history panel, DB) with a single hook. Do NOT implement this in
the frontend.

Settings infrastructure that already exists and must be reused:

- `backend/config_manager.py` — `get_setting(key_path)` / `set_setting(key_path, value)`
  with dot notation; values are arbitrary JSON (stored in `config.json`).
- REST: `GET/POST /api/config/settings` and `GET/POST /api/config/settings/<key>`
  (`backend/app.py:1937-2003+`).
- Frontend toggle pattern: `loadXxxSetting()` + `toggleXxx()` methods in
  `frontend/app.js` (see `toggleAutoPaste` at `app.js:4266` for the canonical
  example, including revert-on-error), wired in the listener block around
  `app.js:930-1000`, with markup as `setting-item` blocks in
  `electron/index.html` (Settings panel starts at line ~198).

## 3. Data model

One JSON setting under the existing `ui_settings` namespace:

```json
"ui_settings": {
  "transcript_suffix": {
    "enabled": false,
    "active_id": null,
    "items": [
      { "id": "sfx_1720900000", "text": "/ blah" },
      { "id": "sfx_1720900001", "text": "-- draft" }
    ]
  }
}
```

- `id`: string, generated on the frontend as `"sfx_" + Date.now()` (collisions
  impossible in practice — items are user-typed one at a time).
- `active_id`: id of the item to append, or `null`. If `enabled` is true but
  `active_id` is null or dangling (item was deleted), **behave as disabled** —
  never crash, never append empty text.
- `text`: stored trimmed; empty strings are rejected in the UI.
- Future-proofing (do not implement): a `position` field per item
  (`"append" | "prepend"`) can be added later without migration since readers
  must treat missing fields as defaults.

No DB schema change. No new endpoints — the generic settings API handles
read/write of the whole `transcript_suffix` object in one call.

## 4. Backend implementation

### 4.1 Helper (single source of truth)

Add to `backend/app.py`, near `generate_whisper_prompt_from_dictionary()`
(line ~191), following the same defensive style:

```python
def apply_transcript_suffix(text: str) -> str:
    """
    Append the active user-defined suffix to a FINAL transcript.

    Controlled by ui_settings.transcript_suffix:
      { enabled: bool, active_id: str|null, items: [{id, text}] }

    Never raises — on any config problem, returns text unchanged.
    Must only be called on final assembled transcripts, never on
    individual fluid chunks.
    """
    try:
        cfg = get_default_config_manager().get_setting(
            'ui_settings.transcript_suffix', None
        )
        if not cfg or not cfg.get('enabled'):
            return text
        active_id = cfg.get('active_id')
        if not active_id:
            return text
        suffix = next(
            (i.get('text', '').strip()
             for i in cfg.get('items', []) if i.get('id') == active_id),
            ''
        )
        if not suffix or not text.strip():
            return text
        return f"{text.rstrip()} {suffix}"
    except Exception as e:
        logger.warning(f"⚠️ Transcript suffix skipped: {e}")
        return text
```

Note the guard `if not text.strip()`: an empty/failed transcript must not
become just the suffix.

### 4.2 Call sites (exactly four in this feature + one in Feature 2)

1. **`transcribe_audio()`** — `backend/app.py`, immediately after the dictionary
   fallback correction block (lines 737-748), before the `ephemeral` check:

   ```python
   transcription_data['text'] = apply_transcript_suffix(
       transcription_data.get('text', '')
   )
   ```

   Placement matters: after dictionary corrections (so corrections never touch
   the suffix), before `save_transcription()` and before
   `window_manager.complete_recording(True, transcription_data)` — that is how
   the suffix reaches auto-paste, DB, and the JSON response at once.

   Decision: the suffix **does** apply to `ephemeral` transcriptions
   (instruction mode). Rationale: uniformity; the toggle is the user's control.
   If this proves annoying, gate it behind `and not ephemeral` later.

2. **`fluid_complete()`** — `backend/fluid_transcription.py`, right after
   `clean_text` is produced by the `<seg>`-strip regexes (line ~299):

   ```python
   clean_text = apply_suffix_fn(clean_text)
   ```

   `fluid_transcription.py` gets its collaborators injected via
   `register_fluid_routes(...)` (line 121) — follow that pattern: add an
   `apply_suffix_fn` parameter to `register_fluid_routes`, and pass
   `apply_transcript_suffix` from `app.py` where the routes are registered.
   Do NOT import app.py from fluid_transcription.py (circular import).

3. **`retry_transcription()`** (`app.py:1203`) and
4. **`retry_audio_transcription()`** (`app.py:1313`) — both re-run
   `run_transcription()` on raw stored audio and save a fresh transcript, so
   apply the helper to the retry result text the same way as in (1), after any
   dictionary correction each path performs. There is no double-append risk:
   retries always start from raw audio, never from previously suffixed text.

**Never** call the helper in `/api/transcribe/chunk` — chunks are intermediate.

## 5. Frontend implementation

### 5.1 Settings UI

Location: Settings panel → **Transcription** section (`electron/index.html`,
section header at line ~207, right after the STT model selector). Markup follows
the existing `setting-item setting-item-vertical` pattern:

```html
<!-- Transcript Suffix -->
<div class="setting-item setting-item-vertical">
    <div class="setting-row">
        <div class="setting-label-group">
            <span class="setting-label">Append suffix</span>
            <span class="setting-tooltip" title="Append a saved word or phrase to the end of every transcription">
                <i class="ph ph-info"></i>
            </span>
        </div>
        <label class="toggle-switch">
            <input type="checkbox" id="transcriptSuffixToggle">
            <span class="toggle-slider"></span>
        </label>
    </div>
    <div id="transcriptSuffixControls" class="hidden">
        <select id="transcriptSuffixSelect" class="setting-select">
            <!-- populated from settings; one <option> per item -->
        </select>
        <div class="suffix-editor">
            <input type="text" id="transcriptSuffixInput"
                   class="setting-text-input" placeholder="e.g. / blah"
                   maxlength="120">
            <button id="transcriptSuffixAdd" class="setting-inline-button">Add</button>
            <button id="transcriptSuffixDelete" class="setting-inline-button">Delete selected</button>
        </div>
    </div>
</div>
```

> Check `frontend/css/` (components layer) for the exact toggle markup used by
> the neighboring toggles (e.g. Auto-paste at `index.html` "Defaults" section)
> and copy that structure verbatim — the snippet above is intent, not
> pixel-final markup. New CSS should be minimal: `.suffix-editor` as a flex row,
> reusing existing input/button styles. No cards, no extra enclosures.

Behavior:

- Toggle off → `#transcriptSuffixControls` hidden (`hidden` class, same
  convention as `realtimeFeedSettingItem`).
- Selecting in the dropdown sets `active_id`.
- **Add**: trim input; ignore if empty; create `{id, text}`, push to `items`,
  make it the new `active_id`, clear the input.
- **Delete selected**: remove the item; if it was active, set `active_id` to the
  first remaining item or `null`; if `items` becomes empty, also set
  `enabled: false` and flip the toggle off.

### 5.2 State handling in `frontend/app.js`

Follow the established pattern exactly (mirror `toggleAutoPaste`,
`app.js:4266-4302`):

- Cache element refs in the constructor-area block where `autoPasteToggle`
  et al. are grabbed (`app.js:~415`).
- `loadTranscriptSuffixSetting()` — GET
  `/api/config/settings/ui_settings.transcript_suffix`, hydrate toggle +
  dropdown; call it where the other `loadXxxSetting()` calls run at startup.
- All mutations (toggle, select, add, delete) write the **whole object** back
  with one POST to `/api/config/settings/ui_settings.transcript_suffix`
  (`{"value": {...}}`), keeping a local in-memory copy as source of truth for
  the UI. Revert local state + controls if the POST fails (same
  revert-on-error style as the existing toggles).
- Track with the existing telemetry pattern:
  `feature_toggled { feature: 'transcript_suffix', enabled }`.

No changes needed in the widget, ShortcutManager, or Electron main — the
feature is invisible outside Settings and the resulting text.

## 6. Edge cases (test these)

1. Enabled + no items / dangling `active_id` → transcript unchanged.
2. Suffix with leading/trailing spaces → stored trimmed; output has exactly one
   separating space.
3. Failed transcription (error text saved to history) → suffix must NOT be
   appended to error messages — this is guaranteed by placement (call sites are
   success branches only). Verify.
4. Fluid recording with failed segments (`status='partial'`) → suffix still
   applies to whatever text survived.
5. Dictionary corrections + suffix together → corrections run first; a
   dictionary term inside the suffix text is never "corrected" (suffix appended
   after).
6. Toggle changes mid-recording → whatever the setting is at *completion* time
   wins (backend reads config at completion; this is inherent and acceptable).
7. Unicode/emoji suffixes and `/`-prefixed suffixes — plain string append, must
   pass through untouched.

## 7. Out of scope for v1

- Prepend position (schema-compatible future extension).
- Per-recording suffix picker in the main UI (e.g. choosing at record time).
- Multiple simultaneous suffixes.
