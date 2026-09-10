# 🔏 Notarization — Protocol & Incident Log

Companion to [`BUILD.md`](./BUILD.md). Read that first for the build flow; read this
one when a DMG gets rejected by Gatekeeper, or when `notarytool` refuses to authenticate.

---

## 🧠 **THE ONE THING TO UNDERSTAND**

**Signing is not enough. Signing ≠ notarizing.**

A DMG signed with the Pixelspace Developer ID cert will still be blocked by macOS with:

> "stories" está dañado y no se puede abrir. Deberías trasladarlo a la Papelera.

That message is **not** corruption. It is Gatekeeper refusing an app that carries the
`com.apple.quarantine` attribute (set by any browser download) and has no notarization
ticket. Since macOS Catalina, Developer ID signing alone does not clear this.

Two ways out:

| | What it does | Cost |
|---|---|---|
| `xattr -dr com.apple.quarantine /Applications/Stories.app` | Each teammate strips quarantine manually | Every person, every download, forever |
| **Notarization** | Apple issues a ticket; the DMG opens normally for everyone | One command at build time |

**Notarization is NOT App Store submission.** No human review, nothing published, nothing
listed anywhere, Apple does not distribute or retain the app. It is an automated malware
scan that returns a ticket. Turnaround is typically 2–15 minutes.

---

## ✅ **THE PROTOCOL**

### One-time setup per machine

Notarization needs two independent things in the local keychain:

1. **The Developer ID certificate** — `Developer ID Application: Pixelspace, LLC (N7MMJYTBG2)`.
   Installed from the `.cer` file. This is what *signs*.
2. **A `notarytool` credential profile** — an Apple ID + app-specific password pair stored
   under the profile name `pixelspace-notarize`. This is what *authenticates to Apple*.

The certificate alone does nothing for notarization. Both must be present.

```bash
xcrun notarytool store-credentials pixelspace-notarize \
  --apple-id pixelitea@pixelspace.com \
  --team-id N7MMJYTBG2
```

It prompts for the app-specific password. On success it prints
`Success. Credentials validated.` and the credential lives in the login keychain
permanently — it never needs to be entered again on that machine.

The profile name **must** be exactly `pixelspace-notarize`; it is referenced by
`package.json` (`notarize:status`) and by `.signing.config`.

### Per build

```bash
npm run notarize          # signs the DMG, submits, waits, staples
```

or manually:

```bash
xcrun notarytool submit out/make/Stories-v<version>-internal.dmg \
  --keychain-profile pixelspace-notarize --wait
xcrun stapler staple out/make/Stories-v<version>-internal.dmg
xcrun stapler validate out/make/Stories-v<version>-internal.dmg
```

Stapling is what makes the ticket travel with the file, so the DMG works even offline.
**A submitted-but-unstapled DMG still shows the "damaged" warning.** Do not skip it.

### `.signing.config`

Gitignored, at the repo root, consumed by `scripts/notarize.sh`:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Pixelspace, LLC (N7MMJYTBG2)"
export APPLE_KEYCHAIN_PROFILE="pixelspace-notarize"
export GITHUB_REPO="pixelspace-studio/stories-app"
```

It holds **no secret** — the password lives in the keychain. It is gitignored only
because it names our identity and team.

---

## 🔑 **THE ACCOUNT FACTS** (the part that cost us an hour)

- The Apple Developer Program membership for team **`N7MMJYTBG2`** belongs to
  **`pixelitea@pixelspace.com`**, not to `arturo@pixelspace.com`.
- **App-specific passwords are scoped to one Apple ID.** A password generated while
  signed in as account A will *never* authenticate as account B, no matter how correct
  it looks. The account and the password must come from the same session.
- **Apple never re-displays an existing app-specific password.** The `...` shown next to
  each entry at account.apple.com are masking dots, not a reveal button. If the value was
  not saved when it was created, it is gone — the only options are create a new one or
  revoke.
- Deleting an old app-specific password does not reveal or recover anything, and does not
  give you a new one. Apple allows up to 25; there is no reason to delete before creating.

---

## 🚨 **ERROR TAXONOMY**

Both failures return HTTP 401, but they mean completely different things. **Read the
sentence after the status code — that is the actual diagnostic.**

| Message | Meaning | Fix |
|---|---|---|
| `The application is not allowed for primary authentication` | The Apple ID you passed cannot authenticate for notarization — wrong account, or an account without Developer Program access | Use the Apple ID that owns the team (`pixelitea@pixelspace.com`) |
| `Invalid credentials. Username or password is incorrect.` | The account is valid, but the password does not belong to it | Generate an app-specific password **while signed in as that same Apple ID** |

Transitioning from the first message to the second is *progress* — it means the account
is now right and only the password pairing is wrong.

Other checks:

```bash
# Does a credential profile exist on this machine at all?
xcrun notarytool history --keychain-profile pixelspace-notarize

