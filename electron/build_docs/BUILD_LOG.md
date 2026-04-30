# Build Log

Append-only ledger of every Stories build that left someone's machine.

**If you are about to build, read the latest entry first.** The "version" column tells you what number was last claimed. Pick the next one (e.g. last was `0.9.10-6` → you build `0.9.10-7`), bump `package.json`, then build. Append a new row when your build is done. The `make:*` scripts will refuse to build a version that already appears in this log (enforced by `scripts/guard-version-not-built.js` via `built/<version>` git tags).

| Version | Flavor | Built by | Date | Branch | Tag | Release |
|---------|--------|----------|------|--------|-----|---------|
| 0.9.10-4 | community | Arturo | 2026-04-29 | merge/gemini-stt-into-main | — | — (local only) |
| 0.9.10-6 | internal | Arturo | 2026-04-29 | merge/gemini-stt-into-main | [`built/0.9.10-6`](../../../../tree/built/0.9.10-6) | [GitHub release](https://github.com/pixelspace-studio/stories-app/releases/tag/built/0.9.10-6) |
| 0.9.10-7 | internal (signed + notarized) | Florencia | 2026-04-30 | merge/gemini-stt-into-main | [`built/0.9.10-7`](../../../../tree/built/0.9.10-7) | [GitHub release](https://github.com/pixelspace-studio/stories-app/releases/tag/built/0.9.10-7) |

Note: `0.9.10-5` was skipped — built locally as a community DMG by mistake on a non-`main` branch, never distributed, tag and DMG deleted.

Note: `0.9.10-7` is the same source as `0.9.10-6` (HEAD only adds the BUILD_LOG/guard tooling), rebuilt to ship a properly signed and Apple-notarized DMG. Testers can install it without the `xattr -dr com.apple.quarantine` workaround.
