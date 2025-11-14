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
✓ No analytics, tracking, or data collection
✓ Local network permission used ONLY for internal communication


📚 DOCUMENTATION
───────────────────────────────────────────────────────────────

Full documentation: https://github.com/Floristeady/stories-app

Issues or questions? Open an issue on GitHub!


───────────────────────────────────────────────────────────────
Version: 0.9.7
License: MIT
Made with ❤️  by Pixelspace
───────────────────────────────────────────────────────────────

