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
            event.stopPropagation(); // CRITICAL: Prevent event bubbling
            event.preventDefault();  // CRITICAL: Prevent default behavior
            this.cancelRecording('cancel_button');
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
        
        // Initialize backend URL with dynamic port
        this.initBackendUrl();
        
        // Start button state polling
        this.startButtonStatePolling();
        
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
            if (window.electronAPI && window.electronAPI.syncRecordingState) {
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
            console.log('🎛️ Requesting microphone access...');
            
            // Check if mediaDevices is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('getUserMedia not supported');
            }
            
            console.log('🎛️ navigator.mediaDevices available');
            
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
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
            
            this.mediaRecorder.start();
            console.log('🎛️ MediaRecorder started');
            
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
            this.mediaRecorder.stop();
            
            // Don't stop timer yet - it will freeze during transcribing state
            
            // Clear recording source
            this.recordingSource = null;
            
            console.log('🎛️ Web recording stopped');
            
            // NOTIFY MAIN WINDOW: Widget stopped recording
            if (window.electronAPI && window.electronAPI.syncRecordingState) {
                try {
                    await window.electronAPI.syncRecordingState('widget_recording_stopped');
                    // Request main window to play record stop sound
                    await window.electronAPI.syncRecordingState('play_sound_record_stop');
                    console.log('📢 Notified main window: widget stopped recording');
                } catch (error) {
                    console.warn('⚠️ Could not notify main window:', error);
                }
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
            
            // Notify main process: widget is transcribing
            if (window.electronAPI && window.electronAPI.syncRecordingState) {
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
                
                // Notify main window to refresh history
                try {
                    console.log('🔄 Notifying main window to refresh history...');
                    await window.electronAPI.syncRecordingState('transcription_completed');
                    console.log('✅ Main window notified of new transcription');
                    
                    // Request widget hide if auto-hide is enabled
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
            // Always return to inactive state
            this.stopTimer();
            await this.setWidgetState('inactive');
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
        
        // Reset timer color to default (white)
        this.timerDisplay.classList.remove('long-recording', 'max-time-warning');
        
        // DON'T reset timer text - keep it frozen at current time
        // this.timerDisplay.textContent = '00:00';
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
    async setWidgetState(state) {
        this.currentState = state;
        console.log(`🎛️ Setting widget state to: ${state}`);
        
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
        }
    }

    async showInactiveState() {
        // Signal that transcription is complete (accelerate progress to 95%)
        this.transcriptionCompleted = true;
        
        // DON'T stop the progress interval here
        // Let it finish naturally and reach 95%, then it will stop itself
        
        // Change button content smoothly
        await this.updateButtonContent('<i class="ph ph-microphone"></i>');
        
        // Button styling
        this.recordButton.style.removeProperty('background-color');
        this.recordButton.classList.remove('recording', 'processing');
        this.recordButton.classList.add('inactive');
        
        // Fade out cancel button and timer (CSS handles the transition)
        this.cancelButton.style.opacity = '0';
        this.timerDisplay.style.opacity = '0';
        
        // Wait for fade out (100ms matches transition)
        await new Promise(resolve => setTimeout(resolve, 100));
        
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
        if (window.electronAPI && window.electronAPI.resizeWidget) {
            await window.electronAPI.resizeWidget(130, 40);
        }
        
        this.widgetContainer.classList.remove('compact');
        this.widgetContainer.classList.add('expanded');
        
        // Cancel button active (CSS handles visibility with fade)
        this.cancelButton.disabled = false;
        this.cancelButton.style.opacity = '1';
        this.timerDisplay.style.opacity = '1';
        
        // Change to recording class BEFORE content change for smooth color transition
        this.recordButton.classList.remove('inactive', 'processing');
        this.recordButton.classList.add('recording');
        this.recordButton.style.removeProperty('background-color');
        
        // Button shows stop square (content fade happens after color change)
        await this.updateButtonContent('<div class="stop-square"></div>');
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
        if (window.electronAPI && window.electronAPI.resizeWidget) {
            await window.electronAPI.resizeWidget(130, 40);
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
        
        if (skipAnimation) {
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
}

// Initialize the widget app
document.addEventListener('DOMContentLoaded', () => {
    window.widgetInstance = new WidgetApp();
    console.log('✅ Widget instance exposed globally for main process communication');
});

console.log('🎛️ Widget script loaded');

