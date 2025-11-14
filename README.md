# Stories v0.9.8

A powerful desktop application for macOS that converts voice to text using OpenAI's Whisper API. Features intelligent auto-paste, transcription history, menu bar status icon, and global shortcuts for maximum productivity.

## Key Features

- **One-click audio recording** with visual feedback and audio waveform
- **AI-powered transcription** via OpenAI Whisper API
- **Automatic language detection** and multi-language support
- **Smart auto-paste** - automatically pastes transcriptions where you were typing
- **Transcription history** with local SQLite database
- **Global shortcuts** - Cmd+Shift+R (record) & Cmd+Control+V (copy latest)
- **Floating widget** - always-on-top draggable recording interface
- **Audio archiving** - optional local storage of recordings for playback and download
- **Audio download** - download recordings as WebM (or MP3 if FFmpeg is installed)
- **Custom dictionary** - add custom words/names for accurate transcriptions
- **Settings panel** - API key management and audio preferences
- **Professional theme system** - consistent color palette and design
- **Minimalist interface** designed for maximum productivity
- **Toast notifications** - instant visual feedback for all actions
- **Enhanced security** - Apple Events permissions for reliable auto-paste
- **Multi-screen support** - widget follows cursor across displays
- **Optimized performance** - singleton configuration manager reduces memory usage
- **Menu bar status icon** - visual states (idle, recording, processing, ready) with quick actions

## Quick Start

### For Users (Download & Install)

