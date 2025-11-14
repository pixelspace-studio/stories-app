// Voice to Text App V2 - Frontend JavaScript

/**
 * Improves generic frontend error messages to be more user-friendly
 * Only applies to errors NOT from backend (backend errors are already user-friendly)
 * 
 * @param {Error|string} error - The error object or message
 * @param {boolean} hasAudio - Whether audio was saved (audio_id exists)
 * @returns {string} User-friendly error message
 */
function getUserFriendlyErrorMessage(error, hasAudio = false) {
    const errorMessage = typeof error === 'string' ? error : error.message || String(error);
    const errorLower = errorMessage.toLowerCase();
    
    // If the error already mentions "You can download the audio file" it's from backend
    // Backend errors are already user-friendly, return as-is
    if (errorMessage.includes('You can download the audio file') || 
        errorMessage.includes('Your audio is saved')) {
        return errorMessage;
    }
    
    const audioSavedNote = hasAudio ? ' Your audio is saved.' : '';
    
    // Frontend-specific errors
    if (errorLower.includes('failed to fetch') || errorLower.includes('networkerror')) {
        return `Connection issue. Check your internet and retry.${audioSavedNote}`;
    }
    
    if (errorLower.includes('aborted') || errorLower.includes('aborterror')) {
        return `Request canceled.${audioSavedNote}${hasAudio ? ' Click Retry.' : ''}`;
    }
    
    if (error.name === 'TypeError' || errorLower.includes('cannot read property')) {
        return `Something went wrong.${audioSavedNote}${hasAudio ? ' Please retry.' : ''}`;
    }
    
    // If none of the above, but it's a generic technical error, simplify it
    if (errorLower.includes('error') || errorLower.includes('failed')) {
        return `An error occurred.${audioSavedNote}${hasAudio ? ' Please retry.' : ''}`;
    }
    
    // If it's already user-friendly (no technical jargon), return as-is
    return errorMessage;
}

class VoiceToTextApp {
    constructor() {
        // Initialize component managers
        this.modalManager = new ModalManager();
        this.stateManager = new StateManager();
        
        // New components (available but not used yet - gradual migration)
        this.api = null; // Will be initialized after backendUrl is set
        this.shortcuts = null; // Will be initialized after api
        this.dictionary = null; // Will be initialized after api
        this.uiController = null; // Will be initialized after elements
        this.telemetry = new TelemetryClient(); // Telemetry for usage analytics
        
        // Legacy state (will be migrated to StateManager)
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.startTime = null;
        this.timerInterval = null;
        this.backendUrl = 'http://127.0.0.1:57002'; // Default, will be updated
        this.recordingSource = null; // 'main' or 'widget'
        this.isCancelled = false;
        this.hasApiKey = false; // Track API key status
        this.safetyTimeout = null; // Safety timeout for max recording time
        
        // 🔧 Recording configuration (received from main process)
        // These values are set by main.js to keep main window and widget in sync
        this.MAX_RECORDING_MINUTES = 20; // Default, will be overridden by config
        this.WARNING_AT_MINUTES = 15; // Default, will be overridden by config
        this.LONG_RECORDING_MINUTES = 5; // Default, will be overridden by config
        
        // 🎯 Progress indicator threshold for main window (in seconds)
        // Show phase descriptions (Uploading → Transcribing → Almost done) for audio >= this threshold
        // FOR TESTING: Set to 30 seconds (0.5 min) to see phases on short recordings
        // FOR PRODUCTION: Set to 300 seconds (5 min) to only show phases on long recordings
        this.PROGRESS_THRESHOLD_SECONDS = 300; // TODO: Change to 300 before production
        
        // Load More state
        this.showingAll = false;
        this.initialDisplayCount = 3; // Show first 3 transcriptions
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupTranscriptionEventDelegation();
        
        this.initBackendUrl();
        this.setupWidgetSync();
        this.setupRecordingSync();
        this.registerModals(); // Register modals with ModalManager
        this.setupRecordingConfig(); // Listen for config from main process
        this.setupSettingsPanelListener(); // Listen for open settings from tray
    }

    // Receive recording configuration from main process
    setupRecordingConfig() {
        if (window.electronAPI && window.electronAPI.onRecordingConfig) {
            window.electronAPI.onRecordingConfig((config) => {
                this.MAX_RECORDING_MINUTES = config.MAX_MINUTES;
                this.WARNING_AT_MINUTES = config.WARNING_MINUTES;
                this.LONG_RECORDING_MINUTES = config.LONG_RECORDING_MINUTES;
                console.log('📐 Main window received recording config:', config);
            });
        }
    }
    
    // Listen for open settings panel request from tray menu
    setupSettingsPanelListener() {
        if (window.electronAPI && window.electronAPI.onOpenSettingsPanel) {
            window.electronAPI.onOpenSettingsPanel(() => {
                console.log('📱 Tray requested to open settings panel');
                this.openSettings();
            });
        }
    }
    
    async initBackendUrl() {
        // Get dynamic backend port from Electron
        if (window.electronAPI && window.electronAPI.getBackendPort) {
            try {
                const port = await window.electronAPI.getBackendPort();
                this.backendUrl = `http://127.0.0.1:${port}`;
            } catch (error) {
                console.warn('⚠️ Could not get backend port, using default:', this.backendUrl);
            }
        }
        
        // Initialize API client now that we have the backend URL
        this.api = new APIClient(this.backendUrl);
        
        // Initialize managers that depend on API
        this.shortcuts = new ShortcutManager(this.api);
        this.dictionary = new DictionaryManager(this.api);
        
        // Configure DictionaryManager elements (now that dictionary exists)
        this.dictionary.setElements(this.dictionaryContent, this.dictionaryEmpty);
        
        console.log('✅ Components initialized:', {
            api: !!this.api,
            shortcuts: !!this.shortcuts,
            dictionary: !!this.dictionary,
            telemetry: !!this.telemetry
        });
        
        // Initialize telemetry (loads preference from localStorage)
        await this.initializeTelemetry();
        
        // Check backend connection (shortcut will be loaded after connection)
        this.checkBackendConnection();
    }

    /**
     * Initialize telemetry: load user preference and start tracking
     * Note: TelemetryClient.js is self-contained, but we sync the preference from our backend
     */
    async initializeTelemetry() {
        try {
            // Check if telemetry UI should be shown (only in internal builds)
            this.setupTelemetryUI();
            
            // Only sync preferences for internal builds
            // Community builds have telemetry permanently disabled
            if (this.telemetry.isInternalBuild()) {
                // Load telemetry preference from backend
                const response = await fetch(`${this.backendUrl}/api/config/settings/telemetry_enabled`);
                if (response.ok) {
                    const data = await response.json();
                    const isEnabled = data.value !== false; // Default to true
                    this.telemetry.setEnabled(isEnabled);
                    console.log('📊 Telemetry:', isEnabled ? 'Enabled' : 'Disabled');
                } else {
                    // Default to enabled if can't load preference (internal builds only)
                    this.telemetry.setEnabled(true);
                    console.log('📊 Telemetry: Enabled (default)');
                }
            } else {
                console.log('📊 Telemetry: Disabled (community build)');
            }
            
            // Initialize telemetry client (generates UUID, starts batch timer, tracks app_opened)
            await this.telemetry.init();
        } catch (error) {
            console.error('❌ Error initializing telemetry:', error);
            // Only enable on error if it's an internal build
            if (this.telemetry.isInternalBuild()) {
                this.telemetry.setEnabled(true);
            }
        }
    }
    
    /**
     * Setup telemetry UI based on build type
     * Only show telemetry settings in internal builds
     */
    setupTelemetryUI() {
        const telemetryContainer = document.getElementById('telemetrySettingContainer');
        
        if (!telemetryContainer) {
            console.warn('⚠️ Telemetry container not found in DOM');
            return; // Element not found
        }
        
        // Check if this is an internal build
        const isInternalBuild = this.telemetry.isInternalBuild();
        
        if (isInternalBuild) {
            // Show telemetry settings (internal build)
            telemetryContainer.style.display = 'block';
            console.log('📊 Telemetry UI: Visible (internal build)');
        } else {
            // Hide telemetry settings (community build)
            telemetryContainer.style.display = 'none';
            console.log('📊 Telemetry UI: Hidden (community build)');
        }
    }

    /**
     * Get platform information
     */
    async getPlatform() {
        if (window.electronAPI && window.electronAPI.getPlatform) {
            return await window.electronAPI.getPlatform();
        }
        return 'unknown';
    }

    /**
     * Get app version
     */
    async getAppVersion() {
        if (window.electronAPI && window.electronAPI.getAppVersion) {
            return await window.electronAPI.getAppVersion();
        }
        return '0.0.0';
    }

    /**
     * Register all modals with ModalManager
     * This centralizes modal management and eliminates duplicate code
     */
    registerModals() {
        // Register Settings Panel (overlay is the modal, panel slides inside)
        this.modalManager.register('settings', this.settingsOverlay, null);
        
        // Register Shortcuts Panel (overlay is the modal, panel slides inside)
        this.modalManager.register('shortcuts', this.shortcutsOverlay, null);
        
        // Register Dictionary Panel (overlay is the modal, panel slides inside)
        this.modalManager.register('dictionary', this.dictionaryOverlay, null);
        
        // Register Word Modal
        this.modalManager.register('word-modal', this.wordModal, null);
        
        // Register API Key Modal
        this.modalManager.register('api-key-modal', this.apiKeyModal, null);
        
        // Register Shortcuts Edit Modal
        this.modalManager.register('shortcuts-edit-modal', this.shortcutsModal, null);
        
        // Register Remove API Key Confirmation
        this.modalManager.register('remove-api-key-modal', this.removeApiKeyModal, null);
        
        // Register Clear Audio Confirmation
        this.modalManager.register('clear-audio-modal', this.clearAudioModal, null);
        
        // Register Alert Modal
        this.modalManager.register('alert-modal', this.alertModal, null);
        
        console.log('✅ All modals registered with ModalManager');
    }

    initializeElements() {
        // Main elements
        this.recordButton = document.getElementById('recordButton');
        this.timer = document.getElementById('timer');
        this.warningIcon = document.getElementById('warningIcon');
        this.statusText = document.getElementById('statusText');
        this.visualizer = document.getElementById('visualizer');
        this.cancelButton = document.getElementById('cancelButton');
        this.recordingInfo = document.getElementById('recordingInfo');
        
        // App container (for skeleton loader)
        this.appContainer = document.getElementById('appContainer');
        
        // Transcriptions
        this.transcriptionsContainer = document.getElementById('transcriptionsContainer');
        this.loadMoreButton = document.getElementById('loadMoreButton');
        this.gradientOverlay = document.getElementById('gradientOverlay');
        this.sectionTitle = document.querySelector('.section-title');
        
        // Create View Less button dynamically
        this.showLessButton = document.createElement('button');
        this.showLessButton.className = 'show-less-button hidden';
        this.showLessButton.textContent = 'View less';
        this.showLessButton.addEventListener('click', () => {
            this.handleShowLess();
        });
        
        // Placeholder buttons
        this.shortcutsButton = document.getElementById('shortcutsButton');
        this.dictionaryButton = document.getElementById('dictionaryButton');
        this.settingsButton = document.getElementById('settingsButton');
        
        // Settings Panel
        this.settingsOverlay = document.getElementById('settingsOverlay');
        this.settingsPanel = document.getElementById('settingsPanel');
        this.apiKeySettingItem = document.getElementById('apiKeySettingItem');
        this.addApiKeyButton = document.getElementById('addApiKeyButton');
        this.apiKeyConfiguredItem = document.getElementById('apiKeyConfiguredItem');
        this.changeApiKeyButton = document.getElementById('changeApiKeyButton');
        this.removeApiKeySettingsButton = document.getElementById('removeApiKeySettingsButton');
        this.saveAudioToggle = document.getElementById('saveAudioToggle');
        this.soundEffectsToggle = document.getElementById('soundEffectsToggle');
        this.autoHideWidgetToggle = document.getElementById('autoHideWidgetToggle');
        this.autoPasteToggle = document.getElementById('autoPasteToggle');
        this.telemetryToggle = document.getElementById('telemetryToggle');
        this.privacyPolicyLink = document.getElementById('privacyPolicyLink');
        
        // Audio Storage Section
        this.audioStorageSection = document.getElementById('audioStorageSection');
        this.openAudioFolderButton = document.getElementById('openAudioFolderButton');
        this.storageSeparator = document.getElementById('storageSeparator');
        this.storageStatsText = document.getElementById('storageStatsText');
        this.cleanupAudioButton = document.getElementById('cleanupAudioButton');
        
        // Dictionary Panel
        this.dictionaryOverlay = document.getElementById('dictionaryOverlay');
        this.dictionaryPanel = document.getElementById('dictionaryPanel');
        this.addWordButton = document.getElementById('addWordButton');
        this.dictionaryContent = document.getElementById('dictionaryContent');
        this.dictionaryEmpty = document.getElementById('dictionaryEmpty');
        
        // Word Modal
        this.wordModal = document.getElementById('wordModal');
        this.closeWordModal = document.getElementById('closeWordModal');
        this.wordInput = document.getElementById('wordInput');
        this.submitWord = document.getElementById('submitWord');
        this.submitWordText = document.getElementById('submitWordText');
        this.wordModalTitle = document.getElementById('wordModalTitle');
        this.currentEditingWordId = null;
        
        // API Key Modal
        this.apiKeyModal = document.getElementById('apiKeyModal');
        this.closeApiModal = document.getElementById('closeApiModal');
        this.apiKeyInput = document.getElementById('apiKeyInput');
        this.submitApiKey = document.getElementById('submitApiKey');
        this.submitApiKeyText = document.getElementById('submitApiKeyText');
        this.apiKeyModalTitle = document.getElementById('apiKeyModalTitle');
        this.apiKeyInputLabel = document.getElementById('apiKeyInputLabel');
        this.currentApiKeySection = document.getElementById('currentApiKeySection');
        this.currentApiKeyValue = document.getElementById('currentApiKeyValue');
        this.apiKeyDisplay = document.getElementById('apiKeyDisplay');
        
        // Remove API Key Confirmation Modal
        this.removeApiKeyModal = document.getElementById('removeApiKeyModal');
        this.closeRemoveApiModal = document.getElementById('closeRemoveApiModal');
        this.confirmRemoveApiKey = document.getElementById('confirmRemoveApiKey');
        
        // Clear Audio Files Confirmation Modal
        this.clearAudioModal = document.getElementById('clearAudioModal');
        this.closeClearAudioModal = document.getElementById('closeClearAudioModal');
        this.confirmClearAudio = document.getElementById('confirmClearAudio');
        
        // Alert Modal
        this.alertModal = document.getElementById('alertModal');
        this.alertIcon = document.getElementById('alertIcon');
        this.alertTitle = document.getElementById('alertTitle');
        this.alertMessage = document.getElementById('alertMessage');
        this.alertButton = document.getElementById('alertButton');
        
        // Confirm Modal
        this.confirmModal = document.getElementById('confirmModal');
        this.confirmTitle = document.getElementById('confirmTitle');
        this.confirmMessage = document.getElementById('confirmMessage');
        this.confirmCancel = document.getElementById('confirmCancel');
        this.confirmOk = document.getElementById('confirmOk');
        this.confirmCallback = null;
        
        // Shortcuts Panel
        this.shortcutsOverlay = document.getElementById('shortcutsOverlay');
        this.shortcutsPanel = document.getElementById('shortcutsPanel');
        this.editRecordShortcut = document.getElementById('editRecordShortcut');
        this.recordShortcutDisplay = document.getElementById('recordShortcutDisplay');
        
        // Shortcuts Modal
        this.shortcutsModal = document.getElementById('shortcutsModal');
        this.closeShortcutsModal = document.getElementById('closeShortcutsModal');
        this.recordShortcutInput = document.getElementById('recordShortcutInput');
        this.recordShortcutError = document.getElementById('recordShortcutError');
        this.saveRecordShortcut = document.getElementById('saveRecordShortcut');
        this.currentRecordingShortcut = null; // Store current shortcut
        
        // Verify critical elements
        if (!this.recordButton) console.error('❌ Record button not found');
        if (!this.transcriptionsContainer) console.error('❌ Transcriptions container not found');
        
        // Initialize UIStateController now that elements are available
        // Note: This will be used for reactive UI updates in the future
        this.uiController = new UIStateController(this, this.stateManager);
        console.log('✅ UIStateController initialized');
    }

