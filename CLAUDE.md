# CLAUDE.md

Project-specific guidance for Claude Code working in this repo.

## Build & version

For anything build-, version-, or release-related, see the canonical docs:

- `electron/build_docs/BUILD.md` — **start here.** Internal vs community flavors, branch rules, claiming a version with `built/<version>` tags, distributing DMGs to the team via GitHub prereleases.
- `docs/RELEASE_GUIDE.md` — deeper signing/notarization mechanics, troubleshooting, Python-bundling gotchas.
- `docs/VERSION_GUIDE.md` — semver conventions, the `built/<version>` tag convention, post-build version bump.

These are authoritative. Don't duplicate them here.

## Codebase pointers

- `backend/app.py` — Flask server, all API routes.
- `backend/config_manager.py` — settings + encrypted secure storage (API keys live in `secure.enc`). Key derivation uses POSIX username only; **never** include `os.uname().nodename` (it rotates with Wi-Fi/Bonjour state on macOS and silently breaks decryption — keys appear to vanish).
- `backend/fluid_transcription.py` — real-time chunk transcription. Endpoint `/api/transcribe/chunk` dispatches via `run_transcription` in `app.py`, which has Gemini↔Whisper auto-fallback.
- `frontend/app.js` — main UI logic (~3800 lines).
- `frontend/components/FluidTranscriptionManager.js` — only caller of `/api/transcribe/chunk`.

## Logs

- Backend: `~/Library/Application Support/Stories/backend.log`
- Electron main: `~/Library/Logs/Stories/main.log`
- Encrypted secrets: `~/Library/Application Support/Stories/secure.enc` (+ `.backup`)

## Operational gotchas

- Killing Stories: use `pkill -f "Stories.app"`. Never `pkill -f "stories-app"` — it matches the build's working directory and kills `electron-forge make` mid-flight.
