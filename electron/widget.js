// ====================================
// WIDGET APP - Main Controller
// ====================================

class WidgetApp {
    constructor() {
        this.backendUrl = 'http://127.0.0.1:57002'; // Default, will be updated
        this.recordButton = document.getElementById('recordButton');
        this.timerDisplay = document.getElementById('timerDisplay');
        this.cancelButton = document.getElementById('cancelButton');
        this.widgetContainer = document.querySelector('.widget-container');
        this.widgetControls = document.getElementById('widgetControls');
        this.isRecording = false;
        this.isProcessing = false;
        this.startTime = null;
        this.timerInterval = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isCancelled = false;
        this.manualButtonControl = false;
        this.pollingInterval = null;
        this.recordingSource = null; // 'main' or 'widget' - who's actually recording
        this.currentState = 'inactive'; // inactive, starting, recording, recording_active, transcribing
        this.safetyTimeout = null; // Safety timeout to prevent infinite recording
        this.hasApiKey = false; // Track API key status
        
        // 🔧 Recording configuration (received from main process)
        // These values are set by main.js to keep widget and main window in sync
        this.MAX_RECORDING_MINUTES = 20; // Default, will be overridden by config
        this.WARNING_AT_MINUTES = 15; // Default, will be overridden by config
        this.LONG_RECORDING_MINUTES = 5; // Default, will be overridden by config
        
        // Sleep/wake detection variables
        this.lastActivityCheck = Date.now();
        this.sleepWakeCheckInterval = null;
        
        // Telemetry client
        this.telemetry = new TelemetryClient();

        // Fluid Transcription
        this.fluidTranscription = null;
        this.isFluidEnabled = false;
        this._fluidStopping = false; // Guard flag for onstop handler

        // Instant recording mode (skip animations for faster start)
        this.instantMode = false;

        // Smart Transforms — clean state
        this.transformButton = document.getElementById('transformButton');
        this.transformDropdown = document.getElementById('transformDropdown');
        this._transformPresets = null;
        this._lastTranscriptionId = null;
        this._autoPasteEnabled = false;
        this._transformCountdownTimer = null;
        this.isInstructionMode = false; // true = recording a voice instruction for custom transform
        this.isPromptMode = false;     // true = recording a direct AI prompt (double-tap)

        this.init();
        this.setupRecordingConfig(); // Listen for config from main process
    }

    // Receive recording configuration from main process
    setupRecordingConfig() {
        if (window.electronAPI && window.electronAPI.onRecordingConfig) {
            window.electronAPI.onRecordingConfig((config) => {
                this.MAX_RECORDING_MINUTES = config.MAX_MINUTES;
                this.WARNING_AT_MINUTES = config.WARNING_MINUTES;
                this.LONG_RECORDING_MINUTES = config.LONG_RECORDING_MINUTES;
                console.log('📐 Widget received recording config:', config);
            });
        }
    }

