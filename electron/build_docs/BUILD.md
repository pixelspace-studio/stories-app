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

## 🏷️ **AFTER A LOCAL BUILD — CLAIM THE VERSION**

A local build produces a binary that may end up on someone's machine. To prevent two devs from independently building different bits as the same version:

1. **Tag the commit** with `built/<version>`. The `built/` prefix (not `v`) keeps CI from treating it as an official release:
   ```bash
   git tag built/0.9.10-5 -m "Built locally by <name> on YYYY-MM-DD"
   git push origin built/0.9.10-5
   ```
2. **Bump `package.json` to the next `-N`** in a separate commit and push, so the next dev pulling main starts from a fresh number:
   ```bash
   # edit package.json: 0.9.10-5 → 0.9.10-6
   git add package.json && git commit -m "chore(version): bump to 0.9.10-6" && git push
   ```

Before bumping, check existing tags (`git tag -l 'built/*'` and `gh release list`) to pick a number nobody has claimed.

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
- After a successful local build: tag with `built/<version>`, bump `package.json` to the next `-N`, push both. See "After a local build — claim the version" above. This prevents two devs from independently building different bits as the same version.
- To distribute an internal build, attach the DMG to a `built/<version>` GitHub prerelease. If unsigned (no Pixelspace cert in keychain), include the `xattr -dr com.apple.quarantine /Applications/Stories.app` workaround in the release notes.
- Both flavors handle: Python venv install, PyInstaller bundle, electron-forge package, DMG modification, DMG signing (if cert present).
- **Before reporting "build worked"**: actually open the resulting `.dmg`, install it, and exercise the changed code path. The dev mode (`npm start`) uses system Python and will not surface PyInstaller bundling issues.
