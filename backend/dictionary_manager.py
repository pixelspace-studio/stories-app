"""
Custom Dictionary Manager for Stories App
Handles user-defined words for automatic text correction in transcriptions
"""

import re
import uuid
from datetime import datetime
from typing import Dict, List, Optional
import logging
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

class DictionaryManager:
    """Manages custom dictionary for text correction"""
    
    def __init__(self, config_manager):
        """
        Initialize dictionary manager
        
        Args:
            config_manager: ConfigManager instance for persistent storage
        """
        self.config = config_manager
        self._ensure_dictionary_settings()
    
    def _ensure_dictionary_settings(self):
        """Ensure dictionary settings exist in config"""
        # Load current settings safely
        settings = self.config.get_setting('dictionary_settings')
        
        # Only initialize if settings don't exist at all
        if settings is None:
            # Initialize default dictionary settings
            default_settings = {
                'enabled': True,
                'max_words': 50,
                'words': []
            }
            self.config.set_setting('dictionary_settings', default_settings)
            logger.info("📖 Dictionary settings initialized (first time)")
        else:
            # Settings exist - verify structure without overwriting words
            if 'words' not in settings:
                settings['words'] = []
                self.config.set_setting('dictionary_settings', settings)
                logger.info("📖 Dictionary settings migrated (added words array)")
            else:
                logger.info(f"📖 Dictionary settings loaded ({len(settings.get('words', []))} words)")
    
    def is_enabled(self) -> bool:
        """Check if dictionary is enabled"""
        try:
            settings = self.config.get_setting('dictionary_settings')
            if settings is None:
                return True
            return settings.get('enabled', True)
        except:
            return True
    
    def set_enabled(self, enabled: bool) -> bool:
        """
        Enable or disable dictionary
        
        Args:
            enabled: True to enable, False to disable
            
        Returns:
            Success status
        """
        try:
            settings = self.config.get_setting('dictionary_settings')
            if settings is None:
                self._ensure_dictionary_settings()
                settings = self.config.get_setting('dictionary_settings')
            
            settings['enabled'] = enabled
            self.config.set_setting('dictionary_settings', settings)
            logger.info(f"📖 Dictionary {'enabled' if enabled else 'disabled'}")
            return True
        except Exception as e:
            logger.error(f"❌ Error setting dictionary enabled state: {e}")
            return False
    
    def get_all_words(self) -> List[Dict]:
        """
        Get all words from dictionary
        
        Returns:
            List of word entries
        """
        try:
            settings = self.config.get_setting('dictionary_settings')
            if settings is None:
                logger.warning("⚠️ Dictionary settings not found, initializing...")
                self._ensure_dictionary_settings()
                settings = self.config.get_setting('dictionary_settings')
                if settings is None:
                    return []
            return settings.get('words', [])
        except Exception as e:
            logger.error(f"❌ Error getting dictionary words: {e}")
            return []
    
    def add_word(self, word: str, case_sensitive: bool = True) -> Optional[Dict]:
        """
        Add a word to the dictionary
        
        Args:
            word: The word to add (this is the correct spelling)
            case_sensitive: Whether to preserve exact case
            
        Returns:
            The created word entry or None if failed
        """
        try:
            # Validate word
            if not word or not word.strip():
                logger.error("❌ Cannot add empty word")
                return None
            
            word = word.strip()
            
            settings = self.config.get_setting('dictionary_settings')
            if settings is None:
                self._ensure_dictionary_settings()
                settings = self.config.get_setting('dictionary_settings')
            
            words = settings.get('words', [])
            
            # Check word limit
            max_words = settings.get('max_words', 50)
            if len(words) >= max_words:
                logger.error(f"❌ Dictionary limit reached ({max_words} words)")
                return None
            
            # Check if word already exists
            for existing_word in words:
                if existing_word['word'].lower() == word.lower():
                    logger.error(f"❌ Word '{word}' already exists in dictionary")
                    return None
            
            # Create word entry
            word_entry = {
                'id': str(uuid.uuid4()),
                'word': word,  # This is the CORRECT spelling
                'case_sensitive': case_sensitive,
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }
            
            words.append(word_entry)
            settings['words'] = words
            self.config.set_setting('dictionary_settings', settings)
            
            logger.info(f"✅ Added word to dictionary: '{word}'")
            return word_entry
            
        except Exception as e:
            logger.error(f"❌ Error adding word to dictionary: {e}")
            return None
    
    def update_word(self, word_id: str, word: str, case_sensitive: bool = True) -> Optional[Dict]:
        """
        Update a word in the dictionary
        
        Args:
            word_id: ID of the word to update
            word: New word value
            case_sensitive: Whether to preserve exact case
            
        Returns:
            Updated word entry or None if failed
        """
        try:
            if not word or not word.strip():
                logger.error("❌ Cannot update to empty word")
                return None
            
            word = word.strip()
            
            settings = self.config.get_setting('dictionary_settings')
            if settings is None:
                self._ensure_dictionary_settings()
                settings = self.config.get_setting('dictionary_settings')
            
            words = settings.get('words', [])
            
            # Find and update word
            for i, existing_word in enumerate(words):
                if existing_word['id'] == word_id:
                    # Check if new word conflicts with another entry
                    for other_word in words:
                        if other_word['id'] != word_id and other_word['word'].lower() == word.lower():
                            logger.error(f"❌ Word '{word}' already exists in dictionary")
                            return None
                    
                    words[i]['word'] = word
                    words[i]['case_sensitive'] = case_sensitive
                    words[i]['updated_at'] = datetime.now().isoformat()
                    
                    settings['words'] = words
                    self.config.set_setting('dictionary_settings', settings)
                    
                    logger.info(f"✅ Updated word in dictionary: '{word}'")
                    return words[i]
            
            logger.error(f"❌ Word with ID '{word_id}' not found")
            return None
            
        except Exception as e:
            logger.error(f"❌ Error updating word in dictionary: {e}")
            return None
    
    def delete_word(self, word_id: str) -> bool:
        """
        Delete a word from the dictionary
        
        Args:
            word_id: ID of the word to delete
            
        Returns:
            Success status
        """
        try:
            settings = self.config.get_setting('dictionary_settings')
            if settings is None:
                self._ensure_dictionary_settings()
                settings = self.config.get_setting('dictionary_settings')
            
            words = settings.get('words', [])
            
            # Find and remove word
            initial_count = len(words)
            words = [w for w in words if w['id'] != word_id]
            
            if len(words) == initial_count:
                logger.error(f"❌ Word with ID '{word_id}' not found")
                return False
            
            settings['words'] = words
            self.config.set_setting('dictionary_settings', settings)
            
            logger.info(f"✅ Deleted word from dictionary")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error deleting word from dictionary: {e}")
            return False
    
    def apply_corrections(self, text: str) -> str:
        """
        Apply dictionary corrections to transcribed text
        
        Args:
            text: The transcribed text from Whisper
            
        Returns:
            Corrected text with dictionary words applied
        """
        if not text or not self.is_enabled():
            return text
        
        try:
            words = self.get_all_words()
            
            if not words:
                return text
            
            corrected_text = text
            
            logger.info(f"📖 Dictionary: Processing text with {len(words)} words")
            
            for word_entry in words:
                correct_word = word_entry['word']
                case_sensitive = word_entry.get('case_sensitive', True)
                
                logger.info(f"📖 Processing word: '{correct_word}'")
                
                # Create pattern to match the word with word boundaries
                # This will match the word regardless of how it's written
                pattern = rf'\b{re.escape(correct_word)}\b'
                
                if case_sensitive:
                    # Replace only if case matches
                    corrected_text = re.sub(pattern, correct_word, corrected_text)
                else:
                    # Replace regardless of case
                    corrected_text = re.sub(
                        pattern, 
                        correct_word, 
                        corrected_text, 
                        flags=re.IGNORECASE
                    )
                
                # Also try to match common variations:
                # - All lowercase: "pixelspace" → "PixelSpace"
                # - With spaces: "pixel space" → "PixelSpace"
                # - With hyphens: "pixel-space" → "PixelSpace"
                
                # Generate possible variations
                variations = set()
                
                # 1. Basic case variations
                variations.add(correct_word.lower())
                variations.add(correct_word.upper())
                variations.add(correct_word.capitalize())
                variations.add(correct_word.title())  # First letter of each word capitalized
                
                # 2. Detect compound words and split them
                # Look for capital letters in the middle (PascalCase/camelCase)
                capitals = [i for i, c in enumerate(correct_word) if i > 0 and c.isupper()]
                
                if capitals:
                    # Split at capital letters (e.g., "PixelSpace" -> ["Pixel", "Space"])
                    parts = re.findall('[A-Z][^A-Z]*', correct_word)
                    if len(parts) > 1:
                        # Add variations with spaces and hyphens
                        variations.add(' '.join(parts))                    # "Pixel Space"
                        variations.add(' '.join(parts).lower())            # "pixel space"
                        variations.add(' '.join(parts).upper())            # "PIXEL SPACE"
                        variations.add('-'.join(parts))                    # "Pixel-Space"
                        variations.add('-'.join(parts).lower())            # "pixel-space"
                        variations.add(''.join(parts).lower())             # "pixelspace"
                        variations.add(''.join(parts))                     # "PixelSpace"
                
                # 3. For words without internal capitals, try intelligent splitting
                if len(correct_word) > 6 and not capitals:
                    # Try multiple split positions around the middle
                    mid = len(correct_word) // 2
                    for split_pos in range(mid - 2, mid + 3):
                        if 2 < split_pos < len(correct_word) - 2:
                            part1 = correct_word[:split_pos]
                            part2 = correct_word[split_pos:]
                            
                            # Add various combinations
                            variations.add(f"{part1} {part2}".lower())                    # "hoot suite"
                            variations.add(f"{part1}-{part2}".lower())                    # "hoot-suite"
                            variations.add(f"{part1.capitalize()} {part2.capitalize()}")  # "Hoot Suite"
                            variations.add(f"{part1.capitalize()}{part2.capitalize()}")   # "HootSuite"
                            variations.add(f"{part1} {part2}".upper())                    # "HOOT SUITE"
                
                # 4. Remove the original word and empty strings
                variations = [v for v in variations if v and v.lower() != correct_word.lower()]
                
                logger.info(f"📖 Generated variations for '{correct_word}': {variations}")
                
                # Replace all variations with the correct word
                # Always use case-insensitive matching for better coverage
                for variation in variations:
                    if variation and variation.lower() != correct_word.lower():
                        pattern = rf'\b{re.escape(variation)}\b'
                        before = corrected_text
                        # Always case-insensitive (re.IGNORECASE) for maximum flexibility
                        corrected_text = re.sub(pattern, correct_word, corrected_text, flags=re.IGNORECASE)
                        if before != corrected_text:
                            logger.info(f"📖 Replaced '{variation}' with '{correct_word}'")
                
                # NEW: Fuzzy matching for similar words (e.g., "Prescriptive" → "Prescryptive")
                # This catches words that Whisper "corrected" to real words
                words_in_text = re.findall(r'\b\w+\b', corrected_text)
                for text_word in words_in_text:
                    # Skip if already exact match (case-insensitive)
                    if text_word.lower() == correct_word.lower():
                        continue
                    
                    # Calculate similarity ratio (0.0 to 1.0)
                    similarity = SequenceMatcher(None, text_word.lower(), correct_word.lower()).ratio()
                    
                    # If similarity is high (>85%), replace with dictionary word
                    if similarity > 0.85:
                        logger.info(f"📖 Fuzzy match: '{text_word}' → '{correct_word}' (similarity: {similarity:.2f})")
                        # Use word boundary pattern to replace whole word only
                        pattern = rf'\b{re.escape(text_word)}\b'
                        corrected_text = re.sub(pattern, correct_word, corrected_text, flags=re.IGNORECASE)
                        break  # Only replace first match per dictionary word
            
            if corrected_text != text:
                logger.info(f"📖 Applied dictionary corrections")
            
            return corrected_text
            
        except Exception as e:
            logger.error(f"❌ Error applying dictionary corrections: {e}")
            return text
    
    def get_stats(self) -> Dict:
        """
        Get dictionary statistics
        
        Returns:
            Dictionary with stats
        """
        try:
            settings = self.config.get_setting('dictionary_settings')
            if settings is None:
                self._ensure_dictionary_settings()
                settings = self.config.get_setting('dictionary_settings')
                if settings is None:
                    return {
                        'enabled': True,
                        'total_words': 0,
                        'max_words': 50,
                        'available_slots': 50
                    }
            
            words = settings.get('words', [])
            max_words = settings.get('max_words', 50)
            enabled = settings.get('enabled', True)
            
            return {
                'enabled': enabled,
                'total_words': len(words),
                'max_words': max_words,
                'available_slots': max_words - len(words)
            }
        except Exception as e:
            logger.error(f"❌ Error getting dictionary stats: {e}")
            return {
                'enabled': True,
                'total_words': 0,
                'max_words': 50,
                'available_slots': 50
            }


# Utility function
def get_default_dictionary_manager():
    """Get default dictionary manager instance"""
    from config_manager import get_default_config_manager
    config = get_default_config_manager()
    return DictionaryManager(config)

