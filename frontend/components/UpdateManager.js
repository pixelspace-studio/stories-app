/**
 * UpdateManager.js
 * Manages auto-update functionality for Stories
 * 
 * Features:
 * - Check for updates automatically
 * - Show update notification
 * - Download and install updates
 * - Progress feedback
 */

class UpdateManager {
  constructor() {
    this.notification = document.getElementById('updateNotification');
    this.updateVersion = document.getElementById('updateVersion');
    this.updateMessage = document.getElementById('updateNotificationMessage');
    this.updateProgress = document.getElementById('updateProgress');
    this.updateProgressFill = document.getElementById('updateProgressFill');
    this.updateProgressText = document.getElementById('updateProgressText');
    this.updateNowButton = document.getElementById('updateNowButton');
    this.restartButton = document.getElementById('restartButton');
    
    this.updateInfo = null;
    this.isDownloading = false;
    
    this.init();
  }
  
  init() {
    console.log('[UpdateManager] Initializing...');
    
    // Listen for update events from main process
    window.api.on('update-available', this.handleUpdateAvailable.bind(this));
    window.api.on('update-downloaded', this.handleUpdateDownloaded.bind(this));
    window.api.on('update-download-progress', this.handleDownloadProgress.bind(this));
    window.api.on('update-error', this.handleUpdateError.bind(this));
    
    // Button handlers
    this.updateNowButton.addEventListener('click', () => this.downloadUpdate());
    this.restartButton.addEventListener('click', () => this.installUpdate());
    
    // Auto-dismiss after 15 seconds
    this.autoDismissTimeout = null;
    
    console.log('[UpdateManager] Initialized successfully');
  }
  
  /**
   * Handle update available event
   */
  handleUpdateAvailable(updateInfo) {
    console.log('[UpdateManager] Update available:', updateInfo);
    this.updateInfo = updateInfo;
    this.showNotification(updateInfo);
  }
  
  /**
   * Handle update downloaded event
   */
  handleUpdateDownloaded(info) {
    console.log('[UpdateManager] Update downloaded:', info);
    this.showRestartButton();
  }
  
  /**
   * Handle download progress
   */
  handleDownloadProgress(progressInfo) {
    const percent = Math.round(progressInfo.percent);
    console.log(`[UpdateManager] Download progress: ${percent}%`);
    this.updateProgressBar(percent);
  }
  
  /**
   * Handle update error
   */
  handleUpdateError(errorMessage) {
    console.error('[UpdateManager] Error:', errorMessage);
    this.hideProgressBar();
    this.isDownloading = false;
    
    // Show error in notification
    this.updateMessage.textContent = 'Update failed. Please try again later.';
    this.updateNowButton.classList.remove('hidden');
    this.updateNowButton.textContent = 'Try Again';
  }
  
  /**
   * Show update notification
   */
  showNotification(updateInfo) {
    this.updateVersion.textContent = updateInfo.version;
    
    // Friendly message
    this.updateMessage.innerHTML = `New version ${updateInfo.version} available`;
    
    // Show notification
    this.notification.classList.remove('hidden');
    
    // Auto-dismiss after 15 seconds if user doesn't interact
    if (this.autoDismissTimeout) {
      clearTimeout(this.autoDismissTimeout);
    }
    
    this.autoDismissTimeout = setTimeout(() => {
      if (!this.isDownloading && !this.notification.classList.contains('hidden')) {
        this.hideNotification();
      }
    }, 15000);
  }
  
  /**
   * Hide notification
   */
  hideNotification() {
    this.notification.classList.add('hidden');
    this.hideProgressBar();
  }
  
  /**
   * Download update
   */
  async downloadUpdate() {
    console.log('[UpdateManager] Starting download...');
    this.isDownloading = true;
    
    // Hide "Update Now" button, show progress
    this.updateNowButton.classList.add('hidden');
    this.showProgressBar();
    
    try {
      const result = await window.api.invoke('download-update');
      if (!result.success) {
        throw new Error(result.error || 'Download failed');
      }
    } catch (error) {
      console.error('[UpdateManager] Download error:', error);
      this.handleUpdateError(error.message);
    }
  }
  
  /**
   * Install update and restart
   */
  installUpdate() {
    console.log('[UpdateManager] Installing update and restarting...');
    window.api.invoke('install-update');
  }
  
  /**
   * Show progress bar
   */
  showProgressBar() {
    this.updateProgress.classList.remove('hidden');
    this.updateProgressFill.style.width = '0%';
    this.updateProgressText.textContent = 'Downloading... 0%';
  }
  
  /**
   * Hide progress bar
   */
  hideProgressBar() {
    this.updateProgress.classList.add('hidden');
  }
  
  /**
   * Update progress bar
   */
  updateProgressBar(percent) {
    this.updateProgressFill.style.width = `${percent}%`;
    this.updateProgressText.textContent = `Downloading... ${percent}%`;
    
    if (percent >= 100) {
      this.updateProgressText.textContent = 'Download complete!';
    }
  }
  
  /**
   * Show restart button
   */
  showRestartButton() {
    this.hideProgressBar();
    this.updateNowButton.classList.add('hidden');
    this.restartButton.classList.remove('hidden');
    this.restartButton.textContent = 'Restart';
    this.updateMessage.innerHTML = `All set! Restart to update`;
  }
  
  /**
   * Check for updates manually
   */
  async checkForUpdates() {
    console.log('[UpdateManager] Checking for updates manually...');
    try {
      const result = await window.api.invoke('check-for-updates');
      if (result.success && result.updateInfo) {
        console.log('[UpdateManager] Update found:', result.updateInfo);
        // Event listener will handle showing notification
      } else {
        console.log('[UpdateManager] No updates available');
        // Optionally show "You're up to date" message
      }
    } catch (error) {
      console.error('[UpdateManager] Error checking for updates:', error);
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.updateManager = new UpdateManager();
  });
} else {
  window.updateManager = new UpdateManager();
}

