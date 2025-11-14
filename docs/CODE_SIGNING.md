# Code Signing for macOS

This guide explains how to configure code signing and notarization for Stories App builds on macOS.

## Overview

Code signing is required for:
- Distributing apps outside the Mac App Store
- Notarization (required by macOS for distribution)
- User trust and security

## Prerequisites

1. **Apple Developer Account**
   - Enroll at https://developer.apple.com
   - Cost: $99/year

2. **Developer ID Application Certificate**
   - Download from Apple Developer portal
   - Install in Keychain Access

3. **App-Specific Password** (for notarization)
   - Generate in Apple ID account settings
   - Used for notarization authentication

## Setup

### Step 1: Get Your Team ID

1. Go to https://developer.apple.com/account
2. Find your Team ID (format: `XXXXXXXXXX`)
3. Note your organization name

### Step 2: Configure Signing Identity

Set the environment variable with your Developer ID:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Company Name (TEAMID)"
```

**Example:**
```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Acme Corp (ABC123DEF4)"
```

**To make it permanent**, add to your `~/.zshrc` or `~/.bashrc`:
```bash
echo 'export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Company (TEAMID)"' >> ~/.zshrc
source ~/.zshrc
```

### Step 3: Configure Notarization

Store your Apple ID credentials for notarization:

```bash
xcrun notarytool store-credentials "your-profile-name" \
  --apple-id "your-email@example.com" \
  --team-id "TEAMID" \
  --password "app-specific-password"
```

**Note:** Use an app-specific password, not your regular Apple ID password.

Then set the profile name as an environment variable:

```bash
export APPLE_KEYCHAIN_PROFILE="your-profile-name"
```

**To make it permanent:**
```bash
echo 'export APPLE_KEYCHAIN_PROFILE="your-profile-name"' >> ~/.zshrc
source ~/.zshrc
```

## Building Signed Apps

### Community Build (No Signing)

If `APPLE_SIGNING_IDENTITY` is not set, builds will skip code signing:

```bash
npm run make:community
```

This is fine for:
- Local testing
- Development builds
- Open source contributors who don't have certificates

### Signed Build

With environment variables set:

```bash
npm run make:community
# or
npm run make:internal
```

The build process will:
1. Sign the app bundle
2. Sign all nested binaries
3. Sign the backend executable
4. Sign the uninstaller

## Notarization

After building, notarize the DMG:

```bash
npm run notarize
```

This will:
1. Sign the DMG
2. Submit to Apple for notarization
3. Wait for approval (5-15 minutes)
4. Staple the notarization ticket

### Check Notarization Status

```bash
npm run notarize:check
```

Or manually:
```bash
xcrun notarytool history --keychain-profile "$APPLE_KEYCHAIN_PROFILE"
```

## Troubleshooting

### "APPLE_SIGNING_IDENTITY not set"

**Solution:** Set the environment variable as shown in Step 2.

### "APPLE_KEYCHAIN_PROFILE not set"

**Solution:** Set the environment variable as shown in Step 3.

### "No signing identity found"

**Solution:** 
1. Check certificate is installed: `security find-identity -v -p codesigning`
2. Verify Team ID matches your certificate
3. Ensure certificate hasn't expired

### Notarization Fails

**Common causes:**
- Expired certificate
- Invalid entitlements
- Missing hardened runtime
- Binary artifacts in app bundle

**Check logs:**
```bash
xcrun notarytool log <SUBMISSION_ID> --keychain-profile "$APPLE_KEYCHAIN_PROFILE"
```

## For Contributors

If you're contributing to Stories App and don't have an Apple Developer account:

- **You can still build:** Use `npm run make:community` (skips signing)
- **You can still test:** Unsigned builds work for local testing
- **You can still contribute:** Code changes don't require signing

Only Pixelspace team members need to sign builds for public distribution.

## Security Notes

- **Never commit** your Team ID or credentials to Git
- **Use environment variables** for all sensitive information
- **App-specific passwords** are safer than regular passwords
- **Rotate credentials** periodically

## Additional Resources

- [Apple Code Signing Guide](https://developer.apple.com/documentation/security/code_signing_services)
- [Notarization Documentation](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Troubleshooting Code Signing](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution/troubleshooting)

