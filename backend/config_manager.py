"""
Configuration Management System for Stories App
Handles secure storage, validation, and management of application settings
"""

import os
import json
import base64
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional, List
import logging
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import openai

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ConfigurationManager:
    """Manages application configuration with secure storage"""
    
    def __init__(self, config_dir: Optional[str] = None):
        """
        Initialize configuration manager
        
        Args:
            config_dir: Directory for configuration files. If None, uses system default.
        """
        if config_dir is None:
            # Use system-appropriate directory
            if os.name == 'nt':  # Windows
                config_dir = os.path.join(os.environ['APPDATA'], 'Stories')
            else:  # macOS/Linux
                config_dir = os.path.join(
                    os.path.expanduser('~'), 
                    'Library', 'Application Support', 'Stories'
                )
        
        self.config_dir = Path(config_dir)
        self.config_file = self.config_dir / 'config.json'
        self.secure_file = self.config_dir / 'secure.enc'
        
        # Create directory if it doesn't exist
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
        # Default configuration
        self.default_config = {
            'app_version': '2.0.0',
            'api_settings': {
                'timeout': 30,
                'max_retries': 3,
                'retry_delay': 1.0
            },
            'audio_settings': {
                'save_audio_files': True,
                'cleanup_days': 30,
                'keep_failed_files': True,
                'max_file_size_mb': 25
            },
            'ui_settings': {
                'theme': 'system',
                'language': 'auto',
                'notifications': True,
                'always_on_top': False,
                'auto_hide_widget': False,
                'auto_paste': False,
                'sound_effects_enabled': False
            },
            'shortcuts': {
                'record_toggle': 'CommandOrControl+Shift+R',
                'copy_latest': 'CommandOrControl+Control+G'
            },
            'dictionary_settings': {
                'enabled': True,
                'max_words': 50,
                'words': []
            }
        }
        
        # Secure configuration (encrypted)
        self.secure_keys = ['openai_api_key', 'user_preferences']
        
        # Cache for configuration (avoid repeated file reads)
        self._config_cache = None
        self._cache_timestamp = 0
        self._cache_ttl = 60  # Cache for 60 seconds
        
        logger.info(f"Configuration manager initialized at: {self.config_dir}")
    
    def _generate_key(self, password: str) -> bytes:
        """Generate encryption key from password"""
        password_bytes = password.encode()
        salt = b'whisper_space_salt_2025'  # Fixed salt for consistency
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(password_bytes))
        return key
    
    def _get_machine_id(self) -> str:
        """Get unique machine identifier for encryption"""
        # Use hostname + user as basis for machine ID
        machine_info = f"{os.uname().nodename}_{os.environ.get('USER', 'default')}"
        return hashlib.sha256(machine_info.encode()).hexdigest()[:16]
    
    def _encrypt_data(self, data: Dict[str, Any]) -> bytes:
        """Encrypt sensitive data"""
        machine_id = self._get_machine_id()
        key = self._generate_key(machine_id)
        fernet = Fernet(key)
        
        json_data = json.dumps(data).encode()
        encrypted_data = fernet.encrypt(json_data)
        return encrypted_data
    
    def _decrypt_data(self, encrypted_data: bytes) -> Dict[str, Any]:
        """Decrypt sensitive data"""
        try:
            machine_id = self._get_machine_id()
            key = self._generate_key(machine_id)
            fernet = Fernet(key)
            
            decrypted_data = fernet.decrypt(encrypted_data)
            return json.loads(decrypted_data.decode())
        except Exception as e:
            # Don't log as error - file might not exist on first run
            logger.debug(f"Could not decrypt data: {e}")
            return {}
    
    def _deep_merge(self, base: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
        """
        Deep merge two dictionaries, preserving nested structures
        
        Args:
            base: Base dictionary (defaults)
            updates: Dictionary with updates to apply
            
        Returns:
            Merged dictionary
        
        Note: User data in 'updates' takes precedence over defaults in 'base'.
              This ensures user's dictionary words, settings, etc. are preserved.
        """
        import copy
        result = copy.deepcopy(base)
        
        for key, value in updates.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                # Recursively merge nested dictionaries
                result[key] = self._deep_merge(result[key], value)
            else:
                # User data takes precedence - use value from updates (saved config)
                # This preserves arrays like dictionary words, custom settings, etc.
                result[key] = copy.deepcopy(value)
        
        return result
    
    def load_config(self, use_cache: bool = True) -> Dict[str, Any]:
        """
        Load configuration from files with optional caching and backup recovery
        
        Args:
            use_cache: If True, use cached config if available and fresh
            
        Returns:
            Configuration dictionary
        """
        import time
        import copy
        import shutil
        
        # Check if cache is valid
        if use_cache and self._config_cache is not None:
            cache_age = time.time() - self._cache_timestamp
            if cache_age < self._cache_ttl:
                return copy.deepcopy(self._config_cache)
        
        # Load fresh configuration (deep copy to avoid reference issues)
        config = copy.deepcopy(self.default_config)
        
        # === LOAD REGULAR CONFIGURATION WITH BACKUP RECOVERY ===
        if self.config_file.exists():
            config_loaded = False
            
            # Try loading main config file
            try:
                with open(self.config_file, 'r') as f:
                    saved_config = json.load(f)
                    # Deep merge saved config into defaults
                    config = self._deep_merge(config, saved_config)
                    config_loaded = True
                    logger.info("✅ Configuration loaded successfully")
            except json.JSONDecodeError as e:
                logger.error(f"❌ Config file corrupted: {e}")
                
                # Try loading from backup
                backup_file = self.config_dir / 'config.json.backup'
                if backup_file.exists():
                    try:
                        logger.warning("⚠️  Attempting to restore from backup...")
                        with open(backup_file, 'r') as f:
                            saved_config = json.load(f)
                            config = self._deep_merge(config, saved_config)
                            config_loaded = True
                            
                        # Restore backup to main file
                        shutil.copy2(backup_file, self.config_file)
                        logger.info("✅ Configuration restored from backup")
                    except Exception as backup_error:
                        logger.error(f"❌ Failed to load backup: {backup_error}")
                else:
                    logger.error("❌ No backup file found")
            except Exception as e:
                logger.error(f"❌ Failed to load config: {e}")
            
            # If config couldn't be loaded from main or backup, log critical error
            if not config_loaded:
                logger.critical("🔥 CRITICAL: Could not load configuration from main or backup file!")
                logger.critical("🔥 Using default configuration - user data may be lost")
        
        # === LOAD SECURE CONFIGURATION WITH BACKUP RECOVERY ===
        if self.secure_file.exists():
            secure_loaded = False
            
            # Try loading main secure file
            try:
                with open(self.secure_file, 'rb') as f:
                    encrypted_data = f.read()
                    secure_config = self._decrypt_data(encrypted_data)
                    if secure_config:  # Only merge if decryption succeeded
                        config = self._deep_merge(config, secure_config)
                        secure_loaded = True
            except Exception as e:
                logger.warning(f"⚠️  Could not load secure config: {e}")
                
                # Try loading from backup
                backup_file = self.config_dir / 'secure.enc.backup'
                if backup_file.exists():
                    try:
                        logger.warning("⚠️  Attempting to restore secure config from backup...")
                        with open(backup_file, 'rb') as f:
                            encrypted_data = f.read()
                            secure_config = self._decrypt_data(encrypted_data)
                            if secure_config:
                                config = self._deep_merge(config, secure_config)
                                secure_loaded = True
                                
                        # Restore backup to main file
                        shutil.copy2(backup_file, self.secure_file)
                        logger.info("✅ Secure configuration restored from backup")
                    except Exception as backup_error:
                        logger.warning(f"⚠️  Failed to load secure backup: {backup_error}")
        else:
            # First time setup - no secure file exists yet
            logger.debug("📝 No secure configuration file found (first run)")
        
        # Update cache (deep copy to avoid mutations)
        self._config_cache = copy.deepcopy(config)
        self._cache_timestamp = time.time()
        
        return config
    
    def save_config(self, config: Dict[str, Any]) -> bool:
        """
        Save configuration to files with atomic writes and file locking
        
        Uses temporary files and atomic renames to prevent corruption from
        concurrent writes or crashes during save operations.
        """
        import tempfile
        import fcntl
        import shutil
        
        # Invalidate cache on save
        self._config_cache = None
        self._cache_timestamp = 0
        
        try:
            # Separate secure and regular config
            regular_config = {}
            secure_config = {}
            
            for key, value in config.items():
                if key in self.secure_keys:
                    secure_config[key] = value
                else:
                    regular_config[key] = value
            
            # === ATOMIC WRITE FOR REGULAR CONFIG ===
            # Create backup before writing
            if self.config_file.exists():
                backup_file = self.config_dir / 'config.json.backup'
                try:
                    shutil.copy2(self.config_file, backup_file)
                except Exception as e:
                    logger.warning(f"Failed to create backup: {e}")
            
            # Write to temporary file first
            temp_fd, temp_path = tempfile.mkstemp(
                dir=self.config_dir,
                prefix='.config_',
                suffix='.tmp'
            )
            
            try:
                # Lock the temp file (prevents concurrent writes)
                fcntl.flock(temp_fd, fcntl.LOCK_EX)
                
                # Write JSON to temp file
                with os.fdopen(temp_fd, 'w') as temp_file:
                    json.dump(regular_config, temp_file, indent=2)
                    temp_file.flush()
                    os.fsync(temp_file.fileno())
                
                # Validate JSON before committing
                with open(temp_path, 'r') as f:
                    json.load(f)  # This will raise if invalid
                
                # Atomic rename (replaces old file)
                os.replace(temp_path, self.config_file)
                
            except Exception as e:
                # Cleanup temp file on error
                try:
                    os.unlink(temp_path)
                except:
                    pass
                raise e
            
            # === ATOMIC WRITE FOR SECURE CONFIG ===
            if secure_config:
                # Create backup before writing
                if self.secure_file.exists():
                    backup_file = self.config_dir / 'secure.enc.backup'
                    try:
                        shutil.copy2(self.secure_file, backup_file)
                    except Exception as e:
                        logger.warning(f"Failed to create secure backup: {e}")
                
                # Encrypt data
                encrypted_data = self._encrypt_data(secure_config)
                
                # Write to temporary file first
                temp_fd, temp_path = tempfile.mkstemp(
                    dir=self.config_dir,
                    prefix='.secure_',
                    suffix='.tmp'
                )
                
                try:
                    # Lock the temp file
                    fcntl.flock(temp_fd, fcntl.LOCK_EX)
                    
                    # Write encrypted data
                    with os.fdopen(temp_fd, 'wb') as temp_file:
                        temp_file.write(encrypted_data)
                        temp_file.flush()
                        os.fsync(temp_file.fileno())
                    
                    # Atomic rename
                    os.replace(temp_path, self.secure_file)
                    
                except Exception as e:
                    # Cleanup temp file on error
                    try:
                        os.unlink(temp_path)
                    except:
                        pass
                    raise e
            
            logger.info("Configuration saved successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save config: {e}")
            return False
    
    def get_setting(self, key_path: str, default: Any = None) -> Any:
        """
        Get a setting value using dot notation
        
        Args:
            key_path: Dot-separated path to setting (e.g., 'api_settings.timeout')
            default: Default value if setting not found
            
        Returns:
            Setting value or default
        """
        config = self.load_config()
        keys = key_path.split('.')
        
        current = config
        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return default
        
        return current
    
    def set_setting(self, key_path: str, value: Any) -> bool:
        """
        Set a setting value using dot notation
        
        Args:
            key_path: Dot-separated path to setting
            value: Value to set
            
        Returns:
            Success status
        """
        config = self.load_config()
        keys = key_path.split('.')
        
        logger.info(f"Setting '{key_path}' to: {value}")
        
        # Navigate to parent and set value
        current = config
        for key in keys[:-1]:
            if key not in current:
                current[key] = {}
            current = current[key]
        
        current[keys[-1]] = value
        
        # Log the actual value set
        logger.info(f"Value set in config: {current[keys[-1]]}")
        
        result = self.save_config(config)
        logger.info(f"Config save result: {result}")
        return result
    
    def validate_api_key(self, api_key: str) -> Dict[str, Any]:
        """
        Validate OpenAI API key
        
        Args:
            api_key: API key to validate
            
        Returns:
            Validation result with status and details
        """
        if not api_key or not api_key.strip():
            return {
                'valid': False,
                'error': 'API key is empty',
                'details': 'Please provide a valid OpenAI API key'
            }
        
        if not api_key.startswith('sk-'):
            return {
                'valid': False,
                'error': 'Invalid API key format',
                'details': 'OpenAI API keys should start with "sk-"'
            }
        
        try:
            # Test API key with a simple request
            client = openai.OpenAI(api_key=api_key.strip())
            
            # Make a minimal request to validate the key
            response = client.models.list()
            
            # Check if we can access Whisper model
            whisper_available = any(
                'whisper' in model.id.lower() 
                for model in response.data
            )
            
            return {
                'valid': True,
                'whisper_available': whisper_available,
                'model_count': len(response.data),
                'details': 'API key is valid and working'
            }
            
        except openai.AuthenticationError:
            return {
                'valid': False,
                'error': 'Authentication failed',
                'details': 'The API key is invalid or has been revoked'
            }
        except openai.RateLimitError:
            return {
                'valid': True,
                'warning': 'Rate limit reached',
                'details': 'API key is valid but rate limited'
            }
        except Exception as e:
            return {
                'valid': False,
                'error': 'Validation failed',
                'details': str(e)
            }
    
    def get_api_key(self) -> Optional[str]:
        """Get stored API key"""
        return self.get_setting('openai_api_key')
    
    def set_api_key(self, api_key: str) -> Dict[str, Any]:
        """
        Set and validate API key
        
        Args:
            api_key: OpenAI API key
            
        Returns:
            Result with validation status
        """
        # Validate first
        validation = self.validate_api_key(api_key)
        
        if validation['valid']:
            # Save if valid
            success = self.set_setting('openai_api_key', api_key.strip())
            if success:
                validation['saved'] = True
                logger.info("API key saved successfully")
            else:
                validation['saved'] = False
                validation['error'] = 'Failed to save API key'
        
        return validation
    
    def delete_api_key(self) -> bool:
        """
        Delete API key from configuration
        
        Returns:
            True if successful, False otherwise
        """
        try:
            # Set to empty string to delete
            success = self.set_setting('openai_api_key', '')
            return success
        except Exception as e:
            print(f"❌ Error deleting API key: {e}")
            return False
    
    def get_all_settings(self) -> Dict[str, Any]:
        """Get all settings (excluding sensitive data for client)"""
        config = self.load_config()
        
        # Remove sensitive data for client response
        client_config = config.copy()
        if 'openai_api_key' in client_config:
            # Show only masked version with middle dots (·)
            api_key = client_config['openai_api_key']
            if api_key:
                masked = f"sk-·······{api_key[-4:]}" if len(api_key) > 10 else "sk-····****"
                client_config['openai_api_key_masked'] = masked
            del client_config['openai_api_key']
        
        return client_config
    
    def reset_to_defaults(self, keep_api_key: bool = True) -> bool:
        """
        Reset configuration to defaults
        
        Args:
            keep_api_key: Whether to preserve the API key
            
        Returns:
            Success status
        """
        try:
            import copy
            config = copy.deepcopy(self.default_config)
            
            if keep_api_key:
                current_api_key = self.get_api_key()
                if current_api_key:
                    config['openai_api_key'] = current_api_key
            
            return self.save_config(config)
            
        except Exception as e:
            logger.error(f"Failed to reset config: {e}")
            return False
    
    def export_settings(self, include_api_key: bool = False) -> Dict[str, Any]:
        """
        Export settings for backup
        
        Args:
            include_api_key: Whether to include API key (not recommended)
            
        Returns:
            Exportable settings
        """
        config = self.load_config()
        
        if not include_api_key and 'openai_api_key' in config:
            del config['openai_api_key']
        
        return {
            'export_timestamp': '2025-09-26T10:00:00Z',
            'app_version': config.get('app_version', '2.0.0'),
            'settings': config
        }
    
    def import_settings(self, settings_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Import settings from backup
        
        Args:
            settings_data: Settings to import
            
        Returns:
            Import result
        """
        try:
            if 'settings' not in settings_data:
                return {
                    'success': False,
                    'error': 'Invalid settings format'
                }
            
            current_config = self.load_config()
            imported_settings = settings_data['settings']
            
            # Merge with current config
            current_config.update(imported_settings)
            
            success = self.save_config(current_config)
            
            return {
                'success': success,
                'imported_keys': list(imported_settings.keys()),
                'message': 'Settings imported successfully' if success else 'Failed to save imported settings'
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

# ====================================
# SINGLETON INSTANCE
# ====================================

_config_manager_instance = None

def get_default_config_manager() -> ConfigurationManager:
    """
    Get singleton configuration manager instance
    
    Returns:
        Singleton ConfigurationManager instance
    """
    global _config_manager_instance
    
    if _config_manager_instance is None:
        _config_manager_instance = ConfigurationManager()
        logger.info("✅ Configuration Manager singleton created")
    
    return _config_manager_instance

def validate_openai_key(api_key: str) -> Dict[str, Any]:
    """
    Convenience function to validate OpenAI API key
    
    Args:
        api_key: API key to validate
        
    Returns:
        Validation result
    """
    config_manager = get_default_config_manager()
    return config_manager.validate_api_key(api_key)
