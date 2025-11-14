/**
 * ModalManager - Unified modal and overlay management
 * 
 * Handles all modal/overlay open/close logic in one place
 * Eliminates code duplication and ensures consistent behavior
 */
class ModalManager {
    constructor() {
        // Store registered modals and their overlays
        this.modals = new Map();
        this.overlays = new Map();
        
        // Track currently open modal
        this.currentModal = null;
        
        // Debug mode (set to false in production)
        this.debug = false;
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
     * Register a modal with optional overlay
     * @param {string} name - Unique identifier for the modal
     * @param {HTMLElement} modalElement - The modal element (can be overlay itself)
     * @param {HTMLElement} overlayElement - The overlay element (optional, for modals within overlays)
     */
    register(name, modalElement, overlayElement = null) {
        if (!modalElement) {
            console.error(`ModalManager: Cannot register modal "${name}" - element is null`);
            return;
        }
        
        this.modals.set(name, modalElement);
        
        // If overlay is provided separately, use it for click-to-close
        if (overlayElement) {
            this.overlays.set(name, overlayElement);
            
            // Auto-setup overlay click to close
            overlayElement.addEventListener('click', (e) => {
                if (e.target === overlayElement) {
                    this.close(name);
                }
            });
        } else if (modalElement.classList.contains('panel-overlay')) {
            // If modalElement is itself an overlay, set up click-to-close on it
            this.overlays.set(name, modalElement);
            
            modalElement.addEventListener('click', (e) => {
                // Only close if clicking on the overlay itself, not on child elements
                if (e.target === modalElement || e.target.classList.contains('panel-overlay')) {
                    this.close(name);
                }
            });
        }
        
        this.log(`✅ Modal registered: ${name}`);
    }
    
    /**
     * Open a modal
     * @param {string} name - Modal identifier
     * @param {Object} options - Optional configuration
     */
    open(name, options = {}) {
        const modal = this.modals.get(name);
        
        if (!modal) {
            console.error(`ModalManager: Modal "${name}" not found`);
            return;
        }
        
        // Close any currently open modal first
        if (this.currentModal && this.currentModal !== name) {
            this.close(this.currentModal);
        }
        
        // Remove hidden class first
        modal.classList.remove('hidden');
        
        // Show modal with optional delay for animation
        const showDelay = options.delay || 0;
        setTimeout(() => {
            modal.classList.add('show');
            this.currentModal = name;
            
            // Call optional callback
            if (options.onOpen) {
                options.onOpen();
            }
        }, showDelay);
        
        this.log(`📂 Modal opened: ${name}`);
    }
    
    /**
     * Close a modal
     * @param {string} name - Modal identifier
     * @param {Object} options - Optional configuration
     */
    close(name, options = {}) {
        const modal = this.modals.get(name);
        
        if (!modal) {
            console.error(`ModalManager: Modal "${name}" not found`);
            return;
        }
        
        // Remove show class for animation
        modal.classList.remove('show');
        
        // Add hidden class after animation completes
        const hideDelay = options.delay || 300;
        setTimeout(() => {
            modal.classList.add('hidden');
            
            // Clear current modal if it was this one
            if (this.currentModal === name) {
                this.currentModal = null;
            }
            
            // Call optional callback
            if (options.onClose) {
                options.onClose();
            }
        }, hideDelay);
        
        this.log(`📁 Modal closed: ${name}`);
    }
    
    /**
     * Close all open modals
     */
    closeAll() {
        this.modals.forEach((modal, name) => {
            if (modal.classList.contains('show')) {
                this.close(name, { delay: 0 });
            }
        });
    }
    
    /**
     * Check if a modal is currently open
     * @param {string} name - Modal identifier
     * @returns {boolean}
     */
    isOpen(name) {
        const modal = this.modals.get(name);
        return modal ? modal.classList.contains('show') : false;
    }
    
    /**
     * Get current open modal name
     * @returns {string|null}
     */
    getCurrentModal() {
        return this.currentModal;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModalManager;
}

