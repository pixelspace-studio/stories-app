# 🚀 Stories App - Release Guide

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

Each time you have a new version:

1. **Update version number** in `package.json`
2. **Fix bugs** you want to solve
3. **Compile backend** if you made changes in Python:
   ```bash
   cd backend && pyinstaller backend.spec && cp dist/stories-backend ../dist/
   ```
4. **Execute:**
   ```bash
   npm run release
   ```
5. **Wait 5-15 minutes** while Apple notarizes
6. **Distribute** the DMG from `out/make/Stories.dmg`

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

