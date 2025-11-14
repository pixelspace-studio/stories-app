// ====================================
// IMPORTS & DEPENDENCIES
// ====================================
const { app, BrowserWindow, ipcMain, globalShortcut, clipboard, Notification, systemPreferences, screen, Tray, Menu, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const os = require('os');
const robot = require('@jitsi/robotjs');
const { autoUpdater } = require('electron-updater');

// ====================================
// LOGGING SETUP
// ====================================

// Setup logging to file (overwrites on each launch to avoid huge files)
const LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'Stories');
const LOG_FILE = path.join(LOG_DIR, 'main.log');

// Create log directory if it doesn't exist
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Create write stream (mode 'w' = overwrite on each launch)
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' });

// Override console methods to also write to file
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Track if logging is active
let loggingActive = true;

console.log = (...args) => {
  if (loggingActive && logStream && !logStream.destroyed) {
    try {
      const timestamp = new Date().toISOString().replace('T', ' ').substr(0, 23);
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      logStream.write(`[${timestamp}] [LOG] ${message}\n`);
    } catch (error) {
      // Silently fail if stream is closed
    }
  }
  originalConsoleLog(...args);
};

console.error = (...args) => {
  if (loggingActive && logStream && !logStream.destroyed) {
    try {
      const timestamp = new Date().toISOString().replace('T', ' ').substr(0, 23);
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      logStream.write(`[${timestamp}] [ERROR] ${message}\n`);
    } catch (error) {
      // Silently fail if stream is closed
    }
  }
  originalConsoleError(...args);
};

console.warn = (...args) => {
  if (loggingActive && logStream && !logStream.destroyed) {
    try {
      const timestamp = new Date().toISOString().replace('T', ' ').substr(0, 23);
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      logStream.write(`[${timestamp}] [WARN] ${message}\n`);
    } catch (error) {
      // Silently fail if stream is closed
    }
  }
  originalConsoleWarn(...args);
};

// Log startup
console.log('================================================================================');
console.log('🚀 Stories Main Process Starting...');
console.log(`📝 Log file: ${LOG_FILE}`);
console.log('================================================================================');

// ====================================
// GLOBAL VARIABLES
// ====================================

// Window references
let mainWindow;
let widgetWindow;
let isWidgetActive = false; // Track widget state for window-all-closed prevention

// Tray icon (menu bar)
let tray = null;
let trayMenu = null;

// Backend server
let backendProcess;
let backendPort = 57002; // Default port, will be updated dynamically

// Multi-screen tracking
let currentDisplay = null;
let screenCheckInterval = null;

// Shortcuts tracking
let currentRecordShortcut = 'CommandOrControl+Shift+R';

// Database path (same as backend)
const DATABASE_PATH = path.join(require('os').homedir(), 'Library/Application Support/Stories/transcriptions.db');

// ====================================
// RECORDING CONFIGURATION (Centralized)
// ====================================
// 🔧 CHANGE THESE VALUES TO ADJUST RECORDING LIMITS
// These values are sent to both widget and main window to keep them in sync

const RECORDING_CONFIG = {
  // Maximum recording time before auto-stop (in minutes)
  MAX_MINUTES: 20,
  
  // Show critical warning at this time (in minutes)
  WARNING_MINUTES: 15,
  
  // Show "long recording" notice at this time (in minutes)
  LONG_RECORDING_MINUTES: 5
};

// For quick testing, uncomment these lines:
//RECORDING_CONFIG.MAX_MINUTES = 2;
//RECORDING_CONFIG.WARNING_MINUTES = 1.5;
//RECORDING_CONFIG.LONG_RECORDING_MINUTES = 0.50; // 30 seconds

// ====================================
// DOCK ICON MANAGEMENT (macOS)
// ====================================
// Helper function to ensure dock icon is visible
// Solves NSPanel bug where dock icon disappears when widget (type: 'panel') is shown
// HYBRID SOLUTION: Lightweight event-driven Dock Keeper (no 3-second interval)
function ensureDockIcon() {
  if (process.platform === 'darwin' && !app.isQuitting) {
    app.dock.show();
    app.setActivationPolicy('regular');
  }
}

// ====================================
// WINDOW MANAGEMENT
// ====================================

// Note: Skeleton loaders are now controlled by app.js
// They hide automatically when transcriptions finish loading

function createMainWindow() {
  // Detect cursor position to open on the correct display
  let windowPosition = {};
  if (process.platform === 'darwin') {
    const cursorPoint = screen.getCursorScreenPoint();
    const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
    
    // Center window on the display where cursor is
    windowPosition = {
      x: currentDisplay.bounds.x + (currentDisplay.bounds.width - 700) / 2,
      y: currentDisplay.bounds.y + (currentDisplay.bounds.height - 480) / 2
    };
  }
  
  // Create the main browser window
  mainWindow = new BrowserWindow({
    width: 700,
    height: 480,
    minWidth: 700,
    minHeight: 480,
    maxWidth: 700,
    maxHeight: 480,
    ...windowPosition,
    show: true, // CRITICAL: Show window immediately to appear in dock
    skipTaskbar: false, // EXPLICIT: Ensure this window ALWAYS counts for dock icon
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    resizable: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 10, y: 10 },
    title: 'Stories'
  });

  // Load the app
  const htmlPath = path.join(__dirname, 'index.html');
  mainWindow.loadFile(htmlPath);

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
  
  // Note: lastActiveApp is now captured directly in toggleRecording()
  // No need for blur event listeners that overwrite it
  
  // Log when page finishes loading
  mainWindow.webContents.once('did-finish-load', () => {
    // Send recording configuration to main window
    mainWindow.webContents.send('recording-config', RECORDING_CONFIG);
  });
  
  // Log any loading errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`❌ Failed to load page: ${errorCode} - ${errorDescription}`);
  });

  // CRITICAL: Prevent window from closing - minimize to Dock instead
  // User can click on minimized window in Dock to restore
  // CRITICAL: Ensure main window is always "countable" for dock
  // This reinforces that macOS should keep dock icon visible
  if (process.platform === 'darwin') {
    mainWindow.on('show', () => {
      mainWindow.setSkipTaskbar(false);
      app.dock.show();
      app.setActivationPolicy('regular');
      console.log('📱 Main window shown - dock reinforced');
    });
    
    mainWindow.on('restore', () => {
      mainWindow.setSkipTaskbar(false);
      app.dock.show();
      app.setActivationPolicy('regular');
      console.log('📱 Main window restored - dock reinforced');
    });
  }
  
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.minimize(); // Minimize to Dock (better UX than hide)
      
      // CRITICAL: Force dock icon to stay visible (panel windows don't count as regular windows)
      // Dock Keeper interval will ensure it stays visible
      if (process.platform === 'darwin') {
        mainWindow.setSkipTaskbar(false); // EXPLICIT: Ensure it still counts when minimized
        app.dock.show();
        app.setActivationPolicy('regular');
        console.log('📱 Main window minimized - dock reinforced');
      }
      return false;
    }
  });
  
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

async function createWidgetWindow(shouldHide = false) {
  // Get widget position from backend OR detect current display
  let widgetPosition = null;
  
  try {
    const response = await fetch('http://127.0.0.1:5002/api/window/widget/position');
    if (response.ok) {
      const data = await response.json();
      widgetPosition = data.position;
    }
  } catch (error) {
    // Backend not available, will use smart positioning
  }

  // If no saved position, detect current display and position widget there
  if (!widgetPosition) {
    const cursorPoint = screen.getCursorScreenPoint();
    const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
    
    // Position widget in top-right corner with enough space for expanded state
    // Widget expands to 160px width when recording, so leave at least 180px from right edge
    widgetPosition = {
      x: currentDisplay.bounds.x + currentDisplay.bounds.width - 200,
      y: currentDisplay.bounds.y + 20
    };
  }

  // Create the widget window
  widgetWindow = new BrowserWindow({
    width: 48,
    height: 48,
    x: widgetPosition.x,
    y: widgetPosition.y,
    resizable: false,
    alwaysOnTop: true,
    fullscreenable: false, // CRITICAL: Prevents widget from entering its own fullscreen space
    visibleOnAllWorkspaces: true, // CRITICAL: Must be in constructor for macOS fullscreen support
    type: 'panel', // CRITICAL: macOS NSPanel - floats over fullscreen apps
    acceptsFirstMouse: true, // Allow clicks without activating window
    frame: false, // No window chrome
    skipTaskbar: true, // Don't show in taskbar
    transparent: false,
    backgroundColor: '#1A1A1A',
    show: false, // CRITICAL: Don't show yet - we'll show after capturing the active app
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Stories Widget',
    roundedCorners: true,
    hasShadow: true
  });

  // Create a simple widget HTML file
  const widgetHtmlPath = path.join(__dirname, 'widget.html');
  
  // Load the widget
  widgetWindow.loadFile(widgetHtmlPath);

  // Send recording configuration to widget when loaded
  widgetWindow.webContents.once('did-finish-load', () => {
    widgetWindow.webContents.send('recording-config', RECORDING_CONFIG);
  });

  // Open DevTools in development for widget
  if (process.argv.includes('--dev')) {
    widgetWindow.webContents.openDevTools();
  }
  
  // CRITICAL: ALWAYS show widget first to apply macOS fullscreen config
  // This is required for setVisibleOnAllWorkspaces to work correctly
  // (v0.9.2 always showed widget first, then hid it - same approach)
  widgetWindow.show();
  
  // CRITICAL: Configure fullscreen behavior AFTER show() for macOS
  // macOS REQUIRES the window to be visible for these settings to take effect
  if (process.platform === 'darwin') {
    widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    widgetWindow.setAlwaysOnTop(true, 'pop-up-menu'); // Use 'pop-up-menu' level (NSPopUpMenuWindowLevel = 101)
    // DON'T call moveTop() - widget is NSPanel + setAlwaysOnTop = ALWAYS on top
    // Calling moveTop() reorganizes z-order and causes main window issues
  }
  
  // NOW hide widget if auto-hide is enabled (just like v0.9.2 did)
  if (shouldHide) {
    widgetWindow.hide();
    isWidgetActive = false; // Widget is hidden, mark as inactive
  } else {
    isWidgetActive = true; // Widget is visible, mark as active
  }

  // Handle widget moved - save position and check for display change
  widgetWindow.on('moved', async () => {
    const bounds = widgetWindow.getBounds();
    
    // Check if widget moved to a different display
    const newDisplay = getCurrentDisplay();
    if (newDisplay && currentDisplay && newDisplay.id !== currentDisplay.id) {
      currentDisplay = newDisplay;
    }
    
    // Save position to backend
    try {
      await fetch('http://127.0.0.1:5002/api/window/widget/position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: bounds.x, y: bounds.y })
      });
    } catch (error) {
      // Silently fail - non-critical
    }
  });

  // Note: lastActiveApp is now captured directly in toggleRecording()
  // No need for blur event listeners that overwrite it

  // Handle widget closed
  widgetWindow.on('closed', function () {
    widgetWindow = null;
    isWidgetActive = false; // Widget is destroyed, mark as inactive
    // Stop screen monitoring when widget is closed
    if (screenCheckInterval) {
      clearInterval(screenCheckInterval);
      screenCheckInterval = null;
    }
  });
  
  // Start multi-screen monitoring
  startScreenMonitoring();
}

