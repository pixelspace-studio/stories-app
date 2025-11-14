<!-- 26836709-0c72-467d-9d2c-0a5122d0567d a4c72039-aa10-4bce-99f0-2d183838c0bb -->
# Menu Bar Status Icon Implementation

## Overview

Add a native macOS menu bar icon that displays the current recording state using template images (black/white icons that adapt to system theme) with color overlays for different states. The tray integrates with the existing WindowManager state system and provides quick access to common actions.

## Design Approach

### Icon Strategy (macOS Guidelines)

According to Apple's Human Interface Guidelines for menu bar icons:

- Use **template images** (monochrome, 16x16 or 32x32 pixels)
- System automatically inverts colors based on theme (light/dark mode)
- Recommended: Black icon with transparent background
- File naming: `iconTemplate.png` or `iconTemplate@2x.png`

We'll create a simplified version of the Stories logo as a template image and use Electron's `tray.setImage()` with different colored versions for each state.

### Visual States

1. **Idle**: Standard template icon (adapts to system theme - white on dark, black on light)
2. **Recording**: Template icon with RED filled background (solid red circle/square background)
3. **Processing**: Template icon with ORANGE dot/circle indicator (small circle overlay on corner)
4. **Ready**: Template icon with GREEN dot/circle indicator (small circle overlay on corner, brief 2 seconds)

### Menu Actions

- Start/Stop Recording (disabled if no API key)
- Open Main Window
- Separator
- Quit Stories

## Implementation Plan

### 1. Create Menu Bar Icons (Template Images)

**File: `assets/icons/tray/`** (new directory)

Create template images following Apple guidelines:

- `trayTemplate.png` (16x16) - Base icon, black with alpha channel
- `trayTemplate@2x.png` (32x32) - Retina version
- These will be auto-inverted by macOS based on theme

For colored state overlays, create non-template versions:

- `trayRecording.png` / `trayRecording@2x.png` - Red background
- `trayProcessing.png` / `trayProcessing@2x.png` - Orange background
- `trayReady.png` / `trayReady@2x.png` - Green background

Icon design: Simplified Stories microphone icon, optimized for small sizes.

### 2. Implement Tray Manager in main.js

**File: `electron/main.js`**

Add at the top with other imports:

```javascript
const { app, BrowserWindow, ipcMain, globalShortcut, clipboard, Notification, systemPreferences, screen, Tray, Menu } = require('electron');
```

Add global variable after window references:

```javascript
let tray = null;
let trayMenu = null;
```

Create new function after `createWidgetWindow()`:

```javascript
function createTray() {
  // Create tray with template image (auto-adapts to theme)
  const trayIconPath = path.join(__dirname, '..', 'assets', 'icons', 'tray', 'trayTemplate.png');
  tray = new Tray(trayIconPath);
  
  // Set tooltip
  tray.setToolTip('Stories - Voice to Text');
  
  // Create context menu
  updateTrayMenu();
  
  // Click handler - toggle main window visibility
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
  
  console.log('✅ Tray icon created');
}

function updateTrayMenu() {
  const isRecordingActive = isRecording;
  
  trayMenu = Menu.buildFromTemplate([
    {
      label: isRecordingActive ? 'Stop Recording' : 'Start Recording',
      enabled: hasApiKey,
      click: () => {
        toggleRecording();
      }
    },
    {
      label: 'Open Main Window',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Stories',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(trayMenu);
}

function updateTrayState(state) {
  if (!tray) return;
  
  const iconsPath = path.join(__dirname, '..', 'assets', 'icons', 'tray');
  let iconFile;
  
  switch (state) {
    case 'recording':
      iconFile = 'trayRecording.png';
      break;
    case 'processing':
      iconFile = 'trayProcessing.png';
      break;
    case 'ready':
      iconFile = 'trayReady.png';
      // Auto-revert to idle after 2 seconds
      setTimeout(() => {
        if (tray && !isRecording) {
          updateTrayState('idle');
        }
      }, 2000);
      break;
    case 'idle':
    default:
      iconFile = 'trayTemplate.png';
      break;
  }
  
  const iconPath = path.join(iconsPath, iconFile);
  tray.setImage(iconPath);
  
  // Update menu to reflect current state
  updateTrayMenu();
}
```

