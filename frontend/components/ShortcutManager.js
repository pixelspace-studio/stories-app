/**
 * ShortcutManager - Manages keyboard shortcuts
 * 
 * Handles shortcut validation, formatting, and display
 * Encapsulates all shortcut-related logic
 */
class ShortcutManager {
    constructor(apiClient) {
        this.api = apiClient;
        this.debug = false;
        
        // Current shortcut being edited
        this.currentShortcut = null;
        
        // Constants
        this.CONSTANTS = {
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
    
    log(message, ...args) {
        if (this.debug) {
            console.log(message, ...args);
        }
    }
    
    // ====================================
    // LOAD & SAVE
    // ====================================
    
    async loadFromBackend() {
        try {
            const data = await this.api.getShortcut(this.CONSTANTS.BACKEND_KEY);
            return data.value || this.CONSTANTS.DEFAULT_SHORTCUT;
        } catch (error) {
            console.error('Error loading shortcut:', error);
            return this.CONSTANTS.DEFAULT_SHORTCUT;
        }
    }
    
    async save(shortcut) {
        try {
            await this.api.saveShortcut(this.CONSTANTS.BACKEND_KEY, shortcut);
            this.log('✅ Shortcut saved:', shortcut);
            return true;
        } catch (error) {
            console.error('Error saving shortcut:', error);
            throw error;
        }
    }
    
    // ====================================
    // CAPTURE & CONVERT
    // ====================================
    
    captureFromEvent(e) {
        this.log('🎹 Key event:', { key: e.key, code: e.code });
        
        // Extract display keys
        const displayKeys = this.extractDisplayKeys(e);
        if (displayKeys.length === 0) return null;
        
        // Validate basic requirements
        const basicValidation = this.validateBasic(displayKeys);
        if (!basicValidation.valid) {
            return {
                display: displayKeys.join(' '),
                electron: null,
                valid: false,
                error: basicValidation.error
            };
        }
        
        // Convert to Electron format
        const electronShortcut = this.convertToElectronFormat(e);
        
        // Validate against system shortcuts
        const validation = this.validate(electronShortcut);
        
        return {
            display: displayKeys.join(' '),
            electron: electronShortcut,
            valid: validation.valid,
            error: validation.error
        };
    }
    
    extractDisplayKeys(e) {
        const keys = [];
        
        if (e.metaKey) keys.push('⌘');
        if (e.ctrlKey && !e.metaKey) keys.push('⌃');
        if (e.altKey) keys.push('⌥');
        if (e.shiftKey) keys.push('⇧');
        
        if (e.getModifierState && e.getModifierState('Fn')) {
            keys.push('🌐');
        }
        
        const mainKey = this.extractMainKey(e);
        if (mainKey) {
            keys.push(mainKey);
        }
        
        return keys;
    }
    
    extractMainKey(e) {
        let mainKey;
        if (e.altKey && e.code && e.code.startsWith('Key')) {
            mainKey = e.code.replace('Key', '');
        } else if (e.altKey && e.code === 'Space') {
            mainKey = ' ';
        } else {
            mainKey = e.key;
        }
        
        if (this.CONSTANTS.MODIFIERS.KEY_NAMES.includes(mainKey)) {
            return null;
        }
        
        if (mainKey === ' ') return 'Space';
        if (this.CONSTANTS.ARROW_KEYS[mainKey]) {
            return this.CONSTANTS.SYMBOLS[this.CONSTANTS.ARROW_KEYS[mainKey]];
        }
        
        return mainKey.toUpperCase();
    }
    
    convertToElectronFormat(e) {
        const keys = [];
        
        if (e.getModifierState && e.getModifierState('Fn')) {
            keys.push('Fn');
        }
        
        if (e.metaKey) keys.push('Command');
        if (e.ctrlKey && !e.metaKey) keys.push('Control');
        if (e.altKey) keys.push('Alt');
        if (e.shiftKey) keys.push('Shift');
        
        const mainKey = this.convertMainKeyToElectronFormat(e);
        if (mainKey) {
            keys.push(mainKey);
        }
        
        return keys.join('+');
    }
    
    convertMainKeyToElectronFormat(e) {
        let rawKey;
        if (e.altKey && e.code && e.code.startsWith('Key')) {
            rawKey = e.code.replace('Key', '');
        } else if (e.altKey && e.code === 'Space') {
            rawKey = ' ';
        } else {
            rawKey = e.key;
        }
        
        if (this.CONSTANTS.MODIFIERS.KEY_NAMES.includes(rawKey)) {
            return null;
        }
        
        if (rawKey === ' ') return 'Space';
        if (this.CONSTANTS.ARROW_KEYS[rawKey]) {
            return this.CONSTANTS.ARROW_KEYS[rawKey];
        }
        
        return rawKey.toUpperCase();
    }
    
    // ====================================
    // VALIDATION
    // ====================================
    
    validateBasic(keys) {
        const modifiers = this.CONSTANTS.MODIFIERS.DISPLAY;
        const hasMainKey = keys.some(key => !modifiers.includes(key));
        
        if (!hasMainKey && keys[0] !== '🌐') {
            return {
                valid: false,
                error: 'You must include a key with your modifiers (like R, A, Space, etc). Electron does not support modifier-only shortcuts.'
            };
        }
        
        if (keys.length === 1 && keys[0] !== '🌐') {
            return {
                valid: false,
                error: 'You must include at least one modifier key (⌘, ⌃, ⌥, or ⇧) with this key.'
            };
        }
        
        return { valid: true };
    }
    
    validate(shortcut) {
        const keyCount = shortcut.split('+').length;
        if (keyCount > this.CONSTANTS.MAX_KEYS) {
            return {
                valid: false,
                error: `Too many keys (${keyCount} detected, max ${this.CONSTANTS.MAX_KEYS}). Try: Control+Option+R, Command+Shift+Space.`
            };
        }
        
        if (shortcut === this.CONSTANTS.COPY_SHORTCUT) {
            return {
                valid: false,
                error: 'This shortcut is used for "Copy Latest Transcription"'
            };
        }
        
        if (this.isForbidden(shortcut)) {
            return {
                valid: false,
                error: 'This shortcut is reserved by macOS. Try Control+Option, Command+Shift, or different modifiers.'
            };
        }
        
        const problematic = ['Command+Control', 'Control+Command'];
        if (problematic.includes(shortcut)) {
            return {
                valid: false,
                error: 'Command+Control combination does not work reliably. Try Control+Option or Command+Shift with a key.'
            };
        }
        
        return { valid: true };
    }
    
    isForbidden(shortcut) {
        const forbidden = [
            'Command+C', 'Command+V', 'Command+X', 'Command+Z', 'Command+Shift+Z',
            'Command+A', 'Command+Q', 'Command+W', 'Command+R', 'Command+T',
            'Command+S', 'Command+P', 'Command+N', 'Command+M', 'Command+H',
            'Command+F', 'Command+G', 'Command+Shift+G', 'Command+,',
            'Command+Up', 'Command+Down', 'Command+Left', 'Command+Right',
            'Command+Shift+Up', 'Command+Shift+Down', 
            'Command+Shift+Left', 'Command+Shift+Right',
            'Command+Control+F', 'Command+Space', 'Command+Alt+Space',
            'Command+Shift+3', 'Command+Shift+4', 'Command+Shift+5',
            'Command+Alt+Esc', 'Command+Alt+D', 'Command+Delete',
            'Command+Shift+Delete', 'Command+Shift+Q',
            'Command+B', 'Command+I', 'Command+U', 'Command+Shift+T',
            'Command+=', 'Command+-', 'Command+Alt+F', 'Command+Shift+F',
            'Fn+F11', 'Fn+F12', 'Command+Tab', 'Alt+Tab', 'Control+Alt+Delete'
        ];
        
        return forbidden.includes(shortcut);
    }
    
    // ====================================
    // FORMATTING & DISPLAY
    // ====================================
    
    formatForDisplay(electronShortcut) {
        let display = electronShortcut;
        
        Object.entries(this.CONSTANTS.SYMBOLS).forEach(([key, symbol]) => {
            display = display.replace(new RegExp(key, 'g'), symbol);
        });
        
        return display.replace(/\+/g, ' ');
    }
    
    updateDisplay(electronShortcut, displayElement) {
        if (!displayElement) {
            console.error('Display element not found');
            return;
        }
        
        const isMac = window.electronAPI?.platform === 'darwin';
        
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
        
        displayElement.innerHTML = '';
        symbols.forEach(symbol => {
            const span = document.createElement('span');
            span.className = 'key';
            span.textContent = symbol;
            displayElement.appendChild(span);
        });
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ShortcutManager;
}

