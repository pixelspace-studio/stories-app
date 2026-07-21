# Build Log

Append-only ledger of every Stories build that left someone's machine.

**If you are about to build, read the latest entry first.** The "version" column tells you what number was last claimed. Pick the next one (e.g. last was `0.9.10-6` → you build `0.9.10-7`), bump `package.json`, then build. Append a new row when your build is done. The `make:*` scripts will refuse to build a version that already appears in this log (enforced by `scripts/guard-version-not-built.js` via `built/<version>` git tags).

| Version | Flavor | Built by | Date | Branch | Tag | Release |
|---------|--------|----------|------|--------|-----|---------|
| 0.9.10-4 | community | Arturo | 2026-04-29 | merge/gemini-stt-into-main | — | — (local only) |
| 0.9.10-6 | internal | Arturo | 2026-04-29 | merge/gemini-stt-into-main | [`built/0.9.10-6`](../../../../tree/built/0.9.10-6) | [GitHub release](https://github.com/pixelspace-studio/stories-app/releases/tag/built/0.9.10-6) |
| 0.9.10-7 | internal (signed + notarized) | Florencia | 2026-04-30 | merge/gemini-stt-into-main | [`built/0.9.10-7`](../../../../tree/built/0.9.10-7) | [GitHub release](https://github.com/pixelspace-studio/stories-app/releases/tag/built/0.9.10-7) |
| 0.9.10-8 | internal (unsigned) | Arturo | 2026-05-13 | merge/gemini-stt-into-main | [`built/0.9.10-8`](../../../../tree/built/0.9.10-8) | — (local only) |
| 0.9.10-9 | internal (unsigned) | Arturo | 2026-05-13 | fix/backend-onedir | [`built/0.9.10-9`](../../../../tree/built/0.9.10-9) | [GitHub release](https://github.com/pixelspace-studio/stories-app/releases/tag/built/0.9.10-9) |

Note: `0.9.10-5` was skipped — built locally as a community DMG by mistake on a non-`main` branch, never distributed, tag and DMG deleted.

Note: `0.9.10-7` is the same source as `0.9.10-6` (HEAD only adds the BUILD_LOG/guard tooling), rebuilt to ship a properly signed and Apple-notarized DMG. Testers can install it without the `xattr -dr com.apple.quarantine` workaround.

Note: `0.9.10-9` migrates the backend from PyInstaller onefile to onedir (issue #33). Adds `_MEI`-state diagnostic logging in the Gemini/Whisper init paths. Built unsigned on Arturo's Mac — to ship to Flor as a Gatekeeper-friendly DMG, Florencia (or anyone with the Pixelspace cert) should rebuild from `built/0.9.10-9` to produce a signed + notarized `0.9.10-10`. The onedir layout requires every `.so` and `.dylib` inside `_internal/` to be individually signed with hardened runtime — the updated `scripts/sign-all-binaries.sh` already does this.
| 0.9.10-10 | internal (signed) | Arturo | 2026-07-16 | feature/suffix-and-media-import | [`built/0.9.10-10`](../../../../tree/built/0.9.10-10) | [GitHub release](https://github.com/pixelspace-studio/stories-app/releases/tag/built/0.9.10-10) |

Note: `0.9.10-10` adds two features — transcript suffix (user-defined word/phrase appended to final transcriptions) and media file import (transcribe existing audio/video files) — plus the suffix-editor UI fixes. Signed with the Pixelspace cert, not notarized.

Note: `0.9.10-10` was **rebuilt in place on 2026-07-20** (same version number, new bits, tag and release asset replaced) to ship two corrections found while dogfooding:
1. **Media import no longer requires ffmpeg.** The first `0.9.10-10` cut required a system `ffmpeg` binary, which macOS does not ship and GUI apps cannot see on `PATH` even when Homebrew installed it — so import failed for everyone. Conversion now happens entirely in the renderer: Chromium decodes the container (video picture discarded), the audio is downmixed to 16 kHz mono, and a vendored dependency-free MP3 encoder (`@breezystack/lamejs`, LGPL, audited: zero network calls) produces the upload. Nothing to install.
2. **Silent recording no longer hangs the main window.** Recording a fully-silent clip from the widget (mic far/muted) left the main window stuck on "Transcribing..." forever, because the widget's empty-audio branch reset itself but never told the main window to clear its spinner. Fixed by sending the same `transcription_completed` sync the success/error branches already use. Verified live via console capture of both renderers.
