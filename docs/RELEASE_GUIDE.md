# 🚀 Stories App - Release Guide

> **For the day-to-day build flow** (internal vs community flavors, version-claiming with `built/<version>` tags, distributing DMGs to the team), see [`../electron/build_docs/BUILD.md`](../electron/build_docs/BUILD.md). This guide focuses on the deeper "how signing and notarization work" details and troubleshooting.

This guide shows you how to create a new version of Stories ready for distribution.

---

## 📋 **COMPLETE PROCESS (QUICK)**

To create a new complete release (signed and notarized):

```bash
npm run release
```

That's it! This command:
1. ✅ Compiles the app
2. ✅ Signs the app with your Pixelspace, LLC certificate
3. ✅ Creates the DMG
4. ✅ Signs the DMG
5. ✅ Notarizes with Apple (5-15 minutes)
6. ✅ Staples the notarization ticket

---

## 📝 **STEP-BY-STEP PROCESS (MANUAL)**

If you prefer to do it step by step or had an error:

### **Step 1: Compile Python backend**

```bash
cd backend
pyinstaller backend.spec
cp dist/stories-backend ../dist/
cd ..
```

### **Step 2: Compile and sign the app**

```bash
npm run make
```

This:
- Compiles the Electron frontend
- Packages the app
- Signs the app automatically
- Creates the DMG
- Signs the DMG automatically
- Runs the post-make script to customize the DMG

### **Step 3: Notarize with Apple**

```bash
npm run notarize
```

This:
- Uploads the DMG to Apple for validation
- Waits for approval (5-15 minutes)
- Staples the ticket to the DMG

---

## 🔍 **USEFUL COMMANDS**

### **View notarization history:**
```bash
npm run notarize:check
```

### **View status of specific notarization:**
```bash
xcrun notarytool info <SUBMISSION_ID> --keychain-profile "your-profile-name"
```

### **View notarization error log:**
```bash
xcrun notarytool log <SUBMISSION_ID> --keychain-profile "your-profile-name"
```

### **Verify app signature:**
```bash
codesign -dvvv out/Stories-darwin-arm64/Stories.app
```

### **Verify DMG signature:**
```bash
codesign -dvvv out/make/Stories.dmg
```

### **Verify notarization (staple):**
```bash
xcrun stapler validate out/make/Stories.dmg
```

---

## 🐛 **TROUBLESHOOTING**

### **Error: "No signature found"**
The file is not signed. Make sure to:
1. Have a valid Developer ID Application certificate installed
2. Verify with: `security find-identity -v -p codesigning`
3. See `docs/CODE_SIGNING.md` for setup instructions

### **Error: "Notarization failed - Invalid"**
View the error log:
```bash
xcrun notarytool log <SUBMISSION_ID> --keychain-profile "your-profile-name"
```

Common causes:
- Missing signature on some component
- Incorrect entitlements
- Backend not signed

### **Error: "No authentication properties provided"**
Apple credentials are not configured. Verify:
```bash
xcrun notarytool history --keychain-profile "your-profile-name"
```

If it fails, reconfigure:
```bash
xcrun notarytool store-credentials "your-profile-name" \
  --apple-id "your@email.com" \
  --password "app-specific-password" \
  --team-id "YOUR_TEAM_ID"
```

See `docs/CODE_SIGNING.md` for detailed setup instructions.

### **Notarization takes more than 30 minutes**
Apple sometimes has delays. You can:
1. Cancel with Ctrl+C (submission continues at Apple)
2. Check status with `npm run notarize:check`
3. When it says "Accepted", staple manually:
   ```bash
   xcrun stapler staple out/make/Stories.dmg
   ```

---

## 📦 **DISTRIBUTION**

Once the process is finished, you'll find:

```
out/make/
├── Stories.dmg          ← Distribute this file
└── zip/
    └── Stories.zip      ← Compressed alternative
```

The DMG is:
✅ Signed with your Developer ID certificate
✅ Notarized by Apple
✅ Ready to distribute without warnings

---

## 🔄 **FOR FUTURE VERSIONS**

Each time you cut a new version, **bump the version in 3 places** (they
must match or the in-DMG README and Settings will lie about which build
the user has):

1. `package.json` → `"version"` field
2. `CHANGELOG.md` → add a new `## [<version>] - YYYY-MM-DD` block at the
   top with `### Added` / `### Changed` / `### Fixed` sections
3. `DMG_README.txt` → add a new `📝 CHANGELOG — v<version>` section
   AND update the `Version: <version>` line at the bottom

Then:

```bash
npm run release        # signed + notarized (production)
# OR
npm run make:community # local DMG, unsigned if no cert (testing / dev)
```

