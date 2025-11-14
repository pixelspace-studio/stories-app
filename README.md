# Stories v0.9.8

A powerful desktop application for macOS that converts voice to text using OpenAI's Whisper API. Features intelligent auto-paste, transcription history, menu bar status icon, and global shortcuts for maximum productivity.

## Key Features

- **One-click audio recording** with visual feedback and audio waveform
- **AI-powered transcription** via OpenAI Whisper API
- **Automatic language detection** and multi-language support
- **Smart auto-paste** - automatically pastes transcriptions where you were typing
- **Transcription history** with local SQLite database
- **Global shortcuts** - Configurable shortcuts for recording & copying transcriptions
- **Floating widget** - always-on-top draggable recording interface
- **Audio archiving** - optional local storage of recordings for playback and download
- **Audio download** - download recordings as WebM (or MP3 if FFmpeg is installed)
- **Custom dictionary** - add custom words/names for accurate transcriptions
- **Settings panel** - API key management and audio preferences
- **Toast notifications** - instant visual feedback for all actions
- **Enhanced security** - Apple Events permissions for reliable auto-paste
- **Multi-screen support** - widget follows cursor across displays
- **Menu bar status icon** - visual states (idle, recording, processing, ready) with quick actions

## Quick Start

### For Users (Download & Install)

1. **Download the latest release**
   - Download `Stories.dmg` from [GitHub Releases](https://github.com/pixelspace-studio/stories-app/releases)

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
   git clone https://github.com/pixelspace-studio/stories-app.git
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

### Project Structure

```
stories-app/
├── electron/         # Electron main process & UI
├── backend/          # Python Flask server & Whisper integration
├── frontend/         # JavaScript UI components & styles
├── Tests/            # Test suites
├── docs/             # Documentation
├── scripts/          # Build & deployment scripts
└── assets/           # Application icons
```

For detailed project structure, see the repository structure.

## Keyboard Shortcuts

### Global Shortcuts (work system-wide)
- **Cmd+Shift+R**: Start/stop recording (configurable)
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
# Test backend directly
python3 Tests/test_manual.py

# Run component tests
python3 Tests/test_audio_storage.py
python3 Tests/test_config_system.py
python3 Tests/test_retry_logic.py
python3 Tests/test_window_manager.py
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
- Personal names: "María", "João"

### Audio Storage
Manage your local audio files:
1. Go to Settings
2. Toggle "Save Audio Files" to enable/disable saving
3. Click the cleanup icon to delete files older than 14 days
4. Recordings are organized by year/month in `~/Library/Application Support/Stories/audio/`
5. Download recordings as WebM (automatically converts to MP3 if FFmpeg is installed on your system)

## Building & Distribution

### Quick Build Commands
```bash
# Package the app
npm run build

# Create DMG installer
npm run make

# Create community build (no telemetry)
npm run make:community

# Create internal build (with telemetry)
npm run make:internal
```

**For detailed instructions:**
- Version management: See `docs/VERSION_GUIDE.md`
- Building & distribution: See `docs/RELEASE_GUIDE.md`
- Code signing (macOS): See `docs/CODE_SIGNING.md`

## Uninstalling

**IMPORTANT**: Simply deleting Stories.app will leave data behind.

### Automatic Uninstaller (Recommended)

If you installed via DMG:
1. Open the original **Stories.dmg** file
2. Double-click **"Uninstall Stories.app"**
3. Follow the prompts and confirm with "y"

### Manual Uninstall

```bash
# Remove application and all data
rm -rf /Applications/Stories.app
rm -rf ~/Library/Application\ Support/Stories/
rm -rf ~/Library/Preferences/com.pixelspace.stories.plist
rm -rf ~/Library/Logs/Stories/
```

This removes the app, transcription history, audio recordings, settings, and API key.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Quick start:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and test
4. Commit with clear messages
5. Push and open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **OpenAI** for the Whisper API
- **Electron** for the desktop framework
- **Flask** for the Python backend
- **Phosphor Icons** for the beautiful icon set
- **macOS** for the excellent audio APIs

## Support

- **Issues**: [GitHub Issues](https://github.com/pixelspace-studio/stories-app/issues)

---

Made with care for productivity enthusiasts