// ====================================
// TRAY ICON (MENU BAR) MANAGEMENT
// ====================================

function createTray() {
  console.log('🔧 Creating tray icon...');
  
  // Create tray with template image (auto-adapts to theme)
  const trayIconPath = path.join(__dirname, '..', 'assets', 'icons', 'tray', 'trayTemplate.png');
  
  if (!fs.existsSync(trayIconPath)) {
    console.error('❌ Tray icon not found:', trayIconPath);
    return;
  }
  
  tray = new Tray(trayIconPath);
  
  // Set tooltip
  tray.setToolTip('Stories - Voice to Text');
  
  // Create context menu
  updateTrayMenu();
  
  // Click handler - toggle main window visibility
  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
        mainWindow.focus();
      } else {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
  
  // Listen for system theme changes (macOS)
  if (process.platform === 'darwin') {
    systemPreferences.subscribeNotification(
      'AppleInterfaceThemeChangedNotification',
      () => {
        console.log('🎨 System theme changed, updating tray icon...');
        // Force update current tray state with new theme
        const currentState = isRecording ? 'recording' : 'idle';
        updateTrayState(currentState);
      }
    );
  }
  
  console.log('✅ Tray icon created');
}

function updateTrayMenu() {
  if (!tray) return;
  
  const isRecordingActive = isRecording;
  
  trayMenu = Menu.buildFromTemplate([
    {
      label: isRecordingActive ? 'Stop Recording' : 'Start Recording',
      enabled: true, // Will be updated after API key check
      click: () => {
        toggleRecording();
      }
    },
    {
      label: 'Open Main Window',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Open Settings',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();
          // Send message to open settings panel
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('open-settings-panel');
            }
          }, 300); // Small delay to ensure window is ready
        }
      }
    },
    { type: 'separator' },
    {
      label: 'View Logs',
      submenu: [
        {
          label: 'Frontend Log',
          click: async () => {
            const { shell } = require('electron');
            const path = require('path');
            const os = require('os');
            const logPath = path.join(os.homedir(), 'Library', 'Logs', 'Stories');
            try {
              await shell.openPath(logPath);
            } catch (error) {
              console.error('❌ Error opening frontend log folder:', error);
            }
          }
        },
        {
          label: 'Backend Log',
          click: async () => {
            const { shell } = require('electron');
            const path = require('path');
            const os = require('os');
            const logPath = path.join(os.homedir(), 'Library', 'Application Support', 'Stories');
            try {
              await shell.openPath(logPath);
            } catch (error) {
              console.error('❌ Error opening backend log folder:', error);
            }
          }
        }
      ]
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
  if (!tray) {
    console.warn('⚠️ Tray not initialized, cannot update state');
    return;
  }
  
  const iconsPath = path.join(__dirname, '..', 'assets', 'icons', 'tray');
  let iconFile;
  
  // Detect if system is in dark mode (using nativeTheme for compatibility)
  const isDarkMode = nativeTheme.shouldUseDarkColors;
  const themeSuffix = isDarkMode ? 'Dark' : '';
  
  switch (state) {
    case 'recording':
      iconFile = `trayRecording${themeSuffix}.png`; // Red dot (adapts to theme)
      break;
    case 'processing':
      iconFile = `trayProcessing${themeSuffix}.png`; // Orange dot (adapts to theme)
      break;
    case 'ready':
      iconFile = `trayReady${themeSuffix}.png`; // Green dot (adapts to theme)
      // Auto-revert to idle after 2 seconds
      setTimeout(() => {
        if (tray && !isRecording) {
          updateTrayState('idle');
        }
      }, 2000);
      break;
    case 'idle':
    default:
      iconFile = 'trayTemplate.png'; // Template (already adapts to theme automatically)
      break;
  }
  
  const iconPath = path.join(iconsPath, iconFile);
  
  if (fs.existsSync(iconPath)) {
    // Use nativeImage to properly load @2x versions for Retina displays
    const image = nativeImage.createFromPath(iconPath);
    tray.setImage(image);
    console.log(`🔄 Tray state updated: ${state}`);
  } else {
    console.error(`❌ Tray icon not found: ${iconPath}`);
  }
  
  // Update menu to reflect current state
  updateTrayMenu();
}

// Multi-screen support functions
function getSmartPosition(widgetBounds, display) {
  // Calculate position relative to display bounds
  const offsetX = widgetBounds.x - display.bounds.x;
  const offsetY = widgetBounds.y - display.bounds.y;
  
  // Calculate distances from edges
  const distanceFromLeft = offsetX;
  const distanceFromRight = display.bounds.width - (offsetX + widgetBounds.width);
  const distanceFromTop = offsetY;
  const distanceFromBottom = display.bounds.height - (offsetY + widgetBounds.height);
  
  // Determine anchor point based on which edge is closest
  let anchor = 'top-left'; // default
  let anchorOffsetX = distanceFromLeft;
  let anchorOffsetY = distanceFromTop;
  
  // Threshold for considering "near edge" (100px)
  const edgeThreshold = 100;
  
  // Determine horizontal anchor
  if (distanceFromRight < edgeThreshold) {
    // Near right edge
    anchor = distanceFromTop < edgeThreshold ? 'top-right' : 
             distanceFromBottom < edgeThreshold ? 'bottom-right' : 'top-right';
    anchorOffsetX = distanceFromRight;
  } else if (distanceFromLeft < edgeThreshold) {
    // Near left edge
    anchor = distanceFromTop < edgeThreshold ? 'top-left' : 
             distanceFromBottom < edgeThreshold ? 'bottom-left' : 'top-left';
    anchorOffsetX = distanceFromLeft;
  } else {
    // In the middle - use percentage
    anchor = 'percentage';
    anchorOffsetX = offsetX / display.bounds.width; // percentage (0-1)
  }
  
  // Determine vertical offset based on anchor
  if (anchor.includes('bottom')) {
    anchorOffsetY = distanceFromBottom;
  } else if (anchor !== 'percentage') {
    anchorOffsetY = distanceFromTop;
  } else {
    anchorOffsetY = offsetY / display.bounds.height; // percentage (0-1)
  }
  
  return {
    anchor,
    offsetX: anchorOffsetX,
    offsetY: anchorOffsetY
  };
}

function applySmartPosition(smartPos, display, widgetBounds) {
  // Safety margin to prevent widget from being too close to edges or going off-screen
  const edgeMargin = 4; // 4px margin from screen edges
  
  let x, y;
  
  switch (smartPos.anchor) {
    case 'top-left':
      x = display.bounds.x + smartPos.offsetX;
      y = display.bounds.y + smartPos.offsetY;
      break;
    
    case 'top-right':
      x = display.bounds.x + display.bounds.width - widgetBounds.width - smartPos.offsetX;
      y = display.bounds.y + smartPos.offsetY;
      break;
    
    case 'bottom-left':
      x = display.bounds.x + smartPos.offsetX;
      y = display.bounds.y + display.bounds.height - widgetBounds.height - smartPos.offsetY;
      break;
    
    case 'bottom-right':
      x = display.bounds.x + display.bounds.width - widgetBounds.width - smartPos.offsetX;
      y = display.bounds.y + display.bounds.height - widgetBounds.height - smartPos.offsetY;
      break;
    
    case 'percentage':
      // Use percentage of screen size
      x = display.bounds.x + (smartPos.offsetX * display.bounds.width);
      y = display.bounds.y + (smartPos.offsetY * display.bounds.height);
      break;
    
    default:
      x = display.bounds.x + smartPos.offsetX;
      y = display.bounds.y + smartPos.offsetY;
  }
  
  // Ensure widget stays within bounds with safety margin
  const minX = display.bounds.x + edgeMargin;
  const minY = display.bounds.y + edgeMargin;
  const maxX = display.bounds.x + display.bounds.width - widgetBounds.width - edgeMargin;
  const maxY = display.bounds.y + display.bounds.height - widgetBounds.height - edgeMargin;
  
  x = Math.max(minX, Math.min(x, maxX));
  y = Math.max(minY, Math.min(y, maxY));
  
  return { x, y };
}

