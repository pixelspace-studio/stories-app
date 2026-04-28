# Changelog

All notable changes to Stories App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.9.10-1] - 2026-04-25

**Integration release.** Brings the long-running `feature/gemini-stt`
chain (fluid-transcription → realtime-agent-feed → smart-tools →
gemini-stt) onto the same trunk as the post-release fixes that
landed directly on `main` (#17 Windows auto-paste, #18 fluid
reliability + widget timer freeze, #19 View More visibility,
#20 scrollable class cleanup, version bump to 0.9.9, BUILD_TYPE
plumbing for post-make).

No new user-facing features in this version itself — see the
[0.9.9-4] and [0.9.9] sections below for the actual feature work
that this release combines.

### Notes
- During the merge, `frontend/components/FluidTranscriptionManager.js`
  was hand-merged so PR #18's chunk retry loop and averaging
  downsampler coexist with our pause()/resume(), silence detection
  (RMS skip) and `_calculateRMS` helper.
- Settings UI keeps both dropdowns: main's full-width microphone
  selector and our constrained STT model dropdown — the latter is
  scoped via `#sttModelSelect.setting-select` to avoid leaking the
  pill style onto the mic selector.
- `frontend/app.js` got PR #19 + PR #20's View More fixes applied
  by hand on top of our version (the changes were tiny: `>` →
  `>=`, drop the redundant overflow probe, always clean up the
  `scrollable` class, reset `showingAll` on history clear).