# Why did a submission come back Invalid?
xcrun notarytool log <SUBMISSION_ID> --keychain-profile pixelspace-notarize
```

---

## 📓 **INCIDENT — 2026-07-20**

**Symptom.** The `0.9.10-10` DMG downloaded from the GitHub prerelease showed
"stories está dañado y no se puede abrir" on a teammate's Mac.

**First finding: the DMG was never corrupt.** `hdiutil verify` reported the local DMG
valid, and its SHA-256 matched the GitHub asset digest byte for byte
(`9b51dda0…b4efc4`, 151,130,898 bytes). Rebuilding and re-uploading would have produced
an identical file and an identical failure. The real cause was that `0.9.10-10` was
signed but **not notarized** — see the BUILD_LOG note for that version, which says so
explicitly.

**Why it had "never happened before":** it had. `0.9.10-7` was built by Florencia as
*signed + notarized* and installed cleanly. `0.9.10-8`, `-9`, and `-10` were signed-only
or unsigned. The difference was never the build machine or a regression — it was whether
the notarization step ran.

**Why we could not just notarize.** The `notarytool` credential profile did not exist on
Arturo's machine. Verified absent across the login keychain (12 items, all certificates —
zero stored passwords), the system keychain, `~/.zshrc`, shell history, Xcode preferences,
provisioning profiles, and `.p8` API keys on disk. The Developer ID *certificate* had
survived the machine migration; the notarization *credential* had not. These are two
separate artifacts and only one of them travels with a `.cer` file.

**The dead ends, in order:**

1. Assumed the app-specific password had been mistyped as the primary account password.
   Stated as fact rather than hypothesis — it was wrong, and it burned trust and time.
2. Assumed hidden characters from an Apple Notes paste. Checking the clipboard
   programmatically showed it held 648 characters of terminal log, not a 19-character
   password — real evidence, but it turned out to be a copy made *after* the failed
   attempt, not the cause.
3. The actual cause: the app-specific password was being paired with the wrong Apple ID.

**Resolution.** Pairing `pixelitea@pixelspace.com` with an app-specific password generated
under that same account validated on the first try.

### Second failure: the submission came back `Invalid`

With credentials working, the `0.9.10-10` DMG was submitted and Apple rejected it:
`Archive contains critical validation errors`. Every Electron helper app
(`Stories Helper`, `Stories Helper (GPU)`, `Stories Helper (Plugin)`,
`Stories Helper (Renderer)`) failed with the same three errors:

- The signature of the binary is invalid
- The signature does not include a secure timestamp
- The executable does not have the hardened runtime enabled

`codesign -dvv` on the packaged helper confirmed it: `flags=0x20002(adhoc,linker-signed)`
— the stock ad-hoc signature Electron ships with, never replaced.

**Root cause — the same missing file.** The `postPackage` hook in `forge.config.js` reads
the identity from `APPLE_SIGNING_IDENTITY` or from `.signing.config`. With neither present
it prints `⏭️ Skipping code signing` and **returns early**, silently skipping the backend
signing, `sign-all-binaries.sh`, and the main-bundle signature. The DMG was signed
afterwards by `notarize.sh` step 1, which is why `codesign -dvv` on the *DMG* showed a
valid Pixelspace authority while everything inside it was unsigned.

That is the trap: **a DMG can report a valid Developer ID signature while its contents are
entirely ad-hoc signed.** Verifying the DMG proves nothing about the app inside it.

**Fix.** Restore `.signing.config`, then re-sign in place and rebuild the DMG without
repackaging:

```bash
./scripts/sign-all-binaries.sh out/Stories-darwin-arm64/Stories.app
rm -rf "out/Stories-darwin-arm64/Stories.app/Contents/Resources/app/node_modules/@jitsi/robotjs/build/Release/obj.target"
source .signing.config
codesign --force --sign "$APPLE_SIGNING_IDENTITY" --options runtime \
  --entitlements ./entitlements.mac.plist --timestamp "out/Stories-darwin-arm64/Stories.app"