// ====================================
// MULTI-SCREEN SUPPORT
// ====================================

function getCurrentDisplay() {
  if (!widgetWindow) return null;
  
  const widgetBounds = widgetWindow.getBounds();
  const widgetCenter = {
    x: widgetBounds.x + widgetBounds.width / 2,
    y: widgetBounds.y + widgetBounds.height / 2
  };
  
  // Find which display contains the widget center
  return screen.getDisplayNearestPoint(widgetCenter);
}

function getCursorDisplay() {
  // Get current cursor position
  const cursorPoint = screen.getCursorScreenPoint();
  // Find which display contains the cursor
  return screen.getDisplayNearestPoint(cursorPoint);
}

function startScreenMonitoring() {
  if (!widgetWindow) return;
  
  // Get initial display based on cursor position
  currentDisplay = getCursorDisplay();
  
  // Check for cursor display changes every 500ms
  screenCheckInterval = setInterval(() => {
    if (!widgetWindow) {
      clearInterval(screenCheckInterval);
      return;
    }
    
    // Get display where cursor is currently located
    const cursorDisplay = getCursorDisplay();
    
    // Check if cursor moved to a different display
    if (cursorDisplay && currentDisplay && cursorDisplay.id !== currentDisplay.id) {
      // Get current widget bounds
      const widgetBounds = widgetWindow.getBounds();
      
      // Calculate smart position on OLD display (which edge/corner it's near)
      const smartPos = getSmartPosition(widgetBounds, currentDisplay);
      
      // Apply same smart position on NEW display (where cursor is)
      const newPosition = applySmartPosition(smartPos, cursorDisplay, widgetBounds);
      
      // Move widget to new position
      widgetWindow.setBounds({
        x: Math.round(newPosition.x),
        y: Math.round(newPosition.y),
        width: widgetBounds.width,
        height: widgetBounds.height
      });
      
      // Update current display
      currentDisplay = cursorDisplay;
    }
  }, 500);
}

// Helper function to check if backend is responding via HTTP
async function checkBackendHealth(port, maxRetries = 20, delayMs = 500) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000) // 2 second timeout per request
      });
      
      if (response.ok) {
        return true;
      }
    } catch (error) {
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  console.error(`❌ Backend health check failed after ${maxRetries} attempts`);
  return false;
}

// Helper function to setup backend process handlers
function setupBackendHandlers(process, resolve, reject, onRetry) {
  let serverStarted = false;
  let hasOutput = false;
  let detectedPort = backendPort;

  process.stdout.on('data', (data) => {
    const output = data.toString();
    hasOutput = true;
    console.log(`[Backend] ${output.trim()}`);
    
    // Detect dynamic port from backend output
    const portMatch = output.match(/BACKEND_PORT=(\d+)/);
    if (portMatch) {
      detectedPort = parseInt(portMatch[1]);
      backendPort = detectedPort;
    }
    
    // Check if server is starting (but don't resolve yet, wait for health check)
    if ((output.includes('Running on http://127.0.0.1:') || 
         output.includes('* Running on all addresses') ||
         output.includes('Backend server starting')) && !serverStarted) {
      serverStarted = true;
      
      // Do HTTP health check to confirm it's really ready
      // Generous timeout for slower systems: 20 retries x 1000ms = 20 seconds max
      checkBackendHealth(detectedPort, 20, 1000).then(healthy => {
        if (healthy) {
          console.log(`✅ Backend ready`);
      resolve();
        } else {
          console.error(`❌ Backend health check failed`);
          reject(new Error('Backend started but is not responding to health checks'));
        }
      }).catch(error => {
        console.error(`❌ Backend health check error:`, error);
        reject(new Error('Backend health check failed: ' + error.message));
      });
    }
  });

  process.stderr.on('data', (data) => {
    const error = data.toString();
    hasOutput = true;
    
    // Don't log Flask warnings as errors
    if (error.includes('WARNING: This is a development server') || 
        error.includes('Press CTRL+C to quit')) {
      console.log(`[Backend] ${error.trim()}`);
      
      // Flask startup message in stderr means it's starting
      if (error.includes('Running on http://127.0.0.1:') && !serverStarted) {
        serverStarted = true;
        
        // Do HTTP health check
        checkBackendHealth(detectedPort, 15, 1000).then(healthy => {
          if (healthy) {
            console.log(`✅ Backend ready`);
        resolve();
          } else {
            reject(new Error('Backend started but health check failed'));
          }
        }).catch(error => {
          reject(new Error('Backend health check failed: ' + error.message));
        });
      }
    } else {
      console.error(`[Backend Error] ${error.trim()}`);
    }
  });

  process.on('error', (error) => {
    console.error(`❌ Backend process error: ${error.message}`);
    if (onRetry) {
      onRetry();
    } else {
      reject(error);
    }
  });

  process.on('close', (code) => {
    if (!serverStarted) {
      console.error(`❌ Backend process closed with code ${code} before starting`);
      if (code === 127 || code === 'ENOENT') {
        // Command not found
        if (onRetry) {
          onRetry();
        } else {
          reject(new Error('Backend executable not found'));
        }
      } else {
        reject(new Error(`Backend failed to start, exit code: ${code}`));
      }
    }
  });

  // Increased timeout for cold starts (first time after install/update)
  // Generous timeout to allow health checks to complete on slower systems
  setTimeout(() => {
    if (!serverStarted && !hasOutput) {
      console.error(`❌ Backend timeout: No output received in 30 seconds`);
      process.kill();
      if (onRetry) {
        onRetry();
      } else {
        reject(new Error('Backend startup timeout - no output'));
      }
    } else if (!serverStarted) {
      console.error(`❌ Backend timeout: Output received but not started in 30 seconds`);
      reject(new Error('Backend startup timeout - not ready'));
    }
  }, 30000); // 30 seconds: allows health check to run (20 retries x 1000ms = 20s max)
}

// ====================================
// BACKEND SERVER MANAGEMENT
// ====================================

function startBackendServer() {
  return new Promise((resolve, reject) => {
    // Determine backend path based on whether app is packaged or not
    let backendCommand, backendArgs, projectRoot;
    
    if (app.isPackaged) {
      // Production: Use standalone executable
      backendCommand = path.join(process.resourcesPath, 'stories-backend');
      backendArgs = [];
      projectRoot = process.resourcesPath;
    } else {
      // Development: Use Python directly
      const pythonCommands = process.platform === 'win32' 
        ? ['python', 'python3', 'py'] 
        : ['python3', 'python'];
      backendCommand = pythonCommands[0]; // Will try all in tryPython
      backendArgs = [path.join(__dirname, '..', 'backend', 'app.py')];
      projectRoot = path.join(__dirname, '..');
    }
    
    // For packaged app, directly start the executable
    if (app.isPackaged) {
      backendProcess = spawn(backendCommand, backendArgs, {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      setupBackendHandlers(backendProcess, resolve, reject, () => {
        reject(new Error('Failed to start backend executable'));
      });
      return;
    }
    
    // For development, try Python commands
    let pythonIndex = 0;
    const pythonCommands = process.platform === 'win32' 
      ? ['python', 'python3', 'py'] 
      : ['python3', 'python'];
    
    function tryPython() {
      if (pythonIndex >= pythonCommands.length) {
        reject(new Error('No working Python installation found. Tried: ' + pythonCommands.join(', ')));
        return;
      }
      
      const pythonCmd = pythonCommands[pythonIndex];
      
      backendProcess = spawn(pythonCmd, backendArgs, {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      });
      
      setupBackendHandlers(backendProcess, resolve, reject, () => {
        pythonIndex++;
        setTimeout(tryPython, 100);
      });
    }
    
    tryPython();
  });
}

function stopBackendServer() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

// Global shortcut functions
function getLatestTranscription() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DATABASE_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        reject(err);
        return;
      }
    });

    db.get(
      'SELECT text FROM transcriptions ORDER BY created_at DESC LIMIT 1',
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? row.text : null);
        }
        db.close();
      }
    );
  });
}

function copyLatestTranscription() {
  getLatestTranscription()
    .then(text => {
      if (text) {
        clipboard.writeText(text);
        
        // Show notification
        new Notification({
          title: 'Stories',
          body: 'Latest transcription copied to clipboard',
          silent: true
        }).show();
      } else {
        new Notification({
          title: 'Stories',
          body: 'No transcriptions found',
          silent: true
        }).show();
      }
    })
    .catch(error => {
      console.error('❌ Error copying transcription:', error);
      new Notification({
        title: 'Stories',
        body: 'Error accessing transcriptions',
        silent: true
      }).show();
    });
}

