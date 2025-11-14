/**
 * UIStateController - Reactive UI updates based on state changes
 * 
 * Listens to StateManager changes and updates UI automatically
 * Separates UI logic from business logic
 */
class UIStateController {
    constructor(stateManager, elements = {}) {
        this.state = stateManager;
        this.elements = elements;
        this.debug = false;
        this.subscriptions = [];
    }
    
    log(message, ...args) {
        if (this.debug) {
            console.log(message, ...args);
        }
    }
    
    /**
     * Set UI elements
     */
    setElements(elements) {
        this.elements = { ...this.elements, ...elements };
    }
    
    /**
     * Initialize all state subscriptions
     */
    init() {
        this.setupRecordingSubscriptions();
        this.setupUISubscriptions();
        this.setupSettingsSubscriptions();
        this.log('✅ UIStateController initialized');
    }
    
    /**
     * Setup recording state subscriptions
     */
    setupRecordingSubscriptions() {
        // Listen to recording state changes
        const unsubRecording = this.state.subscribe('recording.isRecording', (isRecording) => {
            this.updateRecordingUI(isRecording);
        });
        this.subscriptions.push(unsubRecording);
        
        // Listen to recording source
        const unsubSource = this.state.subscribe('recording.source', (source) => {
            this.log('Recording source changed:', source);
        });
        this.subscriptions.push(unsubSource);
        
        // Listen to cancelled state
        const unsubCancelled = this.state.subscribe('recording.isCancelled', (isCancelled) => {
            if (isCancelled) {
                this.updateUIForCancelled();
            }
        });
        this.subscriptions.push(unsubCancelled);
    }
    
    /**
     * Setup UI state subscriptions
     */
    setupUISubscriptions() {
        // Listen to panel changes
        const unsubPanel = this.state.subscribe('ui.currentPanel', (panel) => {
            this.log('Current panel:', panel);
        });
        this.subscriptions.push(unsubPanel);
        
        // Listen to modal changes
        const unsubModal = this.state.subscribe('ui.currentModal', (modal) => {
            this.log('Current modal:', modal);
        });
        this.subscriptions.push(unsubModal);
        
        // Listen to widget visibility
        const unsubWidget = this.state.subscribe('ui.widgetVisible', (visible) => {
            this.updateWidgetVisibility(visible);
        });
        this.subscriptions.push(unsubWidget);
    }
    
    /**
     * Setup settings state subscriptions
     */
    setupSettingsSubscriptions() {
        // Listen to API key status
        const unsubApiKey = this.state.subscribe('settings.hasApiKey', (hasKey) => {
            this.updateApiKeyUI(hasKey);
        });
        this.subscriptions.push(unsubApiKey);
        
        // Listen to save audio setting
        const unsubSaveAudio = this.state.subscribe('settings.saveAudio', (saveAudio) => {
            this.log('Save audio setting:', saveAudio);
        });
        this.subscriptions.push(unsubSaveAudio);
        
        // Listen to auto-hide widget
        const unsubAutoHide = this.state.subscribe('settings.autoHideWidget', (autoHide) => {
            this.log('Auto-hide widget:', autoHide);
        });
        this.subscriptions.push(unsubAutoHide);
    }
    
    // ====================================
    // UI UPDATE METHODS
    // ====================================
    
    /**
     * Update recording UI state
     */
    updateRecordingUI(isRecording) {
        this.log('🎙️ Recording state changed:', isRecording);
        
        if (isRecording) {
            this.updateUIForRecording();
        } else {
            this.updateUIForIdle();
        }
    }
    
    /**
     * Update UI for recording state
     */
    updateUIForRecording() {
        const { recordButton, recordingInfo, timer, visualizer } = this.elements;
        
        if (recordButton) {
            recordButton.classList.add('recording');
            recordButton.querySelector('i')?.classList.replace('ph-microphone', 'ph-stop');
        }
        
        if (recordingInfo) {
            recordingInfo.classList.remove('hidden');
        }
        
        if (timer) {
            timer.textContent = '00:00';
        }
        
        if (visualizer) {
            visualizer.classList.add('active');
        }
        
        this.log('✅ UI updated for recording');
    }
    
    /**
     * Update UI for idle state
     */
    updateUIForIdle() {
        const { recordButton, recordingInfo, visualizer, cancelButton } = this.elements;
        
        if (recordButton) {
            recordButton.classList.remove('recording', 'transcribing');
            recordButton.querySelector('i')?.classList.replace('ph-stop', 'ph-microphone');
        }
        
        if (recordingInfo) {
            recordingInfo.classList.add('hidden');
        }
        
        if (visualizer) {
            visualizer.classList.remove('active');
        }
        
        if (cancelButton) {
            cancelButton.classList.add('hidden');
        }
        
        this.log('✅ UI updated for idle');
    }
    
    /**
     * Update UI for cancelled state
     */
    updateUIForCancelled() {
        this.log('❌ Recording cancelled');
        this.updateUIForIdle();
    }
    
    /**
     * Update UI for transcribing state
     */
    updateUIForTranscribing() {
        const { recordButton, statusText } = this.elements;
        
        if (recordButton) {
            recordButton.classList.add('transcribing');
            recordButton.classList.remove('recording');
        }
        
        if (statusText) {
            statusText.textContent = 'Transcribing...';
        }
        
        this.log('✅ UI updated for transcribing');
    }
    
    /**
     * Update API key UI
     */
    updateApiKeyUI(hasKey) {
        const { apiKeySettingItem, apiKeyConfiguredItem } = this.elements;
        
        if (hasKey) {
            apiKeySettingItem?.classList.add('hidden');
            apiKeyConfiguredItem?.classList.remove('hidden');
        } else {
            apiKeySettingItem?.classList.remove('hidden');
            apiKeyConfiguredItem?.classList.add('hidden');
        }
        
        this.log('🔑 API Key UI updated:', hasKey ? 'configured' : 'not configured');
    }
    
    /**
     * Update widget visibility
     */
    updateWidgetVisibility(visible) {
        this.log('👁️ Widget visibility:', visible ? 'visible' : 'hidden');
        // Widget visibility handled by Electron main process
    }
    
    // ====================================
    // HELPERS
    // ====================================
    
    /**
     * Show element
     */
    show(element) {
        element?.classList.remove('hidden');
    }
    
    /**
     * Hide element
     */
    hide(element) {
        element?.classList.add('hidden');
    }
    
    /**
     * Toggle element visibility
     */
    toggle(element, show) {
        if (show) {
            this.show(element);
        } else {
            this.hide(element);
        }
    }
    
    /**
     * Cleanup all subscriptions
     */
    destroy() {
        this.subscriptions.forEach(unsub => unsub());
        this.subscriptions = [];
        this.log('🧹 UIStateController destroyed');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIStateController;
}

