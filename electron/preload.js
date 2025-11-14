// Preload script for secure IPC communication
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    requestAutoPaste: (text) => ipcRenderer.invoke('request-auto-paste', text),
    getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
    getBackendPort: () => ipcRenderer.invoke('get-backend-port'),
    setAlwaysOnTop: (alwaysOnTop) => ipcRenderer.invoke('set-always-on-top', alwaysOnTop),
    setAutoHideWidget: (isEnabled) => ipcRenderer.invoke('set-auto-hide-widget', isEnabled),
    setAutoPaste: (isEnabled) => ipcRenderer.invoke('set-auto-paste', isEnabled),
    syncRecordingState: (message) => ipcRenderer.invoke('sync-recording-state', message),
    onSyncRecordingState: (callback) => ipcRenderer.on('sync-recording-state-broadcast', callback),
    onShortcutTriggered: (callback) => ipcRenderer.on('shortcut-triggered', callback),
    onRecordingConfig: (callback) => ipcRenderer.on('recording-config', (event, config) => callback(config)),
    onOpenSettingsPanel: (callback) => ipcRenderer.on('open-settings-panel', callback),
    pasteText: (text) => ipcRenderer.invoke('request-auto-paste', text),
    resizeWidget: (width, height) => ipcRenderer.invoke('resize-widget', width, height),
    requestWidgetHide: () => ipcRenderer.invoke('request-widget-hide'),
    updateShortcut: (shortcutName, shortcutValue) => ipcRenderer.invoke('update-shortcut', shortcutName, shortcutValue),
    openLogFolder: (logType) => ipcRenderer.invoke('open-log-folder', logType),
    openAudioFolder: () => ipcRenderer.invoke('open-audio-folder'),
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    platform: process.platform,
    
    // Telemetry build detection
    isInternalBuild: () => ipcRenderer.sendSync('is-internal-build'),
    getTelemetryConfig: () => ipcRenderer.sendSync('get-telemetry-config'),
    
    // Auto-update methods
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    getUpdateInfo: () => ipcRenderer.invoke('get-update-info'),
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (event, info) => callback(info)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (event, info) => callback(info)),
    onUpdateDownloadProgress: (callback) => ipcRenderer.on('update-download-progress', (event, progress) => callback(progress)),
    onUpdateError: (callback) => ipcRenderer.on('update-error', (event, error) => callback(error))
});

// Also expose as 'api' for convenience and compatibility with UpdateManager
contextBridge.exposeInMainWorld('api', {
    invoke: (channel, ...args) => {
        const allowedChannels = [
            'check-for-updates',
            'download-update',
            'install-update',
            'get-update-info'
        ];
        if (allowedChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, ...args);
        }
        throw new Error(`Channel ${channel} not allowed`);
    },
    on: (channel, callback) => {
        const allowedChannels = [
            'update-available',
            'update-downloaded',
            'update-download-progress',
            'update-error'
        ];
        if (allowedChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        } else {
            throw new Error(`Channel ${channel} not allowed`);
        }
    }
});