// ====================================
// SHORTCUT MANAGEMENT
// ====================================

// Shortcut constants
const SHORTCUT_DEFAULTS = {
  RECORD: 'CommandOrControl+Shift+R',
  COPY: 'CommandOrControl+Control+G',
  CANCEL: 'Command+Control+C' // Changed to match COPY pattern (⌘+⌃)
};

const MODIFIER_KEYS = ['CommandOrControl', 'Command', 'Control', 'Alt', 'Option', 'Shift', 'Fn'];

// Shortcut validation
function validateShortcut(shortcut) {
  const parts = shortcut.split('+');
  const hasMainKey = parts.some(part => !MODIFIER_KEYS.includes(part));
  
  // Electron requires at least one main key (except for Fn alone)
  if (!hasMainKey && shortcut !== 'Fn') {
    return {
      valid: false,
      error: 'Electron requires a main key with modifiers'
    };
  }
  
  return { valid: true };
}

// Load shortcut from backend
async function loadRecordingShortcut() {
  try {
    const response = await fetch(`http://127.0.0.1:${backendPort}/api/config/settings/shortcuts.record_toggle`);
    if (response.ok) {
      const data = await response.json();
      return data.value || SHORTCUT_DEFAULTS.RECORD;
    }
  } catch (error) {
    console.log('⚠️ Could not load shortcut, using default');
  }
  return SHORTCUT_DEFAULTS.RECORD;
}

// Register a single shortcut with error handling
function registerShortcut(shortcut, callback, name) {
  // Register shortcut silently
  
  try {
    const success = globalShortcut.register(shortcut, callback);
    
    if (!success) {
      console.error(`❌ Failed to register ${name}:`, shortcut);
      console.log('⚠️ This shortcut may be reserved by macOS or another app');
      return false;
    }
    
    // Shortcut registered successfully
    return true;
  } catch (error) {
    console.error(`❌ Exception registering ${name}:`, error.message);
    return false;
  }
}

// Register all global shortcuts
async function registerGlobalShortcuts() {
  // Clear any existing shortcuts first to prevent duplicates
  globalShortcut.unregisterAll();
  
  // Load and validate recording shortcut
  currentRecordShortcut = await loadRecordingShortcut();
  
  const validation = validateShortcut(currentRecordShortcut);
  if (!validation.valid) {
    console.error('❌ Invalid shortcut:', currentRecordShortcut, '-', validation.error);
    console.log('⚠️ Using default:', SHORTCUT_DEFAULTS.RECORD);
    currentRecordShortcut = SHORTCUT_DEFAULTS.RECORD;
  }
  
  // Register copy shortcut
  registerShortcut(
    SHORTCUT_DEFAULTS.COPY,
    () => copyLatestTranscription(),
    'Copy Latest Transcription'
  );
  
  // Register cancel shortcut
  registerShortcut(
    SHORTCUT_DEFAULTS.CANCEL,
    () => cancelRecording(),
    'Cancel Recording'
  );
  
  // Register recording shortcut
  const success = registerShortcut(
    currentRecordShortcut,
    () => {
      console.log('🎤 Shortcut triggered:', currentRecordShortcut);
    toggleRecording();
    },
    'Start/Stop Recording'
  );

  if (success) {
    console.log('🎯 Shortcuts registered:', currentRecordShortcut, '(record),', SHORTCUT_DEFAULTS.CANCEL, '(cancel)');
  }
}

async function toggleRecording() {
  console.log('🎤 Toggle recording:', isRecording ? 'STOP' : 'START');
  
  // Check if API key is configured (only when starting recording)
  if (!isRecording) {
    try {
      const response = await fetch(`http://127.0.0.1:${backendPort}/api/config/api-key`);
      if (response.ok) {
        const data = await response.json();
        if (!data.has_api_key) {
          console.warn('⚠️ Cannot start recording: No API Key configured');
          
          // Show notification
          new Notification({
            title: 'Stories - API Key Required',
            body: 'Please add your OpenAI API Key in Settings before recording.',
            silent: false
          }).show();
          
          // Try to focus main window and show alert
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) {
              mainWindow.restore();
            }
            mainWindow.focus();
            
            // Send message to main window to show alert
            mainWindow.webContents.send('sync-recording-state-broadcast', 'api_key_required');
          }
          
          return; // Abort recording
        }
      }
    } catch (error) {
      console.error('❌ Error checking API key status:', error);
      // Continue anyway (backend might be starting up)
    }
  }
  
  // CRITICAL: Capture app in BOTH start and stop to get the LAST active app
  // This ensures auto-paste goes to the most recent app, not the initial one
  let wasInStoriesApp = false; // Track if user was already in Stories
  
  if (process.platform === 'darwin') {
    // Capture active app (for auto-paste detection)
    
    const { exec } = require('child_process');
    const script = `
      tell application "System Events"
        try
          set frontmostApp to name of first application process whose frontmost is true
          return frontmostApp
        on error
          return "Unknown"
        end try
      end tell
    `;
    
    // WAIT for the app capture to complete before continuing
    await new Promise((resolve) => {
      exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
        if (!error && stdout) {
          const appName = stdout.trim();
          
          // Check if user was already in Stories app
          if (appName === 'Electron' || appName === 'Stories' || appName === 'stories') {
            wasInStoriesApp = true;
          } else {
            // User is in another app - save/update it for auto-paste
            lastActiveApp = appName;
          }
        }
        resolve(); // Always resolve to continue
      });
    });
    
    // CRITICAL FIX: If we detected Stories when STOPPING, schedule async fallback detection
    // This catches the case where user navigated: App A → App B → App C → Stories
    // We want App C (last non-Stories app), not App A (initial app)
    // Run fallback ASYNCHRONOUSLY to avoid blocking UI (prevents 2.4s freeze)
    if (isRecording && wasInStoriesApp) {
      // Execute fallback detection WITHOUT awaiting (non-blocking)
      // This runs in parallel while UI continues responding
      (async () => {
        const maxAttempts = 3;
        const delays = [400, 800, 1200]; // Progressive delays in ms
        let detectedApp = null;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const currentDelay = delays[attempt];
          await new Promise(resolve => setTimeout(resolve, currentDelay));
          
          // Try to detect the app
          detectedApp = await new Promise((resolve) => {
            exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
              if (!error && stdout) {
                const appName = stdout.trim();
                
                // Check if it's a valid app (not Stories/Electron/Unknown)
                if (appName !== 'Electron' && appName !== 'Stories' && appName !== 'stories' && appName !== 'Unknown') {
                  resolve(appName); // Valid app found
                } else {
                  resolve(null); // Invalid, keep trying
                }
              } else {
                resolve(null); // Error, keep trying
              }
            });
          });
          
          // If we found a valid app, stop trying
          if (detectedApp) {
            lastActiveApp = detectedApp;
            break;
          }
        }
      })(); // Immediately invoke async function (fire and forget)
    }
  }
  
  // If user was already in Stories, restore main window if minimized
  // DON'T call moveTop() - it reorganizes z-order and moves window behind other apps
  if (wasInStoriesApp && mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
      console.log('📱 Main window restored (was minimized)');
    }
    // Main window is already visible and at correct z-order
    // Widget will appear on top due to NSPanel + setAlwaysOnTop
  }
  
  // CRITICAL: Ensure dock icon stays visible (macOS NSPanel bug fix)
  // Call BEFORE showing widget to prevent race condition
  // HYBRID SOLUTION: Combine with isWidgetActive tracking
  ensureDockIcon();
  
  // ALWAYS ensure widget is visible and on top when toggling recording
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    console.log('📱 Ensuring widget is visible and on top...');
    
    // Mark widget as active (for window-all-closed prevention)
    isWidgetActive = true;
    
    // Show widget if it was hidden (auto-hide mode)
    if (autoHideWidgetEnabled) {
    widgetWindow.show();
    }
    
    // CRITICAL: Re-apply fullscreen config EVERY time (fixes macOS fullscreen bug)
    if (process.platform === 'darwin') {
      widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      widgetWindow.setAlwaysOnTop(true, 'pop-up-menu'); // Use 'pop-up-menu' level (highest, level 101)
      // DON'T call moveTop() - widget is NSPanel + setAlwaysOnTop = ALWAYS on top
      // Calling moveTop() causes z-order reorganization and main window issues
      console.log('✅ Widget forced to top (fullscreen-safe, no focus)');
      // DON'T call focus() - it causes macOS to exit fullscreen!
    } else {
      widgetWindow.setAlwaysOnTop(true);
      // DON'T call moveTop() on other platforms either
    }
  }
  
  // Send command to widget window
  if (widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.webContents && !widgetWindow.webContents.isDestroyed()) {
    widgetWindow.webContents.send('shortcut-triggered', 'toggle-recording');
  } else {
    console.error('❌ Widget window not available');
  }
}

function cancelRecording() {
  // DON'T show widget here - it's already visible during recording
  // Auto-hide logic in widget.js will handle hiding after cancel
  
  // Send cancel command to widget window
  if (widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.webContents && !widgetWindow.webContents.isDestroyed()) {
    widgetWindow.webContents.send('shortcut-triggered', 'cancel-recording');
  } else {
    console.error('❌ Widget window not available for cancel');
  }
}

