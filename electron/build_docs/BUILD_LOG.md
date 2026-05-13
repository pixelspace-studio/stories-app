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
