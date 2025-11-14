"""
Window Manager for Dual-Window Architecture
Manages state and communication between Main Window and Floating Widget
"""

import json
import os
import time
from datetime import datetime
from typing import Dict, Any, Optional, List, Callable
from enum import Enum
import threading
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WindowType(Enum):
    """Types of windows in the application"""
    MAIN = "main"
    WIDGET = "widget"

class RecordingState(Enum):
    """States of the recording system"""
    IDLE = "idle"
    RECORDING = "recording"
    PROCESSING = "processing"
    ERROR = "error"

class WindowState(Enum):
    """States of individual windows"""
    HIDDEN = "hidden"
    VISIBLE = "visible"
    FOCUSED = "focused"
    MINIMIZED = "minimized"

class WindowManager:
    """Manages dual-window architecture and inter-window communication"""
    
    def __init__(self, config_dir: Optional[str] = None):
        """
        Initialize window manager
        
        Args:
            config_dir: Directory for configuration files
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
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
        self.widget_config_file = self.config_dir / 'widget_state.json'
        self.window_state_file = self.config_dir / 'window_states.json'
        
        # Current application state
        self.recording_state = RecordingState.IDLE
        self.active_window = None  # Which window initiated current recording
        self.recording_session_id = None
        self.recording_start_time = None
        
        # Window states
        self.window_states = {
            WindowType.MAIN: WindowState.HIDDEN,
            WindowType.WIDGET: WindowState.HIDDEN
        }
        
        # Widget configuration
        self.widget_config = {
            'position': {'x': 100, 'y': 100},  # Default position
            'always_on_top': True,
            'visible': True
        }
        
        # Event listeners
        self.state_change_listeners = []
        self.position_change_listeners = []
        
        # Thread safety
        self._lock = threading.Lock()
        
        # Load saved states
        self._load_widget_config()
        self._load_window_states()
        
        logger.info(f"Window manager initialized at: {self.config_dir}")
    
    def _load_widget_config(self):
        """Load widget configuration from file"""
        try:
            if self.widget_config_file.exists():
                with open(self.widget_config_file, 'r') as f:
                    saved_config = json.load(f)
                    self.widget_config.update(saved_config)
                logger.info("Widget configuration loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load widget config: {e}")
    
    def _save_widget_config(self):
        """Save widget configuration to file"""
        try:
            with open(self.widget_config_file, 'w') as f:
                json.dump(self.widget_config, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save widget config: {e}")
    
    def _load_window_states(self):
        """Load window states from file"""
        try:
            if self.window_state_file.exists():
                with open(self.window_state_file, 'r') as f:
                    saved_states = json.load(f)
                    for window_type_str, state_str in saved_states.items():
                        try:
                            window_type = WindowType(window_type_str)
                            window_state = WindowState(state_str)
                            self.window_states[window_type] = window_state
                        except ValueError:
                            continue
                logger.info("Window states loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load window states: {e}")
    
    def _save_window_states(self):
        """Save window states to file"""
        try:
            states_to_save = {
                window_type.value: state.value 
                for window_type, state in self.window_states.items()
            }
            with open(self.window_state_file, 'w') as f:
                json.dump(states_to_save, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save window states: {e}")
    
    def add_state_change_listener(self, callback: Callable[[Dict[str, Any]], None]):
        """Add listener for state changes"""
        self.state_change_listeners.append(callback)
    
    def add_position_change_listener(self, callback: Callable[[Dict[str, Any]], None]):
        """Add listener for position changes"""
        self.position_change_listeners.append(callback)
    
    def _notify_state_change(self, change_data: Dict[str, Any]):
        """Notify all listeners of state change"""
        for listener in self.state_change_listeners:
            try:
                listener(change_data)
            except Exception as e:
                logger.error(f"Error in state change listener: {e}")
    
    def _notify_position_change(self, position_data: Dict[str, Any]):
        """Notify all listeners of position change"""
        for listener in self.position_change_listeners:
            try:
                listener(position_data)
            except Exception as e:
                logger.error(f"Error in position change listener: {e}")
    
    def get_widget_position(self) -> Dict[str, int]:
        """Get current widget position"""
        with self._lock:
            return self.widget_config['position'].copy()
    
    def set_widget_position(self, x: int, y: int) -> bool:
        """
        Set widget position and persist it
        
        Args:
            x: X coordinate
            y: Y coordinate
            
        Returns:
            Success status
        """
        try:
            with self._lock:
                old_position = self.widget_config['position'].copy()
                self.widget_config['position'] = {'x': x, 'y': y}
                self._save_widget_config()
            
            # Notify listeners
            self._notify_position_change({
                'old_position': old_position,
                'new_position': {'x': x, 'y': y},
                'timestamp': datetime.now().isoformat()
            })
            
            logger.info(f"Widget position updated to ({x}, {y})")
            return True
            
        except Exception as e:
            logger.error(f"Failed to set widget position: {e}")
            return False
    
    def get_window_state(self, window_type: WindowType) -> WindowState:
        """Get current state of a window"""
        with self._lock:
            return self.window_states.get(window_type, WindowState.HIDDEN)
    
    def set_window_state(self, window_type: WindowType, state: WindowState) -> bool:
        """
        Set window state
        
        Args:
            window_type: Type of window
            state: New state
            
        Returns:
            Success status
        """
        try:
            with self._lock:
                old_state = self.window_states.get(window_type, WindowState.HIDDEN)
                self.window_states[window_type] = state
                self._save_window_states()
            
            # Notify listeners
            self._notify_state_change({
                'type': 'window_state_change',
                'window_type': window_type.value,
                'old_state': old_state.value,
                'new_state': state.value,
                'timestamp': datetime.now().isoformat()
            })
            
            logger.info(f"Window {window_type.value} state changed to {state.value}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to set window state: {e}")
            return False
    
    def get_recording_state(self) -> Dict[str, Any]:
        """Get current recording state"""
        with self._lock:
            return {
                'state': self.recording_state.value,
                'active_window': self.active_window.value if self.active_window else None,
                'session_id': self.recording_session_id,
                'start_time': self.recording_start_time,
                'duration': (
                    time.time() - self.recording_start_time 
                    if self.recording_start_time else None
                )
            }
    
    def start_recording(self, initiated_by: WindowType) -> Dict[str, Any]:
        """
        Start recording session
        
        Args:
            initiated_by: Window that initiated the recording
            
        Returns:
            Recording session info
        """
        try:
            with self._lock:
                if self.recording_state != RecordingState.IDLE:
                    return {
                        'success': False,
                        'error': f'Recording already in progress (state: {self.recording_state.value})',
                        'current_state': self.get_recording_state()
                    }
                
                # Generate session ID
                session_id = f"rec_{int(time.time() * 1000)}"
                
                # Update state
                self.recording_state = RecordingState.RECORDING
                self.active_window = initiated_by
                self.recording_session_id = session_id
                self.recording_start_time = time.time()
                
                # Update window states based on architecture logic
                if initiated_by == WindowType.MAIN:
                    # Main window loses focus, widget gains focus
                    self.set_window_state(WindowType.MAIN, WindowState.VISIBLE)
                    self.set_window_state(WindowType.WIDGET, WindowState.FOCUSED)
                else:
                    # Widget-only recording, main stays as is
                    self.set_window_state(WindowType.WIDGET, WindowState.FOCUSED)
            
            # Notify listeners
            recording_info = self.get_recording_state()
            self._notify_state_change({
                'type': 'recording_started',
                'initiated_by': initiated_by.value,
                'session_id': session_id,
                'recording_info': recording_info,
                'timestamp': datetime.now().isoformat()
            })
            
            logger.info(f"Recording started by {initiated_by.value}, session: {session_id}")
            
            return {
                'success': True,
                'session_id': session_id,
                'recording_info': recording_info,
                'message': f'Recording started by {initiated_by.value}'
            }
            
        except Exception as e:
            logger.error(f"Failed to start recording: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def stop_recording(self) -> Dict[str, Any]:
        """
        Stop current recording session
        
        Returns:
            Recording session info
        """
        try:
            with self._lock:
                if self.recording_state != RecordingState.RECORDING:
                    return {
                        'success': False,
                        'error': f'No recording in progress (state: {self.recording_state.value})',
                        'current_state': self.get_recording_state()
                    }
                
                # Get session info before clearing
                session_info = self.get_recording_state()
                session_id = self.recording_session_id
                
                # Update state
                self.recording_state = RecordingState.PROCESSING
            
            # Notify listeners
            self._notify_state_change({
                'type': 'recording_stopped',
                'session_id': session_id,
                'session_info': session_info,
                'timestamp': datetime.now().isoformat()
            })
            
            logger.info(f"Recording stopped, session: {session_id}")
            
            return {
                'success': True,
                'session_id': session_id,
                'session_info': session_info,
                'message': 'Recording stopped, processing...'
            }
            
        except Exception as e:
            logger.error(f"Failed to stop recording: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def complete_recording(self, success: bool, result_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Complete recording session (after transcription)
        
        Args:
            success: Whether transcription was successful
            result_data: Transcription result data
            
        Returns:
            Session completion info
        """
        try:
            with self._lock:
                if self.recording_state != RecordingState.PROCESSING:
                    return {
                        'success': False,
                        'error': f'No processing in progress (state: {self.recording_state.value})',
                        'current_state': self.get_recording_state()
                    }
                
                # Get session info before clearing
                session_info = self.get_recording_state()
                session_id = self.recording_session_id
                
                # Clear recording state
                self.recording_state = RecordingState.IDLE
                self.active_window = None
                self.recording_session_id = None
                self.recording_start_time = None
            
            # Notify listeners
            self._notify_state_change({
                'type': 'recording_completed',
                'session_id': session_id,
                'success': success,
                'session_info': session_info,
                'result_data': result_data,
                'timestamp': datetime.now().isoformat()
            })
            
            logger.info(f"Recording completed, session: {session_id}, success: {success}")
            
            return {
                'success': True,
                'session_id': session_id,
                'recording_success': success,
                'session_info': session_info,
                'result_data': result_data,
                'message': 'Recording session completed'
            }
            
        except Exception as e:
            logger.error(f"Failed to complete recording: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def get_button_states(self) -> Dict[str, Dict[str, Any]]:
        """
        Get button states for both windows based on current recording state
        
        Returns:
            Button states for main and widget windows
        """
        with self._lock:
            recording_state = self.recording_state
            active_window = self.active_window
        
        if recording_state == RecordingState.IDLE:
            # Both windows show "Record" button (enabled)
            return {
                'main': {
                    'text': 'Record',
                    'enabled': True,
                    'state': 'idle'
                },
                'widget': {
                    'text': 'Record',
                    'enabled': True,
                    'state': 'idle'
                }
            }
        
        elif recording_state in [RecordingState.RECORDING, RecordingState.PROCESSING]:
            # Main window shows "Recording..." (visual only)
            # Widget shows "Stop" (active control)
            return {
                'main': {
                    'text': 'Recording...' if recording_state == RecordingState.RECORDING else 'Processing...',
                    'enabled': False,
                    'state': recording_state.value
                },
                'widget': {
                    'text': 'Stop' if recording_state == RecordingState.RECORDING else 'Processing...',
                    'enabled': recording_state == RecordingState.RECORDING,
                    'state': recording_state.value,
                    'active_control': True
                }
            }
        
        else:  # ERROR state
            return {
                'main': {
                    'text': 'Error',
                    'enabled': False,
                    'state': 'error'
                },
                'widget': {
                    'text': 'Error',
                    'enabled': False,
                    'state': 'error'
                }
            }
    
    def get_full_state(self) -> Dict[str, Any]:
        """Get complete application state"""
        with self._lock:
            return {
                'recording': self.get_recording_state(),
                'windows': {
                    window_type.value: state.value 
                    for window_type, state in self.window_states.items()
                },
                'widget': self.widget_config.copy(),
                'button_states': self.get_button_states(),
                'timestamp': datetime.now().isoformat()
            }
    
    def reset_state(self) -> Dict[str, Any]:
        """Reset all states to default (emergency reset)"""
        try:
            with self._lock:
                self.recording_state = RecordingState.IDLE
                self.active_window = None
                self.recording_session_id = None
                self.recording_start_time = None
                
                # Reset window states
                for window_type in self.window_states:
                    self.window_states[window_type] = WindowState.HIDDEN
                
                self._save_window_states()
            
            # Notify listeners
            self._notify_state_change({
                'type': 'state_reset',
                'timestamp': datetime.now().isoformat()
            })
            
            logger.info("Application state reset to defaults")
            
            return {
                'success': True,
                'message': 'Application state reset successfully',
                'current_state': self.get_full_state()
            }
            
        except Exception as e:
            logger.error(f"Failed to reset state: {e}")
            return {
                'success': False,
                'error': str(e)
            }

# Utility functions
def get_default_window_manager() -> WindowManager:
    """Get default window manager instance"""
    return WindowManager()

# Global instance for shared use
_window_manager_instance = None

def get_shared_window_manager() -> WindowManager:
    """Get shared window manager instance (singleton)"""
    global _window_manager_instance
    if _window_manager_instance is None:
        _window_manager_instance = WindowManager()
    return _window_manager_instance