function unregisterGlobalShortcuts() {
  globalShortcut.unregisterAll();
}

// App event handlers
// Function to check permissions status from backend
async function getPermissionsStatus() {
  try {
    const response = await fetch(`http://127.0.0.1:${backendPort}/api/permissions/status`);
    if (response.ok) {
      const data = await response.json();
      return data.permissions || {};
    }
  } catch (error) {
    console.warn('⚠️ Could not get permissions status from backend');
  }
  return {};
}

// Function to update permission status in backend
async function updatePermissionStatus(permissionType, granted) {
  try {
    await fetch(`http://127.0.0.1:${backendPort}/api/permissions/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permission_type: permissionType,
        granted: granted,
        requested_at: new Date().toISOString()
      })
    });
  } catch (error) {
    console.warn('⚠️ Could not update permission status in backend');
  }
}

// Function to request microphone permissions
async function requestMicrophonePermission() {
  if (process.platform === 'darwin') {
    try {
      // Check current system status (without prompting)
      const status = systemPreferences.getMediaAccessStatus('microphone');
      
      // Get saved permission state from backend
      const savedPermissions = await getPermissionsStatus();
      const micPermission = savedPermissions.microphone || {};
      const wasGrantedBefore = micPermission.granted === true;
      
      if (status === 'granted') {
        // Permission already granted, update backend and return
        await updatePermissionStatus('microphone', true);
        return true;
      }
      
      // Permission not granted - check if it was revoked
      if (wasGrantedBefore && status !== 'granted') {
        // User revoked the permission! Ask again
        const granted = await systemPreferences.askForMediaAccess('microphone');
        await updatePermissionStatus('microphone', granted);
        return granted;
      }
      
      // Check if we've already requested this permission before
      if (micPermission.requested_at) {
        return false;
      }
      
      // First time requesting - show system prompt
      const granted = await systemPreferences.askForMediaAccess('microphone');
      await updatePermissionStatus('microphone', granted);
      
      return granted;
    } catch (error) {
      console.error('🎙️ Error requesting microphone permission:', error);
      return false;
    }
  }
  return true; // On other platforms, assume permission is granted
}

// Function to request accessibility permissions for auto-paste
async function requestAccessibilityPermission() {
  if (process.platform === 'darwin') {
    try {
      console.log('🔐 Checking accessibility permissions...');
      // Check status WITHOUT prompting (false parameter is critical!)
      const isTrusted = systemPreferences.isTrustedAccessibilityClient(false);
      
      // Get saved permission state from backend
      const savedPermissions = await getPermissionsStatus();
      const accessibilityPermission = savedPermissions.accessibility || {};
      const wasGrantedBefore = accessibilityPermission.granted === true;
      
      if (isTrusted) {
        // Permission already granted, update backend and return
        console.log('✅ Accessibility permission already granted');
        await updatePermissionStatus('accessibility', true);
        return true;
      }
      
      // Permission not granted - check if it was revoked
      if (wasGrantedBefore && !isTrusted) {
        // User revoked the permission! Show dialog again
        console.log('⚠️ Accessibility permission was revoked by user, showing dialog again...');
        
        const { dialog } = require('electron');
        const result = await dialog.showMessageBox({
          type: 'warning',
          title: 'Accessibility Permission Required',
          message: 'Stories needs Accessibility permission for auto-paste to work.',
          detail: 'This permission was previously granted but has been revoked. Click "Open System Settings" to grant it again.',
          buttons: ['Open System Settings', 'Later'],
          defaultId: 0
        });
        
        // Update backend (still not granted)
        await updatePermissionStatus('accessibility', false);
        
        if (result.response === 0) {
          const { shell } = require('electron');
          shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
        }
        
        return false;
      }
      
      // Permission not granted - check if we've asked before
      if (accessibilityPermission.requested_at) {
        console.log('🔐 Accessibility permission was requested before, not asking again automatically');
        console.log('   User can grant it in System Settings if needed');
        return false;
      }
      
      // First time requesting - show our custom dialog
      console.log('⚠️ Accessibility permission not granted');
      console.log('   Showing permission dialog for the first time...');
        
        // Show dialog to user
        const { dialog } = require('electron');
        const result = await dialog.showMessageBox({
          type: 'warning',
          title: 'Accessibility Permission Required',
          message: 'Stories needs Accessibility permission for auto-paste to work.',
          detail: 'Click "Open System Settings" to grant permission, then restart Stories.',
          buttons: ['Open System Settings', 'Later'],
          defaultId: 0
        });
      
      // Save that we requested it (even if user clicked "Later")
      await updatePermissionStatus('accessibility', false);
        
        if (result.response === 0) {
          // Open System Settings
          const { shell } = require('electron');
          shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
        }
        
        return false;
    } catch (error) {
      console.error('🔐 Error checking accessibility permission:', error);
      return false;
    }
  }
  return true;
}

// ====================================
// STARTUP CONFIGURATION
// ====================================

/**
 * Load all startup configuration from backend
 * This runs BEFORE creating windows to avoid race conditions
 * @returns {Promise<Object>} Configuration object
 */
async function loadStartupConfiguration() {
  const config = {
    autoHideWidget: false,
    autoPaste: false,
    recordShortcut: 'CommandOrControl+Shift+R'
  };
  
  try {
    // Load auto-hide widget setting
    const widgetResponse = await fetch(`http://127.0.0.1:${backendPort}/api/config/settings/ui_settings.auto_hide_widget`);
    if (widgetResponse.ok) {
      const data = await widgetResponse.json();
      config.autoHideWidget = data.value || false;
    }
  } catch (error) {
    console.warn('⚠️ Could not load auto-hide widget setting:', error.message);
  }
  
  try {
    // Load auto-paste setting
    const pasteResponse = await fetch(`http://127.0.0.1:${backendPort}/api/config/settings/ui_settings.auto_paste`);
    if (pasteResponse.ok) {
      const data = await pasteResponse.json();
      config.autoPaste = data.value || false;
    }
  } catch (error) {
    console.warn('⚠️ Could not load auto-paste setting:', error.message);
  }
  
  try {
    // Load record shortcut
    const shortcutResponse = await fetch(`http://127.0.0.1:${backendPort}/api/config/settings/shortcuts.record_toggle`);
    if (shortcutResponse.ok) {
      const data = await shortcutResponse.json();
      config.recordShortcut = data.value || 'CommandOrControl+Shift+R';
    }
  } catch (error) {
    console.warn('⚠️ Could not load record shortcut:', error.message);
  }
  
  return config;
}

// ====================================
// AUTO-UPDATER CONFIGURATION
// ====================================

// Configure electron-updater
autoUpdater.logger = console;
autoUpdater.autoDownload = false; // Don't auto-download, ask user first
autoUpdater.autoInstallOnAppQuit = true; // Install when app quits

// Check for updates on startup (after 3 seconds to not slow down launch)
function checkForUpdatesOnStartup() {
  setTimeout(() => {
    console.log('[AutoUpdater] Checking for updates...');
    autoUpdater.checkForUpdates().catch(err => {
      console.error('[AutoUpdater] Failed to check for updates:', err);
    });
  }, 3000);
}

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  console.log('[AutoUpdater] Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('[AutoUpdater] Update available:', info.version);
  // Send to renderer process
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate
    });
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('[AutoUpdater] Update not available. Current version:', info.version);
});

autoUpdater.on('error', (err) => {
  console.error('[AutoUpdater] Error:', err);
  // Send error to renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-error', err.message);
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  const log_message = `Downloaded ${progressObj.percent.toFixed(2)}% (${progressObj.transferred}/${progressObj.total})`;
  console.log('[AutoUpdater]', log_message);
  // Send progress to renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-download-progress', progressObj);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('[AutoUpdater] Update downloaded:', info.version);
  // Send to renderer process
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-downloaded', {
      version: info.version
    });
  }
});

// ====================================
// APP LIFECYCLE
// ====================================