    async init() {
        // Initialize telemetry
        await this.initializeTelemetry();
        
        // Set up button event listeners
        this.recordButton.addEventListener('click', () => this.handleRecordClick());
        this.cancelButton.addEventListener('click', (event) => {
            event.stopPropagation();
            event.preventDefault();
            // In transform states, cancel = dismiss transform mode
            if (this.currentState.startsWith('transform_')) {
                this.setWidgetState('inactive');
            } else {
                this.cancelRecording('cancel_button');
            }
        });
        
        // Force stop mechanism: hold stop button for 2 seconds
        this.holdTimeout = null;
        this.recordButton.addEventListener('mousedown', (e) => {
            if (this.isRecording) {
                this.holdTimeout = setTimeout(() => {
                    this.forceStopRecording('button_hold_2s');
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
        
        // Set up recording sync listener
        this.setupRecordingSync();
        
        // Set up shortcut listener
        this.setupShortcutListener();
        
        // Listen for instant recording setting changes from main process
        if (window.electronAPI && window.electronAPI.onInstantRecordingChanged) {
            window.electronAPI.onInstantRecordingChanged((event, isEnabled) => {
                this.setInstantMode(isEnabled);
            });
        }

        // Initialize backend URL with dynamic port
        this.initBackendUrl();

        // Start button state polling
        this.startButtonStatePolling();

        // Smart Transforms setup
        this.setupTransform();
    }
    
    async initializeTelemetry() {
        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/telemetry_enabled`);
            if (response.ok) {
                const data = await response.json();
                const isEnabled = data.value !== false;
                this.telemetry.setEnabled(isEnabled);
            } else {
                this.telemetry.setEnabled(true);
            }
            await this.telemetry.init();
        } catch (error) {
            console.error('Error initializing telemetry:', error);
            this.telemetry.setEnabled(true);
        }
    }
    
    async getPlatform() {
        if (window.electronAPI && window.electronAPI.invoke) {
            return await window.electronAPI.invoke('get-platform');
        }
        return 'unknown';
    }
    
    async getAppVersion() {
        if (window.electronAPI && window.electronAPI.invoke) {
            return await window.electronAPI.invoke('get-app-version');
        }
        return '0.0.0';
    }
    
    async initBackendUrl() {
        // Get dynamic backend port from Electron
        if (window.electronAPI && window.electronAPI.getBackendPort) {
            try {
                const port = await window.electronAPI.getBackendPort();
                this.backendUrl = `http://127.0.0.1:${port}`;
            } catch (error) {
                console.warn('⚠️ Widget: Could not get backend port, using default:', this.backendUrl);
            }
        }

        // Initialize FluidTranscriptionManager
        this.fluidTranscription = new FluidTranscriptionManager(null, this.backendUrl);

        // Load fluid transcription setting
        this.loadFluidTranscriptionSetting();

        // Load instant recording setting
        this.loadInstantRecordingSetting();

        // Now check backend connection
        this.checkBackendConnection();
    }

    async checkBackendConnection() {
        try {
            const response = await fetch(`${this.backendUrl}/api/health`);
            if (response.ok) {
                this.updateButtonStates();
                // Check API key status on connection
                await this.checkApiKeyStatus();
            } else {
                setTimeout(() => this.checkBackendConnection(), 2000);
            }
        } catch (error) {
            console.error('❌ Widget: Backend connection failed, retrying...', error);
            setTimeout(() => this.checkBackendConnection(), 2000);
        }
    }
    
    async checkApiKeyStatus() {
        try {
            const response = await fetch(`${this.backendUrl}/api/config/api-key`);
            if (response.ok) {
                const data = await response.json();
                this.hasApiKey = data.has_api_key;
                console.log('🔑 Widget: API Key status:', this.hasApiKey ? 'configured' : 'missing');
                
                // Update button visual state
                if (!this.hasApiKey) {
                    this.setWidgetDisabled();
                } else if (this.currentState === 'inactive') {
                    // Re-enable if it was disabled
                    this.recordButton.style.opacity = '1';
                    this.recordButton.style.cursor = 'pointer';
                    this.recordButton.removeAttribute('title');
                }
            }
        } catch (error) {
            console.error('❌ Widget: Error checking API key status:', error);
        }
    }
    
    setWidgetDisabled() {
        // Visual feedback for disabled state (only when inactive)
        if (this.currentState === 'inactive' && this.recordButton) {
            this.recordButton.style.opacity = '0.3';
            this.recordButton.style.cursor = 'not-allowed';
            this.recordButton.setAttribute('title', 'Add your API key in Settings');
        }
    }

    async handleRecordClick() {
        
        // BETTER state check: use isRecording flag primarily
        const isCurrentlyRecording = this.isRecording && (this.recordingSource === 'widget' || this.recordingSource === 'main');
        
        // Check if API key is configured when starting new recording
        if (!isCurrentlyRecording && !this.hasApiKey) {
            console.warn('🔑 Widget: Cannot record - No API Key configured');
            // Notify main window to show message
            if (window.electronAPI && window.electronAPI.syncRecordingState) {
                await window.electronAPI.syncRecordingState('api_key_required');
            }
            return; // Abort recording
        }
        
        if (isCurrentlyRecording) {
            // Check who's recording
            if (this.recordingSource === 'widget') {
                // Widget is recording, stop it
                await this.stopRecording();
            } else if (this.recordingSource === 'main') {
                // Main window is recording, send stop request
                if (window.electronAPI && window.electronAPI.syncRecordingState) {
                    await window.electronAPI.syncRecordingState('request_stop_main_recording');
                }
            }
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            // Instant mode: pre-expand widget BEFORE anything else
            // so it's already in recording layout when it becomes visible
            if (this.instantMode) {
                this.widgetContainer.classList.remove('compact');
                this.widgetContainer.classList.add('expanded');
                this.recordButton.classList.remove('inactive', 'processing');
                this.recordButton.classList.add('recording');
                this.recordButton.innerHTML = '<div class="stop-square"></div>';
                this.recordButton.style.opacity = '1';
                this.cancelButton.disabled = false;
                this.cancelButton.style.opacity = '1';
                this.timerDisplay.style.opacity = '1';
                if (window.electronAPI && window.electronAPI.resizeWidget) {
                    window.electronAPI.resizeWidget(130, 40); // fire-and-forget, no await
                }
            }

            // Safety timeout: auto force-stop after MAX_RECORDING_MINUTES
            const maxTimeMs = this.MAX_RECORDING_MINUTES * 60 * 1000;
            this.safetyTimeout = setTimeout(() => {
                if (this.isRecording) {
                    console.error(`⚠️ SAFETY TIMEOUT: ${this.MAX_RECORDING_MINUTES} minutes exceeded, forcing stop`);
                    this.forceStopRecording('max_time_exceeded');
                }
            }, maxTimeMs);
            
            // Start sleep/wake detection to handle Mac sleep scenarios
            this.startSleepWakeDetection();
            
            // Start actual recording using web API directly
            await this.startWebRecording();
            
            // Mark that widget is recording
            this.recordingSource = 'widget';
            
            // Show recording state immediately (skip "starting")
            await this.setWidgetState('recording');
            
            // After 3 seconds, switch to recording_active state
            setTimeout(async () => {
                if (this.currentState === 'recording') {
                    await this.setWidgetState('recording_active');
                }
            }, 3000);
            
            // NOTIFY MAIN WINDOW: Widget started recording
            // Skip notification in instruction mode — main window should not sync
            if (!this.isInstructionMode && window.electronAPI && window.electronAPI.syncRecordingState) {
                try {
                    await window.electronAPI.syncRecordingState('widget_recording_started');
                    // Request main window to play record start sound
                    await window.electronAPI.syncRecordingState('play_sound_record_start');
                } catch (error) {
                    console.warn('⚠️ Could not notify main window:', error);
                }
            }
            
            // Track recording started
            await this.telemetry.track('recording_started', {
                source: 'widget',
                platform: await this.getPlatform()
            });
            
        } catch (error) {
            console.error('🎛️ Error starting recording:', error);
            console.error('🎛️ Error details:', error.message);
        }
    }

    async stopRecording() {
        try {
            console.log('🎛️ Stopping recording from widget');
            
            // Clear safety timeout
            if (this.safetyTimeout) {
                clearTimeout(this.safetyTimeout);
                this.safetyTimeout = null;
            }
            
            // Stop sleep/wake detection
            this.stopSleepWakeDetection();
            
            // Stop actual recording - this will trigger processWebRecording
            this.stopWebRecording();
            
            // Track recording completed
            const duration = this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0;
            await this.telemetry.track('recording_completed', {
                source: 'widget',
                duration_seconds: duration,
                platform: await this.getPlatform()
            });
            
            console.log('🎛️ Recording stopped, processing will begin automatically');
        } catch (error) {
            console.error('🎛️ Error stopping recording:', error);
        }
    }

    async startWebRecording() {
        try {
            // Refresh fluid setting from backend before each recording
            // Skip in instant mode — use cached value from startup/settings change
            if (!this.instantMode) {
                await this.loadFluidTranscriptionSetting();
            }

            console.log('🎛️ Requesting microphone access...');

            // Check if mediaDevices is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('getUserMedia not supported');
            }
            
            console.log('🎛️ navigator.mediaDevices available');

            // Build audio constraints with preferred microphone
            const audioConstraints = {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            };

            try {
                const micResponse = await fetch(`${this.backendUrl}/api/config/settings/audio_settings.preferred_microphone`);
                if (micResponse.ok) {
                    const micData = await micResponse.json();
                    if (micData.value && micData.value !== 'default') {
                        audioConstraints.deviceId = { exact: micData.value };
                        console.log('🎙️ Widget using preferred microphone:', micData.value);
                    }
                }
            } catch (e) {
                console.log('🎙️ Could not load mic preference, using system default');
            }

            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
            
            console.log('🎛️ Microphone access granted!');
            console.log('🎛️ Stream:', stream);
            console.log('🎛️ Audio tracks:', stream.getAudioTracks().length);
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            this.audioChunks = [];
            this.isCancelled = false;
            
            console.log('🎛️ MediaRecorder created');
            
            this.mediaRecorder.ondataavailable = event => {
                console.log('🎛️ Data available:', event.data.size, 'bytes');
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = async () => {
                console.log('🎛️ MediaRecorder stopped');
                console.log('🎛️ isCancelled flag at onstop:', this.isCancelled);
                console.log('🎛️ _fluidStopping flag at onstop:', this._fluidStopping);

                // If fluid transcription is handling the stop, skip all onstop logic
                // handleFluidStop() manages its own state, hide, and cleanup
                if (this._fluidStopping) {
                    console.log('🎛️ Fluid transcription handling stop — onstop skipping');
                    return;
                }

                // Only process if not cancelled
                if (!this.isCancelled) {
                    console.log('🎛️ Processing recording...');
                    this.processWebRecording();
                } else {
                    console.log('🎛️ Recording was cancelled, not processing');
                    // CRITICAL: Reset isCancelled flag ONLY after onstop fires
                    this.isCancelled = false;
                    console.log('🎛️ isCancelled flag reset after cancellation');

                    // Request widget hide if auto-hide is enabled
                    if (window.electronAPI && window.electronAPI.requestWidgetHide) {
                        console.log('🎛️ Requesting widget hide after cancellation...');
                        await window.electronAPI.requestWidgetHide();
                    }
                }
            };
            
            // CRITICAL: Handle MediaRecorder errors (mic disconnected, system error, etc.)
            this.mediaRecorder.onerror = (event) => {
                console.error('🚨 MediaRecorder ERROR:', event.error);
                console.error('🚨 Error name:', event.error?.name);
                console.error('🚨 Error message:', event.error?.message);
                console.error('🚨 MediaRecorder state:', this.mediaRecorder?.state);
                
                // Cancel recording due to error
                this.cancelRecording('media_recorder_error');
            };
            
            // CRITICAL: Handle audio track ending unexpectedly (mic disconnected, permission revoked, etc.)
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length > 0) {
                audioTracks[0].onended = () => {
                    console.error('🚨 Audio track ended unexpectedly');
                    console.error('🚨 Track state:', audioTracks[0].readyState);
                    console.error('🚨 Track enabled:', audioTracks[0].enabled);
                    console.error('🚨 Track muted:', audioTracks[0].muted);
                    
                    // Cancel recording if track ends while recording
                    if (this.isRecording && this.mediaRecorder?.state === 'recording') {
                        this.cancelRecording('audio_track_ended');
                    }
                };
                
                audioTracks[0].onmute = () => {
                    console.warn('⚠️ Audio track muted');
                };
                
                audioTracks[0].onunmute = () => {
                    console.log('✅ Audio track unmuted');
                };
            }
            
            this.mediaRecorder.start();
            console.log('🎛️ MediaRecorder started');

            // Start fluid transcription if enabled (NEVER in instruction mode)
            console.log(`🔄 Widget: fluid enabled=${this.isFluidEnabled}, manager=${!!this.fluidTranscription}, instructionMode=${this.isInstructionMode}`);
            if (this.isFluidEnabled && this.fluidTranscription && !this.isInstructionMode) {
                console.log('🔄 Widget: Starting fluid transcription...');
                this.fluidTranscription.start(stream);
            } else {
                console.log(`🔄 Widget: Using classic mode${this.isInstructionMode ? ' (instruction mode)' : ''}`);
            }

            this.startTimer();
            this.showCancelButton();

            // Update recording state immediately
            this.isRecording = true;
            console.log('🎛️ Recording state updated to:', this.isRecording);

            console.log('🎛️ Web recording started successfully');
            
        } catch (error) {
            console.error('🎛️ Error in startWebRecording:', error);
            console.error('🎛️ Error name:', error.name);
            console.error('🎛️ Error message:', error.message);
            
            let errorMessage = 'Error accessing microphone: ' + error.message;
            
            if (error.name === 'NotAllowedError') {
                errorMessage = 'Microphone access denied. Please allow microphone access in system preferences.';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'No microphone found. Please connect a microphone.';
            } else if (error.name === 'NotSupportedError') {
                errorMessage = 'Microphone not supported on this device.';
            }
            
            alert(errorMessage);
        }
    }

    async stopWebRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            // Check if fluid transcription is active
            // SKIP fluid path in instruction/prompt mode — standard path has the intercept
            const fluidActive = this.fluidTranscription && this.fluidTranscription.isActive() && !this.isInstructionMode;

            if (fluidActive) {
                // Prevent processWebRecording from running
                this.isCancelled = true;
                // Guard: tell onstop handler to skip entirely (fluid handles everything)
                this._fluidStopping = true;
            }

            // Stop mediaRecorder and timer FIRST — user expects immediate response
            this.mediaRecorder.stop();
            this.stopTimer();

            // THEN stop fluid silently if we switched to instruction/prompt mode mid-recording
            if (this.isInstructionMode && this.fluidTranscription && this.fluidTranscription.isActive()) {
                // Fire-and-forget — don't await, let it clean up in background
                this.fluidTranscription.stop().catch(() => {});
                console.log('🔄 Fluid stopping in background (prompt/instruction mode)');
            }

            // Clear recording source
            this.recordingSource = null;

            console.log('🎛️ Web recording stopped');

            // NOTIFY MAIN WINDOW: Widget stopped recording
            // Skip notification in instruction mode — main window should not sync
            if (!this.isInstructionMode && window.electronAPI && window.electronAPI.syncRecordingState) {
                try {
                    await window.electronAPI.syncRecordingState('widget_recording_stopped');
                    // Request main window to play record stop sound
                    await window.electronAPI.syncRecordingState('play_sound_record_stop');
                    console.log('📢 Notified main window: widget stopped recording');
                } catch (error) {
                    console.warn('⚠️ Could not notify main window:', error);
                }
            }

            // If fluid was active, handle fluid stop flow
            if (fluidActive) {
                const duration = this.startTime ? (Date.now() - this.startTime) / 1000 : 0;
                await this.handleFluidStop(duration);
            }
        }
    }

