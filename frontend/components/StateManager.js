/**
 * StateManager - Centralized state management with reactive updates
 * 
 * Manages all application state in one place and notifies listeners of changes
 * Replaces scattered state variables across the app
 */
class StateManager {
    constructor() {
        // Debug mode (set to false in production)
        this.debug = false;
        
        // Central application state
        this.state = {
            recording: {
                isRecording: false,
                source: null, // 'main' | 'widget'
                isCancelled: false,
                startTime: null
            },
            ui: {
                currentPanel: null,
                currentModal: null,
                widgetVisible: true
            },
            settings: {
                hasApiKey: false,
                saveAudio: false,
                autoHideWidget: false,
                autoPaste: false
            },
            shortcuts: {
                recordToggle: 'CommandOrControl+Shift+R',
                cancelRecording: 'Control+Command+S'
            },
            backend: {
                connected: false,
                url: 'http://127.0.0.1:5001'
            }
        };
        
        // Store listeners for state changes
        this.listeners = new Map();
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
     * Get current state value
     * @param {string} path - Dot notation path (e.g., 'recording.isRecording')
     * @returns {any} State value
     */
    get(path) {
        const keys = path.split('.');
        let value = this.state;
        
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                console.warn(`StateManager: Path "${path}" not found`);
                return undefined;
            }
        }
        
        return value;
    }
    
    /**
     * Set state value and notify listeners
     * @param {string} path - Dot notation path
     * @param {any} value - New value
     */
    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let obj = this.state;
        
        // Navigate to the parent object
        for (const key of keys) {
            if (!(key in obj)) {
                obj[key] = {};
            }
            obj = obj[key];
        }
        
        // Check if value actually changed
        const oldValue = obj[lastKey];
        if (oldValue === value) {
            return; // No change, don't notify
        }
        
        // Set new value
        obj[lastKey] = value;
        
        // Notify listeners
        this.notify(path, value, oldValue);
        
        this.log(`🔄 State updated: ${path} =`, value);
    }
    
    /**
     * Subscribe to state changes
     * @param {string} path - Path to watch (supports wildcards like 'recording.*')
     * @param {Function} callback - Called when state changes
     * @returns {Function} Unsubscribe function
     */
    subscribe(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, new Set());
        }
        
        this.listeners.get(path).add(callback);
        
        this.log(`👂 Subscribed to: ${path}`);
        
        // Return unsubscribe function
        return () => {
            const listeners = this.listeners.get(path);
            if (listeners) {
                listeners.delete(callback);
                if (listeners.size === 0) {
                    this.listeners.delete(path);
                }
            }
        };
    }
    
    /**
     * Notify listeners of state changes
     * @param {string} path - Changed path
     * @param {any} newValue - New value
     * @param {any} oldValue - Old value
     */
    notify(path, newValue, oldValue) {
        // Notify exact path listeners
        const exactListeners = this.listeners.get(path);
        if (exactListeners) {
            exactListeners.forEach(callback => {
                try {
                    callback(newValue, oldValue, path);
                } catch (error) {
                    console.error(`Error in state listener for "${path}":`, error);
                }
            });
        }
        
        // Notify wildcard listeners (e.g., 'recording.*')
        const pathParts = path.split('.');
        for (let i = 0; i < pathParts.length; i++) {
            const wildcardPath = pathParts.slice(0, i + 1).join('.') + '.*';
            const wildcardListeners = this.listeners.get(wildcardPath);
            
            if (wildcardListeners) {
                wildcardListeners.forEach(callback => {
                    try {
                        callback(newValue, oldValue, path);
                    } catch (error) {
                        console.error(`Error in wildcard listener for "${wildcardPath}":`, error);
                    }
                });
            }
        }
    }
    
    /**
     * Update multiple state values at once
     * @param {Object} updates - Object with path: value pairs
     */
    batchUpdate(updates) {
        Object.entries(updates).forEach(([path, value]) => {
            this.set(path, value);
        });
    }
    
    /**
     * Reset state to initial values
     * @param {string} path - Optional path to reset (resets all if omitted)
     */
    reset(path = null) {
        if (path) {
            // Reset specific path to its initial value
            const initialValue = this.getInitialValue(path);
            this.set(path, initialValue);
        } else {
            // Reset entire state
            this.state = {
                recording: {
                    isRecording: false,
                    source: null,
                    isCancelled: false,
                    startTime: null
                },
                ui: {
                    currentPanel: null,
                    currentModal: null,
                    widgetVisible: true
                },
                settings: {
                    hasApiKey: false,
                    saveAudio: false,
                    autoHideWidget: false,
                    autoPaste: false
                },
                shortcuts: {
                    recordToggle: 'CommandOrControl+Shift+R',
                    cancelRecording: 'Control+Command+S'
                },
                backend: {
                    connected: false,
                    url: 'http://127.0.0.1:5001'
                }
            };
            
            this.log('🔄 State reset to initial values');
        }
    }
    
    /**
     * Get initial value for a path
     * @param {string} path 
     * @returns {any}
     */
    getInitialValue(path) {
        const initialState = {
            'recording.isRecording': false,
            'recording.source': null,
            'recording.isCancelled': false,
            'recording.startTime': null,
            'ui.currentPanel': null,
            'ui.currentModal': null,
            'ui.widgetVisible': true,
            'settings.hasApiKey': false,
            'settings.saveAudio': false,
            'settings.autoHideWidget': false,
            'settings.autoPaste': false,
            'shortcuts.recordToggle': 'CommandOrControl+Shift+R',
            'shortcuts.cancelRecording': 'Control+Command+S',
            'backend.connected': false,
            'backend.url': 'http://127.0.0.1:5001'
        };
        
        return initialState[path];
    }
    
    /**
     * Debug: Log current state (always visible, call manually for debugging)
     */
    debugState() {
        console.log('📊 Current State:', JSON.stringify(this.state, null, 2));
        console.log('👂 Active Listeners:', Array.from(this.listeners.keys()));
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StateManager;
}

