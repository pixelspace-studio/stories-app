╔══════════════════════════════════════════════════════════════╗
║                       STORIES - README                       ║
║            Voice-to-Text Transcription for macOS             ║
╚══════════════════════════════════════════════════════════════╝


📦 INSTALLATION
───────────────────────────────────────────────────────────────

1. Drag "Stories.app" to your Applications folder
2. Open Stories from Applications
3. Grant microphone permissions when prompted
4. Add your OpenAI API key in Settings


🗑️  UNINSTALLATION
───────────────────────────────────────────────────────────────

⚠️  IMPORTANT: Simply deleting Stories.app will leave data behind!

To completely remove Stories from your Mac:


OPTION 1: AUTOMATIC (RECOMMENDED)
──────────────────────────────────
1. Double-click "Uninstall Stories.app" in this DMG
2. Terminal will open automatically
3. Follow the prompts and confirm with "y"

   Note: The uninstaller is signed and notarized - it will
   open without any security warnings.


OPTION 2: MANUAL TERMINAL COMMANDS
───────────────────────────────────
Copy and paste these commands into Terminal:

    rm -rf /Applications/Stories.app
    rm -rf ~/Library/Application\ Support/Stories/
    rm -rf ~/Library/Preferences/com.pixelspace.stories.plist
    rm -rf ~/Library/Logs/Stories/

This removes:
  • The application (~80 MB)
  • All transcriptions and audio files
  • Your API key and settings
  • Application logs


📊 WHAT DATA IS STORED?
───────────────────────────────────────────────────────────────

Stories stores data in: ~/Library/Application Support/Stories/

This includes:
  • transcriptions.db     - Your transcription history
  • audio/                - Saved audio recordings
  • config.json           - App settings
  • secure.enc            - Encrypted API key
  • backend.log           - Error logs for debugging


🔐 PERMISSIONS
───────────────────────────────────────────────────────────────

Stories requires the following permissions:

MICROPHONE ACCESS (Required)
  • Needed to record your voice for transcription
  • Grant in: System Settings > Privacy & Security > Microphone

ACCESSIBILITY ACCESS (Optional)
  • Needed for auto-paste feature only
  • Allows Stories to paste transcriptions automatically
  • Grant in: System Settings > Privacy & Security > Accessibility

LOCAL NETWORK (Required)
  • Needed for internal app communication only
  • Stories frontend talks to its backend via localhost
  • NO external devices or networks are accessed
  • NO data leaves your Mac
  
  Note: macOS may show this as "nearby devices" or "local 
  network" permission. This is ONLY for Stories' internal 
  components to communicate with each other.


🔒 PRIVACY & SECURITY
───────────────────────────────────────────────────────────────

✓ API keys are encrypted and stored locally only
✓ Audio is processed via OpenAI Whisper API (not stored on servers)
✓ Transcriptions are saved locally in SQLite
✓ NO telemetry - GitHub releases have zero tracking
✓ Local network permission used ONLY for internal communication
✓ Open source - all code is auditable


📝 CHANGELOG — v0.9.10-2
───────────────────────────────────────────────────────────────

GEMINI RELIABILITY FIXES
  • Dictionary words (Pixelspace, Claude, ChatGPT, etc.) no longer
    get appended to Gemini transcriptions — they are now treated as
    a strict spelling reference, not as text to echo
  • Slow Gemini calls (occasional 60s+ hangs on the preview model)
    now time out at 10s and retry up to 3 times before falling back
    to Whisper — recordings no longer stall waiting on one bad chunk


📝 CHANGELOG — v0.9.10-1
───────────────────────────────────────────────────────────────

INTEGRATION RELEASE
  • Combines everything from v0.9.9 (Florencia's main-branch fixes)
    with v0.9.9-4 (Gemini STT + Smart Transforms + Real-time Feed)
    so both feature lines live on a single trunk again
  • No new user-facing features in this version itself — see the
    sections below for what each predecessor brought in
  • Audio pipeline now has BOTH our silence-skip / pause-resume /
    fluid pause AND main's chunk-retry + averaging downsampler


📝 CHANGELOG — v0.9.9-4
───────────────────────────────────────────────────────────────

GEMINI STT (NEW)
  • Choose your speech-to-text engine in Settings → STT model
  • Two options: OpenAI Whisper or Gemini Flash Lite
  • Add your Google Gemini API key in Settings → API Keys
  • Each story is tagged with the engine that produced it
    (label appears next to the timestamp)

CROSS-ENGINE FALLBACK (NEW)
  • If the active engine fails with a transient error (server 5xx,
    rate limit, network, timeout) and the other engine has a key
    configured, the transcription is retried with that other engine
    automatically — no failed stories
  • The story label shows the truth, e.g.
    "Whisper (fallback from Gemini Flash Lite)"
  • Auth errors don't trigger fallback (your other key won't fix a
    bad key on the failing engine)

SMART TRANSFORMS — PLAIN TEXT BY DEFAULT
  • Transforms and prompt responses now return raw plain text
  • Markdown / headings / bullets are opt-in: only used when you
    explicitly ask for formatting in your instruction

FIXES
  • Lost-keys-after-install bug: the encrypted key file
    (secure.enc) was tied to an environment variable that changes
    depending on how the app is launched. After installing a new
    build, recording could fail with 401 on every chunk even though
    Settings still showed your key. Fixed by deriving the encryption
    key from a stable user identifier; existing users get a one-time
    transparent migration so they don't have to re-enter their keys.
  • Gemini error categorisation: server 5xx responses are now
    correctly classified as SERVER_ERROR (they previously fell
    through to UNKNOWN_ERROR), so logs and the new cross-engine
    fallback decision match the actual failure category.


📝 CHANGELOG — v0.9.9-3
───────────────────────────────────────────────────────────────

SMART TRANSFORMS (NEW)
  • AI-powered text transformations on any transcription
  • 7 built-in presets: Translate (ES/EN), Format Nicely,
    Bullet Points, Structure, Summarize, Make Concise
  • Custom transforms: describe what you want in your own words
  • Full window: side-by-side panel with Accept/Dismiss flow
  • Widget: 3-second countdown, quick-select dropdown, custom
    voice instructions — all with blue accent
  • Per-story transform labels, View Original, Restore Original
  • Dictionary words injected into AI context for correct
    spelling of proper nouns

DOUBLE-TAP PROMPT MODE (NEW)
  • Press recording shortcut twice quickly to ask AI a question
  • Speak your prompt, get AI response on clipboard
  • Red-to-blue visual transition confirms prompt mode
  • Response saved as a story with your prompt as label


📚 DOCUMENTATION
───────────────────────────────────────────────────────────────

Full documentation: https://github.com/pixelspace-studio/stories-app

Issues or questions? Open an issue on GitHub!


───────────────────────────────────────────────────────────────
Version: 0.9.10-2
License: MIT License
Made with ❤️  by Pixelspace
───────────────────────────────────────────────────────────────

