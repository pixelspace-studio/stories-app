/**
 * TelemetryClient - Anonymous telemetry and crash reporting
 * 
 * Features:
 * - Anonymous UUID generation and persistence
 * - Event batching (sends every 30s or 10 events)
 * - Crash detection and reporting (always-on)
 * - Respects opt-out setting (for telemetry only)
 * - Fails silently (no UX interruption)
 * - Country detection from timezone
 * - Cost estimation for OpenAI usage
 */

class TelemetryClient {
    constructor() {
        this.userId = null;
        this.enabled = false; // Default: disabled (community builds)
        this.eventQueue = [];
        this.batchSize = 10;
        this.batchInterval = 30000; // 30 seconds
        this.batchTimer = null;
        this.isInitialized = false;
        
        // Load telemetry configuration
        this.config = this.loadConfig();
        this.apiUrl = this.config.apiUrl;
        this.debug = this.config.debug;
        
        // Detect app version and platform
        this.appVersion = this.getAppVersion();
        this.platform = this.getPlatform();
        this.country = this.getCountry();
        
        // Check if telemetry should be enabled for this build
        this.checkBuildType();
    }
    
    /**
     * Load telemetry configuration
     * Tries to load from telemetry.config.js (for internal builds)
     * Falls back to default values if not found (community builds)
     */
    loadConfig() {
        try {
            // Try to load config file (only exists in internal builds)
            if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getTelemetryConfig) {
                return window.electronAPI.getTelemetryConfig();
            }
        } catch (e) {
            // Config not available or failed to load
        }
        