    setupEventListeners() {
        // Record button
        this.recordButton.addEventListener('click', async () => {
            if (this.isRecording) {
                if (this.recordingSource === 'main') {
                    this.stopRecording();
                } else if (this.recordingSource === 'widget') {
                    if (window.electronAPI && window.electronAPI.syncRecordingState) {
                        await window.electronAPI.syncRecordingState('request_stop_recording');
                    }
                }
            } else {
                await this.startRecording();
            }
        });

        // Force stop mechanism: hold stop button for 2 seconds
        this.holdTimeout = null;
        this.recordButton.addEventListener('mousedown', () => {
            if (this.isRecording && this.recordingSource === 'main') {
                this.holdTimeout = setTimeout(() => {
                    this.forceStopRecording();
                }, 2000);
            }
        });
        this.recordButton.addEventListener('mouseup', () => {
            if (this.holdTimeout) {
                clearTimeout(this.holdTimeout);
                this.holdTimeout = null;
            }
        });
        this.recordButton.addEventListener('mouseleave', () => {
            if (this.holdTimeout) {
                clearTimeout(this.holdTimeout);
                this.holdTimeout = null;
            }
        });

        // Cancel button
        if (this.cancelButton) {
            this.cancelButton.addEventListener('click', (event) => {
                event.stopPropagation();
                event.preventDefault();
                
                if (this.recordingSource === 'main') {
                    this.cancelRecording();
                } else if (this.recordingSource === 'widget') {
                    if (window.electronAPI && window.electronAPI.syncRecordingState) {
                        window.electronAPI.syncRecordingState('request_cancel_recording');
                    }
                }
            });
        }

        // Load More button
        if (this.loadMoreButton) {
            this.loadMoreButton.addEventListener('click', () => {
                this.handleLoadMore();
            });
        }

        // Placeholder buttons
        if (this.shortcutsButton) {
            this.shortcutsButton.addEventListener('click', () => {
                this.openShortcuts();
            });
        }

        if (this.dictionaryButton) {
            this.dictionaryButton.addEventListener('click', () => {
                this.openDictionary();
            });
        }
        
        // Dictionary overlay - close when clicking outside panel
        if (this.dictionaryOverlay) {
            this.dictionaryOverlay.addEventListener('click', (e) => {
                // Close if clicking on overlay, but not if clicking inside the panel
                if (!this.dictionaryPanel.contains(e.target)) {
                this.closeDictionary();
                }
            });
        }
        
        // Add word button
        if (this.addWordButton) {
            this.addWordButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openWordModal();
            });
        }
        
        // Word modal - close button
        if (this.closeWordModal) {
            this.closeWordModal.addEventListener('click', () => {
                this.closeWordModalFunc();
            });
        }
        
        // Word modal - close on outside click
        if (this.wordModal) {
            this.wordModal.addEventListener('click', (e) => {
                if (e.target === this.wordModal) {
                    this.closeWordModalFunc();
                }
            });
        }
        
        // Word modal - submit button
        if (this.submitWord) {
            this.submitWord.addEventListener('click', () => {
                if (this.currentEditingWordId) {
                    this.updateWord();
                } else {
                    this.addWord();
                }
            });
        }
        
        // Word modal - Enter key to submit
        if (this.wordInput) {
            this.wordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    if (this.currentEditingWordId) {
                        this.updateWord();
                    } else {
                        this.addWord();
                    }
                }
            });
        }

        // Settings button
        if (this.settingsButton) {
            this.settingsButton.addEventListener('click', () => {
                this.openSettings();
            });
        }
        
        // Settings overlay click handling is now managed by ModalManager
        // No need for duplicate event listener here - it was causing conflicts
        // with button clicks inside the panel
        
        // Shortcuts overlay - close when clicking outside panel
        if (this.shortcutsOverlay) {
            this.shortcutsOverlay.addEventListener('click', (e) => {
                // Close if clicking on overlay, but not if clicking inside the panel
                if (!this.shortcutsPanel.contains(e.target)) {
                this.closeShortcuts();
                }
            });
        }
        
        // Edit Recording Shortcut button
        if (this.editRecordShortcut) {
            this.editRecordShortcut.addEventListener('click', (e) => {
                e.preventDefault();
                this.openShortcutModal();
            });
        }
        
        // Close Shortcuts Modal
        if (this.closeShortcutsModal) {
            this.closeShortcutsModal.addEventListener('click', () => {
                this.closeShortcutModal();
            });
        }
        
        // Close Shortcuts modal when clicking outside
        if (this.shortcutsModal) {
            this.shortcutsModal.addEventListener('click', (e) => {
                if (e.target === this.shortcutsModal) {
                    this.closeShortcutModal();
                }
            });
        }
        
        // Capture shortcut keys (auto-capture only)
        if (this.recordShortcutInput) {
            this.recordShortcutInput.addEventListener('click', () => {
                // Clear input on click to allow testing new shortcuts
                this.recordShortcutInput.value = '';
                this.currentRecordingShortcut = null;
                this.recordShortcutError.classList.remove('show');
                this.recordShortcutInput.classList.remove('error');
            });
            
            this.recordShortcutInput.addEventListener('keydown', (e) => {
                // Always capture, no typing mode
                e.preventDefault();
                this.captureShortcut(e);
            });
        }
        
        // Save Recording Shortcut
        if (this.saveRecordShortcut) {
            this.saveRecordShortcut.addEventListener('click', async () => {
                await this.saveShortcutChanges();
            });
        }
        
        // Add API Key button (initial state - no key configured)
        if (this.addApiKeyButton) {
            this.addApiKeyButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openApiKeyModal();
            });
        } else {
            console.error('❌ Add API Key button not found');
        }
        
        // Change API Key button (configured state - key exists)
        if (this.changeApiKeyButton) {
            this.changeApiKeyButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openApiKeyModal();
            });
        } else {
            console.error('❌ Change API Key button not found');
        }
        
        // API Key modal - close button
        if (this.closeApiModal) {
            this.closeApiModal.addEventListener('click', () => {
                this.closeApiKeyModal();
            });
        }
        
        // Close API Key modal when clicking outside
        if (this.apiKeyModal) {
            this.apiKeyModal.addEventListener('click', (e) => {
                if (e.target === this.apiKeyModal) {
                    this.closeApiKeyModal();
                }
            });
        }
        
        // API Key modal - submit button
        if (this.submitApiKey) {
            this.submitApiKey.addEventListener('click', () => {
                this.saveApiKey();
            });
        }
        
        // API Key modal - Enter key
        if (this.apiKeyInput) {
            this.apiKeyInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.saveApiKey();
                }
            });
        }
        
        // Remove API Key button (in Settings)
        if (this.removeApiKeySettingsButton) {
            this.removeApiKeySettingsButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openRemoveApiKeyModal();
            });
        }
        
        // Remove API Key Confirmation Modal - close button
        if (this.closeRemoveApiModal) {
            this.closeRemoveApiModal.addEventListener('click', () => {
                this.closeRemoveApiKeyModal();
            });
        }
        
        // Remove API Key Confirmation Modal - confirm button
        if (this.confirmRemoveApiKey) {
            this.confirmRemoveApiKey.addEventListener('click', () => {
                this.removeApiKey();
            });
        }
        
        // Close Remove API Key modal when clicking outside
        if (this.removeApiKeyModal) {
            this.removeApiKeyModal.addEventListener('click', (e) => {
                if (e.target === this.removeApiKeyModal) {
                    this.closeRemoveApiKeyModal();
                }
            });
        }
        
        // Alert Modal - OK button
        if (this.alertButton) {
            this.alertButton.addEventListener('click', () => {
                this.closeAlert();
            });
        }
        
        // Confirm Modal event listeners
        if (this.confirmCancel) {
            this.confirmCancel.addEventListener('click', () => {
                this.closeConfirm(false);
            });
        }
        
        if (this.confirmOk) {
            this.confirmOk.addEventListener('click', () => {
                this.closeConfirm(true);
            });
        }
        
        // Close Confirm modal when clicking outside
        if (this.confirmModal) {
            this.confirmModal.addEventListener('click', (e) => {
                if (e.target === this.confirmModal) {
                    this.closeConfirm(false);
                }
            });
        }
        
        // Close Alert modal when clicking outside (for consistency)
        if (this.alertModal) {
            this.alertModal.addEventListener('click', (e) => {
                if (e.target === this.alertModal) {
                    this.closeAlert();
                }
            });
        }
        
        // Save Audio toggle
        if (this.saveAudioToggle) {
            this.saveAudioToggle.addEventListener('change', () => {
                this.toggleSaveAudio();
            });
        }

        // Auto-hide Widget toggle
        if (this.autoHideWidgetToggle) {
            this.autoHideWidgetToggle.addEventListener('change', () => {
                this.toggleAutoHideWidget();
            });
        }
        
        // Telemetry toggle
        if (this.telemetryToggle) {
            this.telemetryToggle.addEventListener('change', () => {
                this.toggleTelemetry();
            });
        }
        
        // Privacy policy link
        if (this.privacyPolicyLink) {
            this.privacyPolicyLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showPrivacyPolicy();
            });
        }
        
        if (this.autoPasteToggle) {
            this.autoPasteToggle.addEventListener('change', () => {
                this.toggleAutoPaste();
            });
        }
        
        // Sound Effects toggle
        if (this.soundEffectsToggle) {
            this.soundEffectsToggle.addEventListener('change', () => {
                this.toggleSoundEffects();
            });
        }
        
        // Cleanup Audio link
        if (this.cleanupAudioButton) {
            this.cleanupAudioButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.openClearAudioModal();
            });
        }
        
        // Open Audio Folder Button
        if (this.openAudioFolderButton) {
            this.openAudioFolderButton.addEventListener('click', async () => {
                try {
                    await window.electronAPI.openAudioFolder();
                } catch (error) {
                    console.error('Error opening audio folder:', error);
                    this.showToast('Error opening folder', 'error');
                }
            });
        }
        
        // Clear Audio Modal listeners
        if (this.closeClearAudioModal) {
            this.closeClearAudioModal.addEventListener('click', () => {
                this.closeClearAudioModalHandler();
            });
        }
        
        if (this.confirmClearAudio) {
            this.confirmClearAudio.addEventListener('click', () => {
                this.cleanupOldAudioFiles();
            });
        }
        
        // Close modal when clicking outside
        if (this.clearAudioModal) {
            this.clearAudioModal.addEventListener('click', (e) => {
                if (e.target === this.clearAudioModal) {
                    this.closeClearAudioModalHandler();
                }
            });
        }
    }

    async checkBackendConnection() {
        try {
            // Safety check - ensure API client is initialized
            if (!this.api) {
                console.error('❌ APIClient not initialized yet');
                setTimeout(() => this.checkBackendConnection(), 1000);
                return;
            }
            
            // Use APIClient instead of direct fetch
            const data = await this.api.checkHealth();
            
            console.log('✅ Backend connected via APIClient:', data);
                
                // Check API key status first
                await this.checkApiKeyStatus();
                
                // Load current shortcut and update display
                await this.loadCurrentShortcut();
                
                // Initialize SoundManager
                await this.initializeSoundManager();
                
                // Then load transcription history (immediately, no delay)
                this.loadTranscriptionHistory();
        } catch (error) {
            console.warn('⚠️ Backend connection retry in 3s...', error.message);
            // Retry silently
            setTimeout(() => this.checkBackendConnection(), 3000);
        }
    }

    async initializeSoundManager() {
        try {
            // Initialize SoundManager (preload audio files)
            if (window.soundManager) {
                await soundManager.initialize();
                
                // Load sound effects setting from backend
                const response = await fetch(`${this.backendUrl}/api/config/settings/ui_settings.sound_effects_enabled`);
                if (response.ok) {
                    const data = await response.json();
                    const isEnabled = data.value || false;
                    soundManager.setEnabled(isEnabled);
                    console.log('🔊 SoundManager initialized, enabled:', isEnabled);
                } else {
                    console.log('⚠️ Could not load sound effects setting, using default (disabled)');
                }
            } else {
                console.warn('⚠️ SoundManager not available');
            }
        } catch (error) {
            console.error('❌ Error initializing SoundManager:', error);
        }
    }

    markAppAsLoaded() {
        // Mark app as loaded to trigger crossfade from skeleton to real content
        if (this.appContainer && !this.appContainer.classList.contains('loaded')) {
            console.log('✅ App content loaded - triggering crossfade');
            this.appContainer.classList.add('loaded');
            
            // Remove skeleton elements after crossfade animation completes
            setTimeout(() => {
                const skeletons = document.querySelectorAll('.skeleton-transcription');
                skeletons.forEach(skeleton => skeleton.remove());
                console.log('✅ Skeleton loaders removed');
            }, 550); // Slightly longer than animation (0.5s)
        }
    }

    async startRecording() {
        // Check if API key is configured
        if (!this.hasApiKey) {
            this.showAlert('warning', 'API Key Required', 'Please add your OpenAI API Key in Settings before recording.');
            return;
        }
        
        try {
            // Stop any existing timer immediately and reset to 00:00
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            if (this.timer) {
                this.timer.textContent = '00:00';
            }
            this.startTime = null;
            
            // STATE 1: Starting - show "starting" + timer at 00:00
            this.updateUIForStarting();

            // Get media stream
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            
            // Set up MediaRecorder
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.audioChunks = [];
            this.isCancelled = false;
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                
                if (!this.isCancelled) {
                    this.processRecording();
                } else {
                    this.isCancelled = false;
                }
            };

            // Start recording
            this.mediaRecorder.start();
            this.isRecording = true;
            this.recordingSource = 'main';
            
            // Track recording started
            await this.telemetry.track('recording_started', {
                source: 'main',
                platform: await this.getPlatform()
            });
            
            // Play record start sound
            if (window.soundManager) {
                soundManager.playRecordStart();
            }
            
            // STATE 2: Recording - show "recording" + timer + visualizer + cancel
            this.updateUIForRecording();
            this.startTimer();
            
            // Safety timeout: auto force-stop after MAX_RECORDING_MINUTES
            const maxTimeMs = this.MAX_RECORDING_MINUTES * 60 * 1000;
            this.safetyTimeout = setTimeout(() => {
                if (this.isRecording) {
                    console.error(`⚠️ MAIN WINDOW SAFETY TIMEOUT: ${this.MAX_RECORDING_MINUTES} minutes exceeded, forcing stop`);
                    this.stopRecording(); // Stop and transcribe (like widget does for timer_max_exceeded)
                }
            }, maxTimeMs);
            
            // STATE 3: After 3 seconds, hide "recording" text
            setTimeout(() => {
                if (this.isRecording) {
                    this.updateUIForRecordingActive();
                }
            }, 3000);
            
            // Notify widget
            if (window.electronAPI && window.electronAPI.syncRecordingState) {
                try {
                    await window.electronAPI.syncRecordingState('main_recording_started');
                } catch (error) {
                    console.warn('Could not notify widget:', error);
                }
            }

        } catch (error) {
            console.error('Error starting recording:', error);
            console.error('Error name:', error.name);
            console.error('Error message:', error.message);
            
            // Provide specific error messages based on error type
            let title = 'Microphone Error';
            let message = 'Error accessing microphone. Please check your settings and try again.';
            
            if (error.name === 'NotAllowedError') {
                title = 'Permission Denied';
                message = 'Microphone access denied. Please allow microphone access in System Preferences > Security & Privacy > Microphone.';
            } else if (error.name === 'NotFoundError') {
                title = 'No Microphone Found';
                message = 'No microphone detected. Please connect a microphone and try again.';
            } else if (error.name === 'NotReadableError') {
                title = 'Microphone In Use';
                message = 'Microphone is already in use by another application. Please close other apps using the microphone.';
            } else if (error.name === 'OverconstrainedError') {
                title = 'Microphone Not Supported';
                message = 'Your microphone doesn\'t support the required audio settings. Try a different microphone.';
            } else if (error.name === 'NotSupportedError') {
                title = 'Browser Not Supported';
                message = 'Your browser doesn\'t support audio recording. Please use a modern browser like Chrome or Safari.';
            } else if (error.name === 'AbortError') {
                title = 'Recording Canceled';
                message = 'Microphone access was canceled. Please try again.';
            }
            
            this.showAlert('error', title, message);
        }
    }

    async stopRecording() {
        if (this.mediaRecorder && this.isRecording && this.recordingSource === 'main') {
            // Clear safety timeout
            if (this.safetyTimeout) {
                clearTimeout(this.safetyTimeout);
                this.safetyTimeout = null;
            }
            
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // Calculate recording duration
            const duration = this.startTime ? (Date.now() - this.startTime) / 1000 : 0;
            
            // Track recording completed
            await this.telemetry.track('recording_completed', {
                source: 'main',
                duration_seconds: Math.round(duration),
                platform: await this.getPlatform()
            });
            
            this.recordingSource = null;
            
            // Play record stop sound
            if (window.soundManager) {
                soundManager.playRecordStop();
            }
            
            // Stop all audio tracks
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            
            // STATE 4: Transcribing - show timer + "Transcribing..."
            this.updateUIForTranscribing();
            this.stopTimer(); // Keep timer frozen
            
            // Notify widget
            if (window.electronAPI && window.electronAPI.syncRecordingState) {
                window.electronAPI.syncRecordingState('main_recording_stopped');
            }
        }
    }

    cancelRecording() {
        if (!this.mediaRecorder || !this.isRecording) {
            return;
        }

        this.isRecording = false;
        this.isCancelled = true;
        this.mediaRecorder.stop();
        
        // Stop all audio tracks
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        
        this.stopTimer();
        this.updateUIForIdle();
        
        // Notify widget
        if (window.electronAPI && window.electronAPI.syncRecordingState) {
            window.electronAPI.syncRecordingState('main_recording_cancelled');
        }
    }

    // 🚨 FORCE STOP MECHANISM - Emergency reset for unresponsive stop button
    async forceStopRecording() {
        console.error('🚨 FORCE STOP INITIATED - Main Window');
        
        // Clear any existing timeouts
        if (this.safetyTimeout) {
            clearTimeout(this.safetyTimeout);
            this.safetyTimeout = null;
        }
        
        if (this.stateValidationInterval) {
            clearInterval(this.stateValidationInterval);
            this.stateValidationInterval = null;
        }
        
        // 1. Stop MediaRecorder (ignore all errors)
        try {
            if (this.mediaRecorder) {
                if (this.mediaRecorder.state === 'recording' || this.mediaRecorder.state === 'paused') {
                    this.mediaRecorder.stop();
                }
                // Force stop all tracks
                if (this.mediaRecorder.stream) {
                    this.mediaRecorder.stream.getTracks().forEach(track => {
                        try { 
                            track.stop(); 
                        } catch(e) {
                            console.error('Track stop error (ignored):', e);
                        }
                    });
                }
                this.mediaRecorder = null;
            }
        } catch (e) {
            console.error('MediaRecorder stop error (ignored):', e);
        }
        
        // 2. Reset ALL flags (nuclear option)
        this.isRecording = false;
        this.isProcessing = false;
        this.isCancelled = true;
        this.recordingSource = null;
        this.audioChunks = [];
        
        // 3. Stop timer
        this.stopTimer();
        
        // 4. Reset UI immediately
        try {
            this.updateUIForIdle();
        } catch (e) {
            console.error('UI reset error (ignored):', e);
        }
        
        // 5. Clear backend session
        try {
            await fetch(`${this.backendUrl}/api/recording/force-stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (e) {
            console.error('Backend force-stop failed (ignored):', e);
        }
        
        // 6. Notify widget
        if (window.electronAPI && window.electronAPI.syncRecordingState) {
            try {
                window.electronAPI.syncRecordingState('main_force_stopped');
            } catch (e) {
                console.error('Widget notification failed (ignored):', e);
            }
        }
        
        console.error('✅ FORCE STOP COMPLETED - Main Window');
    }

    async processRecording() {
        try {
            // Keep showing "Transcribing..." state
            
            // Calculate audio duration from recording timer
            const audioDurationSeconds = this.startTime ? (Date.now() - this.startTime) / 1000 : 0;
            
            // Start progress tracking for transcription
            if (audioDurationSeconds > 0) {
                this.updateTranscriptionProgress(audioDurationSeconds);
            }
            
            // Notify widget: main window is transcribing
            if (window.electronAPI && window.electronAPI.syncRecordingState) {
                window.electronAPI.syncRecordingState('main_transcribing');
            }
            
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            
            // 🔍 VALIDATE AUDIO FILE SIZE (25MB OpenAI limit)
            const maxSizeMB = 25;
            const maxSizeBytes = maxSizeMB * 1024 * 1024;
            const fileSizeMB = (audioBlob.size / 1024 / 1024).toFixed(1);
            
            if (audioBlob.size > maxSizeBytes) {
                console.error(`❌ Audio file too large: ${fileSizeMB}MB (max: ${maxSizeMB}MB)`);
                
                // Clear audio chunks (cleanup)
                this.audioChunks = [];
                
                // Update UI to idle state
                this.updateUIForIdle();
                
                // Show error to user
                const errorMessage = `Recording too long (${fileSizeMB}MB). Please record shorter clips (max ${maxSizeMB}MB).`;
                this.showToast(errorMessage, 'error');
                
                // Notify widget about error
                if (window.electronAPI && window.electronAPI.syncRecordingState) {
                    window.electronAPI.syncRecordingState('main_transcription_completed');
                }
                
                return; // Exit early
            }
            
            console.log(`✅ Audio file size OK: ${fileSizeMB}MB (max: ${maxSizeMB}MB)`);
            
            // Clear audio chunks immediately after creating blob (memory optimization)
            this.audioChunks = [];
            
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            
            // Stage 2: Transcribing (after upload starts)
            if (audioDurationSeconds >= this.PROGRESS_THRESHOLD_SECONDS) {
                this.setTranscriptionPhase('transcribing');
            }
            
            // Use APIClient with audio duration for dynamic timeout
            const result = await this.api.transcribe(formData, audioDurationSeconds);
            
            // Stage 3: Almost done (result received)
            if (audioDurationSeconds >= this.PROGRESS_THRESHOLD_SECONDS) {
                this.setTranscriptionPhase('almost_done');
            }
            
            if (result && result.text) {
                console.log('✅ Transcription successful:', result.text);
                
                // Track transcription completed
                // Calculate cost if not provided by backend (fallback)
                // IMPORTANT: If cost_usd is 0, undefined, or null, calculate it from duration
                let cost_usd = result.cost_usd ?? result.cost;
                const duration = result.duration_seconds || audioDurationSeconds || 0;
                
                // If cost is missing, zero, or invalid, calculate it from duration
                if (cost_usd === undefined || cost_usd === null || cost_usd === 0) {
                    if (duration > 0) {
                        const minutes = duration / 60.0;
                        cost_usd = minutes * 0.006; // Whisper pricing: $0.006 per minute
                    } else {
                        cost_usd = 0;
                    }
                } else {
                    // Ensure cost is a valid number
                    cost_usd = parseFloat(cost_usd) || 0;
                }
                
                await this.telemetry.track('transcription_completed', {
                    duration_seconds: result.duration_seconds || audioDurationSeconds || 0,
                    cost_usd: cost_usd,
                    word_count: result.text ? result.text.split(/\s+/).length : 0,
                    platform: await this.getPlatform()
                });
                
                // Play transcription ready sound
                if (window.soundManager) {
                    soundManager.playTranscriptionReady();
                }
                
                // Hide recording info
                this.updateUIForIdle();
                
                // Reload history to show new transcription
                await this.loadTranscriptionHistory();
                
                // Stage 4: Completed
                if (audioDurationSeconds >= this.PROGRESS_THRESHOLD_SECONDS) {
                    this.setTranscriptionPhase('completed');
                }
                
                // Notify widget: transcription completed
                if (window.electronAPI && window.electronAPI.syncRecordingState) {
                    window.electronAPI.syncRecordingState('main_transcription_completed');
                }
                
                // Auto-paste
                this.attemptAutoPaste(result.text);
            } else {
                // Enhanced error logging for debugging
                console.error('❌ Transcription failed:');
                console.error('   Error message:', result.error || 'Unknown error');
                console.error('   Full response:', result);
                console.error('');
                console.error('📋 For detailed backend logs, check:');
                console.error('   ~/Library/Application Support/Stories/backend.log');
                console.error('');
                
                // Get user-friendly error message (backend now returns it in result.error)
                const errorMessage = result.error || 'Transcription failed';
                throw new Error(errorMessage);
            }
            
        } catch (error) {
            console.error('❌ Error processing recording:', error);
            console.error('   Error type:', error.name);
            console.error('   Error details:', error.message);
            console.error('');
            console.error('📋 For detailed backend logs, check:');
            console.error('   ~/Library/Application Support/Stories/backend.log');
            console.error('');
            
            // Track transcription failed
            await this.telemetry.track('transcription_failed', {
                error_type: error.name || 'unknown',
                error_message: error.message || 'Unknown error',
                platform: await this.getPlatform()
            });
            
            this.updateUIForIdle();
            
            // Show toast with user-friendly error message (backend now provides it)
            // The error message is already user-friendly from backend, or from our helper function
            const userFriendlyMessage = getUserFriendlyErrorMessage(error, false);
            this.showToast(userFriendlyMessage, 'error');
            
            // Reload history to show error card
            await this.loadTranscriptionHistory();
            
            // Notify widget: error, return to inactive
            if (window.electronAPI && window.electronAPI.syncRecordingState) {
                window.electronAPI.syncRecordingState('main_transcription_completed');
            }
        }
    }

    async loadTranscriptionHistory() {
        try {
            const response = await fetch(`${this.backendUrl}/api/history`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data && data.transcriptions) {
                this.renderTranscriptions(data.transcriptions);
            } else {
                this.renderTranscriptions([]);
            }
        } catch (error) {
            console.error('Error loading history:', error);
            this.renderTranscriptions([]);
        }
    }

    renderTranscriptions(transcriptions) {
        this.transcriptionsContainer.innerHTML = '';
        
        if (transcriptions.length === 0) {
            // Hide "Recent transcriptions" title when empty
            if (this.sectionTitle) {
                this.sectionTitle.classList.add('hidden');
            }
            
            // Different message based on API key status
            const emptyMessage = this.hasApiKey 
                ? 'Click the microphone to record your first transcription'
                : 'Start recording, but first <a href="#" class="empty-state-link" id="emptyStateApiKeyLink">add your API key</a>';
            
            this.transcriptionsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <i class="ph ph-waveform"></i>
                    </div>
                    <h3 class="empty-state-title">Your <span class="empty-state-highlight">stories</span><span class="empty-state-dot">.</span> start here</h3>
                    <p class="empty-state-text">${emptyMessage}</p>
                </div>
            `;
            
            // Add event listener to the link if it exists
            if (!this.hasApiKey) {
                setTimeout(() => {
                    const apiKeyLink = document.getElementById('emptyStateApiKeyLink');
                    if (apiKeyLink) {
                        apiKeyLink.addEventListener('click', (e) => {
                            e.preventDefault();
                            this.openSettings();
                        });
                    }
                }, 0);
            }
            this.loadMoreButton.classList.add('hidden');
            this.showLessButton.classList.add('hidden');
            this.gradientOverlay.classList.add('hidden');
            this.transcriptionsContainer.classList.remove('scrollable');
            
            // Mark app as loaded (trigger crossfade from skeleton to empty state)
            this.markAppAsLoaded();
            return;
        }
        
        // Show "Recent transcriptions" title when there are transcriptions
        if (this.sectionTitle) {
            this.sectionTitle.classList.remove('hidden');
        }

        // Determine how many to show
        const toShow = this.showingAll ? transcriptions : transcriptions.slice(0, this.initialDisplayCount);
        
        // Use DocumentFragment for batch DOM insertion (single reflow)
        const fragment = document.createDocumentFragment();
        toShow.forEach((transcription) => {
            const card = this.createTranscriptionCard(transcription);
            fragment.appendChild(card);
        });
        
        // Add View Less button at the end if showing all
        if (this.showingAll) {
            this.showLessButton.classList.remove('hidden');
            fragment.appendChild(this.showLessButton);
        } else {
            this.showLessButton.classList.add('hidden');
        }
        
        // Single DOM insertion (optimized)
        this.transcriptionsContainer.appendChild(fragment);
        
        // Check if content overflows after rendering
        setTimeout(() => {
            const hasOverflow = this.transcriptionsContainer.scrollHeight > this.transcriptionsContainer.clientHeight;
            const hasMoreTranscriptions = transcriptions.length > this.initialDisplayCount;
            
            // Show Load More if: more transcriptions OR content overflows
            const shouldShowLoadMore = !this.showingAll && (hasMoreTranscriptions || hasOverflow);
            
            if (this.showingAll) {
                // Showing all: hide Load More, enable scroll
                this.loadMoreButton.classList.add('hidden');
                this.gradientOverlay.classList.add('hidden');
                this.transcriptionsContainer.classList.add('scrollable');
            } else if (shouldShowLoadMore) {
                // Has overflow or more content: show Load More
                this.loadMoreButton.classList.remove('hidden');
                this.gradientOverlay.classList.remove('hidden');
                this.transcriptionsContainer.classList.remove('scrollable');
            } else {
                // No overflow and not many transcriptions: hide both buttons
                this.loadMoreButton.classList.add('hidden');
                this.gradientOverlay.classList.add('hidden');
                this.transcriptionsContainer.classList.remove('scrollable');
            }
            
            // Mark app as loaded (trigger crossfade from skeleton to real content)
            this.markAppAsLoaded();
        }, 100);
    }

    createTranscriptionCard(transcription) {
        const card = document.createElement('div');
        const isError = transcription.status === 'error';
        card.className = isError ? 'transcription-card error-card' : 'transcription-card';
        card.dataset.id = transcription.id;
        card.dataset.text = transcription.text; // Store text for copy action
        
        // Store retry count for tracking (default 0)
        if (isError && transcription.audio_id) {
            card.dataset.retryCount = '0';
        }

        const timestamp = this.formatTimestamp(transcription.created_at);
        
        // For error cards with audio_id, show retry button instead of copy
        // For error cards without audio_id, show neither copy nor retry
        // For success cards, show copy button
        const errorIcon = isError ? '<i class="ph ph-warning-circle"></i>' : '';
        
        let primaryButton = '';
        if (isError && transcription.audio_id) {
            // Show retry button for errors with audio
            primaryButton = `
                <button class="action-icon-button retry-button" title="Retry transcription" data-action="retry" data-audio-id="${transcription.audio_id}">
                    <i class="ph ph-arrows-clockwise"></i>
                </button>
            `;
        } else if (!isError) {
            // Show copy button for successful transcriptions
            primaryButton = `
                <button class="action-icon-button copy-button" title="Copy to clipboard" data-action="copy">
                    <i class="ph ph-copy"></i>
                </button>
            `;
        }
        
        card.innerHTML = `
            <div class="transcription-header">
                <span class="transcription-timestamp">${errorIcon}${timestamp}</span>
                <div class="transcription-actions">
                    ${primaryButton}
                    <button class="action-icon-button delete-button" title="Delete transcription" data-action="delete">
                        <i class="ph ph-trash"></i>
                    </button>
                    ${transcription.audio_id ? `
                        <button class="action-icon-button download-button" title="Download audio" data-action="download" data-audio-id="${transcription.audio_id}">
                            <i class="ph ph-download-simple"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
            <div class="transcription-content ${isError ? 'error-text' : ''}">${this.escapeHtml(transcription.text)}</div>
        `;

        return card;
    }
    
    setupTranscriptionEventDelegation() {
        // Event delegation: One listener for all transcription cards
        this.transcriptionsContainer.addEventListener('click', (e) => {
            const button = e.target.closest('.action-icon-button');
            if (!button) return;
            
            const action = button.dataset.action;
            const card = button.closest('.transcription-card');
            if (!card) return;
            
            const transcriptionId = card.dataset.id;
            
            switch(action) {
                case 'copy':
                    const text = card.dataset.text;
                    this.copyTranscription(text, button);
                    break;
                case 'delete':
                    this.deleteTranscription(transcriptionId);
                    break;
                case 'download':
                    const audioId = button.dataset.audioId;
                    this.downloadAudio(audioId, button);
                    break;
                case 'retry':
                    const retryAudioId = button.dataset.audioId;
                    this.retryTranscription(transcriptionId, retryAudioId, card, button);
                    break;
            }
        });
    }

    async copyTranscription(text, buttonElement) {
        try {
            await navigator.clipboard.writeText(text);
            
            const icon = buttonElement.querySelector('i');
            const originalClass = icon.className;
            
            icon.className = 'ph ph-check';
            buttonElement.style.color = '#059669';
            
            setTimeout(() => {
                icon.className = originalClass;
                buttonElement.style.color = '';
            }, 1500);
            
        } catch (error) {
            console.error('Error copying to clipboard:', error);
        }
    }

    async deleteTranscription(id) {
        try {
            const response = await fetch(`${this.backendUrl}/api/history/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                // Reload history
                await this.loadTranscriptionHistory();
            } else {
                console.error('Failed to delete transcription');
            }
        } catch (error) {
            console.error('Error deleting transcription:', error);
        }
    }

    async downloadAudio(audioId, buttonElement) {
        if (!audioId) {
            console.warn('No audio ID available for this transcription');
            return;
        }

        try {
            // Show loading state
            const icon = buttonElement.querySelector('i');
            const originalClass = icon.className;
            icon.className = 'ph ph-circle-notch';
            icon.style.animation = 'spin 1s linear infinite';
            buttonElement.disabled = true;

            // Fetch audio file
            const response = await fetch(`${this.backendUrl}/api/audio/${audioId}/download`);
            
            if (!response.ok) {
                // Try to get error message from response
                let errorMessage = 'Failed to download audio';
                try {
                    const errorData = await response.json();
                    if (errorData.message) {
                        errorMessage = errorData.message;
                    } else if (errorData.error) {
                        errorMessage = errorData.error;
                    }
                } catch (e) {
                    // Response is not JSON, use default message
                }
                throw new Error(errorMessage);
            }

            // Get filename from response headers or use default
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'recording.webm';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }

            // Create blob and download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            // Show success state
            icon.className = 'ph ph-check';
            icon.style.animation = '';
            buttonElement.style.color = '#059669';
            
            setTimeout(() => {
                icon.className = originalClass;
                icon.style.animation = '';
                buttonElement.style.color = '';
                buttonElement.disabled = false;
            }, 1500);

        } catch (error) {
            console.error('Error downloading audio:', error);
            
            // Show error message to user
            const errorMessage = error.message || 'Failed to download audio';
            this.showAlert('error', 'Download Failed', errorMessage);
            
            // Show error state
            const icon = buttonElement.querySelector('i');
            icon.className = 'ph ph-x';
            icon.style.animation = '';
            buttonElement.style.color = '#dc2626';
            
            setTimeout(() => {
                icon.className = 'ph ph-download-simple';
                buttonElement.style.color = '';
                buttonElement.disabled = false;
            }, 1500);
        }
    }

    async retryTranscription(transcriptionId, audioId, cardElement, buttonElement) {
        if (!audioId) {
            console.warn('No audio ID available for retry');
            this.showToast('Cannot retry: No audio file available', 'error');
            return;
        }

        // Get current retry count (no limit, just for tracking)
        const retryCount = parseInt(cardElement.dataset.retryCount || '0');
        const newRetryCount = retryCount + 1;

        try {
            // Update UI to "retrying" state
            const contentDiv = cardElement.querySelector('.transcription-content');
            const icon = buttonElement.querySelector('i');
            const originalIconClass = icon.className;
            
            // Show spinning icon
            icon.className = 'ph ph-circle-notch';
            icon.style.animation = 'spin 1s linear infinite';
            buttonElement.disabled = true;
            
            // Update content to show retrying state
            contentDiv.innerHTML = 'Retrying transcription...';
            contentDiv.classList.add('retrying-text');

            console.log(`🔄 Retrying transcription ${transcriptionId} (attempt ${newRetryCount})`);
            
            // Show toast with attempt number
            this.showToast(`Retrying transcription... (attempt ${newRetryCount})`, 'info');

            // Setup timeout (45 seconds)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
            }, 45000); // 45 seconds

            // Call retry endpoint
            const response = await fetch(`${this.backendUrl}/api/audio/${audioId}/retry`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    max_attempts: 3
                }),
                signal: controller.signal
            });

            // Clear timeout if request completes
            clearTimeout(timeoutId);

            const data = await response.json();

            if (response.ok && data.status === 'success') {
                // SUCCESS: Replace card with successful transcription
                console.log('✅ Retry successful:', data);
                
                // Reset retry count
                cardElement.dataset.retryCount = '0';
                
                // Update the card to show success
                cardElement.classList.remove('error-card');
                cardElement.dataset.text = data.text;
                
                // Re-create the card with success state
                const timestamp = this.formatTimestamp(data.created_at || new Date().toISOString());
                cardElement.innerHTML = `
                    <div class="transcription-header">
                        <span class="transcription-timestamp">${timestamp}</span>
                        <div class="transcription-actions">
                            <button class="action-icon-button copy-button" title="Copy to clipboard" data-action="copy">
                                <i class="ph ph-copy"></i>
                            </button>
                            <button class="action-icon-button delete-button" title="Delete transcription" data-action="delete">
                                <i class="ph ph-trash"></i>
                            </button>
                            ${audioId ? `
                                <button class="action-icon-button download-button" title="Download audio" data-action="download" data-audio-id="${audioId}">
                                    <i class="ph ph-download-simple"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="transcription-content">${this.escapeHtml(data.text)}</div>
                `;
                
                // Play transcription ready sound
                if (window.soundManager) {
                    soundManager.playTranscriptionReady();
                }
                
                // Show success toast
                this.showToast('Transcription successful!', 'success');
                
            } else {
                // FAILURE: Update error message and increment retry count
                console.log('❌ Retry failed:', data);
                
                // Increment retry count
                cardElement.dataset.retryCount = newRetryCount.toString();
                
                // Restore icon
                icon.className = originalIconClass;
                icon.style.animation = '';
                buttonElement.disabled = false;
                
                // Determine error message
                let errorMessage;
                if (newRetryCount >= 3) {
                    // Special message after 3rd attempt
                    errorMessage = 'Retry failed 3 times. Each attempt uses your OpenAI API. Check your internet connection or try again later.';
                } else {
                    // Regular error message
                    errorMessage = data.text || data.user_message || data.error || 'Transcription failed';
                }
                
                contentDiv.innerHTML = this.escapeHtml(errorMessage);
                contentDiv.classList.remove('retrying-text');
                
                // Show toast with attempt number
                this.showToast(`Retry failed (attempt ${newRetryCount})`, 'error');
            }

        } catch (error) {
            console.error('Error during retry:', error);
            
            // Increment retry count even on error
            cardElement.dataset.retryCount = newRetryCount.toString();
            
            // Restore UI
            const contentDiv = cardElement.querySelector('.transcription-content');
            const icon = buttonElement.querySelector('i');
            
            icon.className = 'ph ph-arrows-clockwise';
            icon.style.animation = '';
            buttonElement.disabled = false;
            contentDiv.classList.remove('retrying-text');
            
            // Check if it was a timeout
            if (error.name === 'AbortError') {
                // Timeout message (permanent in card)
                contentDiv.innerHTML = 'This is taking longer than expected. Try again.';
                this.showToast('Request timeout', 'error');
            } else {
                // Show special message if 3+ attempts
                if (newRetryCount >= 3) {
                    contentDiv.innerHTML = 'Retry failed 3 times. Each attempt uses your OpenAI API. Check your internet connection or try again later.';
                } else {
                    contentDiv.innerHTML = 'Failed to retry transcription';
                }
                this.showToast('Failed to retry transcription', 'error');
            }
        }
    }

    handleLoadMore() {
        this.showingAll = true;
        this.loadTranscriptionHistory();
    }

    handleShowLess() {
        this.showingAll = false;
        this.loadTranscriptionHistory();
        // Scroll to top
        this.transcriptionsContainer.scrollTop = 0;
    }

    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const transcriptionDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        
        let dateStr;
        if (transcriptionDate.getTime() === today.getTime()) {
            dateStr = 'Today';
        } else if (transcriptionDate.getTime() === yesterday.getTime()) {
            dateStr = 'Yesterday';
        } else {
            dateStr = date.toLocaleDateString();
        }
        
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `${timeStr} - ${dateStr}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async attemptAutoPaste(text) {
        try {
            if (!window.electronAPI || !window.electronAPI.requestAutoPaste) {
                await navigator.clipboard.writeText(text);
                return;
            }

            await window.electronAPI.requestAutoPaste(text);
            
        } catch (error) {
            try {
                await navigator.clipboard.writeText(text);
            } catch (clipboardError) {
                console.error('Failed to copy to clipboard:', clipboardError);
            }
        }
    }

    // STATE 1: Starting
    updateUIForStarting() {
        this.recordButton.classList.add('recording');
        this.recordButton.innerHTML = '<i class="ph ph-microphone"></i>';
        this.recordingInfo.classList.remove('hidden');
        this.statusText.textContent = 'Starting';
        this.statusText.classList.remove('hidden');
        this.timer.textContent = '00:00';
        this.visualizer.classList.add('hidden');
        this.cancelButton.classList.add('hidden');
    }

    // STATE 2: Recording (timer + ondas + cancel + botón stop, sin texto)
    updateUIForRecording() {
        this.recordButton.classList.add('recording');
        this.recordButton.innerHTML = '<div class="stop-square-main"></div>';
        this.recordingInfo.classList.remove('hidden');
        this.statusText.classList.add('hidden');
        this.visualizer.classList.remove('hidden');
        this.cancelButton.classList.remove('hidden');
    }

    // STATE 3: Recording (after 3 seconds) - igual que recording
    updateUIForRecordingActive() {
        // Keep same as recording state
        this.statusText.classList.add('hidden');
    }

    // STATE 4: Transcribing (timer + texto, sin ondas, sin cancel)
    updateUIForTranscribing() {
        this.recordButton.classList.remove('recording');
        this.recordButton.classList.add('transcribing');
        this.recordButton.innerHTML = '<div class="spinner-custom-main"></div>';
        this.recordingInfo.classList.remove('hidden');
        this.statusText.textContent = 'Transcribing...';
        this.statusText.classList.remove('hidden');
        this.visualizer.classList.add('hidden');
        this.cancelButton.classList.add('hidden');
        
        // Initialize transcription progress tracking
        this.transcriptionStartTime = Date.now();
        this.transcriptionProgressInterval = null;
    }
    
    /**
     * Calculate estimated transcription time based on audio duration
     * Formula is adaptive: shorter audio = faster, longer audio = slower proportionally
     * Based on real-world experience: 20 min audio takes ~6 min to transcribe
     */
    calculateEstimatedTranscriptionTime(audioDurationSeconds) {
        if (!audioDurationSeconds || audioDurationSeconds <= 0) {
            return 60; // Default 1 minute
        }
        
        const minutes = audioDurationSeconds / 60;
        
        if (minutes < 3) {
            // Very short recordings: super fast (10-20 seconds)
            // Example: 1 min audio → ~15-20 seconds estimated
            return audioDurationSeconds * 0.25 + 10;
        } else if (minutes < 10) {
            // Medium recordings: fast (1-2 minutes)
            // Example: 5 min audio → ~1.5-2 minutes estimated
            return audioDurationSeconds * 0.3 + 20;
        } else {
            // Long recordings: moderate (proportional)
            // Example: 20 min audio → ~6 minutes estimated (0.3x)
            return audioDurationSeconds * 0.3 + 30;
        }
    }
    
    updateTranscriptionProgress(audioDuration) {
        if (!audioDuration || audioDuration <= 0) {
            return; // Can't calculate progress without audio duration
        }
        
        // Clear any existing interval
        if (this.transcriptionProgressInterval) {
            clearInterval(this.transcriptionProgressInterval);
        }
        
        // Check threshold: only show phases for audio >= PROGRESS_THRESHOLD_SECONDS
        if (audioDuration < this.PROGRESS_THRESHOLD_SECONDS) {
            // Short audio: keep simple "Transcribing..." message
            this.statusText.textContent = 'Transcribing...';
            return;
        }
        
        // Calculate estimated transcription time
        const estimatedTime = this.calculateEstimatedTranscriptionTime(audioDuration);
        const startTime = Date.now();
        this.transcriptionCompleted = false;
        
        console.log(`📊 Transcription progress: audio=${audioDuration.toFixed(1)}s, estimated=${estimatedTime.toFixed(1)}s`);
        
        // Start with "Uploading audio..."
        this.statusText.textContent = 'Uploading audio...';
        
        // Update phase display every 100ms based on elapsed time
        this.transcriptionProgressInterval = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000; // seconds elapsed
            const progressPercent = Math.min(95, (elapsed / estimatedTime) * 95);
            
            // Update phase based on progress percentage
            if (this.transcriptionCompleted) {
                // Done! Stop the interval
                this.stopTranscriptionProgress();
            } else if (progressPercent < 5) {
                // 0-5%: Uploading phase
                this.statusText.textContent = 'Uploading audio...';
            } else if (progressPercent < 85) {
                // 5-85%: Transcribing phase
                this.statusText.textContent = 'Transcribing...';
            } else {
                // 85-95%: Almost done phase
                this.statusText.textContent = 'Almost done...';
            }
        }, 100);
            }
            
    // Legacy method - kept for compatibility but no longer used
    // Phases are now calculated automatically based on elapsed time percentage
    setTranscriptionPhase(phase) {
        // phase: 'uploading', 'transcribing', 'almost_done', or 'completed'
        if (phase === 'completed') {
            this.transcriptionCompleted = true;
        } else {
            // Phases are now calculated automatically, but we keep this for compatibility
            this.transcriptionPhase = phase;
        }
    }
    
    stopTranscriptionProgress() {
        if (this.transcriptionProgressInterval) {
            clearInterval(this.transcriptionProgressInterval);
            this.transcriptionProgressInterval = null;
        }
        
        // Mark as completed
        this.transcriptionCompleted = true;
    }

    // Reset to idle state
    updateUIForIdle() {
        this.recordButton.classList.remove('recording', 'transcribing');
        this.recordButton.innerHTML = '<i class="ph ph-microphone"></i>';
        this.recordingInfo.classList.add('hidden');
        this.statusText.classList.add('hidden');
        this.visualizer.classList.add('hidden');
        this.cancelButton.classList.add('hidden');
        
        // Hide warning icon
        if (this.warningIcon) {
            this.warningIcon.classList.add('hidden');
        }
        
        // Stop transcription progress tracking
        this.stopTranscriptionProgress();
    }

    startTimer() {
        this.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            const seconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(seconds / 60); // For display only
            const displaySeconds = seconds % 60;
            
            // Calculate decimal minutes for accurate comparisons with fractional values
            const minutesDecimal = seconds / 60;
            
            this.timer.textContent = `${minutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
            
            // PROTECTION: Auto-stop if exceeds max time (backup to setTimeout)
            // This catches cases where setTimeout was paused (e.g., Mac sleep)
            if (minutesDecimal >= this.MAX_RECORDING_MINUTES) {
                console.error(`🛑 MAIN WINDOW AUTO-STOP: ${this.MAX_RECORDING_MINUTES} minutes exceeded`);
                if (this.recordingSource === 'main') {
                    this.stopRecording(); // Stop and transcribe
                }
                return;
            }
            
            // Visual warnings using timer color + icon + text
            // States: 00:00-05:00 (white) → 05:00-15:00 (gray + ⚠️) → 15:00-20:00 (pink + ⚠️)
            // Use minutesDecimal for accurate fractional minute comparisons
            if (minutesDecimal >= this.WARNING_AT_MINUTES) {
                // CRITICAL WARNING: Pink-gray + filled icon + "X min left" or "X sec left"
                if (this.warningIcon) {
                    this.warningIcon.innerHTML = '<i class="ph ph-warning-circle"></i>';
                    this.warningIcon.classList.remove('hidden');
                }
                if (this.statusText) {
                    const remainingMinutes = this.MAX_RECORDING_MINUTES - minutesDecimal;
                    // Show seconds if less than 1 minute remaining, otherwise show minutes
                    if (remainingMinutes < 1) {
                        const remainingSeconds = Math.ceil(remainingMinutes * 60);
                        this.statusText.textContent = `${remainingSeconds} sec left`;
                    } else {
                        const remainingMins = Math.ceil(remainingMinutes);
                        this.statusText.textContent = `${remainingMins} min left`;
                    }
                    this.statusText.classList.remove('hidden');
                    this.statusText.style.color = '#9B7482'; // Same color as timer
                }
                this.timer.style.color = '#9B7482'; // Pink-gray
                this.timer.style.fontWeight = ''; // No bold
            } else if (minutesDecimal >= this.LONG_RECORDING_MINUTES) {
                // LONG RECORDING: Gray + normal icon + "Long recording"
                if (this.warningIcon) {
                    this.warningIcon.innerHTML = '<i class="ph ph-warning"></i>';
                    this.warningIcon.classList.remove('hidden');
                }
                if (this.statusText) {
                    this.statusText.textContent = 'Long recording';
                    this.statusText.classList.remove('hidden');
                    this.statusText.style.color = ''; // Reset to default
                }
                this.timer.style.color = '#756168'; // Gray-brown
                this.timer.style.fontWeight = ''; // Normal
            } else {
                // NORMAL: White + no warning
                if (this.warningIcon) {
                    this.warningIcon.classList.add('hidden');
                }
                if (this.statusText) {
                    this.statusText.textContent = 'Recording';
                    this.statusText.style.color = ''; // Reset to default
                }
                this.timer.style.color = ''; // Default white
                this.timer.style.fontWeight = '';
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        // Don't reset timer - keep it frozen at current time
    }

    // Settings Panel Methods
    async openSettings() {
        console.log('⚙️ Opening settings panel');
        
        // Load current settings
        this.checkApiKeyStatus();
        
        // Wait for audio setting to load, then load stats if needed
        await this.loadAudioSaveSetting();
        
        // Load auto-hide widget setting
        await this.loadAutoHideWidgetSetting();
        
        // Load auto-paste setting
        await this.loadAutoPasteSetting();
        
        // Load sound effects setting
        await this.loadSoundEffectsSetting();
        
        // Load telemetry setting
        await this.loadTelemetrySetting();
        
        // Open with ModalManager
        this.modalManager.open('settings', { delay: 10 });
    }

    closeSettings() {
        console.log('⚙️ Closing settings panel');
        this.modalManager.close('settings');
    }
    
    openShortcuts() {
        console.log('⌨️ Opening shortcuts panel');
        this.modalManager.open('shortcuts', { delay: 10 });
    }
    
    closeShortcuts() {
        console.log('⌨️ Closing shortcuts panel');
        this.modalManager.close('shortcuts');
    }
    
    // ====================================
    // SHORTCUT LOADING & DISPLAY
    // ====================================
    
    /**
     * Fetch shortcut from backend
     * @returns {Promise<string>} Shortcut in Electron format or default
     */
    async fetchShortcutFromBackend() {
        try {
            // Use ShortcutManager instead of direct fetch
            const shortcut = await this.shortcuts.loadFromBackend();
            console.log('✅ Shortcut loaded via ShortcutManager:', shortcut);
            return shortcut;
        } catch (error) {
            console.error('Error loading shortcut from backend:', error);
            return this.SHORTCUT_CONSTANTS.DEFAULT_SHORTCUT;
        }
    }
    
    /**
     * Load shortcut from backend and update UI display
     */
    async loadCurrentShortcut() {
        const shortcut = await this.fetchShortcutFromBackend();
        this.updateShortcutDisplay(shortcut);
    }
    
    // ====================================
    // SHORTCUT MANAGEMENT
    // ====================================
    
    // Shortcut configuration constants
    get SHORTCUT_CONSTANTS() {
        return {
            DEFAULT_SHORTCUT: 'CommandOrControl+Shift+R',
            COPY_SHORTCUT: 'Command+Control+V',
            BACKEND_KEY: 'shortcuts.record_toggle',
            MAX_KEYS: 3,
            MODIFIERS: {
                DISPLAY: ['⌘', '⌃', '⌥', '⇧', '🌐'],
                ELECTRON: ['Command', 'Control', 'Alt', 'Shift', 'Fn'],
                KEY_NAMES: ['Meta', 'Control', 'Alt', 'Shift', 'Command', 'Fn']
            },
            SYMBOLS: {
                Fn: '🌐',
                CommandOrControl: '⌘',
                Command: '⌘',
                Control: '⌃',
                Alt: '⌥',
                Shift: '⇧',
                Space: 'Space',
                Up: '↑',
                Down: '↓',
                Left: '←',
                Right: '→'
            },
            ARROW_KEYS: {
                'ArrowUp': 'Up',
                'ArrowDown': 'Down',
                'ArrowLeft': 'Left',
                'ArrowRight': 'Right'
            }
        };
    }
    
    async openShortcutModal() {
        console.log('⌨️ Opening shortcut modal');
        
        // Load current shortcut from backend
        this.currentRecordingShortcut = await this.loadCurrentShortcutForModal();
        
        // Display current shortcut in human-readable format
        this.recordShortcutInput.value = this.formatShortcutDisplay(this.currentRecordingShortcut);
        
        // Clear error state
        this.clearShortcutError();
        
        // Show modal
        this.showModal(this.shortcutsModal);
    }
    
    /**
     * Load shortcut for modal (returns value, doesn't update display)
     * @returns {Promise<string>} Current shortcut from backend
     */
    async loadCurrentShortcutForModal() {
        return await this.fetchShortcutFromBackend();
    }
    
    clearShortcutError() {
        this.recordShortcutError.classList.remove('show');
        this.recordShortcutInput.classList.remove('error');
    }
    
    showShortcutError(message) {
        this.recordShortcutInput.classList.add('error');
        this.recordShortcutError.textContent = message;
        this.recordShortcutError.classList.add('show');
        this.currentRecordingShortcut = null;
    }
    
    showModal(modal) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.add('show');
            this.recordShortcutInput.focus();
        }, 10);
    }
    
    closeShortcutModal() {
        console.log('⌨️ Closing shortcut modal');
        this.shortcutsModal.classList.remove('show');
        setTimeout(() => {
            this.shortcutsModal.classList.add('hidden');
        }, 200);
    }
    
    captureShortcut(e) {
        console.log('🎹 Key event:', {
            key: e.key,
            code: e.code,
            altKey: e.altKey,
            metaKey: e.metaKey,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey
        });
        
        // Extract display keys (with symbols)
        const displayKeys = this.extractDisplayKeys(e);
        if (displayKeys.length === 0) return;
        
        // Validate basic requirements
        const basicValidation = this.validateBasicShortcut(displayKeys);
        if (!basicValidation.valid) {
            this.recordShortcutInput.value = displayKeys.join(' ');
            this.showShortcutError(basicValidation.error);
            return;
        }
        
        // Display with spaces between keys
        this.recordShortcutInput.value = displayKeys.join(' ');
        
        // Convert to Electron format and validate against system shortcuts
        const electronShortcut = this.convertToElectronFormat(e);
        const validation = this.validateShortcut(electronShortcut);
        
        if (!validation.valid) {
            this.showShortcutError(validation.error);
        } else {
            this.clearShortcutError();
            this.currentRecordingShortcut = electronShortcut;
        }
    }
    
    extractDisplayKeys(e) {
        const keys = [];
        
        // Capture modifiers with display symbols
        if (e.metaKey) keys.push('⌘');
        if (e.ctrlKey && !e.metaKey) keys.push('⌃');
        if (e.altKey) keys.push('⌥');
        if (e.shiftKey) keys.push('⇧');
        
        // Try to detect Fn
        if (e.getModifierState && e.getModifierState('Fn')) {
            keys.push('🌐');
        }
        
        // Capture main key
        const mainKey = this.extractMainKey(e);
        if (mainKey) {
            keys.push(mainKey);
        }
        
        return keys;
    }
    
    extractMainKey(e) {
        // Use e.code when Alt is pressed to avoid special characters
        let mainKey;
        if (e.altKey && e.code && e.code.startsWith('Key')) {
            mainKey = e.code.replace('Key', '');
        } else if (e.altKey && e.code === 'Space') {
            mainKey = ' ';
        } else {
            mainKey = e.key;
        }
        
        // Ignore modifier keys themselves
        if (this.SHORTCUT_CONSTANTS.MODIFIERS.KEY_NAMES.includes(mainKey)) {
            return null;
        }
        
        // Map special keys to display symbols
        if (mainKey === ' ') return 'Space';
        if (this.SHORTCUT_CONSTANTS.ARROW_KEYS[mainKey]) {
            return this.SHORTCUT_CONSTANTS.SYMBOLS[this.SHORTCUT_CONSTANTS.ARROW_KEYS[mainKey]];
        }
        
        return mainKey.toUpperCase();
    }
    
    validateBasicShortcut(keys) {
        const modifiers = this.SHORTCUT_CONSTANTS.MODIFIERS.DISPLAY;
        const hasMainKey = keys.some(key => !modifiers.includes(key));
        
        // Electron requires at least one main key (except for Fn alone)
        if (!hasMainKey && keys[0] !== '🌐') {
            return {
                valid: false,
                error: 'You must include a key with your modifiers (like R, A, Space, etc). Electron does not support modifier-only shortcuts.'
            };
        }
        
        // Has main key - check it has at least one modifier
        if (keys.length === 1 && keys[0] !== '🌐') {
            return {
                valid: false,
                error: 'You must include at least one modifier key (⌘, ⌃, ⌥, or ⇧) with this key.'
            };
        }
        
        return { valid: true };
    }
    
    convertToElectronFormat(e) {
        const keys = [];
        
        // Add Fn first if present
        if (e.getModifierState && e.getModifierState('Fn')) {
            keys.push('Fn');
        }
        
        // Map modifiers to Electron format
        if (e.metaKey) keys.push('Command');
        if (e.ctrlKey && !e.metaKey) keys.push('Control');
        if (e.altKey) keys.push('Alt');
        if (e.shiftKey) keys.push('Shift');
        
        // Add main key in Electron format
        const mainKey = this.convertMainKeyToElectronFormat(e);
        if (mainKey) {
            keys.push(mainKey);
        }
        
        return keys.join('+');
    }
    
    convertMainKeyToElectronFormat(e) {
        // Use e.code when Alt is pressed to get physical key
        let rawKey;
        if (e.altKey && e.code && e.code.startsWith('Key')) {
            rawKey = e.code.replace('Key', '');
        } else if (e.altKey && e.code === 'Space') {
            rawKey = ' ';
        } else {
            rawKey = e.key;
        }
        
        // Ignore modifier keys
        if (this.SHORTCUT_CONSTANTS.MODIFIERS.KEY_NAMES.includes(rawKey)) {
            return null;
        }
        
        // Map special keys
        if (rawKey === ' ') return 'Space';
        if (this.SHORTCUT_CONSTANTS.ARROW_KEYS[rawKey]) {
            return this.SHORTCUT_CONSTANTS.ARROW_KEYS[rawKey];
        }
        
        return rawKey.toUpperCase();
    }
    
    validateShortcut(shortcut) {
        // Check max keys
        const keyCount = shortcut.split('+').length;
        if (keyCount > this.SHORTCUT_CONSTANTS.MAX_KEYS) {
            return {
                valid: false,
                error: `Too many keys (${keyCount} detected, max ${this.SHORTCUT_CONSTANTS.MAX_KEYS}). Try: Control+Option+R, Command+Shift+Space.`
            };
        }
        
        // Check conflict with app shortcuts
        if (shortcut === this.SHORTCUT_CONSTANTS.COPY_SHORTCUT) {
            return {
                valid: false,
                error: 'This shortcut is used for "Copy Latest Transcription"'
            };
        }
        
        // Check forbidden system shortcuts
        if (this.isForbiddenShortcut(shortcut)) {
            return {
                valid: false,
                error: 'This shortcut is reserved by macOS. Try Control+Option, Command+Shift, or different modifiers.'
            };
        }
        
        // Check problematic combinations
        const problematic = ['Command+Control', 'Control+Command'];
        if (problematic.includes(shortcut)) {
            return {
                valid: false,
                error: 'Command+Control combination does not work reliably. Try Control+Option or Command+Shift with a key.'
            };
        }
        
        return { valid: true };
    }
    
    isForbiddenShortcut(shortcut) {
        const forbidden = [
            // Common Cmd shortcuts
            'Command+C', 'Command+V', 'Command+X', 'Command+Z', 'Command+Shift+Z',
            'Command+A', 'Command+Q', 'Command+W', 'Command+R', 'Command+T',
            'Command+S', 'Command+P', 'Command+N', 'Command+M', 'Command+H',
            'Command+F', 'Command+G', 'Command+Shift+G', 'Command+,',
            
            // Navigation & Control
            'Command+Up', 'Command+Down', 'Command+Left', 'Command+Right',
            'Command+Shift+Up', 'Command+Shift+Down', 
            'Command+Shift+Left', 'Command+Shift+Right',
            'Command+Control+F', 'Command+Space', 'Command+Alt+Space',
            'Command+Shift+3', 'Command+Shift+4', 'Command+Shift+5',
            'Command+Alt+Esc', 'Command+Alt+D', 'Command+Delete',
            'Command+Shift+Delete', 'Command+Shift+Q',
            
            // Browser & Editor
            'Command+B', 'Command+I', 'Command+U', 'Command+Shift+T',
            'Command+=', 'Command+-', 'Command+Alt+F', 'Command+Shift+F',
            
            // Function keys & System
            'Fn+F11', 'Fn+F12', 'Command+Tab', 'Alt+Tab', 'Control+Alt+Delete'
        ];
        
        return forbidden.includes(shortcut);
    }
    
    formatShortcutDisplay(electronShortcut) {
        // Convert Electron format to human-readable with symbols
        let display = electronShortcut;
        
        // Replace each modifier/key with its symbol
        Object.entries(this.SHORTCUT_CONSTANTS.SYMBOLS).forEach(([key, symbol]) => {
            display = display.replace(new RegExp(key, 'g'), symbol);
        });
        
        // Replace + with spaces
        return display.replace(/\+/g, ' ');
    }
    
    async saveShortcutChanges() {
        if (!this.currentRecordingShortcut) {
            this.showToast('Please enter a valid shortcut', 'error');
            return;
        }
        
        try {
            // Use ShortcutManager instead of direct fetch
            await this.shortcuts.save(this.currentRecordingShortcut);
            console.log('✅ Shortcut saved via ShortcutManager:', this.currentRecordingShortcut);
            
            // Update display in shortcuts panel
            this.updateShortcutDisplay(this.currentRecordingShortcut);
            
            // Re-register shortcut in Electron
            if (window.electronAPI && window.electronAPI.updateShortcut) {
                await window.electronAPI.updateShortcut('record_toggle', this.currentRecordingShortcut);
            }
            
            // Close modal
            this.closeShortcutModal();
            
            // Show success message
            this.showToast('Recording shortcut updated successfully', 'success');
            
        } catch (error) {
            console.error('Error saving shortcut:', error);
            this.showToast('Failed to save shortcut. Please try again.', 'error');
        }
    }
    
    updateShortcutDisplay(electronShortcut) {
        // Verify element exists before updating
        if (!this.recordShortcutDisplay) {
            console.error('Shortcut display element not found');
            return;
        }
        
        const isMac = window.electronAPI?.platform === 'darwin';
        
        // Convert Electron format to display symbols
        const keys = electronShortcut
            .replace('CommandOrControl', isMac ? 'Command' : 'Control')
            .split('+');
        
        const symbols = keys.map(key => {
            switch(key) {
                case 'Command': return '⌘';
                case 'Control': return '⌃';
                case 'Alt': return '⌥';
                case 'Option': return '⌥';
                case 'Shift': return '⇧';
                default: return key;
            }
        });
        
        // Clear and rebuild display
        this.recordShortcutDisplay.innerHTML = '';
        symbols.forEach(symbol => {
            const span = document.createElement('span');
            span.className = 'key';
            span.textContent = symbol;
            this.recordShortcutDisplay.appendChild(span);
        });
    }

    // Dictionary Panel Methods
    async openDictionary() {
        console.log('📖 Opening dictionary panel');
        this.dictionaryOverlay.classList.remove('hidden');
        setTimeout(() => {
            this.dictionaryOverlay.classList.add('show');
        }, 10);
        
        // Load dictionary words
        await this.loadDictionaryWords();
    }
    
    closeDictionary() {
        console.log('📖 Closing dictionary panel');
        this.dictionaryOverlay.classList.remove('show');
        setTimeout(() => {
            this.dictionaryOverlay.classList.add('hidden');
        }, 300);
    }
    
    openWordModal(wordId = null, wordText = '') {
        console.log('📝 Opening word modal');
        this.currentEditingWordId = wordId;
        
        if (wordId) {
            // Edit mode
            this.wordModalTitle.textContent = 'Edit word';
            this.submitWordText.textContent = 'Save';
            this.wordInput.value = wordText;
        } else {
            // Add mode
            this.wordModalTitle.textContent = 'Add word';
            this.submitWordText.textContent = 'Add word';
            this.wordInput.value = '';
        }
        
        this.wordModal.classList.remove('hidden');
        setTimeout(() => {
            this.wordModal.classList.add('show');
            this.wordInput.focus();
        }, 10);
    }
    
    closeWordModalFunc() {
        console.log('📝 Closing word modal');
        this.wordModal.classList.remove('show');
        setTimeout(() => {
            this.wordModal.classList.add('hidden');
            this.wordInput.value = '';
            this.currentEditingWordId = null;
        }, 300);
    }
    
    async loadDictionaryWords() {
        try {
            await this.dictionary.load();
            console.log('📖 Dictionary loaded via DictionaryManager:', this.dictionary.getWordCount(), 'words');
            
            // Render with callbacks for edit and delete
            this.dictionary.render(
                (wordId, wordText) => this.openWordModal(wordId, wordText),
                (wordId, wordText) => this.handleDeleteWord(wordId, wordText)
            );
        } catch (error) {
            console.error('❌ Error loading dictionary words:', error);
        }
    }
    
    
    async addWord() {
        const word = this.wordInput.value.trim();
        
        if (!word) {
            this.showToast('Please enter a word', 'error');
            return;
        }
        
        this.submitWord.disabled = true;
        this.submitWordText.textContent = 'Adding...';
        
        try {
            await this.dictionary.add(word, true);
            console.log('✅ Word added via DictionaryManager:', word);
                this.showToast(`Added "${word}" to dictionary`);
                this.closeWordModalFunc();
            
            // Re-render the list
            this.dictionary.render(
                (wordId, wordText) => this.openWordModal(wordId, wordText),
                (wordId, wordText) => this.handleDeleteWord(wordId, wordText)
            );
        } catch (error) {
            console.error('❌ Error adding word:', error);
            this.showToast(error.message || 'Failed to add word', 'error');
        } finally {
            this.submitWord.disabled = false;
            this.submitWordText.textContent = 'Add word';
        }
    }
    
    async updateWord() {
        const word = this.wordInput.value.trim();
        
        if (!word) {
            this.showToast('Please enter a word', 'error');
            return;
        }
        
        this.submitWord.disabled = true;
        this.submitWordText.textContent = 'Saving...';
        
        try {
            await this.dictionary.update(this.currentEditingWordId, word, true);
            console.log('✅ Word updated via DictionaryManager:', word);
                this.showToast(`Updated to "${word}"`);
                this.closeWordModalFunc();
            
            // Re-render the list
            this.dictionary.render(
                (wordId, wordText) => this.openWordModal(wordId, wordText),
                (wordId, wordText) => this.handleDeleteWord(wordId, wordText)
            );
        } catch (error) {
            console.error('❌ Error updating word:', error);
            this.showToast(error.message || 'Failed to update word', 'error');
        } finally {
            this.submitWord.disabled = false;
            this.submitWordText.textContent = 'Save';
        }
    }
    
    handleDeleteWord(wordId, wordText) {
        // Show confirm modal and handle deletion
        this.showConfirm(
            `Delete "${wordText}" from dictionary?`,
            'This action cannot be undone.',
            async () => {
                try {
                    await this.dictionary.deleteConfirmed(wordId, wordText);
                    console.log('✅ Word deleted via DictionaryManager:', wordText);
                this.showToast(`Deleted "${wordText}"`);
                    
                    // Re-render the list
                    this.dictionary.render(
                        (wordId, wordText) => this.openWordModal(wordId, wordText),
                        (wordId, wordText) => this.handleDeleteWord(wordId, wordText)
                    );
        } catch (error) {
            console.error('❌ Error deleting word:', error);
                    this.showToast(error.message || 'Error deleting word', 'error');
        }
            }
        );
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    showToast(message, type = 'success') {
        // Get or create toast container
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        // Icon based on type
        const iconClass = type === 'error' ? 'ph-warning-circle' : 'ph-check-circle';
        
        // Build toast HTML
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="ph ${iconClass}"></i>
            </div>
            <div class="toast-message">${this.escapeHtml(message)}</div>
        `;
        
        // Add to container
        container.appendChild(toast);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 200); // Match animation duration
        }, 3000);
    }

    async checkApiKeyStatus() {
        try {
            console.log('🔍 Checking API Key status...');
            const response = await fetch(`${this.backendUrl}/api/config/api-key`);
            console.log('🔍 Response status:', response.status);
            
            if (response.ok) {
                const data = await response.json();
                console.log('🔍 API Key status data:', data);
                
                // Update hasApiKey state
                this.hasApiKey = data.has_api_key;
                
                if (data.has_api_key) {
                    console.log('✅ Has API Key - showing configured state');
                    // Show configured state
                    this.apiKeySettingItem.classList.add('hidden');
                    this.apiKeyConfiguredItem.classList.remove('hidden');
                    this.apiKeyDisplay.textContent = data.api_key_masked;
                    // Enable recording buttons
                    this.enableRecordingButtons();
                } else {
                    console.log('❌ No API Key - showing add state');
                    // Show add state
                    this.apiKeySettingItem.classList.remove('hidden');
                    this.apiKeyConfiguredItem.classList.add('hidden');
                    // Disable recording buttons
                    this.disableRecordingButtons();
                }
            } else {
                console.warn('⚠️ Failed to check API key status:', response.status);
            }
        } catch (error) {
            console.error('❌ Error checking API key status:', error);
        }
    }
    
    enableRecordingButtons() {
        if (this.recordButton) {
            this.recordButton.disabled = false;
            this.recordButton.style.opacity = '1';
            this.recordButton.style.cursor = 'pointer';
            this.recordButton.removeAttribute('title');
        }
    }
    
    disableRecordingButtons() {
        if (this.recordButton) {
            this.recordButton.disabled = true;
            this.recordButton.style.opacity = '0.4';
            this.recordButton.style.cursor = 'not-allowed';
            this.recordButton.setAttribute('title', 'Add your API key');
        }
    }

    // API Key Modal Methods
    async openApiKeyModal() {
        console.log('🔑 Opening API Key modal');
        
        if (!this.apiKeyModal) {
            console.error('❌ API Key modal element not found!');
            return;
        }
        
        // Close any active alert modal first (prevents z-index conflicts)
        if (this.alertModal && !this.alertModal.classList.contains('hidden')) {
            this.closeAlert();
            // Wait for alert to close before opening API key modal
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        
        // Check if there's already an API key
        try {
            const response = await fetch(`${this.backendUrl}/api/config/api-key`);
            const data = await response.json();
            
            if (data.has_api_key) {
                // CHANGE mode: show current key
                this.apiKeyModalTitle.textContent = 'API Key';
                this.apiKeyInputLabel.textContent = 'New API Key:';
                this.submitApiKeyText.textContent = 'Change';
                this.currentApiKeyValue.textContent = data.api_key_masked;
                this.currentApiKeySection.classList.remove('hidden');
            } else {
                // ADD mode: first time
                this.apiKeyModalTitle.textContent = 'Add API Key';
                this.apiKeyInputLabel.textContent = 'Enter your OpenAI API Key';
                this.submitApiKeyText.textContent = 'Save API Key';
                this.currentApiKeySection.classList.add('hidden');
            }
        } catch (error) {
            console.error('❌ Error checking API key:', error);
            // Default to ADD mode on error
            this.apiKeyModalTitle.textContent = 'Add API Key';
            this.apiKeyInputLabel.textContent = 'Enter your OpenAI API Key';
            this.submitApiKeyText.textContent = 'Save API Key';
            this.currentApiKeySection.classList.add('hidden');
        }
        
        // Clear input and open modal
        this.apiKeyInput.value = '';
        this.apiKeyModal.classList.remove('hidden');
        setTimeout(() => {
            this.apiKeyModal.classList.add('show');
            if (this.apiKeyInput) {
                this.apiKeyInput.focus();
            }
        }, 10);
    }

    closeApiKeyModal() {
        console.log('🔑 Closing API Key modal');
        this.apiKeyModal.classList.remove('show');
        setTimeout(() => {
            this.apiKeyModal.classList.add('hidden');
            this.apiKeyInput.value = '';
        }, 200);
    }

    async saveApiKey() {
        const apiKey = this.apiKeyInput.value.trim();
        
        if (!apiKey) {
            this.showAlert('warning', 'Empty Field', 'Please enter an API Key');
            return;
        }
        
        // Validate format
        if (!apiKey.startsWith('sk-')) {
            this.showAlert('error', 'Invalid Format', 'OpenAI keys start with "sk-". Please check your key.');
            return;
        }
        
        try {
            this.submitApiKey.disabled = true;
            this.submitApiKeyText.textContent = 'Validating...';

            console.log('🔑 Sending API Key to backend for validation...');
            const response = await fetch(`${this.backendUrl}/api/config/api-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey })
            });

            const result = await response.json();
            console.log('🔑 Backend response:', result);
            
            if (response.ok) {
                console.log('✅ API Key saved successfully', result);
                this.closeApiKeyModal();
                await this.checkApiKeyStatus();
                
                // Notify widget about API key change
                if (window.electronAPI && window.electronAPI.syncRecordingState) {
                    await window.electronAPI.syncRecordingState('api_key_added');
                }
                
                // Refresh empty state message
                this.loadTranscriptionHistory();
                this.showAlert('success', 'Success', 'API Key saved and validated successfully!');
            } else {
                console.error('❌ API Key validation failed:', result);
                const errorDetails = result.validation?.details || result.error || 'Invalid API Key';
                this.showAlert('error', 'Validation Failed', `${errorDetails}. Please check your API Key and try again.`);
            }
        } catch (error) {
            console.error('❌ Error saving API Key:', error);
            this.showAlert('error', 'Network Error', 'Please check your connection and try again.');
        } finally {
            this.submitApiKey.disabled = false;
            this.submitApiKeyText.textContent = 'Add API Key';
        }
    }
    
    openRemoveApiKeyModal() {
        console.log('🗑️ Opening Remove API Key confirmation modal');
        this.removeApiKeyModal.classList.remove('hidden');
        setTimeout(() => {
            this.removeApiKeyModal.classList.add('show');
        }, 10);
    }
    
    closeRemoveApiKeyModal() {
        console.log('🗑️ Closing Remove API Key confirmation modal');
        this.removeApiKeyModal.classList.remove('show');
        setTimeout(() => {
            this.removeApiKeyModal.classList.add('hidden');
        }, 200);
    }
    
    openClearAudioModal() {
        console.log('🗑️ Opening Clear Audio confirmation modal');
        this.clearAudioModal.classList.remove('hidden');
        setTimeout(() => {
            this.clearAudioModal.classList.add('show');
        }, 10);
    }
    
    closeClearAudioModalHandler() {
        console.log('🗑️ Closing Clear Audio confirmation modal');
        this.clearAudioModal.classList.remove('show');
        setTimeout(() => {
            this.clearAudioModal.classList.add('hidden');
        }, 200);
    }
    
    async removeApiKey() {
        try {
            console.log('🗑️ Removing API Key...');
            const response = await fetch(`${this.backendUrl}/api/config/api-key`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                console.log('✅ API Key removed successfully');
                this.closeRemoveApiKeyModal();
                await this.checkApiKeyStatus();
                
                // Notify widget about API key removal
                if (window.electronAPI && window.electronAPI.syncRecordingState) {
                    await window.electronAPI.syncRecordingState('api_key_removed');
                }
                
                // Refresh empty state message
                this.loadTranscriptionHistory();
                this.showToast('API Key removed successfully', 'success');
            } else {
                const result = await response.json();
                console.error('❌ Failed to remove API Key:', result);
                this.showToast(result.error || 'Failed to remove API Key', 'error');
            }
        } catch (error) {
            console.error('❌ Error removing API Key:', error);
            this.showToast('Error removing API Key', 'error');
        }
    }
    
    // Alert Modal Methods
    showAlert(type, title, message) {
        if (!this.alertModal) return;
        
        // Icon configurations
        const iconConfig = {
            success: { icon: 'ph-check-circle', class: 'success' },
            error: { icon: 'ph-warning-circle', class: 'error' },
            warning: { icon: 'ph-warning', class: 'warning' },
            info: { icon: 'ph-info', class: 'info' }
        };
        
        const config = iconConfig[type] || iconConfig.info;
        
        // Update icon
        this.alertIcon.className = `alert-icon ${config.class}`;
        this.alertIcon.querySelector('i').className = `ph ${config.icon}`;
        
        // Update content
        this.alertTitle.textContent = title;
        this.alertMessage.textContent = message;
        
        // Show modal
        this.alertModal.classList.remove('hidden');
        setTimeout(() => {
            this.alertModal.classList.add('show');
        }, 10);
    }
    
    closeAlert() {
        if (!this.alertModal) return;
        
        this.alertModal.classList.remove('show');
        setTimeout(() => {
            this.alertModal.classList.add('hidden');
        }, 200);
    }
    
    showConfirm(title, message, onConfirm) {
        if (!this.confirmModal) return;
        
        // Update content
        this.confirmTitle.textContent = title;
        this.confirmMessage.textContent = message;
        
        // Store callback
        this.confirmCallback = onConfirm;
        
        // Show modal
        this.confirmModal.classList.remove('hidden');
        setTimeout(() => {
            this.confirmModal.classList.add('show');
        }, 10);
    }
    
    closeConfirm(confirmed) {
        if (!this.confirmModal) return;
        
        this.confirmModal.classList.remove('show');
        setTimeout(() => {
            this.confirmModal.classList.add('hidden');
            
            // Call callback if confirmed
            if (confirmed && this.confirmCallback) {
                this.confirmCallback();
            }
            
            this.confirmCallback = null;
        }, 200);
    }

    // Load Audio Save Setting
    async loadAudioSaveSetting() {
        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/audio_settings.save_audio_files`);
            if (response.ok) {
                const data = await response.json();
                const isEnabled = data.value !== false; // Default to true if undefined
                console.log('💾 Current audio save setting:', isEnabled);
                this.saveAudioToggle.checked = isEnabled;
                
                // Load stats only if enabled (loadStorageStats handles showing/hiding)
                if (isEnabled) {
                    await this.loadStorageStats();
                } else {
                    // Make sure section is hidden if disabled
                    this.audioStorageSection.classList.add('hidden');
                }
            }
        } catch (error) {
            console.error('❌ Error loading audio save setting:', error);
            // Default to checked on error and try to load stats
            this.saveAudioToggle.checked = true;
            await this.loadStorageStats();
        }
    }

    // Save Audio Toggle Method
    async toggleSaveAudio() {
        const isEnabled = this.saveAudioToggle.checked;
        console.log('💾 Save Audio Files:', isEnabled ? 'Enabled' : 'Disabled');
        
        try {
            // Use APIClient instead of direct fetch
            const result = await this.api.updateSetting('audio_settings.save_audio_files', isEnabled);
            console.log('✅ Audio save preference updated via APIClient:', result);
            
            // Show/hide storage section
            if (isEnabled) {
                this.audioStorageSection.classList.remove('hidden');
                this.loadStorageStats();
            } else {
                this.audioStorageSection.classList.add('hidden');
            }
        } catch (error) {
            console.error('❌ Error updating audio save preference:', error);
            // Revert toggle on error
            this.saveAudioToggle.checked = !isEnabled;
        }
    }

    // Auto-hide Widget Toggle Method
    async toggleAutoHideWidget() {
        const isEnabled = this.autoHideWidgetToggle.checked;
        console.log('🪟 Auto-hide widget:', isEnabled ? 'Enabled' : 'Disabled');
        
        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/ui_settings.auto_hide_widget`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: isEnabled })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Auto-hide widget preference updated:', result);
                
                // Notify Electron main process to update widget visibility
                if (window.electronAPI && window.electronAPI.setAutoHideWidget) {
                    window.electronAPI.setAutoHideWidget(isEnabled);
                }
            } else {
                console.error('❌ Failed to update auto-hide widget preference');
                // Revert toggle on error
                this.autoHideWidgetToggle.checked = !isEnabled;
            }
        } catch (error) {
            console.error('❌ Error updating auto-hide widget preference:', error);
            // Revert toggle on error
            this.autoHideWidgetToggle.checked = !isEnabled;
        }
    }

    // Load auto-hide widget setting
    async loadAutoHideWidgetSetting() {
        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/ui_settings.auto_hide_widget`);
            if (response.ok) {
                const data = await response.json();
                const isEnabled = data.value || false;
                console.log('🪟 Current auto-hide widget setting:', isEnabled);
                this.autoHideWidgetToggle.checked = isEnabled;
                
                // Notify Electron on load
                if (window.electronAPI && window.electronAPI.setAutoHideWidget) {
                    window.electronAPI.setAutoHideWidget(isEnabled);
                }
            }
        } catch (error) {
            console.error('❌ Error loading auto-hide widget setting:', error);
            // Default to unchecked on error
            this.autoHideWidgetToggle.checked = false;
        }
    }

    // Auto-paste Toggle Method
    async toggleAutoPaste() {
        const isEnabled = this.autoPasteToggle.checked;
        console.log('📋 Auto-paste:', isEnabled ? 'Enabled' : 'Disabled');
        
        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/ui_settings.auto_paste`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: isEnabled })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Auto-paste preference updated:', result);
                
                // Track feature toggle
                await this.telemetry.track('feature_toggled', {
                    feature: 'auto_paste',
                    enabled: isEnabled,
                    platform: await this.getPlatform()
                });
                
                // Notify Electron main process to update setting
                if (window.electronAPI && window.electronAPI.setAutoPaste) {
                    window.electronAPI.setAutoPaste(isEnabled);
                }
            } else {
                console.error('❌ Failed to update auto-paste preference');
                // Revert toggle on error
                this.autoPasteToggle.checked = !isEnabled;
            }
        } catch (error) {
            console.error('❌ Error updating auto-paste preference:', error);
            // Revert toggle on error
            this.autoPasteToggle.checked = !isEnabled;
        }
    }

    // Toggle sound effects on/off
    async toggleSoundEffects() {
        const isEnabled = this.soundEffectsToggle.checked;
        console.log('🔊 Sound effects:', isEnabled ? 'Enabled' : 'Disabled');
        
        // Update SoundManager immediately (local feedback)
        if (window.soundManager) {
            soundManager.setEnabled(isEnabled);
        }
        
        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/ui_settings.sound_effects_enabled`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: isEnabled })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Sound effects preference updated:', result);
            } else {
                console.error('❌ Failed to update sound effects preference');
                // Revert toggle and soundManager on error
                this.soundEffectsToggle.checked = !isEnabled;
                if (window.soundManager) {
                    soundManager.setEnabled(!isEnabled);
                }
            }
        } catch (error) {
            console.error('❌ Error updating sound effects preference:', error);
            // Revert toggle and soundManager on error
            this.soundEffectsToggle.checked = !isEnabled;
            if (window.soundManager) {
                soundManager.setEnabled(!isEnabled);
            }
        }
    }
    
    // Toggle telemetry on/off
    async toggleTelemetry() {
        const isEnabled = this.telemetryToggle.checked;
        console.log('📊 Telemetry:', isEnabled ? 'Enabled' : 'Disabled');
        
        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/telemetry_enabled`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: isEnabled })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Telemetry preference updated:', result);
                
                // Update telemetry client state
                this.telemetry.setEnabled(isEnabled);
                
                // Show toast notification
                this.showToast(
                    isEnabled 
                        ? 'Anonymous usage data sharing enabled' 
                        : 'Anonymous usage data sharing disabled',
                    'success'
                );
            } else {
                console.error('❌ Failed to update telemetry preference');
                // Revert toggle on error
                this.telemetryToggle.checked = !isEnabled;
                this.showToast('Error updating preference', 'error');
            }
        } catch (error) {
            console.error('❌ Error updating telemetry preference:', error);
            // Revert toggle on error
            this.telemetryToggle.checked = !isEnabled;
            this.showToast('Error updating preference', 'error');
        }
    }
    
    // Show privacy policy
    showPrivacyPolicy() {
        // Open privacy policy in external browser
        if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal('https://pixelspace.com/stories/data-privacy.html');
        } else {
            // Fallback: Open in new window
            window.open('https://pixelspace.com/stories/data-privacy.html', '_blank');
        }
    }

    // Load sound effects setting
    async loadSoundEffectsSetting() {
        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/ui_settings.sound_effects_enabled`);
            if (response.ok) {
                const data = await response.json();
                const isEnabled = data.value || false;
                console.log('🔊 Current sound effects setting:', isEnabled);
                this.soundEffectsToggle.checked = isEnabled;
                
                // Update SoundManager
                if (window.soundManager) {
                    soundManager.setEnabled(isEnabled);
                }
            } else {
                console.log('⚠️ Could not load sound effects setting, using default (disabled)');
            }
        } catch (error) {
            console.error('❌ Error loading sound effects setting:', error);
        }
    }

    // Load auto-paste setting
    async loadAutoPasteSetting() {
        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/ui_settings.auto_paste`);
            if (response.ok) {
                const data = await response.json();
                const isEnabled = data.value || false;
                console.log('📋 Current auto-paste setting:', isEnabled);
                this.autoPasteToggle.checked = isEnabled;
                
                // Notify Electron on load
                if (window.electronAPI && window.electronAPI.setAutoPaste) {
                    window.electronAPI.setAutoPaste(isEnabled);
                }
            }
        } catch (error) {
            console.error('❌ Error loading auto-paste setting:', error);
            // Default to unchecked on error
            this.autoPasteToggle.checked = false;
        }
    }
    
    // Load telemetry setting
    async loadTelemetrySetting() {
        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/telemetry_enabled`);
            if (response.ok) {
                const data = await response.json();
                const isEnabled = data.value !== false; // Default to true
                console.log('📊 Current telemetry setting:', isEnabled);
                this.telemetryToggle.checked = isEnabled;
            } else {
                console.log('⚠️ Could not load telemetry setting, using default (enabled)');
                this.telemetryToggle.checked = true;
            }
        } catch (error) {
            console.error('❌ Error loading telemetry setting:', error);
            // Default to enabled on error
            this.telemetryToggle.checked = true;
        }
    }

    // Load Storage Stats
    async loadStorageStats() {
        try {
            const response = await fetch(`${this.backendUrl}/api/audio/stats`);
            if (response.ok) {
                const data = await response.json();
                const sizeInMB = data.total_size_mb || 0;
                const fileCount = data.total_files || 0;
                
                console.log('📊 Storage stats loaded:', data);
                
                // Check if Save Audio toggle is ON
                const saveAudioEnabled = this.saveAudioToggle && this.saveAudioToggle.checked;
                
                if (saveAudioEnabled && fileCount > 0) {
                    // Show section and all elements when toggle is ON AND has files
                    this.audioStorageSection.classList.remove('hidden');
                    this.openAudioFolderButton.classList.remove('hidden');
                    this.storageSeparator.classList.remove('hidden');
                    this.storageStatsText.classList.remove('hidden');
                    this.storageStatsText.textContent = `Storage: ${sizeInMB.toFixed(1)} MB (${fileCount} file${fileCount !== 1 ? 's' : ''})`;
                    this.cleanupAudioButton.classList.remove('hidden');
                } else {
                    // Hide entire section when toggle is OFF OR no files
                    this.audioStorageSection.classList.add('hidden');
                }
            } else {
                console.error('❌ Failed to load storage stats');
                // Hide section on error
                this.audioStorageSection.classList.add('hidden');
            }
        } catch (error) {
            console.error('❌ Error loading storage stats:', error);
            // Hide section on error
            this.audioStorageSection.classList.add('hidden');
        }
    }

    // Cleanup Old Audio Files
    async cleanupOldAudioFiles() {
        // Close the confirmation modal
        this.closeClearAudioModalHandler();
        
        // Disable button during cleanup
        this.cleanupAudioButton.disabled = true;
        this.cleanupAudioButton.style.opacity = '0.5';
        
        try {
            const response = await fetch(`${this.backendUrl}/api/audio/cleanup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days_old: 0, keep_failed: false }) // Delete ALL files including failed
            });
            
            if (response.ok) {
                const data = await response.json();
                const deletedCount = data.deleted_count || 0;
                
                console.log('✅ Cleanup completed:', data);
                this.showToast(`Deleted ${deletedCount} audio file${deletedCount !== 1 ? 's' : ''}`);
                
                // Reload stats (this will hide the section if no files remain)
                this.loadStorageStats();
                
                // Reload transcriptions to update download buttons (audio_id now NULL)
                this.loadTranscriptionHistory();
            } else {
                console.error('❌ Failed to cleanup audio files');
                this.showToast('Failed to clear files', 'error');
            }
        } catch (error) {
            console.error('❌ Error cleaning up audio files:', error);
            this.showToast('Error clearing files', 'error');
        } finally {
            // Re-enable button
            this.cleanupAudioButton.disabled = false;
            this.cleanupAudioButton.style.opacity = '1';
        }
    }

    setupWidgetSync() {
        if (window.electronAPI && window.electronAPI.onSyncRecordingState) {
        const appInstance = this;
        
            window.electronAPI.onSyncRecordingState(async function(event, message) {
                // Sync message received
                
                if (message === 'transcription_completed') {
                    await appInstance.loadTranscriptionHistory();
                }
            });
        }
    }

    setupRecordingSync() {
        if (window.electronAPI && window.electronAPI.onSyncRecordingState) {
            const appInstance = this;
            
            window.electronAPI.onSyncRecordingState(function(event, message) {
                console.log('🔄 Recording sync:', message);
                
                if (message === 'request_stop_main_recording') {
                    appInstance.stopRecording();
                } else if (message === 'request_cancel_main_recording') {
                    appInstance.cancelRecording();
                } else if (message === 'widget_recording_started') {
                    appInstance.recordingSource = 'widget';
                    appInstance.isRecording = true;
                    appInstance.updateUIForRecording();
                    appInstance.startTimer();
                    // After 3 seconds, hide "recording" text
                    setTimeout(() => {
                        if (appInstance.isRecording) {
                            appInstance.updateUIForRecordingActive();
                        }
                    }, 3000);
                } else if (message === 'widget_recording_stopped') {
                    appInstance.recordingSource = null;
                    appInstance.isRecording = false;
                    appInstance.updateUIForTranscribing();
                    appInstance.stopTimer();
                    
                    // Start transcription progress tracking (calculate from elapsed time)
                    const audioDurationSeconds = appInstance.startTime ? (Date.now() - appInstance.startTime) / 1000 : 0;
                    
                    if (audioDurationSeconds > 0) {
                        appInstance.updateTranscriptionProgress(audioDurationSeconds);
                        
                        // If showing phases, simulate phase progression
                        if (audioDurationSeconds >= appInstance.PROGRESS_THRESHOLD_SECONDS) {
                            // Stage 2: Transcribing (after 500ms)
                            setTimeout(() => {
                                if (appInstance.transcriptionPhase) {
                                    appInstance.setTranscriptionPhase('transcribing');
                                }
                            }, 500);
                            
                            // Stage 3: Almost done (after 2s)
                            setTimeout(() => {
                                if (appInstance.transcriptionPhase && appInstance.transcriptionPhase !== 'completed') {
                                    appInstance.setTranscriptionPhase('almost_done');
                                }
                            }, 2000);
                        }
                    }
                } else if (message === 'transcription_completed') {
                    // Widget finished transcribing
                    // Mark progress as completed (this will stop the interval)
                    if (appInstance.transcriptionPhase) {
                        appInstance.setTranscriptionPhase('completed');
                    }
                    
                    // Reset UI to idle
                    appInstance.updateUIForIdle();
                    appInstance.loadTranscriptionHistory();
                    
                    // Play transcription ready sound
                    if (window.soundManager) {
                        soundManager.playTranscriptionReady();
                    }
                } else if (message === 'transcription_timeout') {
                    // Widget transcription timed out
                    appInstance.updateUIForIdle();
                    appInstance.showAlert('error', 'Taking Longer Than Expected', 'Your audio is saved. Check the history and click Retry to try again.');
                    appInstance.loadTranscriptionHistory();
                } else if (message === 'widget_recording_cancelled') {
                    appInstance.recordingSource = null;
                    appInstance.isRecording = false;
                    appInstance.stopTimer();
                    appInstance.updateUIForIdle();
                } else if (message === 'widget_force_stopped') {
                    // Widget was force-stopped (timeout, sleep, or manual)
                    // Depending on the reason, it may have transcribed or cancelled
                    appInstance.recordingSource = null;
                    appInstance.isRecording = false;
                    appInstance.stopTimer();
                    // Show transcribing state first (in case it's transcribing)
                    // If it was cancelled, the widget will send widget_recording_cancelled next
                    appInstance.updateUIForTranscribing();
                    console.log('⚠️ Widget force-stopped, checking if transcription follows...');
                } else if (message === 'play_sound_record_start') {
                    // Widget (or shortcut) requested to play record start sound
                    if (window.soundManager) {
                        soundManager.playRecordStart();
                    }
                } else if (message === 'play_sound_record_stop') {
                    // Widget (or shortcut) requested to play record stop sound
                    if (window.soundManager) {
                        soundManager.playRecordStop();
                    }
                } else if (message === 'api_key_required') {
                    // Widget attempted to record without API key
                    console.warn('⚠️ Widget blocked: No API Key configured');
                    appInstance.showAlert('warning', 'API Key Required', 'Please add your OpenAI API Key in Settings before recording.');
                } else if (message === 'api_key_added') {
                    // API key was added successfully, refresh status
                    console.log('🔑 API Key added, refreshing status...');
                    appInstance.checkApiKeyStatus();
                }
            });
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new VoiceToTextApp();
});