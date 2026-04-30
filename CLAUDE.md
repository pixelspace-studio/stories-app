# CLAUDE.md

Project-specific guidance for Claude Code working in this repo.

## Build & version conventions

Stories ships as a signed/notarized macOS DMG (and Windows zip). Versions follow `MAJOR.MINOR.PATCH-N` where `-N` is a build counter for the same patch (e.g. `0.9.10-5`).

### When the user asks for a local build

There are two flavors:

| Flavor | Command | Where allowed | Telemetry | Audience |
|--------|---------|---------------|-----------|----------|
| **internal** | `npm run make:internal` | any branch | enabled | Pixelspace team / dogfooding / shared via GitHub prereleases |
| **community** | `npm run make:community` | **only `main`** | disabled | outside users / official releases |

**Default to `make:internal`** unless the user is explicitly cutting a public release from `main`. The `make:community` script enforces this with `scripts/guard-community-branch.js` — it will hard-fail on any branch other than `main`. There is no override.

Both bundle the Python backend (pyinstaller) and package the Electron app. Output lands in `out/make/Stories-v<version>-<flavor>.dmg`. If the Pixelspace signing cert isn't in the keychain, the DMG is still produced unsigned — flag this to the user; they can install locally but can't distribute without the `xattr -dr com.apple.quarantine` workaround.

**Before building, always:**
1. Bump `package.json` version to the next `-N` suffix (e.g. `-4` → `-5`). Don't reuse a version that was already built.
2. Kill any running Stories process: `pkill -f "Stories.app"`. Do **not** `pkill -f "stories-app"` — that string matches the build's own working directory and will kill `electron-forge make` mid-flight.

### After a successful local build (claim the version)

A local build produces a binary that may end up on someone's machine. To prevent two devs from independently building different bits as the "same" version:

1. **Tag the commit** with `built/<version>` (note: prefix is `built/`, not `v`, so it does **not** trigger the release CI workflow):
   ```bash
   git tag built/0.9.10-5 -m "Built locally by <name> on YYYY-MM-DD"
   git push origin built/0.9.10-5
   ```
2. **Bump `package.json` to the next `-N`** in a separate commit and push, so the next dev pulling main naturally starts from a fresh version number:
   ```bash
   # edit package.json: 0.9.10-5 → 0.9.10-6
   git add package.json && git commit -m "chore(version): bump to 0.9.10-6" && git push
   ```

Before bumping, check existing `built/*` tags (`git tag -l 'built/*'`) and the latest release tag to pick a number nobody has claimed.

### Distributing a build to the team

For internal builds (the common case), upload the DMG to a GitHub prerelease attached to the same `built/<version>` tag:

```bash
gh release create built/0.9.10-5 \
  out/make/Stories-v0.9.10-5-internal.dmg \
  --prerelease \
  --title "0.9.10-5 (internal build by <name>)" \
  --notes "..."
```

In the release notes, **always** include the unquarantine command if the DMG is unsigned, since the Pixelspace cert isn't always available locally:

```bash
xattr -dr com.apple.quarantine /Applications/Stories.app
```

### Official release builds (CI)

Tags matching `v*` (e.g. `v0.9.10`) trigger `.github/workflows/build.yml` which builds Mac+Windows on GitHub Actions, signs, notarizes, and publishes a release. Do **not** push a `v*` tag unless the user explicitly asks for an official release.

### Reference docs

- `docs/RELEASE_GUIDE.md` — full release process (signing, notarization, troubleshooting).
- `docs/VERSION_GUIDE.md` — semver conventions and `npm run version:*` helpers.
- `docs/AUTO_UPDATE_GUIDE.md` — electron-updater setup.

## Codebase pointers

- `backend/app.py` — Flask server, all API routes.
- `backend/config_manager.py` — settings + encrypted secure storage (API keys live here in `secure.enc`). Key derivation uses POSIX username only; **never** include `os.uname().nodename` (it rotates with Wi-Fi/Bonjour state on macOS and silently breaks decryption — keys appear to vanish).
- `backend/fluid_transcription.py` — real-time chunk transcription. Endpoint `/api/transcribe/chunk` dispatches via `run_transcription` in `app.py`, which has Gemini↔Whisper auto-fallback.
- `frontend/app.js` — main UI logic (~3800 lines).
- `frontend/components/FluidTranscriptionManager.js` — only caller of `/api/transcribe/chunk`.

## Logs

- Backend: `~/Library/Application Support/Stories/backend.log`
- Electron main: `~/Library/Logs/Stories/main.log`
- Encrypted secrets: `~/Library/Application Support/Stories/secure.enc` (+ `.backup`)
