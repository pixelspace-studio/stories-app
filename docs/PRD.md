# 📋 PRD: Voice to Text App

## 📌 Executive Summary

**Product:** Desktop application for Mac that converts voice to text using OpenAI's Whisper API, enabling users to dictate emails, notes, and code with instant transcription and automatic punctuation.

**Vision:** Eliminate friction between spoken thought and written text, making digital communication as natural as speaking.

## 🎯 Objectives

### Primary Goals
1. Create a fast and accurate transcription tool for professionals
2. Reduce time spent writing emails and documentation
3. Offer a zero-configuration experience ("works immediately")

### Success Metrics
- Transcription accuracy >95%
- Response time <3 seconds
- User completes first transcription <30 seconds from installation

## 👤 Target User

**Primary Profile:**
- Professionals who write multiple emails/documents daily
- Developers who need to document code
- Mac users who value productivity tools
- People who prefer speaking over typing

**Use Cases:**
1. Dictate quick emails
2. Create meeting notes
3. Document ideas while thinking
4. Write code documentation
5. Compose long messages

## 🔄 User Flow

### Main Flow (MVP)
```
1. Open application
   ↓
2. Click "Record" (or hotkey)
   ↓
3. Speak message
   - See time counter
   - See visual recording indicator
   ↓
4. Click "Stop"
   ↓
5. View transcribed text with punctuation
   ↓
6. Click "Copy"
   ↓
7. Paste in destination app
```

### Future Flow (v2)
- Position cursor in any text field
- Activate global command
- Speak
- Text appears automatically at cursor

## 🎨 Interface Design

### Main Layout
```
┌─────────────────────────────────────┐
│      🎙️ Voice to Text              │
├─────────────────────────────────────┤
│                                     │
│         [🔴 Record]                 │
│                                     │
│         00:00 ⏱️                    │
│      ━━━━━━━━━━━━━━━                │
│                        [📋 Copy]                   │
│   ┌─────────────────────────────┐   │
│   │                             │   │
│   │   (Transcribed text here)   │   │
│   │                             │   │
│   └─────────────────────────────┘   │
│                                     │
│                      │
│                                     │
└─────────────────────────────────────┘
```

### UI States

**1. Initial State**
- Prominent "Record" button
- Empty text area
- Counter at 00:00

**2. Recording**
- Button changes to "Stop" (red)
- Pulsing visual indicator
- Active counter
- Audio visualizer (waves)

**3. Processing**
- Loading spinner
- "Transcribing..." message
- Disabled buttons

**4. Completed**
- Text displayed with punctuation
- Active "Copy" button
- New recording option

## 🛠️ Technical Architecture

### Stack
- **Frontend:** Electron + HTML/CSS/JavaScript
- **Backend:** Python Flask
- **API:** OpenAI Whisper API
- **Packaging:** Electron Forge

### Project Structure
```
voice-to-text-app/
├── electron/
│   ├── main.js           # Main process
│   ├── preload.js        # Security bridge
│   └── index.html        # Main UI
├── backend/
│   ├── app.py            # Flask server
│   ├── transcriber.py    # Whisper logic
│   └── requirements.txt  
├── frontend/
│   ├── styles.css        
│   ├── app.js           # UI logic
│   └── assets/          
├── package.json         
└── .env                 # API keys
```

### API Endpoints

```python
POST /api/transcribe
# Input: audio file (webm/mp3)
# Output: {
#   "text": "Transcribed text",
#   "language": "es",
#   "duration": 2.5
# }

GET /api/health
# Output: {"status": "ok"}
```

## ⚡ Electron Framework Deep Dive

### What is Electron?

Electron is a framework that enables creating native desktop applications using web technologies (HTML, CSS, JavaScript). Created by GitHub, it's used by applications like VS Code, Discord, Slack, WhatsApp Desktop, and Spotify.

### Core Concepts

#### 1. **Process Architecture**

Electron works with a multi-process architecture similar to modern browsers:

```
┌─────────────────────────────────────────────────┐
│                 MAIN PROCESS                    │
│  (Node.js + Electron APIs)                     │
│  - Manages windows                              │
│  - Controls app lifecycle                       │
│  - Handles system events                        │
│  - Runs main.js                                 │
├─────────────────────────────────────────────────┤
│                RENDERER PROCESSES               │
│  (Chromium + Web APIs)                         │
│  - One per window/webview                       │
│  - Runs HTML/CSS/JS                             │
│  - Limited system access for security           │
│  - Can communicate with Main via IPC            │
└─────────────────────────────────────────────────┘
```

#### 2. **Main Process**
- **Purpose:** Controls the application and manages renderer processes
- **Capabilities:** 
  - Full access to Node.js APIs
  - Native OS APIs
  - Window management (`BrowserWindow`)
  - Menus, notifications, updates
- **File:** `electron/main.js`

```javascript
// Simplified main.js example
const { app, BrowserWindow } = require('electron');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false, // Security
      contextIsolation: true  // Security
    }
  });
  
  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);
```

#### 3. **Renderer Process**
- **Purpose:** Renders the user interface
- **Capabilities:**
  - Standard Web APIs (DOM, CSS, Web Audio, etc.)
  - Limited Node.js access (for security)
  - Can communicate with Main Process via IPC
- **Files:** `electron/index.html`, `frontend/app.js`, `frontend/styles.css`

#### 4. **IPC (Inter-Process Communication)**
- **Purpose:** Secure communication between Main and Renderer processes
- **Methods:**
  - `ipcMain` (in Main Process)
  - `ipcRenderer` (in Renderer Process)
  - `preload.js` (security script)