    async processWebRecording() {
        try {
            console.log('🎛️ Processing web recording...');
            
            // Show transcribing state
            await this.setWidgetState('transcribing');
            
            // Stage 1: Starting (10%)
            this.setTranscriptionProgress(10);
            
            // Notify main process: widget is transcribing (skip in instruction mode)
            if (!this.isInstructionMode && window.electronAPI && window.electronAPI.syncRecordingState) {
                try {
                    await window.electronAPI.syncRecordingState('widget_transcribing');
                } catch (error) {
                    console.warn('⚠️ Could not notify main process of transcribing state:', error);
                }
            }
            
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            
            // 🔍 VALIDATE AUDIO FILE SIZE (25MB OpenAI limit)
            const maxSizeMB = 25;
            const maxSizeBytes = maxSizeMB * 1024 * 1024;
            const fileSizeMB = (audioBlob.size / 1024 / 1024).toFixed(1);
            
            if (audioBlob.size > maxSizeBytes) {
                console.error(`❌ Widget: Audio file too large: ${fileSizeMB}MB (max: ${maxSizeMB}MB)`);
                
                // Clear audio chunks (cleanup)
                this.audioChunks = [];
                
                // Reset widget to idle state
                await this.setWidgetState('inactive');
                
                // Log error for user (widget doesn't have toast, but logs are visible in dev tools)
                console.error(`🚨 Recording too long (${fileSizeMB}MB). Please record shorter clips (max ${maxSizeMB}MB).`);
                
                // Notify main window of completion (so it can show error if needed)
                try {
                    await window.electronAPI.syncRecordingState('transcription_completed');
                } catch (error) {
                    console.error('❌ Could not notify main window of size error:', error);
                }
                
                return; // Exit early
            }
            
            console.log(`✅ Widget: Audio file size OK: ${fileSizeMB}MB (max: ${maxSizeMB}MB)`);
            
            // Clear audio chunks immediately after creating blob (memory optimization)
            this.audioChunks = [];
            
            // Calculate audio duration for dynamic timeout
            const audioDurationSeconds = this.startTime ? (Date.now() - this.startTime) / 1000 : 0;
            
            // Calculate frontend timeout (backend timeout + 60s buffer)
            // Backend uses: (duration * 2) + 30
            // Frontend uses: (duration * 2) + 90 (gives backend 60s extra to respond)
            const timeoutMs = audioDurationSeconds 
                ? ((audioDurationSeconds * 2) + 90) * 1000 
                : 150000; // Default 150s (2.5 minutes) if duration unknown
            
            // Create AbortController for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.error('❌ Widget timeout reached, aborting request');
                controller.abort();
            }, timeoutMs);
            
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            // Instruction mode: don't save to DB (ephemeral transcription)
            if (this.isInstructionMode) {
                formData.append('ephemeral', 'true');
            }
            
            console.log('🎛️ Sending to backend for transcription...');
            
            // Stage 2: Sending audio (30%)
            this.setTranscriptionProgress(30);
            