### Known follow-up
- `electron/main.js` still uses inline AppleScript in the
  recording-toggle path instead of PR #17's cross-platform
  `detectCurrentApp()` helper. The helper is already defined in
  the file (it's used in the separate auto-paste call site), so
  re-wiring the toggle path is a small isolated cleanup.

---

## [0.9.9-4] - 2026-04-25

### Added
- **Gemini STT**: New speech-to-text engines alongside OpenAI Whisper
  - `gemini-3-flash-preview` (UI label: "Gemini Flash")
  - `gemini-3.1-flash-lite-preview` (UI label: "Gemini Flash Lite")
  - Settings → STT model dropdown picks the active engine for all
    transcription routes (standard, retry, fluid chunks)
  - Settings → API Keys → Gemini stores the Google API key encrypted
  - New REST endpoints: `GET/POST/DELETE /api/config/gemini-key`
- **Per-story engine label**: Each transcription is tagged with the
  STT engine that produced it. The label appears next to the timestamp
  in Recent stories. New `stt_model` column on the transcriptions table
  (auto-migrated on startup).
- **Cross-engine STT fallback**: When the active engine fails with a
  transient error (HTTP 5xx, rate limit, network, timeout) and the
  other engine has credentials configured, transcription is
  transparently retried with the other engine. Auth errors do NOT
  trigger fallback (the other engine has its own key). The story is
  labelled `"Whisper (fallback from Gemini Flash Lite)"` so the user
  sees what really happened without checking logs.

### Changed
- **Smart Transforms / Prompt Mode — plain text by default**:
  Both system prompts now instruct the model to return raw plain text.
  Markdown, headings, bullets, bold, italics, code blocks and tables
  are opt-in: the model only formats output when the user's instruction
  explicitly asks for visual structure.
- **Settings UI**: API Keys grouped under a single subsection with
  shorter, symmetric labels ("OpenAI" / "Gemini") and a unified
  "Add Key" button. STT model dropdown sized to fit cleanly next to
  its label.
- **STT model dropdown**: Removed "Gemini Flash" option. Only Whisper
  and Gemini Flash Lite are user-selectable; Flash adds cost vs Lite
  without a clear quality win for verbatim transcription.

### Fixed
- **Lost API keys after install**: Recording could fail with HTTP 401
  on every chunk after installing a new build, even though the
  Settings panel still showed the key as configured. Root cause:
  `secure.enc` was encrypted using `os.environ.get('USER')`, which
  varies between launch contexts (Spotlight / Dock / shell). Reads
  from a different context produced a different key and silently
  returned an empty config. The encryption key now derives from
  `pwd.getpwuid(os.getuid()).pw_name`, which is identical across
  launch contexts. A one-time transparent migration tries the legacy
  IDs and re-encrypts with the stable one if recovery succeeds, so
  existing users keep their keys.
- **Misleading error reasons for Gemini failures**: 5xx / "unavailable"
  / "overloaded" responses from the Gemini API were bucketed as
  `UNKNOWN_ERROR`. They are now correctly classified as
  `SERVER_ERROR`, which makes the cross-engine fallback decision
  match the actual failure category and produces clearer log lines.

### Technical
- New dependency: `google-genai==1.73.1`
- `backend/gemini_transcription.py`: thin wrapper that returns the
  same `RetryResult` shape as Whisper so the existing transcription
  flow stays unchanged
- `register_fluid_routes()` accepts `transcribe_chunk_fn` and
  `stt_credentials_check` so chunk transcription respects the active
  engine instead of hard-coding Whisper
- New observability lines in `backend.log`:
  - Startup: `🎙️  STT setup: active=… | openai_key=yes/no | gemini_key=yes/no`
  - Save: `stt_model: …` appended to the existing save line
  - Fallback: `⤺ STT fallback: <primary> failed (<reason>), retrying with <fallback>`
    + `✅ STT fallback succeeded` / `❌ STT fallback also failed`
- Build pipeline hardening: `npm run make:community` and
  `npm run make:internal` now run a `build:backend` step first that
  reinstalls Python deps and rebuilds the PyInstaller bundle, so
  shipped DMGs always carry the latest backend code.

---

## [0.9.9] - 2026-03-25

**Release Date:** March 25, 2026

### Added
- **Fluid Transcription**: Real-time transcription as you record — results appear every ~15 seconds instead of waiting until the end
  - Reduces wait time from 30–180s down to ~2s for long recordings
  - Uses AudioContext + AudioWorklet for low-latency audio streaming
  - Runs in parallel with the existing recording pipeline
  - Toggleable in Settings
- **Windows Auto-Paste**: Transcriptions now automatically paste into the active window on Windows (via Win32 API + PowerShell)

### Fixed
- **View More**: Scrollable state now correctly removed when "View More" button is shown or hidden
- **History Clear**: `showingAll` state resets correctly when history is cleared; "View More" visibility updates properly
- **Widget Timer**: Timer improvements for more accurate display during Fluid Transcription sessions
- **Fluid Transcription Reliability**: Improved stability and chunk handling for long recordings

---

## [0.9.8] - 2025-11-11

**Release Date:** November 11, 2025

### Fixed
- **Settings Panel Bug**: Fixed "Add API Key" button not responding when Settings opened from Settings button
  - Removed duplicate event listener on settings overlay
  - ModalManager now correctly handles overlay clicks
- **Recording Time Limit**: Fixed 20-minute recording limit not being enforced
  - Removed hardcoded 30-minute safety timeout
  - Updated MAX_MINUTES from 15 to 20 in RECORDING_CONFIG
  - Adjusted WARNING_MINUTES to 15 minutes
  - Recording now automatically stops at 20 minutes as configured
- **Timer Display Bug**: Fixed timer showing previous recording time when starting new recording
  - Timer now resets to 00:00 immediately when starting new recording
  - Prevents showing old time for a brief moment

### Improved
- **Transcription Progress Indicator**: Realistic progress based on estimated time (for recordings >= 5 minutes)
  - Widget: Progress bar advances gradually based on elapsed time vs estimated time
  - Main Window: Dynamic phases (Uploading → Transcribing → Almost done) based on progress percentage
  - Adaptive formula: shorter audio = faster, longer audio = slower proportionally
  - Based on real-world experience: 20 min audio takes ~6 min to transcribe
  - For recordings < 5 minutes: simple spinner only (no progress bar)
- **Settings UI**: Moved debug log buttons from Settings header to tray menu
  - Logs now accessible via "View Logs" submenu in tray menu (more professional)
  - Settings header is now cleaner without debug buttons
- **Privacy Policy Link**: Updated "Learn more" link to official privacy policy page
  - Changed from GitHub docs to https://pixelspace.com/stories/data-privacy.html

### Technical
- Implemented time-based progress calculation instead of fixed stages
- Added `calculateEstimatedTranscriptionTime()` function with adaptive formula
- Progress updates every 100ms for smooth animation
- Progress caps at 95% until transcription actually completes

---

## [0.9.7] - 2025-11-04

### Added
- **Menu Bar Status Icon** with 4 visual states:
  - Idle: Standard template icon (adapts to system theme)
  - Recording: Red dot indicator
  - Processing: Orange dot indicator  
  - Ready: Green dot indicator (displays for 2 seconds)
- Menu bar context menu with quick actions:
  - Start/Stop Recording
  - Open Main Window
  - Open Settings
  - Quit Stories
- Dark mode support for menu bar icon (auto-adapts)
- **MP3 Download Conversion**: Audio files automatically converted from WebM to MP3 (128kbps) when downloaded
- Consolidated telemetry documentation (`docs/TELEMETRY.md`)

### Fixed
- Recording cancellation detection improved with detailed logging
- Sleep/wake detection no longer auto-cancels recordings
- Event listener duplicate registration prevented
- Menu bar icon state synchronization across widget and main window
- Progress bar for short recordings (<60s) - timer now stays frozen instead of showing misleading percentages

### Improved
- Code cleanup: removed `.DS_Store` files and `__pycache__` directories
- Updated `.gitignore` to prevent future OS-generated files
- Consolidated obsolete documentation to `/docs/archive/`
- Better error messages for recording cancellations
- **User-friendly error messages** - comprehensive improvements (re-implemented with helper functions):
  - **Backend helper functions**: Centralized error message generation (`get_user_friendly_api_error`, `get_user_friendly_server_error`)
  - **Frontend helper function**: `getUserFriendlyErrorMessage()` for technical error conversion
  - **Microphone permissions**: Specific messages for 6 error types (NotAllowedError, NotFoundError, NotReadableError, etc.)
  - **Backend endpoints**: User-friendly errors for audio download, settings save, dictionary operations, cleanup
  - **Error message context**: Shows "You can download the audio file" only when audio was actually saved
  - **Toast notifications**: Immediate feedback for transcription errors (real-time display)
  - **Code quality**: Clean, maintainable implementation with no code duplication

### Technical
- Tray icon implementation using Electron Tray API
- On-the-fly audio conversion using `pydub` library
- Automatic cleanup of temporary MP3 files
- Graceful fallback to WebM if conversion fails
- **Telemetry Dashboard Improvements** (Nov 5, 2025):
  - **Pagination**: 20 results per page for Recent Recordings and Errors
  - **Date filters**: Last 7, 30, or 90 days
  - **Performance**: Composite database indexes for 10-100x faster queries
  - **Success Rate**: Now calculates correctly (was always showing 0%)
  - **Events Chart**: Shows specific event types instead of generic "other"
  - **Test User Exclusion**: Filter test accounts via `EXCLUDED_USER_IDS` env var
  - **Duration Format**: Dynamic display (seconds/minutes based on length)
  - **Cost Precision**: Up to 6 decimals for accurate small cost display

---

## [0.9.6] - 2025-10-28

### Added
- **Anonymous Telemetry System** (opt-out available)
  - Self-hosted analytics backend on Render.com
  - PostgreSQL database for events and crashes
  - Dashboard for viewing aggregated stats
  - Privacy-first: zero PII, no transcriptions, no API keys
- Telemetry toggle in Settings
- Crash reporting (always on for stability)

### Security
- All telemetry data encrypted in transit (HTTPS only)
- 365-day automatic data retention limit
- GDPR compliant

---

## [0.9.5] - 2025-10-21

### Fixed
- Widget auto-hide improvements
- Startup optimization with skeleton loaders
- Permissions workflow enhanced

---

## [0.9.43] - 2025-10-18

### Added
- **Audio File Size Limits**: Pre-transcription validation for 25MB OpenAI limit
- **Retry Failed Transcriptions**: Retry button on error cards with unlimited attempts
- **Enhanced Error Handling**: User-friendly messages for 502/503 errors

### Fixed
- Progress bar accuracy improvements
- Better error recovery on network timeouts
- Proper cleanup of audio chunks on errors

---

## [0.9.42] - 2025-10-15

### Added
- **Open Audio Folder** button in Settings
- Quick access to saved recordings folder
- Storage stats and cleanup in Settings UI

---

## [0.9.4] - 2025-10-12

### Added
- **Custom Dictionary** with fuzzy matching
- Add custom words/names for better transcription accuracy
- Dictionary management UI in Settings

### Improved
- Transcription quality with custom vocabulary
- UI polish and consistency

---

## [0.9.3] - 2025-10-08

### Added
- **Auto-paste** functionality using robotjs
- Transcriptions automatically paste where you were typing
- Toggle in Settings to enable/disable

### Fixed
- Accessibility permissions workflow
- Multi-monitor widget positioning

---

## [0.9.2] - 2025-10-01

### Added
- **Floating Widget** always-on-top draggable interface
- Widget auto-hide toggle
- Multi-screen support

### Improved
- Widget follows cursor across displays
- Better visual feedback during recording

---

## [0.9.1] - 2025-09-25

### Added
- **Global Shortcuts**:
  - Cmd+Shift+R: Toggle recording
  - Cmd+Control+V: Copy latest transcription
- Settings panel for shortcut customization

### Fixed
- Microphone permissions handling
- Shortcut registration conflicts

---

## [0.9.0] - 2025-09-15

### Added
- Initial pre-release
- Core features:
  - Audio recording with visual feedback
  - OpenAI Whisper API transcription
  - Transcription history with SQLite
  - Audio archiving (optional)
  - Settings UI (API key management)
  - macOS-native design

### Technical
- Electron + Python Flask architecture
- Encrypted API key storage
- Local SQLite database
- PyInstaller for backend distribution

---

## Upcoming Features

See [docs/BACKLOG.md](docs/BACKLOG.md) for planned features:

### v0.9.8+ (Improvements)
- Telemetry dashboard enhancements (pagination, filters)
- Progress bar accuracy fixes
- Enhanced error handling

### v1.0.0 (Production Release)
- Auto-update system
- Complete security audit
- Fresh install testing (macOS 12-14)
- Intel Mac build (x64 support)
- Notarization complete

### v1.1.0+ (Future)
- Performance benchmarks
- Crash reporting improvements
- Audio compression (pre-transcription)

---

[0.9.7]: https://github.com/yourusername/stories-app/compare/v0.9.6...v0.9.7
[0.9.6]: https://github.com/yourusername/stories-app/compare/v0.9.5...v0.9.6
[0.9.5]: https://github.com/yourusername/stories-app/compare/v0.9.43...v0.9.5
[0.9.43]: https://github.com/yourusername/stories-app/releases/tag/v0.9.43