codesign --verify --deep --strict out/Stories-darwin-arm64/Stories.app   # must pass first
rm -f out/make/Stories-v<version>-internal.dmg
BUILD_TYPE=internal ENABLE_TELEMETRY=true npx electron-forge make --skip-package --platform darwin --arch arm64
```

`--skip-package` reuses the already-signed `.app` instead of rebuilding it, which also
sidesteps `guard-version-not-built.js` when the `built/<version>` tag already exists.

### Third failure: `Python.framework` inside the PyInstaller bundle

The resubmission dropped from dozens of errors to exactly two, both on the same path:

```
Contents/Resources/stories-backend/_internal/Python.framework/Versions/3.13
  - The signature of the binary is invalid.
  - The signature does not include a secure timestamp.
```

**Root cause.** `sign-all-binaries.sh` signed `.dylib`, `.node`, and `.so` files
recursively, and signed frameworks — but its framework pass only walked
`Contents/Frameworks`. The PyInstaller onedir backend ships its own
`Python.framework` under `Contents/Resources/stories-backend/_internal/`, which no pass
covered. A framework is not a `.so` or a `.dylib`, so the recursive extension-based passes
missed it too.

**Fix (now permanent in `sign-all-binaries.sh`, step 2.75).** Walk
`Contents/Resources` for any `*.framework`, sign the versioned Mach-O binary *first*, then
the bundle:

```bash
codesign --force --sign "$IDENTITY" --options runtime --timestamp \
  ".../Python.framework/Versions/3.13/Python"
codesign --force --sign "$IDENTITY" --options runtime --timestamp \
  ".../Python.framework"
```

Order matters. Signing the framework bundle alone leaves the inner binary ad-hoc, and
Apple validates the inner binary.

**Re-signing invalidates the parent.** Any time you sign something nested, every enclosing
bundle's signature is broken and must be re-signed outward-in: the framework → the backend
executable → `Stories.app` → the DMG. Skipping a level produces "signature is invalid" on
the level above.

### Always verify before submitting

Notarization round-trips take minutes. This check takes seconds and catches the failure
above locally:

```bash
codesign --verify --deep --strict --verbose=2 out/Stories-darwin-arm64/Stories.app
# want: "valid on disk" + "satisfies its Designated Requirement"

codesign -dvv out/Stories-darwin-arm64/Stories.app/Contents/Frameworks/Stories\ Helper\ \(GPU\).app 2>&1 | grep flags
# want: flags=0x10000(runtime)      — hardened runtime
# BAD:  flags=0x20002(adhoc,linker-signed)  — never signed, will be rejected
```

**Never trust `codesign -dvv` on the DMG as proof the build is signed.** Check a helper app.

**Lesson for whoever hits this next.** The two 401 messages are not interchangeable, and
each one names its own cause precisely. Read them literally instead of pattern-matching to
the most common failure. Measure before theorizing — checking clipboard length, keychain
contents, and the DMG hash each took seconds and each replaced a guess with a fact.

---

## 🔒 **SECURITY NOTES**

- Never paste an app-specific password into a chat, a commit, a ticket, or a log. If it
  happens, revoke it at account.apple.com and generate a replacement — revocation is
  instant and affects nothing else.
- Never commit `.signing.config` (it is gitignored) even though it holds no secret.
- The app-specific password grants notarization access only. It is not the Apple ID
  password, does not unlock iCloud or purchases, and can be revoked at any time from
  account.apple.com → Sign-In and Security → App-Specific Passwords.
- Prefer an **App Store Connect API key** (`.p8` + Key ID + Issuer ID) for CI. It does not
  break when an Apple ID password changes and is not tied to one person's account:

  ```bash
  xcrun notarytool store-credentials pixelspace-notarize \
    --key AuthKey_XXXXXXXXXX.p8 --key-id XXXXXXXXXX --issuer <issuer-uuid>
  ```
