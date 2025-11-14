/**
 * SoundManager - Centralized audio feedback system
 * 
 * Manages sound effects for recording state changes across the application.
 * Single instance ensures sounds play only once, regardless of which component
 * triggers the recording (main window, widget, or global shortcuts).
 */

class SoundManager {
    constructor() {
        this.enabled = false; // Default: disabled
        this.sounds = {};
        this.isInitialized = false;
        
        // Sound definitions with paths
        this.soundDefinitions = {
            recordStart: '../assets/sounds/record-start.mp3',
            recordStop: '../assets/sounds/record-stop.mp3',
            transcriptionReady: '../assets/sounds/transcription-ready.mp3'
        };
        
        console.log('🔊 SoundManager created');
    }
    
    /**
     * Initialize sound manager and preload audio files
     * Fails gracefully if files are missing
     */
    async initialize() {
        if (this.isInitialized) {
            console.log('🔊 SoundManager already initialized');
            return;
        }
        
        console.log('🔊 Initializing SoundManager...');
        
        // Preload all sound files
        for (const [key, path] of Object.entries(this.soundDefinitions)) {
            try {
                const audio = new Audio(path);
                
                // Set properties
                audio.volume = 0.5; // Moderate volume
                audio.preload = 'auto';
                
                // Wait for audio to be loaded
                await new Promise((resolve, reject) => {
                    audio.addEventListener('canplaythrough', resolve, { once: true });
                    audio.addEventListener('error', reject, { once: true });
                    audio.load();
                });
                
                this.sounds[key] = audio;
                console.log(`✅ Loaded sound: ${key}`);
                
            } catch (error) {
                console.warn(`⚠️ Failed to load sound '${key}' from ${path}:`, error.message);
                // Continue loading other sounds even if one fails
            }
        }
        
        this.isInitialized = true;
        console.log(`✅ SoundManager initialized with ${Object.keys(this.sounds).length}/${Object.keys(this.soundDefinitions).length} sounds`);
    }
    
    /**
     * Enable or disable sound effects
     * @param {boolean} enabled - Whether sounds should play
     */
    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        console.log(`🔊 Sound effects ${this.enabled ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * Get current enabled status
     * @returns {boolean}
     */
    isEnabled() {
        return this.enabled;
    }
    
    /**
     * Play a sound with error handling
     * @param {string} soundKey - Key of the sound to play
     * @private
     */
    _playSound(soundKey) {
        // Check if sounds are enabled
        if (!this.enabled) {
            console.log(`🔇 Sound '${soundKey}' not played (disabled)`);
            return;
        }
        
        // Check if sound exists
        if (!this.sounds[soundKey]) {
            console.warn(`⚠️ Sound '${soundKey}' not available`);
            return;
        }
        
        try {
            const audio = this.sounds[soundKey];
            
            // Reset to beginning if already playing
            audio.currentTime = 0;
            
            // Play the sound
            const playPromise = audio.play();
            
            // Handle play promise (some browsers require user interaction first)
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        console.log(`🔊 Played sound: ${soundKey}`);
                    })
                    .catch(error => {
                        // Only log if not an interaction error (common on first load)
                        if (error.name !== 'NotAllowedError') {
                            console.warn(`⚠️ Failed to play sound '${soundKey}':`, error.message);
                        }
                    });
            }
            
        } catch (error) {
            console.warn(`⚠️ Error playing sound '${soundKey}':`, error.message);
        }
    }
    
    /**
     * Play sound when recording starts
     */
    playRecordStart() {
        this._playSound('recordStart');
    }
    
    /**
     * Play sound when recording stops
     */
    playRecordStop() {
        this._playSound('recordStop');
    }
    
    /**
     * Play sound when transcription is ready
     */
    playTranscriptionReady() {
        this._playSound('transcriptionReady');
    }
    
    /**
     * Test all sounds (for settings/debugging)
     * @returns {Array} Results of each sound test
     */
    async testAllSounds() {
        console.log('🧪 Testing all sounds...');
        const results = [];
        
        for (const soundKey of Object.keys(this.soundDefinitions)) {
            const exists = !!this.sounds[soundKey];
            results.push({
                sound: soundKey,
                loaded: exists,
                path: this.soundDefinitions[soundKey]
            });
        }
        
        return results;
    }
}

// Create singleton instance and expose globally
const soundManager = new SoundManager();
window.soundManager = soundManager;

