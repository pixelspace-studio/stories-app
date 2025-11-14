"""
Audio Storage System for Stories App
Handles local storage, metadata, and recovery of audio files
"""

import os
import json
import shutil
import hashlib
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AudioStorageManager:
    """Manages local storage of audio files with metadata"""
    
    def __init__(self, base_path: Optional[str] = None):
        """
        Initialize audio storage manager
        
        Args:
            base_path: Base directory for audio storage. If None, uses system default.
        """
        if base_path is None:
            # Use system-appropriate directory
            if os.name == 'nt':  # Windows
                base_path = os.path.join(os.environ['APPDATA'], 'Stories')
            else:  # macOS/Linux
                base_path = os.path.join(
                    os.path.expanduser('~'), 
                    'Library', 'Application Support', 'Stories'
                )
        
        self.base_path = Path(base_path)
        self.audio_dir = self.base_path / 'audio'
        self.failed_dir = self.audio_dir / 'failed'
        self.metadata_dir = self.base_path / 'metadata'
        
        # Thread pool for timeout-protected operations
        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="audio_storage")
        
        # Create directories
        self._ensure_directories()
        
        logger.info(f"Audio storage initialized at: {self.base_path}")
    
    def _ensure_directories(self):
        """Create necessary directories if they don't exist"""
        directories = [
            self.base_path,
            self.audio_dir,
            self.failed_dir,
            self.metadata_dir
        ]
        
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
    
    def _generate_filename(self, original_filename: str = None, timestamp: datetime = None) -> str:
        """
        Generate unique filename for audio file
        
        Args:
            original_filename: Original filename if available
            timestamp: Timestamp for the file
            
        Returns:
            Generated filename
        """
        if timestamp is None:
            timestamp = datetime.now()
        
        # Format: YYYY-MM-DD_HH-MM-SS_hash
        time_str = timestamp.strftime('%Y-%m-%d_%H-%M-%S')
        
        # Add hash for uniqueness
        hash_str = hashlib.md5(f"{time_str}_{original_filename or 'recording'}".encode()).hexdigest()[:8]
        
        return f"{time_str}_{hash_str}"
    
    def _get_year_month_path(self, timestamp: datetime) -> Path:
        """
        Get year/month subdirectory path
        
        Args:
            timestamp: Timestamp for the file
            
        Returns:
            Path to year/month directory
        """
        year = timestamp.strftime('%Y')
        month = timestamp.strftime('%m')
        
        year_month_path = self.audio_dir / year / month
        year_month_path.mkdir(parents=True, exist_ok=True)
        
        return year_month_path
    
    def save_audio(self, audio_file_path: str, metadata: Dict = None, 
                   is_failed: bool = False) -> Tuple[str, str]:
        """
        Save audio file with metadata
        
        Args:
            audio_file_path: Path to the audio file to save
            metadata: Metadata dictionary
            is_failed: Whether this is a failed transcription
            
        Returns:
            Tuple of (audio_file_id, saved_audio_path)
        """
        timestamp = datetime.now()
        
        # Generate unique filename
        original_name = os.path.basename(audio_file_path)
        filename_base = self._generate_filename(original_name, timestamp)
        
        # Determine file extension
        _, ext = os.path.splitext(audio_file_path)
        if not ext:
            ext = '.webm'  # Default for web recordings
        
        audio_filename = f"{filename_base}{ext}"
        
        # Determine destination directory
        if is_failed:
            dest_dir = self.failed_dir
            status = 'failed'
        else:
            dest_dir = self._get_year_month_path(timestamp)
            status = 'saved'
        
        # Copy audio file
        dest_audio_path = dest_dir / audio_filename
        shutil.copy2(audio_file_path, dest_audio_path)
        
        # Create metadata
        file_metadata = {
            'id': filename_base,
            'original_filename': original_name,
            'saved_filename': audio_filename,
            'saved_path': str(dest_audio_path),
            'timestamp': timestamp.isoformat(),
            'status': status,
            'file_size': os.path.getsize(dest_audio_path),
            'is_failed': is_failed,
            'created_at': timestamp.isoformat(),
            'updated_at': timestamp.isoformat()
        }
        
        # Add custom metadata
        if metadata:
            file_metadata.update(metadata)
        
        # Save metadata
        metadata_filename = f"{filename_base}_metadata.json"
        metadata_path = self.metadata_dir / metadata_filename
        
        with open(metadata_path, 'w') as f:
            json.dump(file_metadata, f, indent=2)
        
        logger.info(f"Audio saved: {audio_filename} ({'failed' if is_failed else 'success'})")
        
        return filename_base, str(dest_audio_path)
    
    def get_audio_info(self, audio_id: str) -> Optional[Dict]:
        """
        Get metadata for a specific audio file
        
        Args:
            audio_id: Audio file ID
            
        Returns:
            Metadata dictionary or None if not found
        """
        metadata_path = self.metadata_dir / f"{audio_id}_metadata.json"
        
        if not metadata_path.exists():
            return None
        
        try:
            with open(metadata_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error reading metadata for {audio_id}: {e}")
            return None
    
    def list_audio_files(self, status: str = None, limit: int = None) -> List[Dict]:
        """
        List audio files with optional filtering
        
        Args:
            status: Filter by status ('saved', 'failed', 'transcribed')
            limit: Maximum number of files to return
            
        Returns:
            List of metadata dictionaries
        """
        audio_files = []
        
        # Get all metadata files
        metadata_files = list(self.metadata_dir.glob("*_metadata.json"))
        
        # Sort by modification time (newest first)
        metadata_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
        
        for metadata_file in metadata_files:
            try:
                with open(metadata_file, 'r') as f:
                    metadata = json.load(f)
                
                # Verify that the audio file still exists
                audio_path = metadata.get('saved_path')
                if audio_path and not os.path.exists(audio_path):
                    logger.warning(f"Audio file not found for metadata: {metadata_file}, skipping")
                    continue
                
                # Filter by status if specified
                if status and metadata.get('status') != status:
                    continue
                
                audio_files.append(metadata)
                
                # Apply limit if specified
                if limit and len(audio_files) >= limit:
                    break
                    
            except Exception as e:
                logger.error(f"Error reading metadata file {metadata_file}: {e}")
        
        return audio_files
    
    def update_audio_status(self, audio_id: str, status: str, 
                           additional_metadata: Dict = None) -> bool:
        """
        Update audio file status and metadata
        
        Args:
            audio_id: Audio file ID
            status: New status
            additional_metadata: Additional metadata to add
            
        Returns:
            Success status
        """
        metadata = self.get_audio_info(audio_id)
        if not metadata:
            return False
        
        # Update status and timestamp
        metadata['status'] = status
        metadata['updated_at'] = datetime.now().isoformat()
        
        # Add additional metadata
        if additional_metadata:
            metadata.update(additional_metadata)
        
        # Save updated metadata
        metadata_path = self.metadata_dir / f"{audio_id}_metadata.json"
        try:
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)
            return True
        except Exception as e:
            logger.error(f"Error updating metadata for {audio_id}: {e}")
            return False
    
    def move_to_failed(self, audio_id: str, error_reason: str = None) -> bool:
        """
        Move audio file to failed directory
        
        Args:
            audio_id: Audio file ID
            error_reason: Reason for failure
            
        Returns:
            Success status
        """
        metadata = self.get_audio_info(audio_id)
        if not metadata:
            return False
        
        current_path = Path(metadata['saved_path'])
        if not current_path.exists():
            logger.error(f"Audio file not found: {current_path}")
            return False
        
        # Move to failed directory
        failed_path = self.failed_dir / current_path.name
        shutil.move(str(current_path), str(failed_path))
        
        # Update metadata
        additional_metadata = {
            'saved_path': str(failed_path),
            'is_failed': True,
            'error_reason': error_reason or 'Unknown error'
        }
        
        return self.update_audio_status(audio_id, 'failed', additional_metadata)
    
    def delete_audio(self, audio_id: str) -> bool:
        """
        Delete audio file and metadata
        
        Args:
            audio_id: Audio file ID
            
        Returns:
            Success status
        """
        metadata = self.get_audio_info(audio_id)
        if not metadata:
            return False
        
        success = True
        
        # Delete audio file
        audio_path = Path(metadata['saved_path'])
        if audio_path.exists():
            try:
                audio_path.unlink()
            except Exception as e:
                logger.error(f"Error deleting audio file {audio_path}: {e}")
                success = False
        
        # Delete metadata file
        metadata_path = self.metadata_dir / f"{audio_id}_metadata.json"
        if metadata_path.exists():
            try:
                metadata_path.unlink()
            except Exception as e:
                logger.error(f"Error deleting metadata file {metadata_path}: {e}")
                success = False
        
        if success:
            logger.info(f"Audio file deleted: {audio_id}")
        
        return success
    
    def cleanup_old_files(self, days_old: int = 30, keep_failed: bool = True) -> Tuple[int, List[str]]:
        """
        Clean up old audio files and orphaned metadata
        
        Args:
            days_old: Delete files older than this many days
            keep_failed: Whether to keep failed files
            
        Returns:
            Tuple of (number of files deleted, list of deleted audio IDs)
        """
        from datetime import timedelta
        
        cutoff_date = datetime.now() - timedelta(days=days_old)
        deleted_count = 0
        deleted_audio_ids = []
        
        # First, clean up orphaned metadata (metadata without audio files)
        orphaned_count = self._cleanup_orphaned_metadata()
        logger.info(f"Cleaned up {orphaned_count} orphaned metadata files")
        
        audio_files = self.list_audio_files()
        
        for metadata in audio_files:
            # Parse creation date
            try:
                created_at = datetime.fromisoformat(metadata['created_at'])
            except:
                continue  # Skip files with invalid dates
            
            # Skip if not old enough
            if created_at > cutoff_date:
                continue
            
            # Skip failed files if requested
            if keep_failed and metadata.get('is_failed', False):
                continue
            
            # Delete the file
            audio_id = metadata['id']
            if self.delete_audio(audio_id):
                deleted_count += 1
                deleted_audio_ids.append(audio_id)
        
        logger.info(f"Cleanup completed: {deleted_count} files deleted, {orphaned_count} orphaned metadata removed")
        return deleted_count, deleted_audio_ids
    
    def _cleanup_orphaned_metadata(self) -> int:
        """
        Clean up metadata files that don't have corresponding audio files
        
        Returns:
            Number of orphaned metadata files deleted
        """
        orphaned_count = 0
        metadata_files = list(self.metadata_dir.glob("*_metadata.json"))
        
        for metadata_file in metadata_files:
            try:
                with open(metadata_file, 'r') as f:
                    metadata = json.load(f)
                
                audio_path = metadata.get('saved_path')
                if audio_path and not os.path.exists(audio_path):
                    # Audio file doesn't exist, delete the metadata
                    metadata_file.unlink()
                    orphaned_count += 1
                    logger.info(f"Deleted orphaned metadata: {metadata_file.name}")
            except Exception as e:
                logger.error(f"Error processing metadata file {metadata_file}: {e}")
        
        return orphaned_count
    
    def get_storage_stats(self, cleanup_days: int = 14) -> Dict:
        """
        Get storage statistics
        
        Args:
            cleanup_days: Days threshold for cleanup eligibility
        
        Returns:
            Dictionary with storage statistics
        """
        from datetime import timedelta
        
        audio_files = self.list_audio_files()
        cutoff_date = datetime.now() - timedelta(days=cleanup_days)
        
        stats = {
            'total_files': len(audio_files),
            'successful_files': 0,
            'failed_files': 0,
            'total_size_bytes': 0,
            'oldest_file': None,
            'newest_file': None,
            'cleanup_eligible_count': 0  # Files that can be cleaned up
        }
        
        oldest_date = None
        newest_date = None
        
        for metadata in audio_files:
            # Count by status
            if metadata.get('is_failed', False):
                stats['failed_files'] += 1
            else:
                stats['successful_files'] += 1
            
            # Add to total size
            stats['total_size_bytes'] += metadata.get('file_size', 0)
            
            # Track oldest and newest, and cleanup eligibility
            try:
                created_at = datetime.fromisoformat(metadata['created_at'])
                
                # Check if eligible for cleanup (older than cleanup_days)
                if created_at < cutoff_date and not metadata.get('is_failed', False):
                    stats['cleanup_eligible_count'] += 1
                
                if oldest_date is None or created_at < oldest_date:
                    oldest_date = created_at
                    stats['oldest_file'] = metadata['id']
                
                if newest_date is None or created_at > newest_date:
                    newest_date = created_at
                    stats['newest_file'] = metadata['id']
                    
            except:
                continue
        
        # Convert size to human readable
        stats['total_size_mb'] = round(stats['total_size_bytes'] / (1024 * 1024), 2)
        
        return stats
    
    # ========================================
    # SAFE METHODS WITH TIMEOUT PROTECTION
    # ========================================
    
    def list_audio_files_safe(self, status: str = None, limit: int = None, timeout: int = 10) -> List[Dict]:
        """
        List audio files with timeout protection
        
        Args:
            status: Filter by status ('saved', 'failed', 'transcribed')
            limit: Maximum number of files to return
            timeout: Max seconds to wait (default: 10s)
            
        Returns:
            List of metadata dictionaries, empty list on timeout/error
        """
        start_time = time.time()
        logger.info(f"📂 list_audio_files_safe: Starting (status={status}, limit={limit}, timeout={timeout}s)")
        
        try:
            future = self.executor.submit(self.list_audio_files, status, limit)
            result = future.result(timeout=timeout)
            elapsed = time.time() - start_time
            logger.info(f"✅ list_audio_files_safe: Found {len(result)} files in {elapsed:.2f}s")
            return result
        except FuturesTimeoutError:
            elapsed = time.time() - start_time
            logger.error(f"❌ list_audio_files_safe: TIMEOUT after {elapsed:.2f}s")
            return []
        except Exception as e:
            elapsed = time.time() - start_time
            logger.error(f"❌ list_audio_files_safe: ERROR after {elapsed:.2f}s: {e}")
            return []
    
    def delete_audio_safe(self, audio_id: str, timeout: int = 5) -> bool:
        """
        Delete audio with timeout protection
        
        Args:
            audio_id: Audio file ID to delete
            timeout: Max seconds to wait (default: 5s)
            
        Returns:
            True if deleted, False on timeout/error
        """
        start_time = time.time()
        logger.info(f"🗑️ delete_audio_safe: Deleting {audio_id} (timeout={timeout}s)")
        
        try:
            future = self.executor.submit(self.delete_audio, audio_id)
            result = future.result(timeout=timeout)
            elapsed = time.time() - start_time
            logger.info(f"✅ delete_audio_safe: Completed in {elapsed:.2f}s")
            return result
        except FuturesTimeoutError:
            elapsed = time.time() - start_time
            logger.error(f"❌ delete_audio_safe: TIMEOUT after {elapsed:.2f}s for {audio_id}")
            return False
        except Exception as e:
            elapsed = time.time() - start_time
            logger.error(f"❌ delete_audio_safe: ERROR after {elapsed:.2f}s: {e}")
            return False