Add tray creation in `app.whenReady()` after creating windows:

```javascript
// After createWidgetWindow()
createTray();
```

Update tray on API key changes - add to `checkApiKeyStatus()` equivalent:

```javascript
// After updating hasApiKey flag
updateTrayMenu();
```

Cleanup tray on quit in `app.on('before-quit')`:

```javascript
if (tray) {
  tray.destroy();
  tray = null;
}
```

### 3. Integrate with Existing State System

**Sync with recording state changes:**

In `toggleRecording()` function:

```javascript
// After isRecording = true
updateTrayState('recording');
```

In recording stop/completion flow:

```javascript
// When transcription starts
updateTrayState('processing');

// When transcription completes successfully
updateTrayState('ready');

// When returning to idle
updateTrayState('idle');
```

**Sync with IPC broadcasts:**

In `ipcMain.handle('sync-recording-state')` handler, add:

```javascript
// Update tray based on message
if (message === 'widget_recording_started' || message === 'main_recording_started') {
  updateTrayState('recording');
} else if (message === 'transcription_started') {
  updateTrayState('processing');
} else if (message === 'transcription_completed') {
  updateTrayState('ready');
} else if (message === 'widget_recording_stopped' || message === 'main_recording_stopped') {
  updateTrayState('idle');
}
```

### 4. Backend State Monitoring (Optional Enhancement)

If we want the tray to reflect backend state even after app restart:

**File: `electron/main.js`**

Add periodic state check:

```javascript
function startTrayStateSync() {
  setInterval(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${backendPort}/api/window/recording/state`);
      if (response.ok) {
        const data = await response.json();
        const backendState = data.recording_state.state;
        
        // Map backend states to tray states
        if (backendState === 'recording') {
          updateTrayState('recording');
        } else if (backendState === 'processing') {
          updateTrayState('processing');
        } else {
          updateTrayState('idle');
        }
      }
    } catch (error) {
      // Backend not available, ignore
    }
  }, 2000); // Check every 2 seconds
}

// Call in app.whenReady() after backend is ready
```

### 5. Testing Checklist

- [ ] Tray icon appears in menu bar on app launch
- [ ] Icon adapts to system theme (light/dark mode)
- [ ] Click on tray icon shows/focuses main window
- [ ] Right-click shows context menu
- [ ] "Start Recording" triggers recording (when API key present)
- [ ] "Stop Recording" appears and works during recording
- [ ] Icon changes to red during recording
- [ ] Icon changes to orange during transcription
- [ ] Icon changes to green briefly when ready
- [ ] Icon returns to idle after completion
- [ ] "Quit Stories" closes app completely
- [ ] Tray syncs with widget recordings
- [ ] Tray syncs with main window recordings
- [ ] Tray syncs with shortcut recordings
- [ ] Menu disables "Start Recording" when no API key

## Files to Modify

1. `electron/main.js` - Add Tray implementation (~150 lines)
2. `assets/icons/tray/` - Create new directory with icon assets (8 PNG files)

## Files to Create

- `assets/icons/tray/trayTemplate.png` (16x16)
- `assets/icons/tray/trayTemplate@2x.png` (32x32)
- `assets/icons/tray/trayRecording.png` (16x16)
- `assets/icons/tray/trayRecording@2x.png` (32x32)
- `assets/icons/tray/trayProcessing.png` (16x16)
- `assets/icons/tray/trayProcessing@2x.png` (32x32)
- `assets/icons/tray/trayReady.png` (16x16)
- `assets/icons/tray/trayReady@2x.png` (32x32)

## Estimated Time

- Icon design and creation: 1-2 hours
- Tray implementation in main.js: 2-3 hours
- State synchronization and testing: 1-2 hours
- Total: 4-7 hours

## Notes

- Tray works alongside widget and main window (no conflicts)
- Uses existing WindowManager state system
- No settings toggle needed (always visible)
- Follows macOS Human Interface Guidelines for menu bar extras
- Template images ensure proper appearance in both light and dark modes

### To-dos

- [ ] Create tray icon assets following Apple HIG (template + colored state versions)
- [ ] Implement Tray creation and management functions in main.js
- [ ] Integrate tray state updates with existing recording state system
- [ ] Test all state transitions and menu actions across widget, main window, and shortcuts