1. **Download the latest release**
   - Download `Stories.dmg` from [GitHub Releases](https://github.com/yourusername/stories-app/releases)

2. **Install the app**
   - Open the DMG file
   - Drag Stories.app to your Applications folder
   - Open Stories from Applications

3. **Configure your API key**
   - When the app opens, click Settings (gear icon)
   - Click "Add API Key"
   - Get your API key from [platform.openai.com](https://platform.openai.com/api-keys)
   - Paste it and click "Save API Key"

4. **Start recording!**
   - Click the record button or press Cmd+Shift+R
   - Speak naturally
   - Your transcription will auto-paste where you were typing

---

## Development

### Prerequisites
- **macOS 10.13+**
- **Python 3.8+**
- **Node.js 14+** (for Electron)
- **OpenAI API key** (get from [platform.openai.com](https://platform.openai.com/api-keys))

### Installation from Source

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/stories-app.git
   cd stories-app
   ```

2. **Install Python dependencies**
   ```bash
   pip3 install -r backend/requirements.txt
   ```

3. **Install Node.js dependencies**
   ```bash
   npm install
   ```

4. **Run the application**
   ```bash
   npm start
   ```

5. **Configure your API key**
   - When the app opens, go to Settings
   - Click "Add API Key"
   - Paste your OpenAI API key
   - Click "Save API Key"

## How It Works

1. **Click Record** - The app captures your voice with high-quality audio processing
2. **Speak naturally** - Whisper AI transcribes with >95% accuracy
3. **Auto-paste** - Text automatically appears where you were typing
4. **Access anytime** - Use Cmd+Control+V to copy your latest transcription

### Development Commands
```bash
# Start the complete app (recommended)
npm start

# Start only the backend for testing
npm run backend

# Start Electron directly (development mode)
npx electron electron/main.js --dev
```

### Testing & Diagnostics

The `Tests/` directory contains comprehensive test suites and diagnostic tools:

```bash
# Quick file structure validation
python3 Tests/check_files.py

# Comprehensive system diagnostics
python3 Tests/diagnose.py

# Manual backend testing (without Electron)
python3 Tests/test_manual.py

# Component-specific tests
python3 Tests/test_audio_storage.py      # Audio storage system
python3 Tests/test_config_system.py      # Configuration manager
python3 Tests/test_retry_logic.py        # API retry mechanisms
python3 Tests/test_window_manager.py     # Window management
```

**When to use each:**
- **check_files.py** - Validate project structure (15 files checked)
- **diagnose.py** - Debug Python/dependencies/backend issues
- **test_manual.py** - Test backend without Electron (browser-based)
- **Component tests** - Verify specific subsystems after changes
- **MANUAL_TESTING_GUIDE.md** - Complete feature testing guide before release

### Project Structure
```
stories-app/
├── electron/              # Electron main process
│   ├── main.js           # Main application logic & window management
│   ├── preload.js        # Security bridge (IPC)
│   ├── index.html        # Main window UI
│   ├── widget.html       # Floating widget UI
│   └── widget.js         # Widget JavaScript logic
├── backend/               # Python Flask server
│   ├── app.py            # Main backend with Whisper integration
│   ├── config_manager.py # Configuration & settings management
│   ├── audio_storage.py  # Audio file management
│   ├── dictionary_manager.py # Custom dictionary for corrections
│   ├── window_manager.py # Window state management
│   ├── retry_logic.py    # API retry mechanisms
│   ├── requirements.txt  # Python dependencies
│   ├── backend.spec      # PyInstaller build configuration
│   ├── build/            # PyInstaller build artifacts (temporary)
│   └── dist/             # Compiled backend binary (stories-backend)
├── frontend/              # UI assets and logic
│   ├── app.js            # Main application JavaScript
│   ├── components/       # Modular JavaScript components
│   │   ├── APIClient.js  # Backend API communication
│   │   ├── StateManager.js # Application state management
│   │   ├── ModalManager.js # Modal dialogs & alerts
│   │   ├── ShortcutManager.js # Keyboard shortcuts
│   │   ├── DictionaryManager.js # Custom dictionary UI
│   │   └── UIStateController.js # UI state coordination
│   └── css/              # Stylesheets (modular architecture)
│       ├── theme.css     # Color palette & design tokens
│       ├── layout.css    # Base layout & grid system
│       ├── components.css # Component-specific styles
│       └── utilities.css  # Utility classes & helpers
├── Tests/                 # Test suites & diagnostics
│   ├── MANUAL_TESTING_GUIDE.md # Complete testing guide
│   ├── check_files.py    # File structure validation
│   ├── diagnose.py       # System diagnostics
│   └── test_*.py         # Component-specific tests
├── docs/                  # Documentation
│   ├── PRD.md            # Product Requirements Document
│   ├── RELEASE_GUIDE.md  # Distribution & notarization guide
│   ├── VERSION_GUIDE.md  # Version management guide
│   └── archive/          # Historical documentation
├── scripts/               # Build & deployment scripts
│   ├── notarize.sh       # Apple notarization script
│   ├── post-make.js      # DMG customization
│   ├── version.js        # Version management utility
│   └── uninstall.sh      # Complete uninstall script
├── assets/                # Application assets
│   └── icons/            # App icons (various sizes)
├── out/                   # Build output (DMG, ZIP, .app)
├── package.json           # Node.js configuration
├── forge.config.js        # Electron Forge build config
└── README.md             # This file
```

### Backend Architecture

The backend uses a **smart port fallback system** to prevent conflicts:

1. **Dynamic Port Selection**: Tries ports 57002-57006 automatically
2. **stdout Communication**: Backend prints `BACKEND_PORT=57002` for Electron to detect
3. **Frontend Sync**: Main window and widget automatically connect to the detected port
4. **Cross-Platform**: Works identically on macOS, Windows, and Linux

This ensures the app never fails due to port conflicts, perfect for developer machines running multiple local servers.

## Keyboard Shortcuts

### Global Shortcuts (work system-wide)
- **Cmd+Shift+R**: Start/stop recording
- **Cmd+Control+V**: Copy latest transcription to clipboard

## Performance

- **Transcription accuracy**: >95% with Whisper-1 model
- **Response time**: <3 seconds for typical recordings
- **Memory usage**: ~150MB RAM (optimized)
- **Startup time**: <1.5 seconds
- **Recording limit**: Up to 20 minutes (automatic stop with visual warnings at 15 minutes)
- **Port management**: Automatic fallback (57002-57006) to avoid conflicts
- **Toast notifications**: Real-time feedback for all user actions

## Privacy & Security

- **Local processing**: Audio is only sent to OpenAI for transcription
- **Optional storage**: Audio files can be saved locally (toggle in Settings)
- **Secure API**: Encrypted key storage via macOS Keychain equivalent
- **Local database**: Transcription history stored locally on your machine
- **No cloud sync**: All data stays on your device

### 📊 Telemetry & Privacy

**GitHub Releases (this repo):**
- ✅ **NO telemetry** - Downloads from GitHub have zero tracking
- ✅ **Privacy-first** - No data collection, everything stays local
- ✅ **Fully private** - Your usage is completely anonymous

**For developers who want analytics:**
- The telemetry code is included and open source
- You can deploy your own analytics backend to any server
- Build with `npm run make:internal` to enable telemetry
- Configure it to send data to YOUR own server
- See `analytics/README.md` for deployment instructions

**What CAN be collected (if you enable it):**
- Anonymous usage statistics (no transcriptions, no PII)
- Crash reports for debugging
- See full details: [docs/TELEMETRY.md](docs/TELEMETRY.md)

## Troubleshooting

### Common Issues

**Backend won't start:**
```bash
# Check Python installation
python3 --version

# Install missing dependencies
pip3 install -r backend/requirements.txt

# Test backend directly
python3 Tests/test_manual.py
```

**Microphone access denied:**
- Go to System Preferences → Security & Privacy → Microphone
- Enable access for Terminal/Python
- Restart the application

**API key not working:**
- Verify your key at [platform.openai.com](https://platform.openai.com/api-keys)
- Check that the key has sufficient credits
- Try removing and re-adding the key in Settings

**Transcription not auto-pasting:**

If transcriptions complete but text doesn't paste automatically:

1. **Check Accessibility permissions:**
   - System Settings → Privacy & Security → Accessibility
   - Stories.app should be in the list with toggle enabled ✅

2. **Permission shows enabled but still not working?**
   
   This is a macOS TCC (Transparency, Consent, and Control) cache issue. The System Settings UI shows permission granted but the cache hasn't updated.
   
   **Solution:**
   ```bash
   # 1. Close Stories completely (Cmd+Q)
   
   # 2. Reset the TCC cache for Stories
   tccutil reset Accessibility com.pixelspace.stories
   
   # 3. IMPORTANT: Restart your Mac (not just Stories)
   # The cache only refreshes after a full system restart
   
   # 4. Open Stories and grant Accessibility permission when prompted
   ```

3. **Alternative:** Try manual paste with Cmd+Control+V

4. **Check logs for details:**
   - `~/Library/Logs/Stories/main.log` - Auto-paste diagnostics
   - `~/Library/Application Support/Stories/backend.log` - Transcription logs

**Port conflict (backend won't start):**
- The app automatically tries ports 57002-57006
- If all ports are in use, close other applications
- Check for other local servers running on these ports
- Run `lsof -i :57002` to see what's using the port

### Diagnostic Tools
```bash
# Run comprehensive diagnostics
python3 Tests/diagnose.py

# Check file structure
python3 Tests/check_files.py

# Test backend directly
python3 Tests/test_manual.py
```

## Customization

### Custom Dictionary
Add custom words, names, or technical terms:
1. Click "Dictionary" button
2. Add your custom words
3. Transcriptions will automatically correct to your preferred spelling

**Example use cases:**
- Company names: "PixelSpace"
- Technical terms: "React.js", "TypeScript"
- Personal names: "Yann LeCun"

### Audio Storage
Manage your local audio files:
1. Go to Settings
2. Toggle "Save Audio Files" to enable/disable saving
3. Click the cleanup icon to delete files older than 14 days
4. Recordings are organized by year/month in `~/Library/Application Support/Stories/audio/`
5. Download recordings as WebM (automatically converts to MP3 if FFmpeg is installed on your system)

## Building & Distribution

### Version Management

Before building, update the version number across all project files:

```bash
# Bug fixes and small changes
npm run version:patch      # 0.9.41 → 0.9.41

# New features (no breaking changes)
npm run version:minor      # 0.9.41 → 0.10.0

# Major releases or breaking changes
npm run version:major      # 0.10.5 → 1.0.0

# Set specific version
npm run version:set 1.0.0  # Manual control
```

**What gets updated:**
- `package.json` version
- `backend/app.py` VERSION constant
- `README.md` version references
- Creates git tag (e.g., `v1.0.0`)

**See `docs/VERSION_GUIDE.md` for complete versioning guide**

### macOS Distribution
```bash
# 1. Update version (choose appropriate command)
npm run version:patch  # or minor/major/set

# 2. Package the app
npm run build

# 3. Create DMG installer (also creates ZIP)
npm run make

# 4. Notarize for macOS distribution
npm run notarize

# 5. Check notarization status
npm run notarize:check
```

**Requirements:**
- Code signing certificate (for notarization)
- App icons in `assets/icons/` directory
- Valid `package.json` configuration

See `docs/RELEASE_GUIDE.md` for detailed distribution steps.

## Uninstalling

**IMPORTANT**: Simply deleting Stories.app will leave data behind (transcriptions, audio files, settings, API key).

### Option 1: Automatic Uninstaller (Recommended)

If you installed via DMG:
1. Open the original **Stories.dmg** file
2. Double-click **"Uninstall Stories.app"**
3. Terminal will open automatically
4. Follow the prompts and confirm with "y"

**Note:** The uninstaller is signed and notarized - it will open without any security warnings.

### Option 2: Manual Terminal Commands

Copy and paste these commands into Terminal to completely remove Stories:

```bash
# Remove application
rm -rf /Applications/Stories.app

# Remove all user data
rm -rf ~/Library/Application\ Support/Stories/

# Remove preferences
rm -rf ~/Library/Preferences/com.pixelspace.stories.plist

# Remove logs
rm -rf ~/Library/Logs/Stories/
```

**What gets deleted:**
- The application (~80 MB)
- All transcription history
- All audio recordings
- Your API key and settings
- Application logs

### Data Storage Locations

Stories stores data in these locations:

```
~/Library/Application Support/Stories/
├── transcriptions.db       # Transcription history
├── audio/                  # Saved audio recordings
├── config.json             # App settings
├── secure.enc              # Encrypted API key
└── backend.log             # Backend logs (overwritten each launch)

~/Library/Logs/Stories/
└── main.log                # Main process logs (overwritten each launch)

~/Library/Preferences/
└── com.pixelspace.stories.plist  # System preferences
```

**Log files are overwritten on each app launch** to prevent them from growing infinitely.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **OpenAI** for the Whisper API
- **Electron** for the desktop framework
- **Flask** for the Python backend
- **Phosphor Icons** for the beautiful icon set
- **macOS** for the excellent audio APIs

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/stories-app/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/stories-app/discussions)

---

Made with care for productivity enthusiasts