# Utility functions
def get_default_storage_manager() -> AudioStorageManager:
    """Get default audio storage manager instance"""
    return AudioStorageManager()

def save_temp_audio_with_metadata(temp_path: str, metadata: Dict = None, 
                                 is_failed: bool = False) -> Tuple[str, str]:
    """
    Convenience function to save temporary audio file
    
    Args:
        temp_path: Path to temporary audio file
        metadata: Metadata dictionary
        is_failed: Whether this is a failed transcription
        
    Returns:
        Tuple of (audio_id, saved_path)
    """
    storage = get_default_storage_manager()
    return storage.save_audio(temp_path, metadata, is_failed)

def save_temp_audio_with_metadata_safe(temp_path: str, metadata: Dict = None, 
                                       is_failed: bool = False, timeout: int = 15) -> Tuple[Optional[str], Optional[str]]:
    """
    Save temporary audio file with timeout protection
    
    Args:
        temp_path: Path to temporary audio file
        metadata: Metadata dictionary
        is_failed: Whether this is a failed transcription
        timeout: Max seconds to wait (default: 15s)
        
    Returns:
        Tuple of (audio_id, saved_path) or (None, None) on timeout/error
    """
    start_time = time.time()
    logger.info(f"💾 save_temp_audio_safe: Starting (timeout={timeout}s)")
    
    try:
        storage = get_default_storage_manager()
        executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="save_audio")
        
        future = executor.submit(storage.save_audio, temp_path, metadata, is_failed)
        result = future.result(timeout=timeout)
        
        elapsed = time.time() - start_time
        logger.info(f"✅ save_temp_audio_safe: Completed in {elapsed:.2f}s")
        executor.shutdown(wait=False)
        return result
    except FuturesTimeoutError:
        elapsed = time.time() - start_time
        logger.error(f"❌ save_temp_audio_safe: TIMEOUT after {elapsed:.2f}s")
        executor.shutdown(wait=False)
        return None, None
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"❌ save_temp_audio_safe: ERROR after {elapsed:.2f}s: {e}")
        if 'executor' in locals():
            executor.shutdown(wait=False)
        return None, None