app.whenReady().then(async () => {
  try {
    // Start backend server
    await startBackendServer();
    
    // Load configuration
    const config = await loadStartupConfiguration();
    autoHideWidgetEnabled = config.autoHideWidget;
    autoPasteEnabled = config.autoPaste || false;
    
    // Setup dock (macOS)
    if (process.platform === 'darwin') {
      app.setActivationPolicy('regular');
      app.dock.show();
    }
    
    // Create windows
    createMainWindow();
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      
      if (process.platform === 'darwin') {
        app.focus({ steal: true });
      }
    }
    
    await createWidgetWindow(config.autoHideWidget);
    
    // Create tray icon (menu bar)
    createTray();
    
    // Capture last active app for auto-paste (macOS)
    if (process.platform === 'darwin') {
      const { exec } = require('child_process');
      const script = `
        tell application "System Events"
          try
            set frontmostApp to name of first application process whose frontmost is true
            return frontmostApp
          on error
            return "Unknown"
          end try
        end tell
      `;
      
      await new Promise((resolve) => {
        exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
          if (!error && stdout) {
            const appName = stdout.trim();
            
            if (appName !== 'Electron' && appName !== 'Stories' && appName !== 'Unknown') {
              lastActiveApp = appName;
            }
          }
          resolve();
        });
      });
    }
    
    // Register shortcuts
    registerGlobalShortcuts();
    
    // Request permissions (async, non-blocking)
    requestMicrophonePermission().catch(error => {
      console.error('⚠️ Error checking microphone permission:', error.message);
    });
    
    requestAccessibilityPermission().catch(error => {
      console.error('⚠️ Error checking accessibility permission:', error.message);
    });
    
    // Setup display event listeners
    screen.on('display-added', (event, newDisplay) => {
      if (widgetWindow) {
        currentDisplay = getCurrentDisplay();
      }
    });
    
    screen.on('display-removed', (event, oldDisplay) => {
      if (widgetWindow && currentDisplay && currentDisplay.id === oldDisplay.id) {
        const primaryDisplay = screen.getPrimaryDisplay();
        const widgetBounds = widgetWindow.getBounds();
        widgetWindow.setBounds({
          x: primaryDisplay.bounds.x + 100,
          y: primaryDisplay.bounds.y + 100,
          width: widgetBounds.width,
          height: widgetBounds.height
        });
        currentDisplay = primaryDisplay;
      }
    });
    
    screen.on('display-metrics-changed', (event, display, changedMetrics) => {
      if (widgetWindow) {
        currentDisplay = getCurrentDisplay();
      }
    });
    
    // CRITICAL: Event-Driven Dock Keeper - Required to keep dock icon visible during widget activity
    // PROBLEM: When widget (type:'panel') is shown/focused during recording, macOS sees:
    //   - Main window is minimized or in background (but still a "regular window")
    //   - Widget is active (but it's a "panel", doesn't count as regular window)
    //   → macOS thinks no regular windows are visible → removes dock icon
    // HYBRID SOLUTION: Lightweight event-driven approach (no 3-second interval)
    //   - isWidgetActive tracking prevents app from quitting (window-all-closed)
    //   - ensureDockIcon() on critical events forces dock icon visibility
    //   - NO timer-based backup (relies on window-all-closed instead)
    if (process.platform === 'darwin') {
      // 1. When widget is shown (e.g., recording starts, auto-hide disabled)
      widgetWindow.on('show', () => {
        ensureDockIcon();
      });
      
      // 2. When main window is minimized
      //    Execute multiple times with short delays to catch macOS removing the icon
      mainWindow.on('minimize', () => {
        ensureDockIcon(); // Immediately
        setTimeout(() => ensureDockIcon(), 50);  // 50ms later
        setTimeout(() => ensureDockIcon(), 150); // 150ms later
        setTimeout(() => ensureDockIcon(), 300); // 300ms later
      });
      
      // NO 3-second interval backup - isWidgetActive + window-all-closed handles this
    }
    
    // Check for updates after app is fully initialized (macOS only, in production)
    if (process.platform === 'darwin' && !process.env.NODE_ENV || process.env.NODE_ENV === 'production') {
      checkForUpdatesOnStartup();
    }
    
  } catch (error) {
    console.error('❌ Failed to start backend:', error);
    console.error('   Error details:', error.message);
    console.error('   Error stack:', error.stack);
    
    // Show error dialog with more helpful information
    const { dialog } = require('electron');
    
    let errorMessage = 'Failed to start the backend server.\n\n';
    
    // Provide helpful error messages based on error type
    if (error.message.includes('timeout')) {
      errorMessage += 'The backend is taking longer than expected to start.\n\n';
      errorMessage += 'This can happen on first launch after installation or update.\n\n';
      errorMessage += 'Please try:\n';
      errorMessage += '1. Close this dialog and wait a moment\n';
      errorMessage += '2. Try opening Stories again\n';
      errorMessage += '3. If problem persists, restart your Mac';
    } else if (error.message.includes('not found') || error.message.includes('ENOENT')) {
      errorMessage += 'The backend executable was not found.\n\n';
      errorMessage += 'Please try:\n';
      errorMessage += '1. Reinstalling Stories\n';
      errorMessage += '2. If in development, check that Python 3 is installed';
    } else if (error.message.includes('health check')) {
      errorMessage += 'The backend started but is not responding.\n\n';
      errorMessage += 'Please try:\n';
      errorMessage += '1. Restarting Stories\n';
      errorMessage += '2. Checking your firewall settings\n';
      errorMessage += '3. Restarting your Mac if problem persists';
    } else {
      errorMessage += 'An unexpected error occurred.\n\n';
      errorMessage += `Error: ${error.message}\n\n`;
      errorMessage += 'Please try restarting Stories or your Mac.';
    }
    
    dialog.showErrorBox('Backend Error', errorMessage);
    app.quit();
  }

  app.on('activate', function () {
    // CRITICAL: When user clicks dock icon, show main window if hidden
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
        console.log('🍎 Main window restored from dock click');
      }
    } else if (BrowserWindow.getAllWindows().length === 0) {
      // Only create new windows if none exist
      createMainWindow();
      createWidgetWindow();
    }
    
    // Force dock icon to be visible (in case it disappeared)
    if (process.platform === 'darwin') {
      app.dock.show();
      app.setActivationPolicy('regular');
    }
  });
});

app.on('window-all-closed', function (e) {
  // CRITICAL FIX: On macOS, intelligently keep app running when needed
  // This prevents dock icon from disappearing when:
  // - Widget (type: 'panel') is active (panels don't count as "windows")
  // - Main window exists but is minimized
  // 
  // IMPROVED: Only prevent close when widget is active OR main window exists
  // This allows normal app closure when user closes all windows manually
  
  if (process.platform === 'darwin') {
    // Prevent app closure if:
    // 1. Widget is currently active/visible (recording or transcribing)
    // 2. Main window still exists (even if minimized)
    if (isWidgetActive || (mainWindow && !mainWindow.isDestroyed())) {
      if (e && e.preventDefault) {
        e.preventDefault();
      }
      console.log('📱 Keeping app running - widget active:', isWidgetActive, '| main window exists:', !!(mainWindow && !mainWindow.isDestroyed()));
      return; // DO NOTHING - keep app alive
    }
    
    // Otherwise, allow normal macOS behavior (stay in dock without windows)
    return;
  }
  
  // On other platforms: Quit when all windows are closed
  unregisterGlobalShortcuts();
  stopBackendServer();
    app.quit();
});

