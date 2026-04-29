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
        this.isRecordingPaused = false;
        this.isAgentMuted = false;
        this._pausedElapsed = 0;   // accumulated seconds before current pause
        this._resumeTime = null;   // Date.now() when last resumed/started

        // Fluid Transcription
        this.fluidTranscription = null;  // Initialized after API ready
        this.isFluidEnabled = false;     // Loaded from settings
        this._fluidStopping = false;     // Guard flag for onstop handler

        // Agent Feed (v2)
        this.isRealtimeFeedEnabled = false;
        this.agentFeedInterval = null;
        this.agentFeedOffset = 0;
        this.agentConnected = false;
        this.agentSessionPath = null;
        this._lastAgentPrompt = null;

        // Agent Modes + Staging
        this.agentModes = [];
        this.selectedModeId = null;
        this.isStagingActive = false;
        this._lastHeartbeat = null;
        this._stagingSessionId = null;
        this._pendingAgentResponse = false;  // true when waiting for agent to respond
        this._selectedModeProactive = true;  // current mode's proactive flag
        
        // 🔧 Recording configuration (received from main process)
        // These values are set by main.js to keep main window and widget in sync
        this.MAX_RECORDING_MINUTES = 20; // Default, will be overridden by config
        this.WARNING_AT_MINUTES = 15; // Default, will be overridden by config
        this.LONG_RECORDING_MINUTES = 12; // Default, will be overridden by config
        
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

        // Ensure agent panel starts hidden
        const agentPanel = document.getElementById('agentFeedPanel');
        if (agentPanel) agentPanel.classList.add('hidden');
        const tSec = document.querySelector('.transcriptions-section');
        if (tSec) tSec.classList.remove('hidden');
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
        this.fluidTranscription = new FluidTranscriptionManager(this.api, this.backendUrl);
        
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
            
            // Check if telemetry is force-enabled in dev mode
            const isForceEnabled = this.telemetry.config && this.telemetry.config.forceEnableInDev;
            
            // Only sync preferences for internal builds (or force-enabled dev builds)
            if (this.telemetry.isInternalBuild() || isForceEnabled) {
                // Load telemetry preference from backend (skip if force-enabled)
                if (isForceEnabled) {
                    console.log('📊 Telemetry: Force enabled in dev mode');
                } else {
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
        
        // Check if this is an internal build or force-enabled in dev
        const isInternalBuild = this.telemetry.isInternalBuild();
        const isForceEnabled = this.telemetry.config && this.telemetry.config.forceEnableInDev;
        
        if (isInternalBuild || isForceEnabled) {
            // Show telemetry settings (internal build or dev mode)
            telemetryContainer.style.display = 'block';
            if (isForceEnabled) {
                console.log('📊 Telemetry UI: Visible (force-enabled in dev)');
            } else {
                console.log('📊 Telemetry UI: Visible (internal build)');
            }
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

        // Register Clear History Confirmation
        this.modalManager.register('clear-history-modal', this.clearHistoryModal, null);
        
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
        this.pauseButton = document.getElementById('pauseButton');
        this.recordingInfo = document.getElementById('recordingInfo');
        
        // App container (for skeleton loader)
        this.appContainer = document.getElementById('appContainer');
        
        // Transcriptions
        this.transcriptionsContainer = document.getElementById('transcriptionsContainer');
        this.loadMoreButton = document.getElementById('loadMoreButton');
        this.gradientOverlay = document.getElementById('gradientOverlay');
        this.sectionTitle = document.querySelector('.section-title');
        
        // Create View Less footer row dynamically (contains View Less button + stats + delete)
        this.viewLessFooter = document.createElement('div');
        this.viewLessFooter.className = 'view-less-footer hidden';

        this.showLessButton = document.createElement('button');
        this.showLessButton.className = 'show-less-button';
        this.showLessButton.textContent = 'View less';
        this.showLessButton.addEventListener('click', () => {
            this.handleShowLess();
        });

        // Stats + delete (right side of footer)
        this.transcriptionStatsSection = document.createElement('div');
        this.transcriptionStatsSection.className = 'transcription-stats-inline hidden';
        this.transcriptionStatsText = document.createElement('span');
        this.transcriptionStatsText.className = 'storage-stats-text';
        this.clearHistoryButton = document.createElement('button');
        this.clearHistoryButton.className = 'icon-button-delete';
        this.clearHistoryButton.id = 'clearHistoryButton';
        this.clearHistoryButton.title = 'Clear all transcriptions';
        this.clearHistoryButton.innerHTML = '<i class="ph ph-trash"></i>';
        this.transcriptionStatsSection.appendChild(this.transcriptionStatsText);
        this.transcriptionStatsSection.appendChild(this.clearHistoryButton);

        this.viewLessFooter.appendChild(this.showLessButton);
        this.viewLessFooter.appendChild(this.transcriptionStatsSection);

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
        // Gemini API key UI
        this.geminiKeySettingItem = document.getElementById('geminiKeySettingItem');
        this.addGeminiKeyButton = document.getElementById('addGeminiKeyButton');
        this.geminiKeyConfiguredItem = document.getElementById('geminiKeyConfiguredItem');
        this.changeGeminiKeyButton = document.getElementById('changeGeminiKeyButton');
        this.removeGeminiKeySettingsButton = document.getElementById('removeGeminiKeySettingsButton');
        this.geminiKeyDisplay = document.getElementById('geminiKeyDisplay');
        this.geminiKeyModal = document.getElementById('geminiKeyModal');
        this.closeGeminiKeyModalBtn = document.getElementById('closeGeminiKeyModal');
        this.geminiKeyInput = document.getElementById('geminiKeyInput');
        this.submitGeminiKey = document.getElementById('submitGeminiKey');
        this.submitGeminiKeyText = document.getElementById('submitGeminiKeyText');
        this.geminiKeyModalTitle = document.getElementById('geminiKeyModalTitle');
        this.geminiKeyInputLabel = document.getElementById('geminiKeyInputLabel');
        this.currentGeminiKeySection = document.getElementById('currentGeminiKeySection');
        this.currentGeminiKeyValue = document.getElementById('currentGeminiKeyValue');
        this.removeGeminiKeyModal = document.getElementById('removeGeminiKeyModal');
        this.closeRemoveGeminiKeyModalBtn = document.getElementById('closeRemoveGeminiKeyModal');
        this.confirmRemoveGeminiKey = document.getElementById('confirmRemoveGeminiKey');
        // STT model selector
        this.sttModelSelect = document.getElementById('sttModelSelect');
        this.saveAudioToggle = document.getElementById('saveAudioToggle');
        this.soundEffectsToggle = document.getElementById('soundEffectsToggle');
        this.autoHideWidgetToggle = document.getElementById('autoHideWidgetToggle');
        this.autoPasteToggle = document.getElementById('autoPasteToggle');
        this.instantRecordingToggle = document.getElementById('instantRecordingToggle');
        this.telemetryToggle = document.getElementById('telemetryToggle');
        this.fluidTranscriptionToggle = document.getElementById('fluidTranscriptionToggle');
        this.realtimeFeedSettingItem = document.getElementById('realtimeFeedSettingItem');
        this.realtimeFeedToggle = document.getElementById('realtimeFeedToggle');
        this.copyFeedPathButton = document.getElementById('copyFeedPathButton');
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

        // Clear Transcription History
        // transcriptionStatsSection, transcriptionStatsText, and clearHistoryButton are created dynamically above
        this.clearHistoryModal = document.getElementById('clearHistoryModal');
        this.closeClearHistoryModal = document.getElementById('closeClearHistoryModal');
        this.confirmClearHistory = document.getElementById('confirmClearHistory');
        
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
            // If staging is active, clicking record cancels staging
            if (this.isStagingActive) {
                this.hideAgentPanel();
                this.isStagingActive = false;
                return;
            }
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

        // Transform apply button
        const transformApplyBtn = document.getElementById('transformApplyBtn');
        if (transformApplyBtn) {
            transformApplyBtn.addEventListener('click', () => this.applyTransform());
        }

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

        // Pause button
        if (this.pauseButton) {
            this.pauseButton.addEventListener('click', (event) => {
                event.stopPropagation();
                event.preventDefault();
                if (this.isRecordingPaused) {
                    this.resumeRecording();
                } else {
                    this.pauseRecording();
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

        // ----- Gemini API Key UI -----
        if (this.addGeminiKeyButton) {
            this.addGeminiKeyButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openGeminiKeyModal();
            });
        }
        if (this.changeGeminiKeyButton) {
            this.changeGeminiKeyButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openGeminiKeyModal();
            });
        }
        if (this.closeGeminiKeyModalBtn) {
            this.closeGeminiKeyModalBtn.addEventListener('click', () => this.closeGeminiKeyModal());
        }
        if (this.geminiKeyModal) {
            this.geminiKeyModal.addEventListener('click', (e) => {
                if (e.target === this.geminiKeyModal) this.closeGeminiKeyModal();
            });
        }
        if (this.submitGeminiKey) {
            this.submitGeminiKey.addEventListener('click', () => this.saveGeminiKey());
        }
        if (this.geminiKeyInput) {
            this.geminiKeyInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.saveGeminiKey();
            });
        }
        if (this.removeGeminiKeySettingsButton) {
            this.removeGeminiKeySettingsButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openRemoveGeminiKeyModal();
            });
        }
        if (this.closeRemoveGeminiKeyModalBtn) {
            this.closeRemoveGeminiKeyModalBtn.addEventListener('click', () => this.closeRemoveGeminiKeyModal());
        }
        if (this.confirmRemoveGeminiKey) {
            this.confirmRemoveGeminiKey.addEventListener('click', () => this.removeGeminiKey());
        }
        if (this.removeGeminiKeyModal) {
            this.removeGeminiKeyModal.addEventListener('click', (e) => {
                if (e.target === this.removeGeminiKeyModal) this.closeRemoveGeminiKeyModal();
            });
        }

        // ----- STT model selector -----
        if (this.sttModelSelect) {
            this.sttModelSelect.addEventListener('change', () => this.setSttModel(this.sttModelSelect.value));
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

        if (this.instantRecordingToggle) {
            this.instantRecordingToggle.addEventListener('change', () => {
                this.toggleInstantRecording();
            });
        }

        // Sound Effects toggle
        if (this.soundEffectsToggle) {
            this.soundEffectsToggle.addEventListener('change', () => {
                this.toggleSoundEffects();
            });
        }

        // Fluid Transcription toggle
        if (this.fluidTranscriptionToggle) {
            this.fluidTranscriptionToggle.addEventListener('change', () => {
                this.toggleFluidTranscription();
            });
        }

        // Real-time Feed toggle
        if (this.realtimeFeedToggle) {
            this.realtimeFeedToggle.addEventListener('change', () => {
                this.toggleRealtimeFeed();
            });
        }

        // Copy Feed Path buttons (staging + active panel + inline)
        document.getElementById('agentCopyPathBtnStaging')?.addEventListener('click', () => {
            this.copyFeedPath();
        });
        document.getElementById('agentCopyPathBtnInline')?.addEventListener('click', () => {
            this.copyFeedPath();
        });

        // Begin Story button (staging → active)
        document.getElementById('agentBeginBtn')?.addEventListener('click', () => this.beginStory());

        // Agent Mute button
        document.getElementById('agentMuteBtn')?.addEventListener('click', () => {
            if (this.isAgentMuted) {
                this.unmuteAgent();
            } else {
                this.muteAgent();
            }
        });

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

        // Clear History button
        if (this.clearHistoryButton) {
            this.clearHistoryButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.openClearHistoryModal();
            });
        }

        // Clear History Modal listeners
        if (this.closeClearHistoryModal) {
            this.closeClearHistoryModal.addEventListener('click', () => {
                this.closeClearHistoryModalHandler();
            });
        }

        if (this.confirmClearHistory) {
            this.confirmClearHistory.addEventListener('click', () => {
                this.clearAllTranscriptions();
            });
        }

        if (this.clearHistoryModal) {
            this.clearHistoryModal.addEventListener('click', (e) => {
                if (e.target === this.clearHistoryModal) {
                    this.closeClearHistoryModalHandler();
                }
            });
        }

        // Agent chips
        document.querySelectorAll('.agent-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!this.agentFeedInterval) return; // only during recording
                btn.classList.add('firing');
                setTimeout(() => btn.classList.remove('firing'), 1200);
                this.sendAgentPrompt(btn.dataset.prompt);
            });
        });

        // Agent input
        const agentInput = document.getElementById('agentInput');
        const agentChips = document.getElementById('agentChips');

        if (agentInput) {
            agentInput.addEventListener('focus', () => agentChips?.classList.add('hidden-chips'));
            agentInput.addEventListener('blur', () => {
                if (!agentInput.value.trim()) agentChips?.classList.remove('hidden-chips');
            });
            agentInput.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const t = agentInput.value.trim();
                    if (!t || !this.agentFeedInterval) return;
                    agentInput.value = '';
                    agentInput.style.height = '28px';
                    agentChips?.classList.remove('hidden-chips');
                    this.sendAgentPrompt(t);
                }
            });
        }

        // Agent send button
        const agentSendBtn = document.getElementById('agentSendBtn');
        if (agentSendBtn && agentInput) {
            agentSendBtn.addEventListener('click', () => {
                const t = agentInput.value.trim();
                if (!t || !this.agentFeedInterval) return;
                agentInput.value = '';
                agentInput.style.height = '28px';
                agentChips?.classList.remove('hidden-chips');
                this.sendAgentPrompt(t);
            });
        }

        // Story col toggle
        document.getElementById('storyToggle')?.addEventListener('click', () => {
            document.getElementById('storyCol')?.classList.toggle('collapsed');
        });
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

                // Load fluid transcription setting
                await this.loadFluidTranscriptionSetting();

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
        // Refresh fluid setting from backend before each recording
        await this.loadFluidTranscriptionSetting();
        await this.loadRealtimeFeedSetting();
        this.hideAgentPanel(); // reset panel for new session

        // If both fluid + realtime feed are on, enter staging state instead of recording
        if (this.isFluidEnabled && this.isRealtimeFeedEnabled) {
            await this.enterStagingState();
            return;
        }

        await this._startRecordingInternal();
    }

    async _startRecordingInternal() {
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
                // If fluid transcription is handling the stop, skip onstop logic
                if (this._fluidStopping) {
                    console.log('🔄 Fluid transcription handling stop — onstop skipping');
                    return;
                }

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

            // Set up audio analyser for reactive visualizer
            this._setupAudioAnalyser(stream);

            // Start fluid transcription if enabled
            console.log(`🔄 Main: fluid enabled=${this.isFluidEnabled}, manager=${!!this.fluidTranscription}`);
            if (this.isFluidEnabled && this.fluidTranscription) {
                console.log('🔄 Main: Starting fluid transcription...');
                this.fluidTranscription.start(stream);
                // If we came from staging, override the session ID so feed stays in same dir
                if (this._stagingSessionId) {
                    this.fluidTranscription.sessionId = this._stagingSessionId;
                }
                if (this.isRealtimeFeedEnabled) {
                    this.fluidTranscription.onSegment = (text, idx) => this._addStoryChunk(text, idx);
                    if (this._stagingSessionId) {
                        // Session already registered during staging — just start polling
                        this._updateAgentStatus('broadcasting');
                        this.agentFeedInterval = setInterval(() => this._pollAgentFeed(), 5000);
                    } else {
                        this.startAgentFeedPolling(this.fluidTranscription.sessionId);
                    }
                }
            } else {
                console.log('🔄 Main: Fluid OFF — using classic mode');
            }
            
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
            
            // In realtime feed mode, extend limits and suppress warnings
            if (this.isRealtimeFeedEnabled && this.isFluidEnabled) {
                this._realtimeOverride = true;
                this._origMax = this.MAX_RECORDING_MINUTES;
                this._origWarning = this.WARNING_AT_MINUTES;
                this._origLong = this.LONG_RECORDING_MINUTES;
                this.MAX_RECORDING_MINUTES = 60;
                this.WARNING_AT_MINUTES = 999;
                this.LONG_RECORDING_MINUTES = 999;
            }

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
            // If paused, resume MediaRecorder before stopping (required for clean stop)
            if (this.isRecordingPaused && this.mediaRecorder.state === 'paused') {
                this.mediaRecorder.resume();
            }
            this.isRecordingPaused = false;
            this.isAgentMuted = false;
            this._stopAudioAnalyser();

            // Clear safety timeout
            if (this.safetyTimeout) {
                clearTimeout(this.safetyTimeout);
                this.safetyTimeout = null;
            }

            // Restore original limits if overridden for realtime
            if (this._realtimeOverride) {
                this.MAX_RECORDING_MINUTES = this._origMax;
                this.WARNING_AT_MINUTES = this._origWarning;
                this.LONG_RECORDING_MINUTES = this._origLong;
                this._realtimeOverride = false;
            }

            // Check if fluid transcription is active
            const fluidActive = this.fluidTranscription && this.fluidTranscription.isActive();

            if (fluidActive) {
                // Fluid mode: prevent processRecording() from running
                this.isCancelled = true;
                // Guard: tell onstop handler to skip entirely (fluid handles everything)
                this._fluidStopping = true;
            }

            this.mediaRecorder.stop();
            this.isRecording = false;

            // Calculate recording duration (excluding paused time)
            const duration = this._getElapsedSeconds();

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

            // Stop agent feed polling
            this.stopAgentFeedPolling();

            // If fluid was active, handle fluid stop flow
            if (fluidActive) {
                this.handleFluidStop(duration);
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

        // Clean up fluid transcription if active (discard accumulated text)
        if (this.fluidTranscription && this.fluidTranscription.isActive()) {
            this.fluidTranscription.stop();
        }

        // Stop all audio tracks
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        this._stopAudioAnalyser();

        this.stopTimer();
        this.updateUIForIdle();
        this.hideAgentPanel();

        // Notify widget
        if (window.electronAPI && window.electronAPI.syncRecordingState) {
            window.electronAPI.syncRecordingState('main_recording_cancelled');
        }
    }

    async pauseRecording() {
        if (!this.isRecording || this.isRecordingPaused) return;

        this.isRecordingPaused = true;

        // Pause MediaRecorder
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.pause();
        }

        // Flush and pause fluid transcription
        if (this.fluidTranscription && this.fluidTranscription.isActive()) {
            this.fluidTranscription.pause();
        }

        // Accumulate elapsed time and freeze timer
        this._pausedElapsed += this._resumeTime ? (Date.now() - this._resumeTime) / 1000 : 0;
        this._resumeTime = null;

        // Write pause event to feed
        try {
            await fetch(`${this.backendUrl}/api/feeds/pause`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ elapsed: this._pausedElapsed })
            });
        } catch (e) {
            console.warn('Pause event send error:', e);
        }

        // Update UI
        this.updateUIForPaused();
        this._updateHeartbeatStatus();

        console.log(`⏸ Recording paused at ${this._pausedElapsed.toFixed(1)}s`);
    }

    async resumeRecording() {
        if (!this.isRecording || !this.isRecordingPaused) return;

        this.isRecordingPaused = false;

        // Resume MediaRecorder
        if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
            this.mediaRecorder.resume();
        }

        // Resume fluid transcription
        if (this.fluidTranscription && this.fluidTranscription.isActive()) {
            this.fluidTranscription.resume();
        }

        // Resume timer
        this._resumeTime = Date.now();

        // Write resume event to feed
        try {
            await fetch(`${this.backendUrl}/api/feeds/resume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (e) {
            console.warn('Resume event send error:', e);
        }

        // Update UI
        this.updateUIForRecording();
        this._updateHeartbeatStatus();

        console.log('▶ Recording resumed');
    }

    async muteAgent() {
        this.isAgentMuted = true;

        try {
            await fetch(`${this.backendUrl}/api/feeds/agent-mute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (e) {
            console.warn('Agent mute event send error:', e);
        }

        // Update mute button UI
        const btn = document.getElementById('agentMuteBtn');
        if (btn) {
            btn.classList.add('muted');
            btn.title = 'Unmute agent';
            btn.querySelector('i').className = 'ph ph-speaker-slash';
        }

        this._updateHeartbeatStatus();
        console.log('🔇 Agent muted');
    }

    async unmuteAgent() {
        this.isAgentMuted = false;

        try {
            await fetch(`${this.backendUrl}/api/feeds/agent-unmute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (e) {
            console.warn('Agent unmute event send error:', e);
        }

        // Update mute button UI
        const btn = document.getElementById('agentMuteBtn');
        if (btn) {
            btn.classList.remove('muted');
            btn.title = 'Mute agent';
            btn.querySelector('i').className = 'ph ph-speaker-high';
        }

        this._updateHeartbeatStatus();
        console.log('🔊 Agent unmuted');
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
                
                // DEBUG: Log what we received from backend
                console.log('🔍 DEBUG - Cost from backend:', {
                    'result.cost_usd': result.cost_usd,
                    'result.cost': result.cost,
                    'cost_usd (after ?? operator)': cost_usd,
                    'duration': duration
                });
                
                // If cost is missing, zero, or invalid, calculate it from duration
                if (cost_usd === undefined || cost_usd === null || cost_usd === 0) {
                    if (duration > 0) {
                        const minutes = duration / 60.0;
                        cost_usd = minutes * 0.006; // Whisper pricing: $0.006 per minute
                        console.log('🔍 DEBUG - Recalculated cost from duration:', cost_usd);
                    } else {
                        cost_usd = 0;
                        console.log('🔍 DEBUG - No duration, cost set to 0');
                    }
                } else {
                    // Ensure cost is a valid number
                    cost_usd = parseFloat(cost_usd) || 0;
                    console.log('🔍 DEBUG - Using backend cost (parsed):', cost_usd);
                }
                
                console.log('🔍 DEBUG - Final cost_usd before telemetry:', cost_usd);
                
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
                this.updateTranscriptionStats(data.transcriptions.length);

            } else {
                this.renderTranscriptions([]);
                this.updateTranscriptionStats(0);
            }
        } catch (error) {
            console.error('Error loading history:', error);
            this.renderTranscriptions([]);
            this.updateTranscriptionStats(0);
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
                ? 'Click the microphone to start telling your story.'
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
            this.viewLessFooter.classList.add('hidden');
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
        
        // Add View Less footer (button + stats + delete) at the end if showing all
        if (this.showingAll) {
            this.viewLessFooter.classList.remove('hidden');
            fragment.appendChild(this.viewLessFooter);
        } else {
            this.viewLessFooter.classList.add('hidden');
        }
        
        // Single DOM insertion (optimized)
        this.transcriptionsContainer.appendChild(fragment);
        
        // Check if content overflows after rendering
        setTimeout(() => {
            // PR #19: View More appears with >= initialDisplayCount (was >) so
            // a fresh history of exactly 3 also triggers it. The previous
            // overflow probe is no longer needed at this window size.
            const hasMoreTranscriptions = transcriptions.length >= this.initialDisplayCount;
            const shouldShowLoadMore = !this.showingAll && hasMoreTranscriptions;
            
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
        const sourceType = transcription.source_type || 'standard';
        const canTransform = !isError && sourceType !== 'realtime';
        const sttModelTag = transcription.stt_model ? `<span class="stt-model-tag">(${this.escapeHtml(transcription.stt_model)})</span>` : '';

        // For error cards with audio_id, show retry button instead of copy
        // For error cards without audio_id, show neither copy nor retry
        // For success cards, show copy button
        const errorIcon = isError ? '<i class="ph ph-warning-circle"></i>' : '';

        let primaryButton = '';
        if (isError && transcription.audio_id) {
            primaryButton = `
                <button class="action-icon-button retry-button" title="Retry transcription" data-action="retry" data-audio-id="${transcription.audio_id}">
                    <i class="ph ph-arrows-clockwise"></i>
                </button>
            `;
        } else if (!isError) {
            primaryButton = `
                <button class="action-icon-button copy-button" title="Copy to clipboard" data-action="copy">
                    <i class="ph ph-copy"></i>
                </button>
            `;
        }

        // Transform button for eligible cards
        const transformButton = canTransform ? `
            <button class="action-icon-button transform-button" title="Transform" data-action="transform">
                <i class="ph ph-magic-wand"></i>
            </button>
        ` : '';

        // Transform label subtitle
        const transformLabel = transcription.transform_label ? `
            <span class="transform-label" title="${this.escapeHtml(transcription.transform_label)}">${this.escapeHtml(transcription.transform_label)}</span>
        ` : '';

        // Source type label for non-standard
        const sourceLabel = sourceType === 'realtime' ? '<span class="transform-label" style="color: var(--gray-40);">Real-time transcription</span>' : '';

        // View Original expandable + Restore Original
        const viewOriginal = transcription.original_text ? `
            <div class="original-actions">
                <button class="view-original-btn" data-action="toggle-original">View Original</button>
                <button class="restore-original-btn" data-action="restore-original">Restore Original</button>
            </div>
            <div class="original-text-content hidden">${this.escapeHtml(transcription.original_text)}</div>
        ` : '';

        card.innerHTML = `
            <div class="transcription-header">
                <span class="transcription-timestamp">${errorIcon}${timestamp} ${sttModelTag}${transformLabel}${sourceLabel}</span>
                <div class="transcription-actions">
                    ${transformButton}
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
            ${viewOriginal}
        `;

        return card;
    }
    
    setupTranscriptionEventDelegation() {
        // Event delegation: One listener for all transcription cards
        this.transcriptionsContainer.addEventListener('click', (e) => {
            // Handle View Original toggle
            const viewOrigBtn = e.target.closest('.view-original-btn');
            if (viewOrigBtn) {
                const actionsDiv = viewOrigBtn.closest('.original-actions');
                const originalContent = actionsDiv?.nextElementSibling;
                if (originalContent) {
                    originalContent.classList.toggle('hidden');
                    viewOrigBtn.textContent = originalContent.classList.contains('hidden') ? 'View Original' : 'Hide Original';
                }
                return;
            }

            // Handle Restore Original
            const restoreBtn = e.target.closest('.restore-original-btn');
            if (restoreBtn) {
                const card = restoreBtn.closest('.transcription-card');
                if (card) {
                    const transcriptionId = card.dataset.id;
                    this.restoreOriginal(parseInt(transcriptionId));
                }
                return;
            }

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
                case 'transform':
                    this.openTransformPanel(parseInt(transcriptionId));
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
        if (this.pauseButton) this.pauseButton.classList.add('hidden');
    }

    // STATE 2: Recording (timer + ondas + cancel + botón stop, sin texto)
    updateUIForRecording() {
        this.recordButton.classList.add('recording');
        this.recordButton.innerHTML = '<div class="stop-square-main"></div>';
        this.recordingInfo.classList.remove('hidden');
        this.statusText.classList.add('hidden');
        this.visualizer.classList.remove('hidden');
        this.cancelButton.classList.remove('hidden');
        // Show pause button only during an active agent/realtime session
        const inAgentSession = this.isRealtimeFeedEnabled && this.isFluidEnabled && !!this._stagingSessionId;
        if (this.pauseButton) {
            if (inAgentSession) {
                this.pauseButton.classList.remove('hidden');
                this.pauseButton.innerHTML = '<span class="pause-bar"></span><span class="pause-bar"></span>';
                this.pauseButton.title = 'Pause recording';
            } else {
                this.pauseButton.classList.add('hidden');
            }
        }
        // Show inline copy-path button only during an active agent session
        const copyPathInline = document.getElementById('agentCopyPathBtnInline');
        if (copyPathInline) {
            if (inAgentSession) {
                copyPathInline.classList.remove('hidden');
            } else {
                copyPathInline.classList.add('hidden');
            }
        }
    }

    // STATE 3: Recording (after 3 seconds) - igual que recording
    updateUIForRecordingActive() {
        // Keep same as recording state
        this.statusText.classList.add('hidden');
    }

    // STATE: Paused (timer frozen, visualizer hidden, status "Paused")
    updateUIForPaused() {
        this.recordButton.classList.add('recording');
        this.recordButton.innerHTML = '<div class="stop-square-main"></div>';
        this.recordingInfo.classList.remove('hidden');
        this.statusText.textContent = 'Paused';
        this.statusText.classList.remove('hidden');
        this.statusText.style.color = '';
        this.visualizer.classList.add('hidden');
        this.cancelButton.classList.remove('hidden');
        // Switch pause button to play icon
        if (this.pauseButton) {
            this.pauseButton.classList.remove('hidden');
            this.pauseButton.innerHTML = '<i class="ph ph-play"></i>';
            this.pauseButton.title = 'Resume recording';
        }
        // Keep copy-path visible in paused state
        const copyPathInline = document.getElementById('agentCopyPathBtnInline');
        if (copyPathInline && this.isRealtimeFeedEnabled && this.isFluidEnabled) {
            copyPathInline.classList.remove('hidden');
        }
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
        if (this.pauseButton) this.pauseButton.classList.add('hidden');
        const copyPathInline = document.getElementById('agentCopyPathBtnInline');
        if (copyPathInline) copyPathInline.classList.add('hidden');
        this.isRecordingPaused = false;

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
        if (this.pauseButton) this.pauseButton.classList.add('hidden');
        const copyPathInline = document.getElementById('agentCopyPathBtnInline');
        if (copyPathInline) copyPathInline.classList.add('hidden');
        this.isRecordingPaused = false;

        // Hide warning icon
        if (this.warningIcon) {
            this.warningIcon.classList.add('hidden');
        }

        // Stop transcription progress tracking
        this.stopTranscriptionProgress();
    }

    _setupAudioAnalyser(stream) {
        try {
            this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this._analyser = this._audioCtx.createAnalyser();
            this._analyser.fftSize = 256;
            this._analyser.smoothingTimeConstant = 0.7;
            const source = this._audioCtx.createMediaStreamSource(stream);
            source.connect(this._analyser);
            this._analyserSource = source;
            this._analyserData = new Uint8Array(this._analyser.frequencyBinCount);
            this._visualizerThreshold = 10; // minimum volume to animate
            this._animateVisualizer();
        } catch (e) {
            console.warn('Audio analyser setup failed:', e);
        }
    }

    _animateVisualizer() {
        if (!this._analyser || !this.isRecording) return;
        this._analyser.getByteFrequencyData(this._analyserData);
        // Average volume from low-mid frequencies (most voice energy)
        const slice = this._analyserData.slice(2, 20);
        const avg = slice.reduce((a, b) => a + b, 0) / slice.length;

        const waves = this.visualizer?.querySelectorAll('.wave');
        if (waves && waves.length) {
            const active = avg > this._visualizerThreshold;
            const minH = 4;
            const maxH = 18;
            waves.forEach((wave, i) => {
                // Remove CSS animation — we drive it manually
                wave.style.animation = 'none';
                if (active) {
                    // Stagger using different frequency bands
                    const bandStart = 2 + i * 6;
                    const bandSlice = this._analyserData.slice(bandStart, bandStart + 6);
                    const bandAvg = bandSlice.reduce((a, b) => a + b, 0) / bandSlice.length;
                    const norm = Math.min(bandAvg / 128, 1);
                    const h = minH + norm * (maxH - minH);
                    wave.style.height = `${h}px`;
                    // Turn pink when near max
                    wave.style.background = norm > 0.7 ? 'var(--color-pink)' : '';
                } else {
                    wave.style.height = `${minH}px`;
                    wave.style.background = '';
                }
            });
        }
        this._visualizerRaf = requestAnimationFrame(() => this._animateVisualizer());
    }

    _stopAudioAnalyser() {
        if (this._visualizerRaf) {
            cancelAnimationFrame(this._visualizerRaf);
            this._visualizerRaf = null;
        }
        if (this._analyserSource) {
            this._analyserSource.disconnect();
            this._analyserSource = null;
        }
        if (this._audioCtx) {
            this._audioCtx.close().catch(() => {});
            this._audioCtx = null;
        }
        this._analyser = null;
        // Reset wave styles
        const waves = this.visualizer?.querySelectorAll('.wave');
        if (waves) {
            waves.forEach(w => { w.style.animation = ''; w.style.height = ''; w.style.background = ''; });
        }
    }

    // Open a mic stream solely for the visualizer (used when widget owns the recording stream)
    async _startVisualizerOnlyStream() {
        try {
            this._vizOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this._setupAudioAnalyser(this._vizOnlyStream);
        } catch (e) {
            console.warn('Could not open visualizer-only mic stream:', e);
        }
    }

    _stopVisualizerOnlyStream() {
        this._stopAudioAnalyser();
        if (this._vizOnlyStream) {
            this._vizOnlyStream.getTracks().forEach(t => t.stop());
            this._vizOnlyStream = null;
        }
    }

    _getElapsedSeconds() {
        return this._pausedElapsed + (this._resumeTime ? (Date.now() - this._resumeTime) / 1000 : 0);
    }

    startTimer() {
        this.startTime = Date.now();
        this._pausedElapsed = 0;
        this._resumeTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsedSec = this._getElapsedSeconds();
            const elapsed = elapsedSec * 1000;
            const seconds = Math.floor(elapsedSec);
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
        this.checkGeminiKeyStatus();
        this.loadSttModelSetting();
        
        // Wait for audio setting to load, then load stats if needed
        await this.loadAudioSaveSetting();
        
        // Load auto-hide widget setting
        await this.loadAutoHideWidgetSetting();
        
        // Load auto-paste setting
        await this.loadAutoPasteSetting();

        // Load instant recording setting
        await this.loadInstantRecordingSetting();

        // Load sound effects setting
        await this.loadSoundEffectsSetting();
        
        // Load telemetry setting
        await this.loadTelemetrySetting();

        // Load fluid transcription setting
        await this.loadFluidTranscriptionSetting();

        // Load real-time feed setting (depends on fluid state)
        await this.loadRealtimeFeedSetting();

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

                // Update cached API key status in main process
                if (window.electronAPI && window.electronAPI.updateApiKeyCache) {
                    window.electronAPI.updateApiKeyCache(true);
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

    openClearHistoryModal() {
        console.log('🗑️ Opening Clear History confirmation modal');
        this.clearHistoryModal.classList.remove('hidden');
        setTimeout(() => {
            this.clearHistoryModal.classList.add('show');
        }, 10);
    }

    closeClearHistoryModalHandler() {
        console.log('🗑️ Closing Clear History confirmation modal');
        this.clearHistoryModal.classList.remove('show');
        setTimeout(() => {
            this.clearHistoryModal.classList.add('hidden');
        }, 200);
    }

    async clearAllTranscriptions() {
        this.closeClearHistoryModalHandler();
        // PR #19: reset paging state so View Less doesn't linger after
        // clearing history and starting fresh.
        this.showingAll = false;

        this.clearHistoryButton.disabled = true;
        this.clearHistoryButton.style.opacity = '0.5';

        try {
            const response = await fetch(`${this.backendUrl}/api/history`, {
                method: 'DELETE'
            });

            if (response.ok) {
                const data = await response.json();
                const deletedCount = data.deleted_count || 0;

                console.log('✅ Transcription history cleared:', data);
                this.showToast(`Deleted ${deletedCount} transcription${deletedCount !== 1 ? 's' : ''}`);

                this.loadTranscriptionHistory();
            } else {
                console.error('❌ Failed to clear transcription history');
                this.showToast('Failed to clear history', 'error');
            }
        } catch (error) {
            console.error('❌ Error clearing transcription history:', error);
            this.showToast('Error clearing history', 'error');
        } finally {
            this.clearHistoryButton.disabled = false;
            this.clearHistoryButton.style.opacity = '1';
        }
    }

    updateTranscriptionStats(count) {
        if (!this.transcriptionStatsSection) return;

        if (count > 0) {
            this.transcriptionStatsSection.classList.remove('hidden');
            this.transcriptionStatsText.textContent = `${count} transcription${count !== 1 ? 's' : ''}`;
        } else {
            this.transcriptionStatsSection.classList.add('hidden');
        }
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

                // Update cached API key status in main process
                if (window.electronAPI && window.electronAPI.updateApiKeyCache) {
                    window.electronAPI.updateApiKeyCache(false);
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
    
    // ====================================
    // Gemini API Key + STT model selector
    // ====================================

    async checkGeminiKeyStatus() {
        try {
            const response = await fetch(`${this.backendUrl}/api/config/gemini-key`);
            if (!response.ok) return;
            const data = await response.json();
            if (data.has_api_key) {
                this.geminiKeySettingItem?.classList.add('hidden');
                this.geminiKeyConfiguredItem?.classList.remove('hidden');
                if (this.geminiKeyDisplay) this.geminiKeyDisplay.textContent = data.api_key_masked || '';
            } else {
                this.geminiKeySettingItem?.classList.remove('hidden');
                this.geminiKeyConfiguredItem?.classList.add('hidden');
            }
        } catch (e) {
            console.error('❌ Error checking Gemini key status:', e);
        }
    }

    async openGeminiKeyModal() {
        if (!this.geminiKeyModal) return;
        try {
            const response = await fetch(`${this.backendUrl}/api/config/gemini-key`);
            const data = await response.json();
            if (data.has_api_key) {
                this.geminiKeyModalTitle.textContent = 'Gemini API Key';
                this.geminiKeyInputLabel.textContent = 'New Gemini API Key:';
                this.submitGeminiKeyText.textContent = 'Change';
                this.currentGeminiKeyValue.textContent = data.api_key_masked;
                this.currentGeminiKeySection.classList.remove('hidden');
            } else {
                this.geminiKeyModalTitle.textContent = 'Add Gemini API Key';
                this.geminiKeyInputLabel.textContent = 'Enter your Google Gemini API Key';
                this.submitGeminiKeyText.textContent = 'Save API Key';
                this.currentGeminiKeySection.classList.add('hidden');
            }
        } catch (e) {
            this.geminiKeyModalTitle.textContent = 'Add Gemini API Key';
        }
        this.geminiKeyInput.value = '';
        this.geminiKeyModal.classList.remove('hidden');
        setTimeout(() => {
            this.geminiKeyModal.classList.add('show');
            this.geminiKeyInput?.focus();
        }, 10);
    }

    closeGeminiKeyModal() {
        if (!this.geminiKeyModal) return;
        this.geminiKeyModal.classList.remove('show');
        setTimeout(() => {
            this.geminiKeyModal.classList.add('hidden');
            if (this.geminiKeyInput) this.geminiKeyInput.value = '';
        }, 200);
    }

    async saveGeminiKey() {
        const apiKey = this.geminiKeyInput.value.trim();
        if (!apiKey) {
            this.showAlert('warning', 'Empty Field', 'Please enter a Gemini API Key');
            return;
        }
        if (!apiKey.startsWith('AIza')) {
            this.showAlert('error', 'Invalid Format', 'Gemini API keys typically start with "AIza".');
            return;
        }
        try {
            this.submitGeminiKey.disabled = true;
            this.submitGeminiKeyText.textContent = 'Saving...';
            const response = await fetch(`${this.backendUrl}/api/config/gemini-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey })
            });
            const result = await response.json();
            if (response.ok && result.success) {
                this.closeGeminiKeyModal();
                await this.checkGeminiKeyStatus();
                this.showAlert('success', 'Success', 'Gemini API Key saved.');
            } else {
                const details = result.validation?.details || result.error || 'Invalid Gemini key';
                this.showAlert('error', 'Save Failed', details);
            }
        } catch (e) {
            console.error('❌ Error saving Gemini key:', e);
            this.showAlert('error', 'Network Error', 'Please check your connection and try again.');
        } finally {
            this.submitGeminiKey.disabled = false;
            this.submitGeminiKeyText.textContent = 'Save API Key';
        }
    }

    openRemoveGeminiKeyModal() {
        if (!this.removeGeminiKeyModal) return;
        this.removeGeminiKeyModal.classList.remove('hidden');
        setTimeout(() => this.removeGeminiKeyModal.classList.add('show'), 10);
    }

    closeRemoveGeminiKeyModal() {
        if (!this.removeGeminiKeyModal) return;
        this.removeGeminiKeyModal.classList.remove('show');
        setTimeout(() => this.removeGeminiKeyModal.classList.add('hidden'), 200);
    }

    async removeGeminiKey() {
        try {
            const response = await fetch(`${this.backendUrl}/api/config/gemini-key`, { method: 'DELETE' });
            if (response.ok) {
                this.closeRemoveGeminiKeyModal();
                await this.checkGeminiKeyStatus();
                this.showToast('Gemini API Key removed', 'success');
            } else {
                const result = await response.json();
                this.showToast(result.error || 'Failed to remove Gemini Key', 'error');
            }
        } catch (e) {
            console.error('❌ Error removing Gemini key:', e);
            this.showToast('Error removing Gemini Key', 'error');
        }
    }

    async loadSttModelSetting() {
        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/ui_settings.stt_model`);
            if (response.ok) {
                const data = await response.json();
                const value = data.value || 'whisper';
                if (this.sttModelSelect) this.sttModelSelect.value = value;
            }
        } catch (e) {
            console.error('❌ Error loading STT model setting:', e);
        }
    }

    async setSttModel(value) {
        try {
            await fetch(`${this.backendUrl}/api/config/settings/ui_settings.stt_model`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value })
            });
            console.log('🎙️ STT model set to:', value);
        } catch (e) {
            console.error('❌ Error saving STT model setting:', e);
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

    // Instant Recording Toggle Method
    async toggleInstantRecording() {
        const isEnabled = this.instantRecordingToggle.checked;
        console.log('⚡ Instant recording:', isEnabled ? 'Enabled' : 'Disabled');

        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/ui_settings.instant_recording`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: isEnabled })
            });

            if (response.ok) {
                console.log('✅ Instant recording preference updated');

                await this.telemetry.track('feature_toggled', {
                    feature: 'instant_recording',
                    enabled: isEnabled,
                    platform: await this.getPlatform()
                });

                // Notify Electron main process
                if (window.electronAPI && window.electronAPI.setInstantRecording) {
                    window.electronAPI.setInstantRecording(isEnabled);
                }
            } else {
                console.error('❌ Failed to update instant recording preference');
                this.instantRecordingToggle.checked = !isEnabled;
            }
        } catch (error) {
            console.error('❌ Error updating instant recording preference:', error);
            this.instantRecordingToggle.checked = !isEnabled;
        }
    }

    // Load instant recording setting
    async loadInstantRecordingSetting() {
        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/ui_settings.instant_recording`);
            if (response.ok) {
                const data = await response.json();
                const isEnabled = data.value || false;
                console.log('⚡ Current instant recording setting:', isEnabled);
                this.instantRecordingToggle.checked = isEnabled;

                // Notify Electron main process of current value
                if (window.electronAPI && window.electronAPI.setInstantRecording) {
                    window.electronAPI.setInstantRecording(isEnabled);
                }
            }
        } catch (error) {
            console.error('❌ Error loading instant recording setting:', error);
            this.instantRecordingToggle.checked = false;
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

    // ====================================
    // FLUID TRANSCRIPTION
    // ====================================

    async loadFluidTranscriptionSetting() {
        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/ui_settings.fluid_transcription`);
            if (response.ok) {
                const data = await response.json();
                this.isFluidEnabled = data.value || false;
                console.log('🔄 Current fluid transcription setting:', this.isFluidEnabled);
                if (this.fluidTranscriptionToggle) {
                    this.fluidTranscriptionToggle.checked = this.isFluidEnabled;
                }
                // Show/hide real-time feed setting based on fluid state
                this.updateRealtimeFeedVisibility();
            }
        } catch (error) {
            console.error('❌ Error loading fluid transcription setting:', error);
            this.isFluidEnabled = false;
            this.updateRealtimeFeedVisibility();
        }
    }

    async toggleFluidTranscription() {
        const isEnabled = this.fluidTranscriptionToggle ? this.fluidTranscriptionToggle.checked : false;
        this.isFluidEnabled = isEnabled;
        console.log('🔄 Fluid transcription toggled:', isEnabled);

        try {
            await fetch(`${this.backendUrl}/api/config/settings/ui_settings.fluid_transcription`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: isEnabled })
            });

            // If fluid turned OFF, auto-disable real-time feed
            if (!isEnabled && this.realtimeFeedToggle && this.realtimeFeedToggle.checked) {
                this.realtimeFeedToggle.checked = false;
                await this.toggleRealtimeFeed();
            }
            this.updateRealtimeFeedVisibility();
        } catch (error) {
            console.error('❌ Error saving fluid transcription setting:', error);
        }
    }

    // ====================================
    // REAL-TIME FEED
    // ====================================

    updateRealtimeFeedVisibility() {
        if (this.realtimeFeedSettingItem) {
            if (this.isFluidEnabled) {
                this.realtimeFeedSettingItem.classList.remove('setting-disabled');
                if (this.realtimeFeedToggle) this.realtimeFeedToggle.disabled = false;
            } else {
                this.realtimeFeedSettingItem.classList.add('setting-disabled');
                if (this.realtimeFeedToggle) this.realtimeFeedToggle.disabled = true;
            }
        }
    }

    async loadRealtimeFeedSetting() {
        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/ui_settings.realtime_feed`);
            if (response.ok) {
                const data = await response.json();
                const isEnabled = data.value || false;
                console.log('📡 Current real-time feed setting:', isEnabled);
                this.isRealtimeFeedEnabled = isEnabled;
                if (this.realtimeFeedToggle) {
                    this.realtimeFeedToggle.checked = isEnabled;
                }
            }
        } catch (error) {
            console.error('❌ Error loading real-time feed setting:', error);
            this.isRealtimeFeedEnabled = false;
        }
    }

    async toggleRealtimeFeed() {
        const isEnabled = this.realtimeFeedToggle ? this.realtimeFeedToggle.checked : false;
        console.log('📡 Real-time feed toggled:', isEnabled);

        try {
            await fetch(`${this.backendUrl}/api/config/settings/ui_settings.realtime_feed`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: isEnabled })
            });
        } catch (error) {
            console.error('❌ Error saving real-time feed setting:', error);
        }
    }

    async copyFeedPath() {
        try {
            const path = this.agentSessionPath;
            if (path) {
                const sessionId = path.split('/').pop();
                await navigator.clipboard.writeText(`Listen to this feed: ${sessionId}`);
                this.showToast('Feed path copied', 'success');
            }
        } catch (error) {
            console.error('❌ Error copying feed path:', error);
            this.showToast('Failed to copy feed path', 'error');
        }
    }

    async handleFluidStop(recordingDuration) {
        try {
            // Stop fluid and get assembled text
            const fluidResult = await this.fluidTranscription.stop();

            if (!fluidResult.text || !fluidResult.text.trim()) {
                console.warn('⚠️ Fluid transcription returned empty text');
                this.updateUIForIdle();
                this.showToast('No speech detected during recording.', 'error');
                if (window.electronAPI && window.electronAPI.syncRecordingState) {
                    window.electronAPI.syncRecordingState('main_transcription_completed');
                }
                return;
            }

            // Save audio from MediaRecorder if save_audio is ON or there were errors
            let audioId = null;
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            this.audioChunks = []; // Free memory

            // Check save_audio setting
            let saveAudio = false;
            try {
                const resp = await fetch(`${this.backendUrl}/api/config/settings/audio_settings.save_audio_files`);
                if (resp.ok) {
                    const data = await resp.json();
                    saveAudio = data.value !== false;
                }
            } catch (e) {
                saveAudio = true; // Default to saving on error
            }

            if (saveAudio || fluidResult.hasErrors) {
                // Save audio via existing /api/transcribe mechanism
                // Send audio to a temp endpoint or save locally
                try {
                    const saveFormData = new FormData();
                    saveFormData.append('audio', audioBlob, 'recording.webm');

                    const saveResp = await fetch(`${this.backendUrl}/api/transcribe/save-audio`, {
                        method: 'POST',
                        body: saveFormData
                    });

                    if (saveResp.ok) {
                        const saveData = await saveResp.json();
                        audioId = saveData.audio_id || null;
                    }
                } catch (e) {
                    console.warn('⚠️ Could not save audio for fluid transcription:', e);
                }
            }

            // Call fluid-complete endpoint
            const completeResp = await fetch(`${this.backendUrl}/api/transcribe/fluid-complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: fluidResult.text,
                    session_id: this.fluidTranscription.sessionId,
                    total_segments: fluidResult.segments.length,
                    failed_segments: fluidResult.failedCount,
                    total_duration: recordingDuration,
                    language: fluidResult.segments.find(s => s.language !== 'unknown')?.language || 'unknown',
                    audio_id: audioId
                })
            });

            if (completeResp.ok) {
                const completeData = await completeResp.json();
                console.log('✅ Fluid transcription saved:', completeData);

                // Play transcription ready sound
                if (window.soundManager) {
                    soundManager.playTranscriptionReady();
                }

                // Update UI
                this.updateUIForIdle();
                await this.loadTranscriptionHistory();
                this.hideAgentPanel();

                // Auto-paste
                this.attemptAutoPaste(completeData.text);
            } else {
                throw new Error('Failed to save fluid transcription');
            }

            // Notify widget
            if (window.electronAPI && window.electronAPI.syncRecordingState) {
                window.electronAPI.syncRecordingState('main_transcription_completed');
            }

        } catch (error) {
            console.error('❌ Fluid stop error:', error);
            this.updateUIForIdle();
            this.hideAgentPanel();
            this.showToast('Error processing fluid transcription. Please try again.', 'error');
            await this.loadTranscriptionHistory();

            if (window.electronAPI && window.electronAPI.syncRecordingState) {
                window.electronAPI.syncRecordingState('main_transcription_completed');
            }
        } finally {
            this._fluidStopping = false;
            this.isCancelled = false;
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

        // Listen for triple-tap transform trigger from main process
        if (window.electronAPI && window.electronAPI.onOpenTransformDropdown) {
            window.electronAPI.onOpenTransformDropdown((event, transcriptionId) => {
                const targetId = transcriptionId;
                if (targetId) {
                    this.openTransformPanel(targetId);
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
                    // Get a mic stream just for the visualizer (widget owns the real recording stream)
                    appInstance._startVisualizerOnlyStream();
                    // After 3 seconds, hide "recording" text
                    setTimeout(() => {
                        if (appInstance.isRecording) {
                            appInstance.updateUIForRecordingActive();
                        }
                    }, 3000);
                } else if (message === 'widget_recording_stopped') {
                    appInstance.recordingSource = null;
                    appInstance.isRecording = false;
                    appInstance._stopVisualizerOnlyStream();
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
                    appInstance._stopVisualizerOnlyStream();
                    appInstance.stopTimer();
                    appInstance.updateUIForIdle();
                } else if (message === 'widget_force_stopped') {
                    // Widget was force-stopped (timeout, sleep, or manual)
                    // Depending on the reason, it may have transcribed or cancelled
                    appInstance.recordingSource = null;
                    appInstance.isRecording = false;
                    appInstance._stopVisualizerOnlyStream();
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

    // --- Smart Transforms ---

    async initTransformPanel() {
        // Cache presets on first call
        if (!this._transformPresets) {
            try {
                const response = await fetch(`${this.backendUrl}/api/transform/presets`);
                if (response.ok) {
                    const data = await response.json();
                    this._transformPresets = data.presets;
                }
            } catch (error) {
                console.error('Error loading transform presets:', error);
            }
        }
    }

    async openTransformPanel(transcriptionId) {
        await this.initTransformPanel();
        if (!this._transformPresets) return;

        // Find transcription in our loaded data
        this._transformTargetId = transcriptionId;
        let transcription = null;
        try {
            const response = await fetch(`${this.backendUrl}/api/history`);
            if (response.ok) {
                const data = await response.json();
                transcription = data.transcriptions.find(t => t.id === transcriptionId);
            }
        } catch (error) {
            console.error('Error fetching transcription:', error);
            return;
        }
        if (!transcription) return;

        this._transformTranscription = transcription;

        // Populate original text panel
        // Left panel shows current text (which may be the latest transform result)
        document.getElementById('transformOriginalText').textContent = transcription.text;
        const leftTitle = document.getElementById('transformLeftTitle');
        if (leftTitle) {
            leftTitle.textContent = transcription.original_text ? 'Current' : 'Original';
        }

        // Reset result panel
        document.getElementById('transformResultText').innerHTML = '<span class="transform-placeholder">Select a transform and apply</span>';


        // Render pills
        const pillsContainer = document.getElementById('transformPills');
        pillsContainer.innerHTML = '';
        this._selectedTransformPreset = null;

        for (const preset of this._transformPresets) {
            const pill = document.createElement('button');
            pill.className = 'transform-pill';
            pill.textContent = preset.label;
            pill.dataset.presetId = preset.id;
            pill.addEventListener('click', () => this._selectTransformPill(pill, preset));
            pillsContainer.appendChild(pill);
        }

        // Reset custom prompt
        document.getElementById('transformCustomPrompt').classList.add('hidden');
        const customInput = document.getElementById('transformCustomInput');
        if (customInput) customInput.value = '';

        // Reset apply button
        const applyBtn = document.getElementById('transformApplyBtn');
        applyBtn.disabled = true;
        applyBtn.classList.remove('processing');
        applyBtn.innerHTML = '<i class="ph ph-magic-wand"></i> Apply Transform';
        applyBtn.style.display = '';

        // Reset pills visibility
        const pillsEl = document.getElementById('transformPills');
        if (pillsEl) pillsEl.style.display = '';

        // Clean up previous action row
        const prevActionRow = document.getElementById('transformActionRow');
        if (prevActionRow) prevActionRow.remove();

        // Reset state flags
        this._transformApplied = false;
        this._transformAccepted = false;
        this._pendingTransformResult = null;

        // Show transform panel, hide transcriptions
        const appContainer = document.getElementById('appContainer');
        appContainer.classList.add('transform-mode');
        document.getElementById('transformPanel').classList.remove('hidden');

        // Change title
        const titleFull = document.querySelector('.title-full');
        if (titleFull) {
            if (!this._originalTitleHTML) this._originalTitleHTML = titleFull.innerHTML;
            titleFull.innerHTML = 'Transform your <span class="title-bold">stories</span><span class="title-dot">.</span>';
        }

        // Add back button (same pattern as staging mode — inside header-left as first child)
        this._addTransformBackButton();

        // Hide record button
        this.recordButton.classList.add('hidden');
    }

    _selectTransformPill(pill, preset) {
        // Deselect all pills
        document.querySelectorAll('.transform-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this._selectedTransformPreset = preset;

        // Show/hide custom prompt
        const customBox = document.getElementById('transformCustomPrompt');
        if (preset.id === 'custom') {
            customBox.classList.remove('hidden');
            document.getElementById('transformCustomInput').focus();
        } else {
            customBox.classList.add('hidden');
        }

        // Enable apply button
        document.getElementById('transformApplyBtn').disabled = false;
    }

    _addTransformBackButton() {
        const headerLeft = document.querySelector('.header-left');
        if (headerLeft && !document.getElementById('transformBackBtn')) {
            const backBtn = document.createElement('button');
            backBtn.id = 'transformBackBtn';
            backBtn.className = 'agent-back-btn';
            backBtn.innerHTML = '<i class="ph ph-arrow-left"></i> Back to recent transcriptions';
            backBtn.addEventListener('click', () => this.closeTransformPanel());
            headerLeft.insertBefore(backBtn, headerLeft.firstChild);
        }
    }

    async applyTransform() {
        const preset = this._selectedTransformPreset;
        if (!preset) return;

        const applyBtn = document.getElementById('transformApplyBtn');
        applyBtn.classList.add('processing');
        applyBtn.innerHTML = '<i class="ph ph-circle-notch"></i> Applying...';
        applyBtn.disabled = true;

        // Build request — always transform current text
        const body = {
            transcription_id: this._transformTargetId,
            source: 'current',
        };

        if (preset.id === 'custom') {
            body.custom_prompt = document.getElementById('transformCustomInput').value.trim();
            if (!body.custom_prompt) {
                applyBtn.classList.remove('processing');
                applyBtn.innerHTML = '<i class="ph ph-magic-wand"></i> Apply Transform';
                applyBtn.disabled = false;
                return;
            }
        } else {
            body.preset_id = preset.id;
        }

        try {
            const response = await fetch(`${this.backendUrl}/api/transform/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Show result in right panel
                document.getElementById('transformResultText').textContent = result.transformed_text;
                this._pendingTransformResult = result.transformed_text;
                this._transformApplied = true;

                // Hide apply button, show accept/dismiss buttons
                applyBtn.style.display = 'none';

                // Hide pills and custom prompt (no longer needed)
                document.getElementById('transformPills').style.display = 'none';
                document.getElementById('transformCustomPrompt').classList.add('hidden');

                const footer = document.querySelector('.transform-footer');
                let actionRow = document.getElementById('transformActionRow');
                if (!actionRow) {
                    actionRow = document.createElement('div');
                    actionRow.id = 'transformActionRow';
                    actionRow.className = 'transform-action-row';
                    actionRow.innerHTML = `
                        <button class="transform-accept-btn" id="transformAcceptBtn">
                            <i class="ph ph-check"></i> Accept Transform
                        </button>
                        <button class="transform-dismiss-btn" id="transformDismissBtn">
                            Dismiss
                        </button>
                    `;
                    footer.appendChild(actionRow);

                    document.getElementById('transformAcceptBtn').addEventListener('click', () => this.acceptTransform());
                    document.getElementById('transformDismissBtn').addEventListener('click', () => this.dismissTransform());
                } else {
                    actionRow.style.display = '';
                }
            } else {
                // Error
                applyBtn.classList.remove('processing');
                applyBtn.innerHTML = '<i class="ph ph-magic-wand"></i> Apply Transform';
                applyBtn.disabled = false;
                console.error('Transform error:', result.error);

                // Show error in result panel
                document.getElementById('transformResultText').innerHTML =
                    `<span class="transform-placeholder" style="color: var(--color-pink);">${this.escapeHtml(result.error || 'Transform failed')}</span>`;
            }
        } catch (error) {
            console.error('Transform request failed:', error);
            applyBtn.classList.remove('processing');
            applyBtn.innerHTML = '<i class="ph ph-magic-wand"></i> Apply Transform';
            applyBtn.disabled = false;
            document.getElementById('transformResultText').innerHTML =
                '<span class="transform-placeholder" style="color: var(--color-pink);">Network error — please try again</span>';
        }
    }

    async acceptTransform() {
        // Copy to clipboard
        if (this._pendingTransformResult) {
            try {
                await navigator.clipboard.writeText(this._pendingTransformResult);
            } catch (err) {
                console.warn('Clipboard write failed:', err);
            }
        }
        this._transformApplied = false;
        this._transformAccepted = true;
        this.closeTransformPanel();
    }

    async dismissTransform() {
        // Revert the transform in the DB
        if (this._transformTargetId) {
            try {
                await fetch(`${this.backendUrl}/api/transform/revert/${this._transformTargetId}`, {
                    method: 'POST'
                });
            } catch (err) {
                console.warn('Revert failed:', err);
            }
        }
        this._transformApplied = false;
        this._transformAccepted = false;

        // Stay on panel — reset UI for another try
        document.getElementById('transformResultText').innerHTML = '<span class="transform-placeholder">Select a transform and apply</span>';

        // Hide accept/dismiss, show pills + apply button again
        const actionRow = document.getElementById('transformActionRow');
        if (actionRow) actionRow.style.display = 'none';

        const applyBtn = document.getElementById('transformApplyBtn');
        applyBtn.style.display = '';
        applyBtn.style.background = '';
        applyBtn.classList.remove('processing');
        applyBtn.disabled = true;
        applyBtn.innerHTML = '<i class="ph ph-magic-wand"></i> Apply Transform';

        document.getElementById('transformPills').style.display = '';

        // Deselect pills
        document.querySelectorAll('.transform-pill').forEach(p => p.classList.remove('active'));
        this._selectedTransformPreset = null;
        document.getElementById('transformCustomPrompt').classList.add('hidden');
    }

    closeTransformPanel() {
        // If transform was applied but not accepted, revert it
        if (this._transformApplied && !this._transformAccepted) {
            this.dismissTransform();
            return; // dismissTransform will call closeTransformPanel again after revert
        }

        const appContainer = document.getElementById('appContainer');
        appContainer.classList.remove('transform-mode');
        document.getElementById('transformPanel').classList.add('hidden');

        // Remove back button
        document.getElementById('transformBackBtn')?.remove();

        // Clean up action row
        const actionRow = document.getElementById('transformActionRow');
        if (actionRow) actionRow.remove();

        // Reset apply button
        const applyBtn = document.getElementById('transformApplyBtn');
        if (applyBtn) {
            applyBtn.style.display = '';
            applyBtn.style.background = '';
        }

        // Reset pills visibility
        const pills = document.getElementById('transformPills');
        if (pills) pills.style.display = '';

        // Restore title
        const titleFull = document.querySelector('.title-full');
        if (titleFull && this._originalTitleHTML) {
            titleFull.innerHTML = this._originalTitleHTML;
        }

        // Restore record button
        this.recordButton.classList.remove('hidden');

        // Reset state
        this._transformApplied = false;
        this._transformAccepted = false;
        this._pendingTransformResult = null;

        // Reload history to reflect changes
        this.loadTranscriptionHistory();
    }

    async restoreOriginal(transcriptionId) {
        try {
            const response = await fetch(`${this.backendUrl}/api/transform/revert/${transcriptionId}`, {
                method: 'POST'
            });
            if (response.ok) {
                await this.loadTranscriptionHistory();
            }
        } catch (err) {
            console.error('Restore original failed:', err);
        }
    }


    // --- Agent Modes + Staging ---

    async enterStagingState() {
        await this.loadAgentModes();

        // Generate session ID early so user can copy feed path
        this._stagingSessionId = crypto.randomUUID();

        // Register feed session immediately
        try {
            const res = await fetch(`${this.backendUrl}/api/feeds/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: this._stagingSessionId })
            });
            if (res.ok) {
                const data = await res.json();
                this.agentSessionPath = data.path;
            }
        } catch (e) {
            console.warn('Feed start error:', e);
        }

        // Load last used mode
        try {
            const res = await fetch(`${this.backendUrl}/api/config/settings/ui_settings.last_agent_mode`);
            if (res.ok) {
                const data = await res.json();
                this.selectedModeId = data.value || (this.agentModes[0]?.id);
            }
        } catch (e) {
            this.selectedModeId = this.agentModes[0]?.id;
        }

        this.renderModeCards();

        // Show staging, hide active
        this.showAgentPanel();
        document.getElementById('agentStaging').style.display = '';
        document.getElementById('agentActive').style.display = 'none';
        this.isStagingActive = true;

        // Hide record button and swap title for staging
        document.getElementById('appContainer')?.classList.add('staging-mode');
        this.recordButton.classList.add('hidden');
        const titleFull = document.querySelector('.title-full');
        if (titleFull) {
            this._originalTitleHTML = titleFull.innerHTML;
            titleFull.innerHTML = 'Speak out your <span class="title-bold">stories</span><span class="title-dot">.</span> <span class="title-realtime">in real-time</span>';
        }

        // Insert back button inside header-left (sits below header-right, above title)
        const headerLeft = document.querySelector('.header-left');
        if (headerLeft && !document.getElementById('agentBackBtn')) {
            const backBtn = document.createElement('button');
            backBtn.id = 'agentBackBtn';
            backBtn.className = 'agent-back-btn';
            backBtn.innerHTML = '<i class="ph ph-arrow-left"></i> Back to recent transcriptions';
            backBtn.addEventListener('click', () => this.hideAgentPanel());
            headerLeft.insertBefore(backBtn, headerLeft.firstChild);
        }

        // Notify main process that realtime feed is active (blocks widget recording)
        if (window.electronAPI && window.electronAPI.setRealtimeActive) {
            window.electronAPI.setRealtimeActive(true);
        }
    }

    async loadAgentModes() {
        try {
            const res = await fetch(`${this.backendUrl}/api/agent-modes`);
            if (res.ok) {
                const data = await res.json();
                this.agentModes = data.modes || [];
            }
        } catch (e) {
            this.agentModes = [];
        }
    }

    renderModeCards() {
        const container = document.getElementById('agentModeSelector');
        if (!container) return;
        container.innerHTML = '';

        // Remove old custom prompt box if present
        const oldBox = document.getElementById('customPromptBox');
        if (oldBox) oldBox.remove();

        for (const mode of this.agentModes) {
            const card = document.createElement('div');
            card.className = `agent-mode-card${mode.id === this.selectedModeId ? ' selected' : ''}`;
            card.dataset.modeId = mode.id;
            card.innerHTML = `
                <div class="agent-mode-card-name">${mode.name}</div>
                <div class="agent-mode-card-desc">${mode.description}</div>
            `;
            card.addEventListener('click', () => {
                this.selectedModeId = mode.id;
                container.querySelectorAll('.agent-mode-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this._toggleCustomPromptBox();
            });
            container.appendChild(card);
        }

        // Insert custom prompt box after the mode selector
        const box = document.createElement('div');
        box.id = 'customPromptBox';
        box.className = 'custom-prompt-box hidden';
        box.innerHTML = `
            <textarea id="customPromptInput" class="custom-prompt-input" placeholder="Write your custom instructions for the AI agent..." rows="3"></textarea>
        `;
        container.parentNode.insertBefore(box, container.nextSibling);

        // Load saved prompt into textarea
        const customMode = this.agentModes.find(m => m.custom);
        if (customMode) {
            document.getElementById('customPromptInput').value = customMode.prompt || '';
        }

        // Auto-save on change
        const textarea = document.getElementById('customPromptInput');
        let saveTimeout;
        textarea.addEventListener('input', () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => this._saveCustomPrompt(textarea.value), 600);
        });

        this._toggleCustomPromptBox();
    }

    _toggleCustomPromptBox() {
        const box = document.getElementById('customPromptBox');
        if (!box) return;
        const isCustom = this.selectedModeId === 'custom';
        box.classList.toggle('hidden', !isCustom);
        if (isCustom) {
            const ta = document.getElementById('customPromptInput');
            if (ta) setTimeout(() => ta.focus(), 50);
        }
    }

    async _saveCustomPrompt(text) {
        // Persist to settings
        try {
            await fetch(`${this.backendUrl}/api/config/settings/ui_settings.custom_agent_prompt`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: text })
            });
        } catch (e) {
            console.warn('Failed to save custom prompt:', e);
        }
        // Also update in-memory mode prompt so beginStory uses latest text
        const customMode = this.agentModes.find(m => m.custom);
        if (customMode) customMode.prompt = text;
    }

    async beginStory() {
        const mode = this.agentModes.find(m => m.id === this.selectedModeId) || this.agentModes[0];
        this._selectedModeProactive = mode ? mode.proactive : true;

        if (mode) {
            // Write mode event to feed
            await fetch(`${this.backendUrl}/api/feeds/mode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: this._stagingSessionId,
                    name: mode.name,
                    prompt: mode.prompt,
                    proactive: mode.proactive
                })
            });

            // Save last used mode
            await fetch(`${this.backendUrl}/api/config/settings/ui_settings.last_agent_mode`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: mode.id })
            });
        }

        // Switch from staging to active
        document.getElementById('agentStaging').style.display = 'none';
        document.getElementById('agentActive').style.display = '';
        document.getElementById('appContainer')?.classList.add('agent-mode');
        this.isStagingActive = false;

        // Now actually start recording
        await this._startRecordingInternal();
    }

    // --- Agent Feed Panel (v2) ---

    showAgentPanel() {
        const panel = document.getElementById('agentFeedPanel');
        if (panel) panel.classList.remove('hidden');
        document.querySelector('.transcriptions-section')?.classList.add('hidden');
    }

    hideAgentPanel() {
        const panel = document.getElementById('agentFeedPanel');
        if (panel) {
            panel.classList.add('hidden');
            document.getElementById('appContainer')?.classList.remove('agent-mode');
            document.querySelector('.transcriptions-section')?.classList.remove('hidden');
            this.agentFeedOffset = 0;
            this.agentConnected = false;
            this.agentSessionPath = null;
            const msgs = document.getElementById('agentMessages');
            if (msgs) msgs.innerHTML = '';
            const feed = document.getElementById('storyColFeed');
            if (feed) feed.innerHTML = '';
            const storyCol = document.getElementById('storyCol');
            if (storyCol) storyCol.classList.remove('collapsed');
            this._updateAgentStatus('idle');

            // Reset staging state
            this.isStagingActive = false;
            this._lastHeartbeat = null;
            this._stagingSessionId = null;
            this._pendingAgentResponse = false;
            this.isAgentMuted = false;
            // Reset mute button UI
            const muteBtn = document.getElementById('agentMuteBtn');
            if (muteBtn) {
                muteBtn.classList.remove('muted');
                muteBtn.title = 'Mute agent';
                muteBtn.querySelector('i').className = 'ph ph-speaker-high';
            }
            const staging = document.getElementById('agentStaging');
            if (staging) staging.style.display = '';
            const active = document.getElementById('agentActive');
            if (active) active.style.display = 'none';

            // Restore record button, original title, and remove back button
            document.getElementById('appContainer')?.classList.remove('staging-mode');
            document.getElementById('agentBackBtn')?.remove();
            this.recordButton.classList.remove('hidden');
            const titleFull = document.querySelector('.title-full');
            if (titleFull && this._originalTitleHTML) {
                titleFull.innerHTML = this._originalTitleHTML;
            }

            // Notify main process that realtime feed is no longer active
            if (window.electronAPI && window.electronAPI.setRealtimeActive) {
                window.electronAPI.setRealtimeActive(false);
            }
        }
    }

    async startAgentFeedPolling(sessionId) {
        this.agentFeedOffset = 0;
        this.agentConnected = false;
        this.agentSessionPath = null;
        this.showAgentPanel();
        this._updateAgentStatus('broadcasting');
        // Register session immediately so latest pointer is set now
        try {
            const res = await fetch(`${this.backendUrl}/api/feeds/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId })
            });
            if (res.ok) {
                const data = await res.json();
                this.agentSessionPath = data.path;
            }
        } catch (e) {
            console.warn('Feed start error:', e);
        }
        this.agentFeedInterval = setInterval(() => this._pollAgentFeed(), 5000);
    }

    stopAgentFeedPolling() {
        if (this.agentFeedInterval) {
            clearInterval(this.agentFeedInterval);
            this.agentFeedInterval = null;
        }
        // Panel stays visible after recording stops — hides on next startRecording()
    }

    async _pollAgentFeed() {
        try {
            const res = await fetch(`${this.backendUrl}/api/feeds/agent?offset=${this.agentFeedOffset}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.lines && data.lines.length > 0) {
                for (const line of data.lines) {
                    if (line.type === 'heartbeat') {
                        this._lastHeartbeat = Date.now();
                        continue;  // Don't render heartbeats
                    }
                    if (!this.agentConnected) {
                        this.agentConnected = true;
                    }
                    this._pendingAgentResponse = false;
                    this._renderAgentLine(line);
                }
                this.agentFeedOffset = data.offset;
            }
            this._updateHeartbeatStatus();
        } catch (e) {
            console.warn('Agent feed poll error:', e);
        }
    }

    _updateHeartbeatStatus() {
        // Handle 2x2 matrix: recording paused × agent muted
        if (this.isRecordingPaused && this.isAgentMuted) {
            this._updateAgentStatus('paused_muted');
            return;
        }
        if (this.isRecordingPaused) {
            this._updateAgentStatus('paused');
            return;
        }
        if (this.isAgentMuted) {
            this._updateAgentStatus('muted');
            return;
        }
        // No heartbeats ever → waiting for agent
        if (!this._lastHeartbeat) {
            this._updateAgentStatus('awaiting');
            return;
        }
        const age = Date.now() - this._lastHeartbeat;

        // Heartbeat dead (>30s)
        if (age > 30000) {
            this._updateAgentStatus('disconnected');
            return;
        }
        // Heartbeat stale (15-30s)
        if (age > 15000) {
            this._updateAgentStatus('stale');
            return;
        }
        // Heartbeat fresh — agent is alive
        if (this._pendingAgentResponse) {
            this._updateAgentStatus('thinking');
        } else if (!this._selectedModeProactive) {
            this._updateAgentStatus('listening_quiet');
        } else {
            this._updateAgentStatus('listening');
        }
    }

    _renderAgentLine(line) {
        const container = document.getElementById('agentMessages');
        if (!container) return;
        const label = this._lastAgentPrompt
            ? `Claude · ${this._lastAgentPrompt}`
            : (line.label || line.type || 'Agent');
        this._lastAgentPrompt = null;
        const div = document.createElement('div');
        div.className = 'agent-msg';
        div.innerHTML = `
            <div class="agent-msg-avatar"><i class="ph ph-robot"></i></div>
            <div class="agent-msg-body">
                <div class="agent-msg-label">${label}</div>
                ${line.ctx ? `<div class="agent-msg-ctx">${this._renderMd(line.ctx)}</div>` : ''}
                <div class="agent-msg-text">${this._renderMd(line.text)}</div>
            </div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    _renderMd(text) {
        if (!text) return '';
        return text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .split('\n')
            .map(line => {
                if (line.match(/^- (.*)/)) return `<div class="md-bullet-line">— ${line.slice(2)}</div>`;
                const numMatch = line.match(/^(\d+)\.\s(.*)/);
                if (numMatch) return `<div class="md-num-line"><span class="md-num">${numMatch[1]}.</span> ${numMatch[2]}</div>`;
                return line;
            })
            .join('<br>')
            .replace(/<\/div><br><div class="md-(?:bullet|num)-line">/g, m => m.replace('<br>', ''))
            .replace(/<br><div class="md-(?:bullet|num)-line">/g, m => m.replace('<br>', ''))
            .replace(/<\/div>(<br>)+(?!<div class="md-)/g, '</div>');
    }

    _addStoryChunk(text, idx) {
        const feed = document.getElementById('storyColFeed');
        if (!feed) return;
        feed.querySelectorAll('.story-chunk.live').forEach(el => el.classList.remove('live'));
        const div = document.createElement('div');
        div.className = 'story-chunk live';
        const elapsed = this.timer ? this.timer.textContent : '00:00';
        div.innerHTML = `<span class="story-chunk-time">${elapsed}</span><span class="story-chunk-text">${text}</span>`;
        feed.appendChild(div);
        feed.scrollTop = feed.scrollHeight;

        // In proactive mode, a new chunk means we expect the agent to react (unless muted)
        if (this._selectedModeProactive && this.agentConnected && !this.isAgentMuted) {
            this._pendingAgentResponse = true;
        }
    }

    async sendAgentPrompt(promptKey) {
        const promptMap = {
            summarize: 'Summarize the conversation so far',
            challenge: 'Challenge this idea — what are the counterarguments?',
            ambiguities: 'Identify ambiguities or unclear points in what was said',
        };
        const text = promptMap[promptKey] || promptKey;
        const labelMap = {
            summarize: 'Summarize',
            challenge: 'Challenge',
            ambiguities: 'Ambiguities',
        };
        this._lastAgentPrompt = labelMap[promptKey] || promptKey;
        this._pendingAgentResponse = true;
        const container = document.getElementById('agentMessages');
        if (container) {
            const div = document.createElement('div');
            div.className = 'agent-user-prompt';
            div.innerHTML = `<div class="agent-user-prompt-label">You</div><div class="agent-user-prompt-text">${text}</div>`;
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
        }
        try {
            await fetch(`${this.backendUrl}/api/feeds/prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: promptKey, text })
            });
        } catch (e) {
            console.warn('Prompt send error:', e);
        }
    }

    _updateAgentStatus(phase) {
        const dot = document.getElementById('agentStatusDot');
        const txt = document.getElementById('agentStatusText');
        if (!dot || !txt) return;
        dot.className = 'agent-status-dot';
        const labels = {
            idle: '',
            broadcasting: 'Broadcasting...',
            awaiting: 'Waiting for agent...',
            listening: 'Listening...',
            listening_quiet: 'Listening quietly',
            thinking: 'Thinking...',
            paused: 'Recording paused',
            muted: 'Agent muted',
            paused_muted: 'Paused · Muted',
            stale: 'Agent idle',
            disconnected: 'Disconnected'
        };
        txt.textContent = labels[phase] || '';
        if (phase === 'broadcasting' || phase === 'awaiting') dot.classList.add('broadcasting');
        else if (phase === 'listening' || phase === 'listening_quiet' || phase === 'paused' || phase === 'paused_muted') dot.classList.add('connected');
        else if (phase === 'muted') dot.classList.add('muted');
        else if (phase === 'thinking') dot.classList.add('thinking');
        else if (phase === 'stale') dot.classList.add('stale');
        else if (phase === 'disconnected') dot.classList.add('disconnected');
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new VoiceToTextApp();
});