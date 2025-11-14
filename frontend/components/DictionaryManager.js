/**
 * DictionaryManager - Manages custom dictionary words
 * 
 * Handles loading, adding, editing, and deleting dictionary words
 * Manages word list rendering and UI updates
 */
class DictionaryManager {
    constructor(apiClient) {
        this.api = apiClient;
        this.debug = false;
        this.words = [];
        
        // UI elements (set externally)
        this.contentElement = null;
        this.emptyElement = null;
    }
    
    log(message, ...args) {
        if (this.debug) {
            console.log(message, ...args);
        }
    }
    
    /**
     * Set UI elements for rendering
     */
    setElements(contentElement, emptyElement) {
        this.contentElement = contentElement;
        this.emptyElement = emptyElement;
    }
    
    // ====================================
    // LOAD & RENDER
    // ====================================
    
    async load() {
        try {
            const data = await this.api.getDictionaryWords();
            this.words = data.words || [];
            this.log('📖 Dictionary loaded:', this.words.length, 'words');
            return this.words;
        } catch (error) {
            console.error('Error loading dictionary:', error);
            this.words = [];
            return [];
        }
    }
    
    render(onEdit, onDelete) {
        if (!this.contentElement || !this.emptyElement) {
            console.error('Dictionary elements not set. Call setElements() first.');
            return;
        }
        
        this.log('🎨 Rendering', this.words.length, 'words');
        
        // Clear current word items
        const wordItems = this.contentElement.querySelectorAll('.dictionary-word-item');
        wordItems.forEach(item => item.remove());
        
        // Show empty state if no words
        if (this.words.length === 0) {
            this.emptyElement.classList.remove('hidden');
            return;
        }
        
        // Hide empty state and render words
        this.emptyElement.classList.add('hidden');
        
        this.words.forEach(word => {
            const wordItem = this.createWordItem(word, onEdit, onDelete);
            this.contentElement.appendChild(wordItem);
        });
        
        this.log('✅ Rendered', this.words.length, 'words');
    }
    
    createWordItem(word, onEdit, onDelete) {
        const wordItem = document.createElement('div');
        wordItem.className = 'dictionary-word-item';
        wordItem.innerHTML = `
            <span class="dictionary-word-text">${this.escapeHtml(word.word)}</span>
            <div class="dictionary-word-actions">
                <button class="dictionary-action-button edit" data-word-id="${word.id}" data-word-text="${this.escapeHtml(word.word)}" title="Edit">
                    <i class="ph ph-pencil-simple"></i>
                </button>
                <button class="dictionary-action-button delete" data-word-id="${word.id}" title="Delete">
                    <i class="ph ph-trash"></i>
                </button>
            </div>
        `;
        
        // Add event listeners
        const editButton = wordItem.querySelector('.edit');
        const deleteButton = wordItem.querySelector('.delete');
        
        if (onEdit) {
            editButton.addEventListener('click', () => onEdit(word.id, word.word));
        }
        
        if (onDelete) {
            deleteButton.addEventListener('click', () => onDelete(word.id, word.word));
        }
        
        return wordItem;
    }
    
    // ====================================
    // ADD, UPDATE, DELETE
    // ====================================
    
    async add(word, caseSensitive = true) {
        if (!word || !word.trim()) {
            throw new Error('Word cannot be empty');
        }
        
        try {
            await this.api.addDictionaryWord(word.trim(), caseSensitive);
            this.log('✅ Word added:', word);
            
            // Reload to get updated list
            await this.load();
            return true;
        } catch (error) {
            console.error('Error adding word:', error);
            throw error;
        }
    }
    
    async update(wordId, newWord, caseSensitive = true) {
        if (!newWord || !newWord.trim()) {
            throw new Error('Word cannot be empty');
        }
        
        try {
            await this.api.updateDictionaryWord(wordId, newWord.trim(), caseSensitive);
            this.log('✅ Word updated:', newWord);
            
            // Reload to get updated list
            await this.load();
            return true;
        } catch (error) {
            console.error('Error updating word:', error);
            throw error;
        }
    }
    
    async deleteConfirmed(wordId, wordText) {
        // Delete without confirmation (confirmation should be handled externally)
        try {
            await this.api.deleteDictionaryWord(wordId);
            this.log('✅ Word deleted:', wordText);
            
            // Reload to get updated list
            await this.load();
            
            return true;
        } catch (error) {
            console.error('Error deleting word:', error);
            throw error;
        }
    }
    
    // ====================================
    // HELPERS
    // ====================================
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    getWords() {
        return this.words;
    }
    
    getWordCount() {
        return this.words.length;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DictionaryManager;
}

