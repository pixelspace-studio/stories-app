# 🛠️ Stories App — Build & Distribution

This doc lives at `electron/build_docs/BUILD.md` because Stories is shipped as an Electron app and any dev (or AI) tasked with producing a build will look in `electron/` first. The build configs themselves live at the repo root (`forge.config.js`, `package.json`) and in `scripts/`. **Read this doc first** for the day-to-day build flow.

For deeper signing/notarization details, troubleshooting, and Python-bundling gotchas, see [`../../docs/RELEASE_GUIDE.md`](../../docs/RELEASE_GUIDE.md).

---

## 🎯 **TWO BUILD FLAVORS**

| Flavor | Command | Where allowed | Telemetry | Audience |
|--------|---------|---------------|-----------|----------|
| **internal** | `npm run make:internal` | any branch | enabled | Pixelspace team / dogfooding / shared via GitHub prereleases |
| **community** | `npm run make:community` | **only `main`** | disabled | outside users / official releases |

**Default to `make:internal` for testing.** Community builds are blocked outside `main` by `scripts/guard-community-branch.js` — there is no override. If a teammate needs to test something from a feature branch, build internal and share via GitHub releases (see "Distributing a build" below).

Output lands in `out/make/Stories-v<version>-<flavor>.dmg`.

---

## 🏷️ **THE VERSION-CLAIMING FLOW**

A local build produces a binary that may end up on someone's machine. To prevent two devs from independently building different bits as the same version, every build is recorded in `electron/build_docs/BUILD_LOG.md`.

### Before you build

1. Open `electron/build_docs/BUILD_LOG.md`. Look at the latest row — that's the most recently claimed version.
2. Bump `package.json` to the next `-N` (e.g. last entry is `0.9.10-6` → set yours to `0.9.10-7`).
3. Run `npm run make:internal` (or `make:community` from `main`). The build script will hard-fail with a clear message if your version already has a `built/<version>` tag — that's your safety net in case BUILD_LOG.md is out of sync with reality. If you see that error, bump higher and try again.

### After your build succeeds

1. Tag the commit (the `built/` prefix avoids triggering the official release CI):
   ```bash
   git tag built/0.9.10-7 -m "Built locally by <name> on YYYY-MM-DD"
   git push origin built/0.9.10-7
   ```
2. Append a row to `electron/build_docs/BUILD_LOG.md` with version, flavor, your name, the date, the branch, the tag link, and (if you distributed) the GitHub release link.
3. Commit `package.json` + `BUILD_LOG.md` together and push.

**You do NOT pre-bump for the next dev.** The log is the source of truth — whoever builds next reads it, picks the next number themselves, and bumps `package.json` as part of their own commit.

---

## 📤 **DISTRIBUTING A BUILD TO THE TEAM**

Upload the DMG to a GitHub prerelease attached to the matching `built/<version>` tag:

```bash
gh release create built/0.9.10-5 \
  out/make/Stories-v0.9.10-5-internal.dmg \
  --prerelease \
  --title "0.9.10-5 (internal build by <name>)" \
  --notes "..."
```

**If the DMG is unsigned** (Pixelspace cert not in keychain — common for local internal builds), include the unquarantine command in the release notes so teammates can open the app:

```bash
xattr -dr com.apple.quarantine /Applications/Stories.app
```

---

## 🤖 **FOR AI CODING AGENTS**

Quick orientation if you've been dropped into this repo to build:

- **Default to `npm run make:internal`** for any build during normal work. Only use `npm run make:community` if you are on `main` AND the user explicitly asks for a public/community release. The community script will hard-fail on any other branch — there is no override.
- **Read `electron/build_docs/BUILD_LOG.md` first.** Pick the next `-N` after the latest row, bump `package.json` to that, then build. The build script refuses to produce a version that already has a `built/<version>` tag.
- After a successful build: create the `built/<version>` tag and push it, append a row to `BUILD_LOG.md`, commit `package.json` + `BUILD_LOG.md` together, push. **Do not** pre-bump for the next dev — they read the log and bump as part of their own work.
- To distribute an internal build, attach the DMG to a `built/<version>` GitHub prerelease. If unsigned (no Pixelspace cert in keychain), include the `xattr -dr com.apple.quarantine /Applications/Stories.app` workaround in the release notes.
- Both flavors handle: Python venv install, PyInstaller bundle, electron-forge package, DMG modification, DMG signing (if cert present).
- **Before reporting "build worked"**: actually open the resulting `.dmg`, install it, and exercise the changed code path. The dev mode (`npm start`) uses system Python and will not surface PyInstaller bundling issues.
