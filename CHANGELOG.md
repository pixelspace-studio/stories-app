# Changelog

All notable changes to Stories App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

