/**
 * APIClient - Centralized backend API communication
 * 
 * Handles all HTTP requests to the backend server
 * Provides consistent error handling and response parsing
 */
class APIClient {
    constructor(baseUrl = 'http://127.0.0.1:57002') {
        this.baseUrl = baseUrl;
        this.debug = false;
    }
    
    /**
     * Set the backend URL dynamically
     */
    setBaseUrl(url) {
        this.baseUrl = url;
        this.log('🔗 Backend URL updated to:', url);
    }
    
    /**
     * Log message only in debug mode
     */
    log(message, ...args) {
        if (this.debug) {
            console.log(message, ...args);
        }
    }
    
    /**
     * Generic fetch wrapper with error handling
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        try {
            this.log(`📡 API Request: ${options.method || 'GET'} ${endpoint}`);
            
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            
            // Handle different content types
            const contentType = response.headers.get('content-type');
            const isJson = contentType && contentType.includes('application/json');
            
            if (!response.ok) {
                // Try to get error details from JSON body if available
                if (isJson) {
                    try {
                        const errorData = await response.json();
                        const errorMsg = errorData.error || errorData.message || response.statusText;
                        const details = errorData.details ? ` - ${errorData.details}` : '';
                        throw new Error(`${errorMsg}${details}`);
                    } catch (jsonError) {
                        // If JSON parsing fails, fall back to status text
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            }
            
            if (isJson) {
                const data = await response.json();
                this.log(`✅ API Response:`, data);
                return data;
            }
            
            return response;
            
        } catch (error) {
            console.error(`❌ API Error [${endpoint}]:`, error);
            throw error;
        }
    }
    
    // ====================================
    // HEALTH & CONNECTION
    // ====================================
    
    async checkHealth() {
        return this.request('/api/health', {
            method: 'GET',
            headers: { 'Content-Type': 'text/plain' }
        });
    }
    
    // ====================================
    // RECORDING & TRANSCRIPTION
    // ====================================
    
    async forceStopRecording() {
        return this.request('/api/recording/force-stop', {
            method: 'POST'
        });
    }
    
    async transcribe(formData, audioDuration = null) {
        // Calculate frontend timeout (backend timeout + 60s buffer)
        // Backend uses: (duration * 2) + 30
        // Frontend uses: (duration * 2) + 90 (gives backend 60s extra to respond)
        const timeoutMs = audioDuration 
            ? ((audioDuration * 2) + 90) * 1000 
            : 150000; // Default 150s (2.5 minutes) if duration unknown
        
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            console.error('❌ Frontend timeout reached, aborting request');
            controller.abort();
        }, timeoutMs);
        
        try {
            const result = await this.request('/api/transcribe', {
                method: 'POST',
                body: formData,
                headers: {}, // Let browser set Content-Type for FormData
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            return result;
            
        } catch (error) {
            clearTimeout(timeoutId);
            
            // Check if it was an abort (timeout)
            if (error.name === 'AbortError') {
                throw new Error('Taking longer than expected. Your audio is saved, click Retry to try again.');
            }
            
            throw error;
        }
    }
    
    async getHistory() {
        return this.request('/api/history');
    }
    
    async deleteTranscription(id) {
        return this.request(`/api/history/${id}`, {
            method: 'DELETE'
        });
    }
    
    async downloadAudio(audioId) {
        return this.request(`/api/audio/${audioId}/download`);
    }
    
    // ====================================
    // DICTIONARY
    // ====================================
    
    async getDictionaryWords() {
        return this.request('/api/dictionary/words');
    }
    
    async addDictionaryWord(word, caseSensitive = true) {
        return this.request('/api/dictionary/words', {
            method: 'POST',
            body: JSON.stringify({ word, case_sensitive: caseSensitive })
        });
    }
    
    async updateDictionaryWord(wordId, word, caseSensitive = true) {
        return this.request(`/api/dictionary/words/${wordId}`, {
            method: 'PUT',
            body: JSON.stringify({ word, case_sensitive: caseSensitive })
        });
    }
    
    async deleteDictionaryWord(wordId) {
        return this.request(`/api/dictionary/words/${wordId}`, {
            method: 'DELETE'
        });
    }
    
    // ====================================
    // SETTINGS & CONFIGURATION
    // ====================================
    
    async getSetting(key) {
        return this.request(`/api/config/settings/${key}`);
    }
    
    async saveSetting(settings) {
        return this.request('/api/config/settings', {
            method: 'POST',
            body: JSON.stringify(settings)
        });
    }
    
    async saveSettings(settings) {
        return this.saveSetting(settings);
    }
    
    async updateSetting(key, value) {
        return this.request(`/api/config/settings/${key}`, {
            method: 'PUT',
            body: JSON.stringify({ value })
        });
    }
    
    // ====================================
    // API KEY
    // ====================================
    
    async getApiKeyStatus() {
        return this.request('/api/config/api-key');
    }
    
    async getApiKey() {
        return this.request('/api/config/api-key');
    }
    
    async saveApiKey(apiKey) {
        return this.request('/api/config/api-key', {
            method: 'POST',
            body: JSON.stringify({ api_key: apiKey })
        });
    }
    
    async deleteApiKey() {
        return this.request('/api/config/api-key', {
            method: 'DELETE'
        });
    }
    
    // ====================================
    // SHORTCUTS
    // ====================================
    
    async getShortcut(key = 'shortcuts.record_toggle') {
        return this.request(`/api/config/settings/${key}`);
    }
    
    async saveShortcut(key, value) {
        return this.saveSetting({ [key]: value });
    }
    
    // ====================================
    // AUDIO SETTINGS
    // ====================================
    
    async getAudioSaveSetting() {
        return this.request('/api/config/settings/audio_settings.save_audio_files');
    }
    
    async saveAudioSaveSetting(value) {
        return this.request('/api/config/settings/audio_settings.save_audio_files', {
            method: 'POST',
            body: JSON.stringify({ value })
        });
    }
    
    // ====================================
    // UI SETTINGS
    // ====================================
    
    async saveAutoHideWidgetSetting(value) {
        return this.request('/api/config/settings/ui_settings.auto_hide_widget', {
            method: 'POST',
            body: JSON.stringify({ value })
        });
    }
    
    async getAutoHideWidgetSetting() {
        return this.request('/api/config/settings/ui_settings.auto_hide_widget');
    }
    
    // ====================================
    // STORAGE & CLEANUP
    // ====================================
    
    async getStorageStats() {
        return this.request('/api/audio/storage/stats');
    }
    
    async cleanupAudioFiles() {
        return this.request('/api/audio/storage/cleanup', {
            method: 'POST'
        });
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIClient;
}