        // Default fallback (for community builds or if config fails)
        return {
            apiUrl: 'http://localhost:5000', // Fallback (won't be used in community builds anyway)
            debug: false
        };
    }
    
    /**
     * Initialize telemetry client
     * Must be called on app startup
     */
    async init() {
        if (this.isInitialized) {
            return;
        }
        
        try {
            // Get or generate user ID
            this.userId = await this.getUserId();
            
            // Check if telemetry is enabled
            // IMPORTANT: Only check localStorage if this is an internal build
            // For community builds, this.enabled was already set to false in checkBuildType()
            if (this.isInternalBuild()) {
                // Internal build: check user preference from localStorage
                this.enabled = await this.isEnabled();
            }
            // For community builds: this.enabled remains false (set in constructor)
            
            // Setup crash reporting (always-on)
            this.setupCrashReporting();
            
            // Start batch timer (only sends if enabled)
            this.startBatchTimer();
            
            this.isInitialized = true;
            this.log('✅ Telemetry initialized', {
                userId: this.userId,
                enabled: this.enabled,
                appVersion: this.appVersion,
                platform: this.platform,
                country: this.country
            });
            
            // Track app_opened event (respects this.enabled)
            await this.track('app_opened');
        } catch (error) {
            this.log('❌ Telemetry initialization failed:', error);
            // Fail silently - don't interrupt user experience
        }
    }
    
    /**
     * Get or generate anonymous user ID
     * Uses localStorage for persistence (works in Electron and web)
     */
    async getUserId() {
        try {
            // Try to get existing user ID from localStorage
            let userId = localStorage.getItem('telemetry_user_id');
            
            if (!userId) {
                // Generate new UUID v4
                userId = this.generateUUID();
                
                // Save to localStorage
                localStorage.setItem('telemetry_user_id', userId);
                
                this.log('🆕 New user ID generated:', userId);
            }
            
            return userId;
        } catch (error) {
            this.log('❌ Error getting user ID:', error);
            // Fallback to in-memory UUID (won't persist)
            return this.generateUUID();
        }
    }
    
    /**
     * Generate UUID v4
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    /**
     * Check if telemetry should be enabled for this build
     * Called in constructor to determine if this is a community or internal build
     */
    checkBuildType() {
        // Check if this is an internal build (has telemetry flag)
        const isInternal = this.isInternalBuild();
        
        if (!isInternal) {
            console.log('🔕 Telemetry disabled (community build from GitHub)');
            this.enabled = false;
            return;
        }
        
        // Internal build: check user preference
        const userPreference = this.getUserPreference();
        this.enabled = userPreference;
        
        if (this.enabled) {
            console.log('📊 Telemetry enabled (internal build, user opt-in)');
        } else {
            console.log('🔕 Telemetry disabled by user preference');
        }
    }
    
    /**
     * Check if this is an internal build with telemetry
     * @returns {boolean} true if internal build, false if community build
     */
    isInternalBuild() {
        // Check for telemetry flag via Electron API
        try {
            if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isInternalBuild) {
                return window.electronAPI.isInternalBuild();
            }
        } catch (e) {
            // Not Electron or API not available
        }
        
        // Check environment variable (for builds)
        if (typeof process !== 'undefined' && process.env && process.env.ENABLE_TELEMETRY === 'true') {
            return true;
        }
        
        // Default: not an internal build
        return false;
    }
    
    /**
     * Get user's telemetry preference from localStorage
     * @returns {boolean} true if enabled, false if disabled
     */
    getUserPreference() {
        try {
            const saved = localStorage.getItem('telemetry_enabled');
            // Default to true for internal builds (user can opt-out)
            return saved === null ? true : saved === 'true';
        } catch (e) {
            return true; // Default enabled for internal builds
        }
    }
    
    /**
     * Set user's telemetry preference
     * @param {boolean} enabled - true to enable, false to disable
     * @returns {boolean} true if saved successfully
     */
    setUserPreference(enabled) {
        if (!this.isInternalBuild()) {
            console.log('🔕 Cannot enable telemetry in community build');
            return false;
        }
        
        try {
            localStorage.setItem('telemetry_enabled', enabled.toString());
            this.enabled = enabled;
            console.log(`📊 Telemetry ${enabled ? 'enabled' : 'disabled'} by user`);
            return true;
        } catch (e) {
            console.error('Failed to save telemetry preference:', e);
            return false;
        }
    }
    
    /**
     * Check if telemetry is enabled
     * Uses localStorage for persistence
     */
    async isEnabled() {
        try {
            const enabled = localStorage.getItem('telemetry_enabled');
            // Default to true (opt-out, not opt-in)
            return enabled === null || enabled === 'true';
        } catch (error) {
            this.log('❌ Error checking telemetry status:', error);
            return true; // Default to enabled
        }
    }
    
    /**
     * Enable or disable telemetry
     * @param {boolean} enabled - true to enable, false to disable
     */
    setEnabled(enabled) {
        // Community builds cannot enable telemetry
        if (!this.isInternalBuild() && enabled === true) {
            console.log('🔕 Cannot enable telemetry in community build');
            this.enabled = false;
            return;
        }
        
        try {
            this.enabled = enabled;
            localStorage.setItem('telemetry_enabled', enabled.toString());
            this.log('📊 Telemetry:', enabled ? 'Enabled' : 'Disabled');
        } catch (error) {
            this.log('❌ Error setting telemetry status:', error);
        }
    }
    
    /**
     * Get app version from package.json
     */
    getAppVersion() {
        try {
            // Try to get version from window (set by main process)
            if (window.appVersion) {
                return window.appVersion;
            }
            
            // Fallback
            return '0.9.51';
        } catch (error) {
            return 'unknown';
        }
    }
    
    /**
     * Get platform information
     */
    getPlatform() {
        try {
            const userAgent = navigator.userAgent;
            const platform = navigator.platform;
            
            // Extract macOS version
            if (platform.includes('Mac')) {
                const match = userAgent.match(/Mac OS X (\d+[._]\d+[._]\d+)/);
                if (match) {
                    const version = match[1].replace(/_/g, '.');
                    return `darwin-${version}`;
                }
                return 'darwin';
            }
            
            return platform.toLowerCase();
        } catch (error) {
            return 'unknown';
        }
    }
    
    /**
     * Get country from timezone
     * Maps timezone to ISO 3166-1 alpha-2 country code
     */
    getCountry() {
        try {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            
            // Simple mapping of timezones to countries
            const timezoneMap = {
                // North America
                'America/New_York': 'US',
                'America/Chicago': 'US',
                'America/Denver': 'US',
                'America/Los_Angeles': 'US',
                'America/Anchorage': 'US',
                'America/Toronto': 'CA',
                'America/Vancouver': 'CA',
                'America/Mexico_City': 'MX',
                'America/Monterrey': 'MX',
                'America/Guadalajara': 'MX',
                
                // South America
                'America/Sao_Paulo': 'BR',
                'America/Buenos_Aires': 'AR',
                'America/Santiago': 'CL',
                'America/Bogota': 'CO',
                'America/Lima': 'PE',
                
                // Europe
                'Europe/London': 'GB',
                'Europe/Paris': 'FR',
                'Europe/Madrid': 'ES',
                'Europe/Berlin': 'DE',
                'Europe/Rome': 'IT',
                'Europe/Amsterdam': 'NL',
                'Europe/Brussels': 'BE',
                'Europe/Stockholm': 'SE',
                'Europe/Oslo': 'NO',
                'Europe/Copenhagen': 'DK',
                
                // Asia
                'Asia/Tokyo': 'JP',
                'Asia/Shanghai': 'CN',
                'Asia/Hong_Kong': 'HK',
                'Asia/Singapore': 'SG',
                'Asia/Seoul': 'KR',
                'Asia/Kolkata': 'IN',
                'Asia/Dubai': 'AE',
                
                // Oceania
                'Australia/Sydney': 'AU',
                'Australia/Melbourne': 'AU',
                'Pacific/Auckland': 'NZ'
            };
            
            // Return mapped country or extract from timezone
            if (timezoneMap[timezone]) {
                return timezoneMap[timezone];
            }
            
            // Try to extract country from timezone (e.g., "America/Mexico_City" -> "MX")
            // This is a fallback, won't work for all cases
            return 'XX'; // Unknown country
        } catch (error) {
            return 'XX';
        }
    }
    
    /**
     * Track an event
     * 
     * @param {string} eventName - Event name (e.g., 'recording_completed')
     * @param {object} properties - Event properties (optional)
     */
    async track(eventName, properties = {}) {
        // Don't track if telemetry disabled
        if (!this.enabled) {
            return;
        }
        
        try {
            const event = {
                user_id: this.userId,
                event: eventName,
                timestamp: new Date().toISOString(),
                properties: properties,
                app_version: this.appVersion,
                platform: this.platform,
                country: this.country
            };
            
            // Add to queue
            this.eventQueue.push(event);
            
            this.log('📊 Event tracked:', eventName, properties);
            
            // Send immediately if batch size reached
            if (this.eventQueue.length >= this.batchSize) {
                await this.sendBatch();
            }
        } catch (error) {
            this.log('❌ Error tracking event:', error);
            // Fail silently
        }
    }
    
    /**
     * Report a crash (always sent, even if telemetry disabled)
     * 
     * @param {object} crashData - Crash information
     */
    async reportCrash(crashData) {
        try {
            const crash = {
                user_id: this.userId,
                app_version: this.appVersion,
                os_version: this.platform,
                crash_type: crashData.type || 'uncaught_error',
                error_message: crashData.message || 'Unknown error',
                stack_trace: crashData.stack || '',
                context: crashData.context || {},
                timestamp: new Date().toISOString()
            };
            
            // Send crash report immediately (don't queue)
            const response = await fetch(`${this.apiUrl}/crash`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(crash)
            });
            
            if (response.ok) {
                const result = await response.json();
                this.log('⚠️ Crash reported:', result.crash_id);
            } else {
                this.log('❌ Failed to report crash:', response.status);
            }
        } catch (error) {
            this.log('❌ Error reporting crash:', error);
            // Fail silently
        }
    }
    
    /**
     * Setup crash reporting listeners
     */
    setupCrashReporting() {
        // Uncaught errors
        window.addEventListener('error', (event) => {
            this.reportCrash({
                type: 'uncaught_error',
                message: event.message,
                stack: event.error?.stack,
                context: {
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno
                }
            });
        });
        
        // Unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.reportCrash({
                type: 'unhandled_rejection',
                message: event.reason?.message || String(event.reason),
                stack: event.reason?.stack,
                context: {
                    promise: 'unhandled_rejection'
                }
            });
        });
        
        this.log('🛡️ Crash reporting enabled');
    }
    
    /**
     * Send batch of events to analytics API
     */
    async sendBatch() {
        if (this.eventQueue.length === 0) {
            return;
        }
        
        try {
            const batch = [...this.eventQueue];
            this.eventQueue = []; // Clear queue
            
            this.log(`📤 Sending batch of ${batch.length} events...`);
            
            const response = await fetch(`${this.apiUrl}/track`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ events: batch })
            });
            
            if (response.ok) {
                const result = await response.json();
                this.log(`✅ Batch sent: ${result.events_received} events`);
            } else {
                this.log(`❌ Failed to send batch: ${response.status}`);
                // Re-add events to queue for retry
                this.eventQueue.push(...batch);
            }
        } catch (error) {
            this.log('❌ Error sending batch:', error);
            // Fail silently - events will be sent in next batch
        }
    }
    
    /**
     * Start batch timer (sends events every 30 seconds)
     */
    startBatchTimer() {
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
        }
        
        this.batchTimer = setInterval(async () => {
            await this.sendBatch();
        }, this.batchInterval);
        
        this.log(`⏰ Batch timer started (${this.batchInterval / 1000}s interval)`);
    }
    
    /**
     * Stop batch timer
     */
    stopBatchTimer() {
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
            this.batchTimer = null;
        }
    }
    
    /**
     * Flush all pending events (call before app closes)
     */
    async flush() {
        this.stopBatchTimer();
        await this.sendBatch();
        this.log('🚿 Telemetry flushed');
    }
    
    /**
     * Calculate estimated OpenAI cost for audio duration
     * 
     * @param {number} audioSeconds - Audio duration in seconds
     * @returns {number} Estimated cost in USD
     */
    calculateCost(audioSeconds) {
        const minutes = audioSeconds / 60;
        const costPerMinute = 0.006; // Whisper API pricing
        return minutes * costPerMinute;
    }
    
    /**
     * Helper: Recording completed event
     * 
     * @param {object} data - Recording data
     */
    async trackRecordingCompleted(data) {
        await this.track('recording_completed', {
            audio_duration_seconds: data.audioSeconds,
            processing_time_seconds: data.processingSeconds,
            source: data.source || 'main_window',
            success: data.success !== false,
            estimated_cost_usd: this.calculateCost(data.audioSeconds)
        });
    }
    
    /**
     * Helper: Transcription failed event
     * 
     * @param {object} data - Error data
     */
    async trackTranscriptionFailed(data) {
        await this.track('transcription_failed', {
            error_type: data.errorType || 'unknown',
            audio_duration_seconds: data.audioSeconds,
            source: data.source || 'main_window'
        });
    }
    
    /**
     * Helper: Feature toggled event
     * 
     * @param {string} feature - Feature name (e.g., 'auto_paste')
     * @param {boolean} enabled - New state
     */
    async trackFeatureToggled(feature, enabled) {
        await this.track('feature_toggled', {
            feature: feature,
            enabled: enabled
        });
    }
    
    /**
     * Helper: Retry attempted event
     */
    async trackRetryAttempted() {
        await this.track('retry_attempted');
    }
    
    /**
     * Debug logging
     */
    log(...args) {
        if (this.debug) {
            console.log('[Telemetry]', ...args);
        }
    }
    
    /**
     * Enable debug mode
     */
    enableDebug() {
        this.debug = true;
        this.log('🐛 Debug mode enabled');
    }
    
    /**
     * Disable debug mode
     */
    disableDebug() {
        this.debug = false;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TelemetryClient;
}