app.on('before-quit', function () {
  app.isQuitting = true;
  unregisterGlobalShortcuts();
  stopBackendServer();
  
  // Cleanup tray icon
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on('will-quit', function () {
  // Unregister all shortcuts when app is about to quit
  unregisterGlobalShortcuts();
  
  // No need to stop interval - we're using event-driven approach now
  // (no dockKeeperInterval in hybrid solution)
  
  // Close log stream safely
  if (logStream && !logStream.destroyed) {
    // Disable logging first to prevent writes during shutdown
    loggingActive = false;
    
    // Write final message directly
    try {
      const timestamp = new Date().toISOString().replace('T', ' ').substr(0, 23);
      logStream.write(`[${timestamp}] [LOG] ================================================================================\n`);
      logStream.write(`[${timestamp}] [LOG] 📝 Stories Main Process Shutting Down...\n`);
      logStream.write(`[${timestamp}] [LOG] ================================================================================\n`);
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Now close the stream
    logStream.end();
  }
});

// ====================================
// APP FOCUS DETECTION
// ====================================

// Store the active app when user switches away from main window
let lastActiveApp = null;

// Track recording state to avoid capturing app twice
let isRecording = false;

// ====================================
// IPC HANDLERS
// ====================================

ipcMain.handle('get-backend-url', () => {
  return 'http://127.0.0.1:5002';
});

ipcMain.handle('set-always-on-top', async (event, alwaysOnTop) => {
  try {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      // Check if this is the widget window - DON'T resize it
      const isWidget = focusedWindow === widgetWindow;
      
      if (isWidget) {
        console.log('⚠️ Ignoring setAlwaysOnTop for widget - widget is always on top and fixed size');
        return { success: true, skipped: true, reason: 'widget window' };
      }
      
      focusedWindow.setAlwaysOnTop(alwaysOnTop, 'pop-up-menu');
      
      if (alwaysOnTop) {
        // Make window smaller and position it in current screen's top-right corner
        const { screen } = require('electron');
        const currentBounds = focusedWindow.getBounds();
        const currentDisplay = screen.getDisplayMatching(currentBounds);
        const { x: screenX, y: screenY, width: screenWidth, height: screenHeight } = currentDisplay.workArea;
        
        // Force compact size to show timer and button: 200x240px (40px menos)
        focusedWindow.setMinimumSize(200, 240);
        focusedWindow.setMaximumSize(200, 240);
        focusedWindow.setSize(200, 240); // Compact rectangle - 200x240px
        
        // Position in top-right corner of CURRENT screen (with proper margin)
        const windowX = screenX + screenWidth - 200 - 20; // 20px margin from right edge
        const windowY = screenY + 20; // 20px margin from top
        focusedWindow.setPosition(windowX, windowY);
        
      } else {
        // Restore normal size limits and center position
        focusedWindow.setMinimumSize(700, 480);
        focusedWindow.setMaximumSize(700, 480);
        
        // Set consistent size - 700x480
        focusedWindow.setSize(700, 480);
        focusedWindow.center();
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error setting always on top:', error);
    return { success: false, error: error.message };
  }
});

// Auto-hide widget setting
let autoHideWidgetEnabled = false;
let widgetHideTimeout = null;

// Auto-paste setting
let autoPasteEnabled = false;

ipcMain.handle('set-auto-hide-widget', async (event, isEnabled) => {
  try {
    // CRITICAL: Only update widget visibility if setting ACTUALLY CHANGED
    // Otherwise, opening settings panel causes widget to be forced to front
    // which makes macOS hide the main window temporarily (very annoying bug)
    const settingChanged = autoHideWidgetEnabled !== isEnabled;
    
    autoHideWidgetEnabled = isEnabled;
    console.log(`🪟 Auto-hide widget setting: ${isEnabled} (changed: ${settingChanged})`);
    
    // Only update widget visibility if setting changed
    if (settingChanged && widgetWindow) {
      if (isEnabled) {
        // Hide widget immediately if not recording
        widgetWindow.hide();
      } else {
        // Show widget if it was hidden
        // DON'T call moveTop() - it causes main window to hide temporarily
        // Widget already has setAlwaysOnTop configured from creation
        console.log('📱 Showing widget (auto-hide disabled)...');
        widgetWindow.show();
        console.log('✅ Widget visible (already configured as always-on-top)');
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error setting auto-hide widget:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-auto-paste', async (event, isEnabled) => {
  try {
    autoPasteEnabled = isEnabled;
    console.log(`📋 Auto-paste setting: ${isEnabled ? 'Enabled' : 'Disabled'}`);
    return { success: true };
  } catch (error) {
    console.error('Error setting auto-paste:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('request-widget-hide', async (event) => {
  try {
    if (autoHideWidgetEnabled && widgetWindow && !widgetWindow.isDestroyed()) {
      // Clear any existing timeout (prevents race condition)
      if (widgetHideTimeout) {
        clearTimeout(widgetHideTimeout);
        widgetHideTimeout = null;
        console.log('🪟 Cleared previous widget hide timeout');
      }
      
      // STRATEGY: Wait for widget to become inactive, THEN hide
      // This handles the case where widget is still transcribing when this is called
      // MAX ATTEMPTS: 20 attempts × 500ms = 10 seconds maximum wait
      const waitForInactiveAndHide = async (maxAttempts = 20, attempt = 1) => {
        try {
          const state = await widgetWindow.webContents.executeJavaScript(`
            window.widgetInstance && window.widgetInstance.currentState
          `);
          
          if (state === 'inactive' || state === null) {
            // Widget is inactive, safe to hide
            if (widgetWindow && !widgetWindow.isDestroyed() && autoHideWidgetEnabled) {
              isWidgetActive = false; // Mark widget as inactive
          widgetWindow.hide();
            }
          } else if (attempt < maxAttempts) {
            // Widget is still recording/transcribing, wait 500ms and check again
            setTimeout(() => waitForInactiveAndHide(maxAttempts, attempt + 1), 500);
          } else {
            // Max attempts reached, force hide to prevent infinite loop
            console.warn(`⚠️ Widget hide timeout after ${maxAttempts} attempts (state: ${state}), forcing hide`);
            if (widgetWindow && !widgetWindow.isDestroyed() && autoHideWidgetEnabled) {
              isWidgetActive = false; // Mark widget as inactive
              widgetWindow.hide();
            }
          }
        } catch (err) {
          console.error('Error checking widget state:', err);
          // On error, try to hide anyway to prevent stuck visible widget
          if (widgetWindow && !widgetWindow.isDestroyed() && autoHideWidgetEnabled) {
            isWidgetActive = false; // Mark widget as inactive
            widgetWindow.hide();
          }
        }
      };
      
      // Start checking after 1 second delay
      widgetHideTimeout = setTimeout(() => {
        waitForInactiveAndHide();
        widgetHideTimeout = null;
      }, 1000);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error hiding widget:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-shortcut', async (event, shortcutName, shortcutValue) => {
  try {
    console.log(`⌨️ Updating shortcut ${shortcutName} to ${shortcutValue}`);
    
    if (shortcutName !== 'record_toggle') {
      return { success: false, error: 'Unknown shortcut name' };
    }
    
    // Validate shortcut
    const validation = validateShortcut(shortcutValue);
    if (!validation.valid) {
      console.error('❌ Invalid shortcut:', shortcutValue, '-', validation.error);
      return { 
        success: false, 
        error: `${validation.error}. Try adding a key like R, Space, or A.`
      };
    }
    
    // Unregister all shortcuts
    globalShortcut.unregisterAll();
    
    // Update the current shortcut value
    currentRecordShortcut = shortcutValue;
    
    // Re-register copy shortcut
    registerShortcut(
      SHORTCUT_DEFAULTS.COPY,
      () => copyLatestTranscription(),
      'Copy Latest Transcription'
    );
    
    // Re-register cancel shortcut
    registerShortcut(
      SHORTCUT_DEFAULTS.CANCEL,
      () => cancelRecording(),
      'Cancel Recording'
    );
    
    // Re-register recording shortcut
    const success = registerShortcut(
      currentRecordShortcut,
      () => {
        console.log('🎤 Shortcut triggered:', currentRecordShortcut);
        toggleRecording();
      },
      'Start/Stop Recording'
    );
    
    if (!success) {
      return { 
        success: false, 
        error: `Could not register "${currentRecordShortcut}". It may be in use by macOS or another app.` 
      };
    }
    
    console.log('✅ Shortcut updated successfully');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Error updating shortcut:', error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// OPEN LOG FOLDER HANDLER
// ============================================================================

ipcMain.handle('open-log-folder', async (event, logType) => {
  const { shell } = require('electron');
  const os = require('os');
  const path = require('path');
  
  try {
    let logPath;
    
    if (logType === 'main') {
      // Main logs: ~/Library/Logs/Stories/
      logPath = path.join(os.homedir(), 'Library', 'Logs', 'Stories');
    } else if (logType === 'backend') {
      // Backend logs: ~/Library/Application Support/Stories/
      logPath = path.join(os.homedir(), 'Library', 'Application Support', 'Stories');
    } else {
      console.error('❌ Unknown log type:', logType);
      return { success: false, error: 'Unknown log type' };
    }
    
    console.log(`📂 Opening log folder: ${logPath}`);
    
    // Open folder in Finder
    await shell.openPath(logPath);
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error opening log folder:', error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// OPEN AUDIO FOLDER HANDLER
// ============================================================================

ipcMain.handle('open-audio-folder', async (event) => {
  const { shell } = require('electron');
  const os = require('os');
  const path = require('path');
  const fs = require('fs');
  
  try {
    // Audio folder path: ~/Library/Application Support/Stories/audio/
    const audioPath = path.join(os.homedir(), 'Library', 'Application Support', 'Stories', 'audio');
    
    console.log(`📂 Opening audio folder: ${audioPath}`);
    
    // Create folder if it doesn't exist
    if (!fs.existsSync(audioPath)) {
      console.log('📁 Audio folder does not exist, creating it...');
      fs.mkdirSync(audioPath, { recursive: true });
      console.log('✅ Audio folder created');
    }
    
    // Open folder in Finder
    await shell.openPath(audioPath);
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error opening audio folder:', error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// HELPER FUNCTIONS FOR AUTO-PASTE
// ============================================================================

/**
 * Check if an app name is valid for auto-paste
 * @param {string} app - App name to validate
 * @returns {boolean} - True if app is valid for auto-paste
 */
function isValidApp(app) {
  return app && 
         app !== 'Stories' && 
         app !== 'Electron' && 
         app !== 'stories' &&
         app !== 'Unknown' &&
         app !== '' &&
         !app.startsWith('Error:');
}

/**
 * Detect the current frontmost app using AppleScript
 * @returns {Promise<string|null>} - App name or null if detection fails
 */
async function detectCurrentApp() {
  if (process.platform !== 'darwin') {
    return null;
  }
  
      const { exec } = require('child_process');
      const detectScript = `
        tell application "System Events"
          try
            set frontmostApp to name of first application process whose frontmost is true
            return frontmostApp
          on error errMsg
            return "Error: " & errMsg
          end try
        end tell
      `;
      
  return new Promise((resolve) => {
        exec(`osascript -e '${detectScript}'`, (error, stdout, stderr) => {
          if (stdout) {
            const appName = stdout.trim();
        console.log('🔍 Detected app:', JSON.stringify(appName));
              resolve(appName);
      } else {
        console.log('❌ Failed to detect app');
          resolve(null);
      }
        });
      });
}

// ============================================================================
// AUTO-PASTE HANDLER
// ============================================================================

ipcMain.handle('request-auto-paste', async (event, text) => {
  try {
    // Copy to clipboard first
    clipboard.writeText(text);
    
    // Check if auto-paste is enabled
    if (!autoPasteEnabled) {
      console.log('📋 Auto-paste skipped (disabled by user)');
      new Notification({
        title: 'Stories',
        body: 'Text copied to clipboard',
        silent: true
      }).show();
      return { success: false, reason: 'Auto-paste disabled' };
    }
    
    // ========================================================================
    // PRIORITY-BASED TARGET APP DETECTION
    // ========================================================================
    // PRIORITY 1: Current app (detected in real-time during transcription)
    //             → Handles user switching apps DURING transcription
    // PRIORITY 2: Captured app (from toggleRecording or async fallback)
    //             → Handles user switching apps BEFORE stopping recording
    // PRIORITY 3: Clipboard notification (no valid app found)
    //             → Fallback when user is in Stories or no app detected
    // ========================================================================
    
    let targetApp = null;
    
    // PRIORITY 1: Detect CURRENT app (in real-time)
    const currentApp = await detectCurrentApp();
    
    if (isValidApp(currentApp)) {
      targetApp = currentApp;
    } else {
      // PRIORITY 2: Use CAPTURED app (from toggleRecording)
      // If lastActiveApp is Stories, wait for async fallback to complete
      if (lastActiveApp === 'Stories' || lastActiveApp === 'Electron' || lastActiveApp === 'stories') {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      if (isValidApp(lastActiveApp)) {
        targetApp = lastActiveApp;
      }
    }
    
    // PRIORITY 3: Clipboard notification (no valid target)
    if (!targetApp) {
      new Notification({
        title: 'Stories',
        body: 'Text copied to clipboard',
        silent: true
      }).show();
      return { success: false, reason: 'No target app detected' };
    }
    
    // Execute auto-paste
    if (process.platform === 'darwin') {
      const { exec } = require('child_process');
      
      // Determine delay based on app type
      const electronApps = ['Cursor', 'Visual Studio Code', 'Code', 'Slack', 'Discord', 'Notion'];
      const isElectronApp = electronApps.some(app => targetApp.includes(app));
      const activationDelay = isElectronApp ? 1000 : 500; // milliseconds
      
      try {
        // Step 1: Activate target app using AppleScript
        const activateScript = `tell application "${targetApp}" to activate`;
        
        exec(`osascript -e '${activateScript}'`, (activateError, activateStdout, activateStderr) => {
          if (activateError) {
            new Notification({
              title: 'Stories',
              body: 'Text copied to clipboard',
              silent: true
            }).show();
            return;
          }
          
          // Step 2: Wait for app to be ready, then paste
          setTimeout(() => {
            // CRITICAL: Verify Accessibility permissions BEFORE attempting paste
            const hasAccessibility = systemPreferences.isTrustedAccessibilityClient(false);
            
            if (!hasAccessibility) {
              console.error('❌ Auto-paste blocked: Missing Accessibility permission');
              console.error('   Solution: System Settings → Privacy & Security → Accessibility → Add Stories');
              console.error('   If permission shown but not working: Close Stories, run "tccutil reset Accessibility com.pixelspace.stories", restart Mac');
              
              new Notification({
                title: 'Stories - Accessibility Required',
                body: 'Auto-paste needs Accessibility permission. Text copied - press Cmd+V to paste.',
                silent: false
              }).show();
              
              return;
            }
            
            try {
              // Verify robotjs is loaded
              if (!robot || typeof robot.keyTap !== 'function') {
                throw new Error('robotjs module not loaded correctly');
              }
              
              // Execute auto-paste
              robot.keyTap('v', 'command');
              console.log('✅ Auto-paste SUCCESS →', targetApp, `(${text.length} chars)`);
              
            } catch (robotError) {
              console.error('❌ Auto-paste failed:', robotError.message);
              
          new Notification({
            title: 'Stories',
                body: 'Text copied to clipboard - press Cmd+V to paste',
            silent: true
          }).show();
            }
          }, activationDelay);
        });
        
      } catch (error) {
        console.error('❌ Auto-paste setup error:', error.message);
        
        new Notification({
          title: 'Stories',
          body: 'Text copied to clipboard',
          silent: true
        }).show();
      }
      
    } else {
      console.log('⚠️ Auto-paste not supported on this platform');
      new Notification({
        title: 'Stories',
        body: 'Text copied - press Cmd+V to paste',
        silent: true
      }).show();
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Auto-paste error:', error.message);
    console.error('   Stack trace:', error.stack);
    console.log('================================================================================');
    return { success: false, error: error.message };
  }
});

// IPC handlers for dual-window architecture
ipcMain.handle('get-backend-port', () => {
  return backendPort;
});

ipcMain.handle('get-platform', () => {
  return process.platform; // darwin, win32, linux
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Check if this is an internal build with telemetry enabled
ipcMain.on('is-internal-build', (event) => {
  // Check if telemetry flag file exists
  // In packaged app, check for flag file in resources
  if (app.isPackaged) {
    const flagPath = path.join(process.resourcesPath, '.telemetry-enabled');
    const isInternal = fs.existsSync(flagPath);
    event.returnValue = isInternal;
  } else {
    // In development, always false (no telemetry in dev)
    event.returnValue = false;
  }
});

// Get telemetry configuration
ipcMain.on('get-telemetry-config', (event) => {
  try {
    // Try to load telemetry.config.js from project root
    const configPath = path.join(__dirname, '..', 'telemetry.config.js');
    
    // Check if config file exists
    if (fs.existsSync(configPath)) {
      // Clear require cache to always get fresh config
      delete require.cache[require.resolve(configPath)];
      const config = require(configPath);
      event.returnValue = config;
    } else {
      // Config not found, return defaults
      event.returnValue = {
        apiUrl: 'http://localhost:5000',
        debug: false
      };
    }
  } catch (error) {
    console.error('Failed to load telemetry config:', error);
    // Return defaults on error
    event.returnValue = {
      apiUrl: 'http://localhost:5000',
      debug: false
    };
  }
});

ipcMain.handle('get-window-type', (event) => {
  const webContents = event.sender;
  const window = BrowserWindow.fromWebContents(webContents);
  
  if (window === mainWindow) {
    return 'main';
  } else if (window === widgetWindow) {
    return 'widget';
  } else {
    return 'unknown';
  }
});

// ============================================================================
// AUTO-UPDATE HANDLERS
// ============================================================================

ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result?.updateInfo };
  } catch (error) {
    console.error('[AutoUpdater] Error checking for updates:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    console.error('[AutoUpdater] Error downloading update:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', () => {
  // This will quit the app and install the update
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('get-update-info', () => {
  return {
    currentVersion: app.getVersion(),
    platform: process.platform
  };
});

// ============================================================================
// WINDOW FOCUS HANDLERS
// ============================================================================

ipcMain.handle('focus-main-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return true;
  }
  return false;
});

ipcMain.handle('focus-widget-window', () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.focus();
    return true;
  }
  return false;
});

ipcMain.handle('get-window-states', () => {
  return {
    main: {
      exists: mainWindow && !mainWindow.isDestroyed(),
      visible: mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible(),
      focused: mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()
    },
    widget: {
      exists: widgetWindow && !widgetWindow.isDestroyed(),
      visible: widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible(),
      focused: widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isFocused()
    }
  };
});

// Handle widget resize with animation (expand from center upwards)
ipcMain.handle('resize-widget', (event, width, height) => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    const currentBounds = widgetWindow.getBounds();
    const widthDiff = width - currentBounds.width;
    const heightDiff = height - currentBounds.height;
    
    // Calculate new position to expand from center upwards
    const newX = currentBounds.x - (widthDiff / 2);  // Center horizontally
    const newY = currentBounds.y - heightDiff;        // Expand upwards
    
    widgetWindow.setBounds({
      x: Math.round(newX),
      y: Math.round(newY),
      width: width,
      height: height
    }, true);  // true = animate the transition
  }
});

ipcMain.handle('sync-recording-state', (event, message) => {
  console.log('🔄 Broadcasting sync message to all windows:', message);
  
  // Update recording state flag and tray state
  if (message === 'widget_recording_started' || message === 'main_recording_started') {
    isRecording = true;
    console.log('🎬 Recording state updated: isRecording = true');
    // Update tray to recording state (red background)
    updateTrayState('recording');
  } else if (message === 'widget_recording_stopped' || message === 'main_recording_stopped') {
    isRecording = false;
    console.log('⏹️ Recording state updated: isRecording = false');
    // Don't update tray yet - wait for transcription to start
  } else if (message === 'widget_recording_cancelled') {
    isRecording = false;
    console.log('🚫 Recording cancelled - reverting tray to idle');
    updateTrayState('idle');
  } else if (message === 'widget_transcribing' || message === 'main_transcribing') {
    // Update tray to processing state (orange dot)
    updateTrayState('processing');
  } else if (message === 'widget_transcription_completed' || message === 'main_transcription_completed' || message === 'transcription_completed') {
    isRecording = false;
    console.log('⏹️ Recording state updated: isRecording = false');
    // Update tray to ready state (green dot, will auto-revert to idle after 2 seconds)
    updateTrayState('ready');
  } else if (message === 'widget_transcription_error' || message === 'main_transcription_error' || message === 'transcription_failed') {
    isRecording = false;
    // Update tray back to idle on error
    updateTrayState('idle');
  }
  
  // Show widget ONLY when main window starts recording (auto-hide mode)
  // Widget recording is already shown by toggleRecording() when shortcut is used
  if (message === 'main_recording_started' && 
      autoHideWidgetEnabled && 
      widgetWindow && 
      !widgetWindow.isDestroyed()) {
    console.log('📱 Showing widget for main window recording (auto-hide mode)');
    widgetWindow.show();
  }
  
  // Broadcast to main window
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sync-recording-state-broadcast', message);
    console.log('🔄 Message sent to main window');
  }
  
  // Broadcast to widget window (if different from sender)
  if (widgetWindow && !widgetWindow.isDestroyed() && event.sender !== widgetWindow.webContents) {
    widgetWindow.webContents.send('sync-recording-state-broadcast', message);
    console.log('🔄 Message sent to widget window');
  }
  
  return true;
});