`npm run make:community` automatically runs `build:backend` first, which
reinstalls Python deps from `backend/requirements.txt` and rebuilds
`dist/stories-backend` via PyInstaller. **You no longer need to call
`pyinstaller` by hand** before building the DMG — it happens for you.

---

## ➕ **ADDING A NEW PYTHON DEPENDENCY**

PyInstaller bundles Python at build time. If you skip step 2 below the
DMG will look fine but the bundled backend will crash at import time
(observable as HTTP 401 / 500 on every `/api/transcribe/*` call from a
freshly installed build, while everything works perfectly in `npm start`
dev mode).

1. Add the package to `backend/requirements.txt` with a pinned version,
   e.g. `google-genai==1.73.1`. The `build:backend` step will pip-install
   it on next build.
2. **If the new package or any of your own modules is imported lazily,
   conditionally, or only inside a function**, add it to `hiddenimports`
   in `backend/backend.spec`. PyInstaller's static analysis can miss
   these. Example from the gemini-stt work:

   ```python
   hiddenimports=[
       ...
       'gemini_transcription',     # our new module
       'google',                   # parent
       'google.genai',
       'google.genai.client',
       'google.genai.types',
   ],
   ```

3. Rebuild and **smoke-test the packaged build** — not just `npm start`.
   The dev server uses your system Python and won't surface missing
   `hiddenimports`.

---

## 🛠️ **BUILDING WITHOUT THE CODE SIGNING CERT**

Community contributors and CI environments that don't have the
`Developer ID Application: Pixelspace, LLC (N7MMJYTBG2)` certificate
in their keychain can still build a working DMG locally:

```bash
npm run make:community
```

You will see `❌ DMG signing failed: ... no identity found` near the
end. **That's expected.** The DMG is still produced at
`out/make/Stories-v<version>-community.dmg` and works on macOS — Gate-
keeper just shows a "from an unidentified developer" prompt the first
time the user opens it (right-click → Open works around this).

For public distribution you need the cert. See `docs/CODE_SIGNING.md`.

---

## 📤 **PUBLISHING TO GITHUB RELEASES (official, signed community)**

For an official public release built from `main` (signed + notarized), attach the DMG to a GitHub Release:

```bash
gh release create v<version>-community --draft \
  --title "Stories v<version> (Community)" \
  --notes-file CHANGELOG.md \
  out/make/Stories-v<version>-community.dmg
```

The Release is created as a draft so you can review before publishing.
List existing releases with `gh release list`.

For internal team-only distribution, see "Distributing a build to the team" near the top of this doc — that uses the `built/<version>` tag + prerelease pattern.

---

## ⚠️ **COMMON GOTCHAS**

- **HTTP 401 on every chunk after installing a new build, but Settings
  still shows your key.** The bundled backend wrote `secure.enc` with a
  machine_id derived from `os.environ.get('USER')`, which differs across
  launch contexts. Fix shipped in 0.9.10-1 (stable `pwd`-based id +
  one-time decryption migration). If you hit this on an OLDER build,
  the workaround is Settings → Remove + Add the keys.
- **DMG seems built but missing your latest backend changes.** You ran
  `electron-forge make` directly instead of `npm run make:community`.
  The forge command does not rebuild the PyInstaller bundle. Always go
  through the npm scripts.
- **Stories.app launches but immediately shows "Network Error" in
  Settings.** Almost always means port 57002 is already in use by a
  stale Python from a previous run. Kill it with
  `lsof -ti:57002 | xargs -r kill -9` and relaunch.
- **The build prints "✅" but `out/make/` looks empty.** You're in
  the wrong working directory. The npm scripts use relative paths and
  `cd backend` mid-pipeline; always run them from the repo root.

---

## 📚 **MORE INFORMATION**

- **Certificates:** See `docs/CERTIFICATE_SETUP.md`
- **Code Signing:** See `docs/CODE_SIGNING_GUIDE.md`
- **GitHub Actions:** See `docs/GITHUB_ACTIONS_GUIDE.md` (cloud automation)

---

## ⚡ **QUICK REFERENCE**

| Command | Description |
|---------|-------------|
| `npm run make` | Compile and sign (without notarizing) |
| `npm run notarize` | Only notarize existing DMG |
| `npm run release` | ALL: make + notarize |
| `npm run notarize:check` | View notarization history |

---

## 🎯 **RECOMMENDED WORKFLOW**

For development and testing:
```bash
npm run make  # Only compile and sign (fast)
```

For public releases:
```bash
npm run release  # Compile, sign and notarize (15-20 min)
```

---

**Ready!** 🎉

Now you can create Stories releases quickly and automatically.