### Electron Advantages

#### ✅ **For Developers:**
1. **Code reusability:** One codebase for all platforms
2. **Familiar technologies:** HTML/CSS/JS you already know
3. **Rich ecosystem:** NPM packages, web frameworks
4. **Rapid development:** Fast prototyping and iteration
5. **Familiar debugging:** Chrome DevTools integrated

#### ✅ **For Product:**
1. **Cross-platform:** Windows, macOS, Linux from one codebase
2. **Distribution:** Native app stores and direct distribution
3. **Updates:** Built-in auto-update system
4. **OS Integration:** Notifications, menus, system shortcuts
5. **Offline-first:** Works without internet (if designed for it)

### Electron Disadvantages

#### ⚠️ **Considerations:**
1. **Memory consumption:** Higher than native apps (includes Chromium)
2. **Distribution size:** ~100-200MB base (due to Chromium)
3. **Performance:** Lower than native apps for intensive tasks
4. **Battery:** Higher consumption on laptops

### Electron in Our Project

#### **Specific Architecture:**

```
┌─────────────────────────────────────────────────┐
│              MAIN PROCESS                       │
│  main.js:                                       │
│  - Creates app window                           │
│  - Starts Flask server (Python backend)        │
│  - Manages lifecycle                            │
├─────────────────────────────────────────────────┤
│            RENDERER PROCESS                     │
│  index.html + app.js + styles.css:             │
│  - Voice recording UI                           │
│  - Web Audio API for microphone                 │
│  - HTTP requests to Flask backend               │
│  - State management and animations              │
├─────────────────────────────────────────────────┤
│             BACKEND PROCESS                     │
│  Flask Server (spawned by Main):               │
│  - REST API endpoints                           │
│  - OpenAI Whisper integration                   │
│  - Audio processing                             │
└─────────────────────────────────────────────────┘
```

#### **Communication Flow:**

```
[User clicks Record] 
    ↓
[Renderer: Web Audio API captures mic]
    ↓  
[Renderer: HTTP POST to Flask backend]
    ↓
[Backend: Processes audio with Whisper]
    ↓
[Backend: Returns transcribed text]
    ↓
[Renderer: Displays text + copy functionality]
```

### Why Electron for This Project?

#### **Technical Decisions:**

1. **Microphone access:** Web Audio API works perfectly
2. **Python integration:** Main process can spawn Flask server
3. **Rich UI:** Modern CSS for animations and states
4. **Simple distribution:** Single executable for macOS
5. **Rapid prototyping:** Familiar web development
6. **Cross-platform ready:** Easy to expand to Windows/Linux

#### **Alternatives Considered:**
- **Native app (Swift):** Better performance, but requires rewriting everything
- **PWA:** No reliable offline access or deep OS integration
- **Tauri (Rust):** Lower memory usage, but less mature ecosystem

### Distribution and Packaging

```bash
# Development
npm run dev

# Production build
npm run build

# Create macOS installer
npm run dist
```

Electron Forge generates:
- `.app` bundle for macOS
- `.dmg` installer
- Integrated auto-updater
- Automatic code signing

### Electron Security

#### **Best Practices Implemented:**

1. **Context Isolation:** `contextIsolation: true`
2. **Node Integration disabled:** `nodeIntegration: false`
3. **Content Security Policy:** Restrictive headers
4. **Preload scripts:** For secure APIs
5. **HTTPS only:** For external resources

### Performance Optimizations

1. **Lazy loading:** Load resources only when needed
2. **Process management:** Close unused processes
3. **Memory management:** Audio buffer cleanup
4. **Bundle optimization:** Asset minification

## ✨ Features

### MVP (v1.0)
- ✅ One-click audio recording
- ✅ Transcription via Whisper API
- ✅ Automatic language detection
- ✅ Multi-language support without configuration
- ✅ Automatic punctuation
- ✅ Recording time counter
- ✅ Visual recording indicator
- ✅ Copy text to clipboard
- ✅ Minimalist interface

### Future Versions
- 📌 v1.1: Global hotkeys
- 📌 v1.2: Transcription history
- 📌 v1.3: Auto-insert at cursor
- 📌 v2.0: Offline mode with local Whisper
- 📌 v2.1: Voice commands for formatting
- 📌 v2.2: Native app integrations

## 🚀 Development Plan

### Phase 1: Initial Setup
- Configure Electron project
- Create basic Flask server
- Integrate OpenAI API

### Phase 2: Core Features
- Implement audio recording
- Connect frontend with backend
- Add basic transcription

### Phase 3: Polish
- Improve UI/UX
- Error handling
- Performance optimization

### Phase 4: Packaging
- Mac build
- Installer
- Documentation

## 📊 Technical Considerations

### Performance
- Audio compression before sending
- Response streaming for long texts
- Local configuration cache

### Security
- Locally encrypted API key
- HTTPS communication
- No recording storage

### Privacy
- Audio sent only to OpenAI
- No analytics
- Future local mode option

## 🎯 Acceptance Criteria

1. **Functionality**
   - Records audio correctly
   - Transcribes with >95% accuracy
   - Copies text without errors

2. **Performance**
   - Response <3 seconds
   - App starts <2 seconds
   - Uses <200MB RAM

3. **Usability**
   - User understands flow without tutorial
   - Clear feedback on each action
   - Errors show solutions

## 📈 Post-MVP Roadmap

**Q4 2025**
- MVP launch
- Initial feedback
- Basic hotkeys

---

*Living document - Last updated: November 4, 2025 by Pixelspace, only for reference* 