            let response;
            try {
                response = await fetch(`${this.backendUrl}/api/transcribe`, {
                    method: 'POST',
                    body: formData,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                
                // Stage 3: Processing (60%)
                this.setTranscriptionProgress(60);
            } catch (fetchError) {
                clearTimeout(timeoutId);
                
                // Check if it was an abort (timeout)
                if (fetchError.name === 'AbortError') {
                    console.error('❌ Widget transcription timeout');
                    await this.setWidgetState('inactive');
                    
                    // Notify main window to show error
                    try {
                        await window.electronAPI.syncRecordingState('transcription_timeout');
                    } catch (error) {
                        console.error('❌ Could not notify main window of timeout:', error);
                    }
                    return;
                }
                throw fetchError;
            }
            
            if (response.ok) {
                const data = await response.json();
                console.log('🎛️ Transcription result:', data.text);
                console.log('🎛️ Transcription ID:', data.transcription_id || 'no ID returned');
                
                // Stage 4: Result received (85%)
                this.setTranscriptionProgress(85);
                
                // Track transcription completed
                // Calculate cost if not provided by backend (fallback)
                // IMPORTANT: If cost_usd is 0, undefined, or null, calculate it from duration
                let cost_usd = data.cost_usd ?? data.cost;
                const duration = data.duration_seconds || audioDurationSeconds || 0;
                
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
                    duration_seconds: data.duration_seconds || audioDurationSeconds || 0,
                    cost_usd: cost_usd,
                    word_count: data.text ? data.text.split(/\s+/).length : 0,
                    platform: await this.getPlatform()
                });
                
                // Smart Transforms: instruction mode / prompt mode intercept
                if (this.isInstructionMode) {
                    if (this.isPromptMode) {
                        console.log('🎯 Prompt mode — sending to AI as direct prompt');
                        this._endPromptMode(data.text);
                    } else {
                        console.log('🪄 Instruction mode — using transcription as transform prompt');
                        this._endInstructionMode(data.text);
                    }
                    return; // Skip normal auto-paste and history flow
                }

                // Execute auto-paste using Electron API (same as main window)
                try {
                    if (window.electronAPI && window.electronAPI.requestAutoPaste) {
                        console.log('🎛️ Requesting auto-paste...');
                        await window.electronAPI.requestAutoPaste(data.text);
                        console.log('✅ Auto-paste executed via Electron API');
                    } else {
                        console.warn('⚠️ Electron API not available for auto-paste');
                    }
                } catch (pasteError) {
                    console.error('❌ Auto-paste error:', pasteError);
                }
                
                // SMART WAIT: Poll the backend until the transcription appears in history
                const transcriptionId = data.transcription_id;
                if (transcriptionId) {
                    console.log(`🔍 Waiting for transcription ${transcriptionId} to appear in DB...`);
                    
                    let attempts = 0;
                    let maxAttempts = 10; // Max 5 seconds (10 * 500ms)
                    let found = false;
                    
                    while (attempts < maxAttempts && !found) {
                        try {
                            const historyResponse = await fetch(`${this.backendUrl}/api/history`);
                            if (historyResponse.ok) {
                                const historyData = await historyResponse.json();
                                const transcription = historyData.transcriptions.find(t => t.id === transcriptionId);
                                
                                if (transcription) {
                                    console.log(`✅ Transcription ${transcriptionId} found in DB after ${attempts * 500}ms`);
                                    found = true;
                                    break;
                                }
                            }
                        } catch (error) {
                            console.warn('⚠️ Error checking history:', error);
                        }
                        
                        attempts++;
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    
                    if (!found) {
                        console.warn(`⚠️ Transcription ${transcriptionId} not found in DB after ${maxAttempts * 500}ms`);
                    }
                } else {
                    // Fallback: simple delay
                    console.log('⏳ No transcription ID, using fallback delay (2000ms)...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                // Store last transcription ID for transforms
                this._lastTranscriptionId = transcriptionId || null;

                // Notify main window to refresh history
                try {
                    console.log('🔄 Notifying main window to refresh history...');
                    await window.electronAPI.syncRecordingState('transcription_completed');
                    console.log('✅ Main window notified of new transcription');

                    // Show transform-ready state (will be skipped if auto-paste is on)
                    if (this._lastTranscriptionId) {
                        this.showTransformReady(this._lastTranscriptionId);
                    }

                    // Request widget hide if auto-hide is enabled
                    // (main process will defer hide if transform window is active)
                    if (window.electronAPI.requestWidgetHide) {
                        await window.electronAPI.requestWidgetHide();
                    }
                } catch (error) {
                    console.error('❌ Could not notify main window:', error);
                }
            } else {
                console.error('❌ Transcription failed with status:', response.status, response.statusText);
                
                // Try to get error details from response
                let errorMessage = 'Unknown error';
                try {
                    const errorData = await response.json();
                    console.error('❌ Error details:', errorData);
                    errorMessage = errorData.error || errorData.message || 'Unknown error';
                    console.error('❌ Error message:', errorMessage);
                } catch (parseError) {
                    console.error('❌ Could not parse error response:', parseError);
                }
                
                // Track transcription failed
                await this.telemetry.track('transcription_failed', {
                    error_type: `http_${response.status}`,
                    error_message: errorMessage,
                    platform: await this.getPlatform()
                });
                
                // Notify main window even on failure so it can refresh and show error card
                try {
                    console.log('🔄 Notifying main window of failed transcription...');
                    await window.electronAPI.syncRecordingState('transcription_completed');
                    console.log('✅ Main window notified of failed transcription');
                    
                    // Request widget hide if auto-hide is enabled
                    if (window.electronAPI.requestWidgetHide) {
                        await window.electronAPI.requestWidgetHide();
                    }
                } catch (error) {
                    console.error('❌ Could not notify main window:', error);
                }
            }
        } catch (error) {
            console.error('❌ Error processing recording:', error);
            console.error('❌ Error name:', error.name);
            console.error('❌ Error message:', error.message);
            console.error('❌ Error stack:', error.stack);
            
            // Notify main window even on exception so it can refresh
            try {
                await window.electronAPI.syncRecordingState('transcription_completed');
                
                // Request widget hide if auto-hide is enabled
                if (window.electronAPI.requestWidgetHide) {
                    await window.electronAPI.requestWidgetHide();
                }
            } catch (notifyError) {
                console.error('❌ Could not notify main window:', notifyError);
            }
        } finally {
            this.stopTimer();
            // Only go inactive if we're still in a transcription state
            // (transform states manage their own transitions)
            if (this.currentState === 'transcribing') {
                await this.setWidgetState('inactive');
            }
        }
    }

    async updateButtonStates() {
        // Disabled for widget - we manage states manually with icons
        return;
    }

    startButtonStatePolling() {
        // DISABLED: No automatic polling for widget - full manual control
        console.log('🎛️ Button polling disabled - widget uses full manual control');
        this.pollingInterval = null;
    }

    stopButtonStatePolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    startTimer() {
        this.startTime = Date.now();
        this.timerDisplay.textContent = '00:00';

        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            const totalSeconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(totalSeconds / 60); // For display only
            const seconds = totalSeconds % 60;
            
            // Calculate decimal minutes for accurate comparisons with fractional values
            const minutesDecimal = totalSeconds / 60;
            
            const timeText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            this.timerDisplay.textContent = timeText;
            
            // PROTECTION: Auto-stop if exceeds max time (backup to setTimeout)
            // This catches cases where setTimeout was paused (e.g., Mac sleep)
            if (minutesDecimal >= this.MAX_RECORDING_MINUTES) {
                console.error(`🛑 WIDGET AUTO-STOP: ${this.MAX_RECORDING_MINUTES} minutes exceeded`);
                this.forceStopRecording('timer_max_exceeded');
                return;
            }
            
            // Visual warnings using timer color only (no text/icons in widget)
            // States: 00:00-05:00 (white) → 05:00-15:00 (pink) → 15:00-20:00 (red)
            // Use minutesDecimal for accurate fractional minute comparisons
            if (minutesDecimal >= this.WARNING_AT_MINUTES) {
                // CRITICAL WARNING: Red + bold (approaching auto-stop)
                this.timerDisplay.classList.remove('long-recording');
                this.timerDisplay.classList.add('max-time-warning');
            } else if (minutesDecimal >= this.LONG_RECORDING_MINUTES) {
                // LONG RECORDING: Pink (informational)
                this.timerDisplay.classList.remove('max-time-warning');
                this.timerDisplay.classList.add('long-recording');
            } else {
                // NORMAL: White (default)
                this.timerDisplay.classList.remove('long-recording', 'max-time-warning');
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        // Remove warning styles but DON'T reset text — freeze at current time
        this.timerDisplay.classList.remove('long-recording', 'max-time-warning');
    }

    // ====================================
    // FLUID TRANSCRIPTION
    // ====================================

    setInstantMode(isEnabled) {
        this.instantMode = isEnabled;
        if (isEnabled) {
            document.body.classList.add('instant-mode');
        } else {
            document.body.classList.remove('instant-mode');
        }
        console.log(`⚡ Widget instant mode: ${isEnabled ? 'ON' : 'OFF'}`);
    }

    async loadInstantRecordingSetting() {
        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/ui_settings.instant_recording`);
            if (response.ok) {
                const data = await response.json();
                this.setInstantMode(data.value || false);
            }
        } catch (error) {
            console.error('❌ Widget: Error loading instant recording setting:', error);
        }
    }

    async loadFluidTranscriptionSetting() {
        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/ui_settings.fluid_transcription`);
            if (response.ok) {
                const data = await response.json();
                this.isFluidEnabled = data.value || false;
                console.log('🔄 Widget: Fluid transcription setting:', this.isFluidEnabled);
            }
        } catch (error) {
            console.error('❌ Widget: Error loading fluid setting:', error);
            this.isFluidEnabled = false;
        }
    }

    async handleFluidStop(recordingDuration) {
        try {
            // Show transcribing state
            await this.setWidgetState('transcribing');
            this.setTranscriptionProgress(10);

            // Stop fluid and get assembled text
            const fluidResult = await this.fluidTranscription.stop();
            this.setTranscriptionProgress(60);

            if (!fluidResult.text || !fluidResult.text.trim()) {
                console.warn('⚠️ Widget: Fluid transcription returned empty text');
                this.stopTimer();
                await this.setWidgetState('inactive');
                // Clear the main window's "Transcribing..." state. Without this the
                // main window, which entered that state on widget_recording_stopped,
                // waits forever for a completion it only gets on the success/error
                // paths (see lines below) — a fully-silent recording (every chunk
                // dropped by silence detection) would otherwise hang its spinner.
                if (window.electronAPI && window.electronAPI.syncRecordingState) {
                    try {
                        await window.electronAPI.syncRecordingState('transcription_completed');
                    } catch (e) { /* ignore */ }
                }
                return;
            }

            // Save audio if needed
            let audioId = null;
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            this.audioChunks = [];

            let saveAudio = false;
            try {
                const resp = await fetch(`${this.backendUrl}/api/config/settings/audio_settings.save_audio_files`);
                if (resp.ok) {
                    const data = await resp.json();
                    saveAudio = data.value !== false;
                }
            } catch (e) {
                saveAudio = true;
            }

            if (saveAudio || fluidResult.hasErrors) {
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
                    console.warn('⚠️ Widget: Could not save audio:', e);
                }
            }

            this.setTranscriptionProgress(80);

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

            this.setTranscriptionProgress(95);

            if (completeResp.ok) {
                const completeData = await completeResp.json();
                console.log('✅ Widget: Fluid transcription saved:', completeData);

                // Auto-paste
                if (window.electronAPI && window.electronAPI.requestAutoPaste) {
                    await window.electronAPI.requestAutoPaste(completeData.text);
                }

                // Store transcription ID for transforms
                this._lastTranscriptionId = completeData.transcription_id || null;

                // Notify main window to refresh history
                if (window.electronAPI && window.electronAPI.syncRecordingState) {
                    await window.electronAPI.syncRecordingState('transcription_completed');
                }

                // Show transform-ready state
                if (this._lastTranscriptionId) {
                    this.showTransformReady(this._lastTranscriptionId);
                }

                this.setTranscriptionProgress(100);
            }

            // Request widget hide if auto-hide enabled
            // (main process will defer hide if transform window is active)
            if (window.electronAPI && window.electronAPI.requestWidgetHide) {
                await window.electronAPI.requestWidgetHide();
            }

        } catch (error) {
            console.error('❌ Widget: Fluid stop error:', error);
            // Notify main window
            if (window.electronAPI && window.electronAPI.syncRecordingState) {
                try {
                    await window.electronAPI.syncRecordingState('transcription_completed');
                } catch (e) { /* ignore */ }
            }
        } finally {
            this._fluidStopping = false;
            this.isCancelled = false;
            this.stopTimer();
            // Only go inactive if still in a transcription state
            if (this.currentState === 'transcribing') {
                await this.setWidgetState('inactive');
            }
        }
    }

    // 🔐 SLEEP/WAKE DETECTION
    // Detects when Mac goes to sleep during recording and auto-stops on wake
    // This prevents the 18-hour recording bug when Mac sleeps overnight
    startSleepWakeDetection() {
        this.lastActivityCheck = Date.now();
        
        // Check every 5 seconds if system was asleep
        this.sleepWakeCheckInterval = setInterval(() => {
            const now = Date.now();
            const elapsed = now - this.lastActivityCheck;
            
            // If more than 10 seconds elapsed (when we check every 5s), system likely slept
            // Normal check should show ~5000ms, if we see >10000ms = sleep happened
            if (elapsed > 10000 && this.isRecording) {
                const sleepSeconds = Math.floor(elapsed / 1000);
                console.warn(`⚠️ Sleep detected during recording (${sleepSeconds}s gap) - continuing...`);
                console.warn('   Note: Recording will continue. User can stop manually if needed.');
                // DO NOT auto-stop - let user control their recording
                // this.forceStopRecording('system_sleep_detected');
            }
            
            // Update last check time
            this.lastActivityCheck = now;
        }, 5000); // Check every 5 seconds
    }

    stopSleepWakeDetection() {
        if (this.sleepWakeCheckInterval) {
            clearInterval(this.sleepWakeCheckInterval);
            this.sleepWakeCheckInterval = null;
        }
    }

    showCancelButton() {
        this.cancelButton.style.display = 'flex';
    }

    hideCancelButton() {
        this.cancelButton.style.display = 'none';
    }

    async cancelRecording(reason = 'user_action') {
        const duration = this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0;
        console.log(`🚨 Recording cancelled: ${reason} | Duration: ${duration}s`);
        console.log('🎛️ Recording source:', this.recordingSource);
        
        // Check who's recording
        if (this.recordingSource === 'widget') {
            // Widget is recording, cancel it
            console.log('🎛️ Cancelling widget recording...');
            
            this.isCancelled = true;
            console.log('✅ isCancelled set to true');

            // Clean up fluid transcription if active
            if (this.fluidTranscription && this.fluidTranscription.isActive()) {
                this.fluidTranscription.stop();
            }

            // Stop actual recording
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                console.log('🛑 Stopping MediaRecorder...');
                this.mediaRecorder.stop();
                console.log('✅ MediaRecorder.stop() called');
                
                // CRITICAL: Stop all tracks immediately
                this.mediaRecorder.stream.getTracks().forEach(track => {
                    track.stop();
                    console.log('🛑 Audio track stopped');
                });
            }
            
            // Stop timer
            console.log('⏱️ Stopping timer...');
            this.stopTimer();
            console.log('✅ Timer stopped');
            
            // Reset state and button IMMEDIATELY (don't wait for backend)
            console.log('🔄 Resetting state...');
            this.isProcessing = false;
            this.isRecording = false; // CRITICAL: Also reset isRecording
            // DON'T reset isCancelled here - it needs to stay true until onstop fires
            // this.isCancelled = false;  ← Will be reset in onstop handler
            this.recordingSource = null;
            
            // Return to inactive state
            await this.setWidgetState('inactive');
            console.log('✅ State reset complete (isCancelled still true for onstop)');
            
            // NOTIFY MAIN WINDOW: Widget cancelled recording (after UI reset)
            console.log('📢 Notifying main window...');
            if (window.electronAPI && window.electronAPI.syncRecordingState) {
                window.electronAPI.syncRecordingState('widget_recording_cancelled')
                    .then(() => console.log('✅ Main window notified: widget cancelled recording'))
                    .catch(error => console.warn('⚠️ Could not notify main window:', error));
            }
            
            console.log('🎛️ Recording cancelled, button reset COMPLETE');
            
        } else if (this.recordingSource === 'main') {
            // Main window is recording, send cancel request
            console.log('📢 Requesting main window to cancel recording...');
            if (window.electronAPI && window.electronAPI.syncRecordingState) {
                await window.electronAPI.syncRecordingState('request_cancel_main_recording');
            }
        }
    }

    // 🚨 FORCE STOP MECHANISM - Emergency reset for unresponsive stop button
    async forceStopRecording(reason = 'manual') {
        const duration = this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0;
        console.error(`🚨 Force stop: ${reason} | Duration: ${duration}s`);
        
        // Clear any existing timeouts
        if (this.safetyTimeout) {
            clearTimeout(this.safetyTimeout);
            this.safetyTimeout = null;
        }
        
        if (this.stateValidationInterval) {
            clearInterval(this.stateValidationInterval);
            this.stateValidationInterval = null;
        }
        
        // Stop sleep/wake detection
        this.stopSleepWakeDetection();
        
        // 🎯 DECISION: Should we transcribe or cancel?
        // - timer_max_exceeded / max_time_exceeded: TRANSCRIBE (valid recording that hit limit)
        // - system_sleep_detected: CANCEL (accidental overnight recording)
        // - manual: CANCEL (user explicitly force-stopped)
        const shouldTranscribe = (reason === 'timer_max_exceeded' || reason === 'max_time_exceeded');
        const shouldCancel = !shouldTranscribe;
        
        if (shouldTranscribe) {
            console.log('✅ Auto-stop will TRANSCRIBE (recording was valid)');
            // Call normal stop (not cancel) to transcribe the audio
            await this.stopRecording();
            return; // Exit early - stopRecording handles everything
        } else {
            console.log('❌ Auto-stop will CANCEL (reason: ' + reason + ')');
        }
        
        // CANCEL path (only for sleep/manual force-stops)
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
        this.isCancelled = true; // Mark as cancelled (won't transcribe)
        this.recordingSource = null;
        this.audioChunks = [];
        
        // 3. Stop timer
        this.stopTimer();
        
        // 4. Reset UI immediately
        try {
            await this.setWidgetState('inactive');
        } catch (e) {
            console.error('UI reset error (ignored):', e);
        }
        
        // 5. Clear backend session
        try {
            await fetch(`${this.backendUrl}/api/window/recording/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (e) {
            console.error('Backend stop recording failed (ignored):', e);
        }
        
        // 6. Notify main window
        if (window.electronAPI && window.electronAPI.syncRecordingState) {
            try {
                await window.electronAPI.syncRecordingState('widget_force_stopped');
            } catch (e) {
                console.error('Main window notification failed (ignored):', e);
            }
        }
        
        console.error('✅ FORCE STOP COMPLETED - Widget');
    }

    // Widget state management functions
    // States: inactive, starting, recording, recording_active, transcribing,
    //         transform_ready, transform_dropdown, transform_processing, transform_success
    async setWidgetState(state) {
        const prev = this.currentState;
        this.currentState = state;
        console.log(`🎛️ Widget state: ${prev} → ${state}`);

        switch(state) {
            case 'inactive':
                await this.showInactiveState();
                break;
            case 'starting':
                await this.showStartingState();
                break;
            case 'recording':
                await this.showRecordingState();
                break;
            case 'recording_active':
                await this.showRecordingActiveState();
                break;
            case 'transcribing':
                await this.showTranscribingState();
                break;
            case 'transform_ready':
                this._showTransformReadyState();
                break;
            case 'transform_dropdown':
                this._showTransformDropdownState();
                break;
            case 'transform_processing':
                this._showTransformProcessingState();
                break;
            case 'transform_success':
                this._showTransformSuccessState();
                break;
        }
    }

    // ---- Transform State Handlers ----

    _showTransformReadyState() {
        // Stop any transcription progress interval
        if (this.transcriptionProgressInterval) {
            clearInterval(this.transcriptionProgressInterval);
            this.transcriptionProgressInterval = null;
        }
        this.timerDisplay.classList.remove('transcription-progress');

        // Layout: expanded with mic + cancel + countdown + transform button
        this.widgetContainer.classList.remove('compact', 'dropdown-open', 'instruction-mode');
        this.widgetContainer.classList.add('expanded');

        // Show transform button with pulse
        this.transformButton.classList.add('visible', 'pulsing');

        // Record button: inactive mic icon
        this.recordButton.className = 'record-button inactive';
        this.recordButton.innerHTML = '<i class="ph ph-microphone"></i>';
        this.recordButton.style.removeProperty('background-color');
        this.recordButton.style.opacity = '1';

        // Show cancel button (X) — push to right with transform button
        this.cancelButton.style.opacity = '1';
        this.cancelButton.style.marginLeft = 'auto';
        this.cancelButton.disabled = false;

        // Resize widget: just enough for R + timer + X + T
        if (window.electronAPI && window.electronAPI.resizeWidget) {
            window.electronAPI.resizeWidget(160, 40, 'down');
        }

        // Start countdown: 3, 2, 1
        // Delay 150ms to let layout changes settle before showing "3"
        this._clearTransformCountdown();
        this.timerDisplay.style.opacity = '1';
        this.timerDisplay.classList.add('transform-countdown');

        this._transformCountdownTimer = setTimeout(() => {
            // Layout is settled — now show "3" for a full second
            this.timerDisplay.textContent = '3';
            this._transformCountdownTimer = setTimeout(() => {
                this.timerDisplay.textContent = '2';
                this._transformCountdownTimer = setTimeout(() => {
                    this.timerDisplay.textContent = '1';
                    this._transformCountdownTimer = setTimeout(() => {
                        this._transformCountdownTimer = null;
                        this.setWidgetState('inactive');
                    }, 1000);
                }, 1000);
            }, 1000);
        }, 150);
    }

    _showTransformDropdownState() {
        // Stop countdown
        this._clearTransformCountdown();
        this.timerDisplay.style.opacity = '0';

        // Stop pulsing, show active (blue)
        this.transformButton.classList.remove('pulsing');
        this.transformButton.classList.add('active');

        // Show cancel button (X) = dismiss transform mode
        this.cancelButton.style.opacity = '1';
        this.cancelButton.disabled = false;

        // Layout: column with controls on top, divider, dropdown below
        this.widgetContainer.classList.add('dropdown-open');

        // Resize widget DOWNWARD to fit dropdown snugly
        if (window.electronAPI && window.electronAPI.resizeWidget) {
            window.electronAPI.resizeWidget(200, 280, 'down');
        }

        // Populate and show dropdown (no dismiss text button — cancel X handles it)
        this.transformDropdown.innerHTML = '';
        for (const preset of (this._transformPresets || [])) {
            const item = document.createElement('button');
            item.className = 'transform-dropdown-item';
            item.textContent = preset.label;
            item.addEventListener('click', () => {
                if (preset.id === 'custom') {
                    this._startInstructionMode();
                } else {
                    this._applyWidgetTransform(preset.id, null);
                }
            });
            this.transformDropdown.appendChild(item);
        }

        this.transformDropdown.classList.add('open');
    }

    _showTransformProcessingState() {
        // Close dropdown, hide transform button
        this.transformDropdown.classList.remove('open');
        this.transformButton.classList.remove('visible', 'pulsing', 'active');
        this.widgetContainer.classList.remove('dropdown-open');
        // Keep instruction-mode for blue accent during processing
        // (will be cleaned up by showInactiveState)

        // Compact with blue spinner (transform context)
        this.widgetContainer.classList.remove('expanded');
        this.widgetContainer.classList.add('compact');
        this.recordButton.className = 'record-button processing';
        this.recordButton.innerHTML = '<div class="spinner-custom"></div>';
        this.recordButton.style.backgroundColor = '#0EA5E9';
        this.cancelButton.style.opacity = '0';
        this.timerDisplay.style.opacity = '0';

        if (window.electronAPI && window.electronAPI.resizeWidget) {
            window.electronAPI.resizeWidget(48, 48);
        }
    }

    _showTransformSuccessState() {
        // Green checkmark
        this.recordButton.className = 'record-button transform-success';
        this.recordButton.innerHTML = '<i class="ph ph-check" style="font-size:20px;color:white;"></i>';

        // Auto-transition to inactive + hide after 1.2s
        setTimeout(() => {
            this.setWidgetState('inactive');
            if (window.electronAPI && window.electronAPI.requestWidgetHide) {
                window.electronAPI.requestWidgetHide();
            }
        }, 1200);
    }

    async showInactiveState() {
        // ---- Clean up ALL transform state ----
        this._clearTransformCountdown();
        this.transformDropdown.classList.remove('open');
        this.transformButton.classList.remove('visible', 'pulsing', 'active');
        this.widgetContainer.classList.remove('dropdown-open', 'instruction-mode');
        this.isInstructionMode = false;

        // Clear transform window state, then request hide (auto-hide respects the setting)
        if (window.electronAPI && window.electronAPI.clearTransformWindow) {
            await window.electronAPI.clearTransformWindow();
        }
        if (window.electronAPI && window.electronAPI.requestWidgetHide) {
            window.electronAPI.requestWidgetHide();
        }
        this.isPromptMode = false;
        // Notify main process instruction mode ended (safety)
        if (window.electronAPI && window.electronAPI.setWidgetInstructionMode) {
            window.electronAPI.setWidgetInstructionMode(false);
        }

        // Signal that transcription is complete (accelerate progress to 95%)
        this.transcriptionCompleted = true;

        // DON'T stop the progress interval here
        // Let it finish naturally and reach 95%, then it will stop itself

        if (this.instantMode) {
            // Instant mode: snap to inactive immediately, no fade delays
            this.recordButton.innerHTML = '<i class="ph ph-microphone"></i>';
            this.recordButton.style.opacity = '1';
            this.recordButton.style.removeProperty('background-color');
            this.recordButton.classList.remove('recording', 'processing', 'transform-success');
            this.recordButton.classList.add('inactive');
            this.cancelButton.style.opacity = '0';
            this.cancelButton.style.marginLeft = '';
            this.timerDisplay.style.opacity = '0';
        } else {
            // Normal mode: smooth transitions
            await this.updateButtonContent('<i class="ph ph-microphone"></i>');
            this.recordButton.style.removeProperty('background-color');
            this.recordButton.classList.remove('recording', 'processing', 'transform-success');
            this.recordButton.classList.add('inactive');
            this.cancelButton.style.opacity = '0';
            this.cancelButton.style.marginLeft = '';
            this.timerDisplay.style.opacity = '0';

            // Wait for fade out (100ms matches transition)
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Compact widget - 48x48 (32x32 button + 8px padding)
        if (window.electronAPI && window.electronAPI.resizeWidget) {
            await window.electronAPI.resizeWidget(48, 48);
        }
        
        this.widgetContainer.classList.remove('expanded');
        this.widgetContainer.classList.add('compact');
        
        // Reset cancel button
        this.cancelButton.disabled = false;
        
        // Reset timer display and long recording state
        this.timerDisplay.textContent = '00:00';
        this.timerDisplay.classList.remove('long-recording', 'blink-once');
        this.longRecordingTriggered = false;
        
        // Apply disabled state if no API key
        if (!this.hasApiKey) {
            this.setWidgetDisabled();
        }
    }

    async showStartingState() {
        // Expanded widget - 130x40 (horizontal layout)
        if (window.electronAPI && window.electronAPI.resizeWidget) {
            await window.electronAPI.resizeWidget(130, 40);
        }
        
        this.widgetContainer.classList.remove('compact');
        this.widgetContainer.classList.add('expanded');
        
        // Cancel button active (CSS handles visibility with fade)
        this.cancelButton.disabled = false;
        this.cancelButton.style.opacity = '1';
        this.timerDisplay.style.opacity = '1';
        
        // Button shows microphone icon
        await this.updateButtonContent('<i class="ph ph-microphone"></i>');
        this.recordButton.style.removeProperty('background-color');
        this.recordButton.classList.remove('recording', 'processing');
        this.recordButton.classList.add('inactive');
        
        // Timer
        this.timerDisplay.textContent = '00:00';
    }

    async showRecordingState() {
        // Expanded widget - 130x40 (horizontal layout)
        // Use 'down' (keep position) in instruction/prompt mode to avoid jumping
        if (window.electronAPI && window.electronAPI.resizeWidget) {
            const dir = this.isInstructionMode ? 'down' : undefined;
            await window.electronAPI.resizeWidget(130, 40, dir);
        }

        this.widgetContainer.classList.remove('compact');
        this.widgetContainer.classList.add('expanded');

        // Cancel button active
        this.cancelButton.disabled = false;
        this.cancelButton.style.opacity = '1';
        this.timerDisplay.style.opacity = '1';

        this.recordButton.classList.remove('inactive', 'processing');
        this.recordButton.classList.add('recording');
        this.recordButton.style.removeProperty('background-color');

        if (this.instantMode) {
            // Instant mode: set content directly, no fade
            this.recordButton.innerHTML = '<div class="stop-square"></div>';
            this.recordButton.style.opacity = '1';
        } else {
            // Normal mode: smooth content fade
            await this.updateButtonContent('<div class="stop-square"></div>');
        }
    }

    async showRecordingActiveState() {
        // Same as recording state, but DON'T re-animate button (already showing stop)
        if (window.electronAPI && window.electronAPI.resizeWidget) {
            await window.electronAPI.resizeWidget(130, 40);
        }
        
        this.widgetContainer.classList.remove('compact');
        this.widgetContainer.classList.add('expanded');
        
        // Cancel button active (CSS handles visibility with fade)
        this.cancelButton.disabled = false;
        this.cancelButton.style.opacity = '1';
        this.timerDisplay.style.opacity = '1';
        
        // Button shows stop square (skip animation if already showing it)
        await this.updateButtonContent('<div class="stop-square"></div>', true);
        this.recordButton.style.removeProperty('background-color');
        this.recordButton.classList.remove('inactive', 'processing');
        this.recordButton.classList.add('recording');
    }

    async showTranscribingState() {
        try {
            console.log('🎛️ showTranscribingState() called');
            
        // Stop timer - freeze at current time
        this.stopTimer();
        
        // Initialize transcription progress tracking
        this.transcriptionStartTime = Date.now();
        
        // Calculate audio duration from recording timer
        const audioDurationSeconds = this.startTime ? (Date.now() - this.startTime) / 1000 : 0;
        
            console.log(`🎛️ Audio duration: ${audioDurationSeconds}s, startTime: ${this.startTime}`);
            
            // Start progress tracking (replace timer with mini progress bar)
        if (audioDurationSeconds > 0) {
                console.log('🎛️ Calling startTranscriptionProgress...');
            this.startTranscriptionProgress(audioDurationSeconds);
                console.log('🎛️ startTranscriptionProgress completed');
        } else {
            // Fallback: just show "..." if duration unknown
                console.warn('⚠️ No audio duration, showing "..."');
            this.timerDisplay.textContent = '...';
            }
        } catch (error) {
            console.error('❌ Error in showTranscribingState:', error);
        }
        
        // Fade out cancel button
        this.cancelButton.style.opacity = '0.5';
        this.cancelButton.disabled = true;
        
        // Change button to spinner with smooth transition
        await this.updateButtonContent('<div class="spinner-custom"></div>');
        
        // Expanded widget - 130x40 (horizontal layout)
        // Use 'down' in instruction/prompt mode to avoid jumping
        if (window.electronAPI && window.electronAPI.resizeWidget) {
            const dir = this.isInstructionMode ? 'down' : undefined;
            await window.electronAPI.resizeWidget(130, 40, dir);
        }

        this.widgetContainer.classList.remove('compact');
        this.widgetContainer.classList.add('expanded');

        // Timer display shows percentage instead of time
        this.timerDisplay.style.opacity = '1';
        
        // Button styling
        this.recordButton.style.backgroundColor = '';
        this.recordButton.classList.remove('recording');
        this.recordButton.classList.add('processing');
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
    
    startTranscriptionProgress(audioDuration) {
        if (!audioDuration || audioDuration <= 0) {
            return;
        }
        
        // Progress threshold: only show progress bar for audio >= 5 minutes (300 seconds)
        // For shorter recordings, just show spinner (no progress bar)
        const PROGRESS_THRESHOLD_SECONDS = 300; // 5 minutes
        
        if (audioDuration < PROGRESS_THRESHOLD_SECONDS) {
            // Short audio: don't show progress bar, just keep spinner
            // The spinner is already shown by showTranscribingState()
            console.log(`📊 Short audio (${audioDuration.toFixed(1)}s): showing spinner only, no progress bar`);
            return;
        }
        
        // Clear any existing interval
        if (this.transcriptionProgressInterval) {
            clearInterval(this.transcriptionProgressInterval);
        }
        
        // Add transcription-progress class for styling
        this.timerDisplay.classList.add('transcription-progress');
        
        // Show mini progress bar (pink border, fills with pink)
        this.timerDisplay.innerHTML = `
            <div class="mini-progress-bar">
                <div class="mini-progress-fill"></div>
            </div>
        `;
        
        // Calculate estimated transcription time
        const estimatedTime = this.calculateEstimatedTranscriptionTime(audioDuration);
        const startTime = Date.now();
        this.transcriptionCompleted = false;
        
        console.log(`📊 Transcription progress: audio=${audioDuration.toFixed(1)}s, estimated=${estimatedTime.toFixed(1)}s`);
        
        // Update progress bar every 100ms based on elapsed time
        this.transcriptionProgressInterval = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000; // seconds elapsed
            let progress = Math.min(95, (elapsed / estimatedTime) * 95);
            
            // If completed, ensure it reaches 95%
            if (this.transcriptionCompleted && progress < 95) {
                progress = 95;
            }
            
            // Update progress bar fill
            const progressFill = this.timerDisplay.querySelector('.mini-progress-fill');
            if (progressFill) {
                progressFill.style.width = `${progress}%`;
            }
            
            // If progress reaches 95%, keep it there until transcription completes
            // Don't stop the interval - wait for actual completion
        }, 100); // Update every 100ms for smooth animation
        
        console.log(`✅ Progress interval created with ID: ${this.transcriptionProgressInterval}`);
    }
    
    // Legacy method - kept for compatibility but no longer used
    // Progress is now calculated automatically based on elapsed time
    setTranscriptionProgress(percent) {
        // No-op: progress is now time-based, not manual
        // This method is kept for compatibility but doesn't affect progress
    }
    
    stopTranscriptionProgress() {
        if (this.transcriptionProgressInterval) {
            clearInterval(this.transcriptionProgressInterval);
            this.transcriptionProgressInterval = null;
        }
        
        // Complete progress to 95% when transcription finishes
        const progressFill = this.timerDisplay.querySelector('.mini-progress-fill');
        if (progressFill) {
            progressFill.style.width = '95%';
        }
        
        // Mark as completed
        this.transcriptionCompleted = true;
        
        // Remove transcription-progress class after a brief delay
        setTimeout(() => {
        this.timerDisplay.classList.remove('transcription-progress');
        }, 500);
    }

    // Dedicated button state management functions (legacy)
    setButtonToStop() {
        this.recordButton.innerHTML = '<i class="ph ph-stop"></i>';
        this.recordButton.style.removeProperty('background-color');
        this.recordButton.classList.remove('inactive', 'processing');
        this.recordButton.classList.add('recording');
        this.isRecording = true;
        console.log('🎛️ Button state: STOP (red, recording=true)');
    }

    setButtonToRecord() {
        this.recordButton.innerHTML = '<i class="ph ph-microphone"></i>';
        this.recordButton.style.removeProperty('background-color');
        this.recordButton.classList.remove('recording', 'processing');
        this.recordButton.classList.add('inactive');
        this.isRecording = false;
        console.log('🎛️ Button state: RECORD (black, recording=false)');
    }

    // Helper to smoothly update button content with fade transition
    async updateButtonContent(newContent, skipAnimation = false) {
        // Check if content is already the same to avoid unnecessary animation
        const currentContent = this.recordButton.innerHTML.trim();
        const newContentTrimmed = newContent.trim();

        if (currentContent === newContentTrimmed) {
            return; // No change needed
        }

        if (skipAnimation || this.instantMode) {
            // Direct change without animation
            this.recordButton.innerHTML = newContent;
            this.recordButton.style.opacity = '1';
            return;
        }
        
        // Fade out (gentle fade)
        this.recordButton.style.opacity = '0.3';
        
        // Wait for partial fade (75ms)
        await new Promise(resolve => setTimeout(resolve, 75));
        
        // Change content
        this.recordButton.innerHTML = newContent;
        
        // Small delay before fade in
        await new Promise(resolve => setTimeout(resolve, 25));
        
        // Fade in
        this.recordButton.style.opacity = '1';
    }

    setupRecordingSync() {
        // Listen for recording state changes from main window
        if (window.electronAPI && window.electronAPI.onSyncRecordingState) {
            const widgetInstance = this;
            
            window.electronAPI.onSyncRecordingState(async function(event, message) {
                console.log('🔄 Widget received recording sync:', message);
                
                // Handle API Key status updates
                if (message === 'api_key_added' || message === 'api_key_removed') {
                    console.log('🔑 API Key status changed, re-checking...');
                    await widgetInstance.checkApiKeyStatus();
                    return;
                }
                
                if (message === 'request_stop_recording') {
                    console.log('🛑 Main window requested stop, stopping widget recording...');
                    // Main window clicked stop while widget is recording
                    widgetInstance.stopRecording();
                } else if (message === 'request_cancel_recording') {
                    console.log('🛑 Main window requested cancel, cancelling widget recording...');
                    // Main window clicked cancel while widget is recording
                    widgetInstance.cancelRecording('main_window_request');
                } else if (message === 'main_recording_started') {
                    console.log('🎙️ Main window started recording, updating widget UI...');
                    // Mark that main window is recording
                    widgetInstance.recordingSource = 'main';
                    widgetInstance.isRecording = true;
                    // Update widget to recording state
                    await widgetInstance.setWidgetState('recording');
                    widgetInstance.startTimer();
                    
                    // After 3 seconds, switch to recording_active state
                    setTimeout(async () => {
                        if (widgetInstance.currentState === 'recording' && widgetInstance.recordingSource === 'main') {
                            await widgetInstance.setWidgetState('recording_active');
                        }
                    }, 3000);
                } else if (message === 'main_recording_stopped') {
                    console.log('🎙️ Main window stopped recording, updating widget UI...');
                    // Clear recording source
                    widgetInstance.recordingSource = null;
                    widgetInstance.isRecording = false;
                    // Don't stop timer - it will freeze in transcribing state
                } else if (message === 'main_recording_cancelled') {
                    console.log('🎙️ Main window cancelled recording, updating widget UI...');
                    // Clear recording source
                    widgetInstance.recordingSource = null;
                    widgetInstance.isRecording = false;
                    // Return to inactive
                    widgetInstance.stopTimer();
                    await widgetInstance.setWidgetState('inactive');
                    
                    // Request widget hide if auto-hide is enabled
                    if (window.electronAPI && window.electronAPI.requestWidgetHide) {
                        await window.electronAPI.requestWidgetHide();
                    }
                } else if (message === 'main_transcribing') {
                    console.log('🎙️ Main window transcribing, updating widget UI...');
                    // Show transcribing state
                    await widgetInstance.setWidgetState('transcribing');
                } else if (message === 'main_transcription_completed') {
                    console.log('🎙️ Main window completed transcription, returning to inactive...');
                    // Return to inactive
                    widgetInstance.stopTimer();
                    await widgetInstance.setWidgetState('inactive');
                    
                    // Request widget hide if auto-hide is enabled
                    if (window.electronAPI && window.electronAPI.requestWidgetHide) {
                        await window.electronAPI.requestWidgetHide();
                    }
                }
            });
            
            console.log('✅ Widget recording synchronization listener setup complete');
        } else {
            console.log('⚠️ Recording synchronization not available');
        }
    }

    setupShortcutListener() {
        // Prevent duplicate listeners
        if (this.shortcutListenerSetup) {
            console.log('⚠️ Shortcut listener already setup, skipping');
            return;
        }
        
        // Listen for global shortcut triggers from main process
        if (window.electronAPI && window.electronAPI.onShortcutTriggered) {
            const widgetInstance = this;
            
            window.electronAPI.onShortcutTriggered(async function(event, command) {
                console.log('⌨️ Widget received shortcut command:', command);
                
                if (command === 'toggle-recording') {
                    console.log('🎙️ Toggle recording shortcut triggered');
                    // Trigger the same function as clicking the record button
                    await widgetInstance.handleRecordClick();
                } else if (command === 'cancel-recording') {
                    console.log('🚫 Cancel recording shortcut triggered');
                    // Only cancel if currently recording
                    if (widgetInstance.isRecording) {
                        await widgetInstance.cancelRecording('keyboard_shortcut');
                    } else {
                        console.log('⚠️ Not recording, ignoring cancel command');
                    }
                }
            });
            
            this.shortcutListenerSetup = true;
            console.log('✅ Widget shortcut listener setup complete');
        } else {
            console.log('⚠️ Shortcut listener not available');
        }
    }

    // ====================================
    // SMART TRANSFORMS
    // ====================================

    setupTransform() {
        this._loadAutoPasteSetting();
        this._loadTransformPresets();

        // Transform button click → toggle dropdown
        if (this.transformButton) {
            this.transformButton.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.currentState === 'transform_dropdown') {
                    // Already open — close
                    this.setWidgetState('inactive');
                } else {
                    this._openTransformDropdown();
                }
            });
        }

        // Triple-tap from main process → open dropdown
        if (window.electronAPI && window.electronAPI.onOpenTransformDropdown) {
            window.electronAPI.onOpenTransformDropdown((event, transcriptionId) => {
                if (transcriptionId) this._lastTranscriptionId = transcriptionId;
                this._openTransformDropdown();
            });
        }

        // Click outside dropdown → dismiss
        document.addEventListener('click', (e) => {
            if (this.currentState === 'transform_dropdown') {
                if (!this.transformDropdown.contains(e.target) && e.target !== this.transformButton) {
                    this.setWidgetState('inactive');
                }
            }
        });

        // Double-tap from main process → switch to prompt mode
        if (window.electronAPI && window.electronAPI.onSwitchToPromptMode) {
            window.electronAPI.onSwitchToPromptMode(() => {
                this._enterPromptMode();
            });
        }

        // Keyboard shortcut while in instruction mode → stop recording
        if (window.electronAPI && window.electronAPI.onStopInstructionRecording) {
            window.electronAPI.onStopInstructionRecording(() => {
                if (this.isInstructionMode && this.isRecording) {
                    this.stopRecording();
                }
            });
        }
    }

    async _loadAutoPasteSetting() {
        try {
            const response = await fetch(`${this.backendUrl}/api/config/settings/ui_settings.auto_paste`);
            if (response.ok) {
                const data = await response.json();
                this._autoPasteEnabled = data.value === true;
            }
        } catch (e) {
            console.warn('Could not load auto-paste setting');
        }
    }

    async _loadTransformPresets() {
        try {
            const response = await fetch(`${this.backendUrl}/api/transform/presets`);
            if (response.ok) {
                const data = await response.json();
                this._transformPresets = data.presets;
            }
        } catch (e) {
            console.warn('Could not load transform presets');
        }
    }

    // ---- Transform entry points (called by recording completion flow) ----

    showTransformReady(transcriptionId) {
        if (this._autoPasteEnabled) return;
        this._lastTranscriptionId = transcriptionId;
        this.setWidgetState('transform_ready');
    }

    // ---- Transform helpers ----

    _clearTransformCountdown() {
        if (this._transformCountdownTimer) {
            clearTimeout(this._transformCountdownTimer);
            this._transformCountdownTimer = null;
        }
        this.timerDisplay.classList.remove('transform-countdown');
    }

    _openTransformDropdown() {
        if (!this._transformPresets || !this._lastTranscriptionId) return;
        this.setWidgetState('transform_dropdown');
    }

    async _applyWidgetTransform(presetId, customPrompt) {
        await this.setWidgetState('transform_processing');

        try {
            const body = {
                transcription_id: this._lastTranscriptionId,
                source: 'current'
            };
            if (presetId && presetId !== 'custom') {
                body.preset_id = presetId;
            } else if (customPrompt) {
                body.custom_prompt = customPrompt;
            }

            const result = await window.electronAPI.requestTransformApply(body);

            if (result && result.success) {
                await this.setWidgetState('transform_success');
            } else {
                console.error('Widget transform error:', result?.error);
                await this.setWidgetState('inactive');
            }
        } catch (error) {
            console.error('Widget transform failed:', error);
            await this.setWidgetState('inactive');
        }
    }

    _startInstructionMode() {
        this.isInstructionMode = true;

        // Notify main process so keyboard shortcut can stop instruction recording
        if (window.electronAPI && window.electronAPI.setWidgetInstructionMode) {
            window.electronAPI.setWidgetInstructionMode(true);
        }

        // Close dropdown, apply blue accent
        this.transformDropdown.classList.remove('open');
        this.widgetContainer.classList.remove('dropdown-open');
        this.widgetContainer.classList.add('instruction-mode');
        this.transformButton.classList.remove('visible', 'pulsing', 'active');

        // Start recording for the instruction
        this.handleRecordClick();
    }

    _endInstructionMode(instructionText) {
        this.isInstructionMode = false;
        this.widgetContainer.classList.remove('instruction-mode');

        // Notify main process instruction mode ended
        if (window.electronAPI && window.electronAPI.setWidgetInstructionMode) {
            window.electronAPI.setWidgetInstructionMode(false);
        }

        if (instructionText && instructionText.trim()) {
            this._applyWidgetTransform('custom', instructionText.trim());
        } else {
            this.setWidgetState('inactive');
        }
    }

    _enterPromptMode() {
        // Already recording — just switch visuals from red to blue
        this.isPromptMode = true;
        this.isInstructionMode = true; // Reuse instruction isolation (no sync, non-fluid, ephemeral)

        // Notify main process so next shortcut press stops recording
        if (window.electronAPI && window.electronAPI.setWidgetInstructionMode) {
            window.electronAPI.setWidgetInstructionMode(true);
        }

        // Red → Blue transition (CSS handles the fade)
        this.widgetContainer.classList.add('instruction-mode');
        console.log('🎯 Prompt mode active — recording continues in blue');
    }

    async _endPromptMode(promptText) {
        this.isInstructionMode = false;
        this.isPromptMode = false;
        this.widgetContainer.classList.remove('instruction-mode');

        if (window.electronAPI && window.electronAPI.setWidgetInstructionMode) {
            window.electronAPI.setWidgetInstructionMode(false);
        }

        if (!promptText || !promptText.trim()) {
            this.setWidgetState('inactive');
            return;
        }

        // Show blue processing spinner
        await this.setWidgetState('transform_processing');

        try {
            const result = await window.electronAPI.requestPromptApply({
                prompt: promptText.trim()
            });

            if (result && result.success) {
                await this.setWidgetState('transform_success');
            } else {
                console.error('Prompt error:', result?.error);
                this.setWidgetState('inactive');
            }
        } catch (error) {
            console.error('Prompt failed:', error);
            this.setWidgetState('inactive');
        }
    }
}

// Initialize the widget app
document.addEventListener('DOMContentLoaded', () => {
    window.widgetInstance = new WidgetApp();
    console.log('✅ Widget instance exposed globally for main process communication');
});

console.log('🎛️ Widget script loaded');

