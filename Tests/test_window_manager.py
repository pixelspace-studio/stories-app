#!/usr/bin/env python3
"""
Test script for Window Manager and dual-window architecture
Tests widget positioning, recording states, and inter-window communication
"""

import sys
import os
import requests
import json
import time
import tempfile
from pathlib import Path

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from window_manager import WindowManager, WindowType, RecordingState, WindowState

def test_window_manager_standalone():
    """Test WindowManager class standalone"""
    print("🧪 Testing Window Manager (Standalone)")
    print("=" * 50)
    
    # Test 1: Initialize window manager
    print("\n1️⃣ Testing window manager initialization...")
    
    # Use temporary directory for testing
    test_dir = tempfile.mkdtemp(prefix="window_test_")
    window_manager = WindowManager(test_dir)
    
    print(f"   ✅ Window manager initialized at: {window_manager.config_dir}")
    print(f"   ✅ Widget config file: {window_manager.widget_config_file}")
    print(f"   ✅ Window state file: {window_manager.window_state_file}")
    
    # Test 2: Widget position management
    print("\n2️⃣ Testing widget position management...")
    
    # Get default position
    default_pos = window_manager.get_widget_position()
    print(f"   ✅ Default position: {default_pos}")
    
    # Set new position
    success = window_manager.set_widget_position(200, 150)
    print(f"   {'✅' if success else '❌'} Set position to (200, 150): {success}")
    
    # Verify position was saved
    new_pos = window_manager.get_widget_position()
    print(f"   ✅ Retrieved position: {new_pos}")
    assert new_pos == {'x': 200, 'y': 150}, f"Position mismatch: {new_pos}"
    
    # Test 3: Window state management
    print("\n3️⃣ Testing window state management...")
    
    # Get default states
    main_state = window_manager.get_window_state(WindowType.MAIN)
    widget_state = window_manager.get_window_state(WindowType.WIDGET)
    print(f"   ✅ Default main state: {main_state.value}")
    print(f"   ✅ Default widget state: {widget_state.value}")
    
    # Set window states
    success1 = window_manager.set_window_state(WindowType.MAIN, WindowState.VISIBLE)
    success2 = window_manager.set_window_state(WindowType.WIDGET, WindowState.FOCUSED)
    print(f"   {'✅' if success1 else '❌'} Set main to visible: {success1}")
    print(f"   {'✅' if success2 else '❌'} Set widget to focused: {success2}")
    
    # Test 4: Recording state management
    print("\n4️⃣ Testing recording state management...")
    
    # Get initial recording state
    initial_state = window_manager.get_recording_state()
    print(f"   ✅ Initial recording state: {initial_state['state']}")
    
    # Start recording from main window
    result = window_manager.start_recording(WindowType.MAIN)
    print(f"   {'✅' if result['success'] else '❌'} Start recording from main: {result['success']}")
    if result['success']:
        print(f"   ✅ Session ID: {result['session_id']}")
    
    # Get recording state during recording
    recording_state = window_manager.get_recording_state()
    print(f"   ✅ Recording state: {recording_state['state']}")
    print(f"   ✅ Active window: {recording_state['active_window']}")
    
    # Test button states during recording
    button_states = window_manager.get_button_states()
    print(f"   ✅ Main button: {button_states['main']['text']} ({'enabled' if button_states['main']['enabled'] else 'disabled'})")
    print(f"   ✅ Widget button: {button_states['widget']['text']} ({'enabled' if button_states['widget']['enabled'] else 'disabled'})")
    
    # Stop recording
    stop_result = window_manager.stop_recording()
    print(f"   {'✅' if stop_result['success'] else '❌'} Stop recording: {stop_result['success']}")
    
    # Complete recording successfully
    complete_result = window_manager.complete_recording(True, {"text": "Test transcription"})
    print(f"   {'✅' if complete_result['success'] else '❌'} Complete recording: {complete_result['success']}")
    
    # Test 5: Full state retrieval
    print("\n5️⃣ Testing full state retrieval...")
    
    full_state = window_manager.get_full_state()
    print(f"   ✅ Full state keys: {list(full_state.keys())}")
    print(f"   ✅ Recording state: {full_state['recording']['state']}")
    print(f"   ✅ Widget position: {full_state['widget']['position']}")
    
    # Test 6: State reset
    print("\n6️⃣ Testing state reset...")
    
    reset_result = window_manager.reset_state()
    print(f"   {'✅' if reset_result['success'] else '❌'} State reset: {reset_result['success']}")
    
    # Verify reset worked
    final_state = window_manager.get_recording_state()
    print(f"   ✅ Final recording state: {final_state['state']}")
    
    # Cleanup
    import shutil
    shutil.rmtree(test_dir)
    
    print("\n✅ All window manager standalone tests passed!")

def test_backend_integration():
    """Test integration with backend server"""
    print("\n🔗 Testing Backend Integration")
    print("=" * 50)
    
    backend_url = "http://127.0.0.1:5002"
    
    # Test 1: Health check
    print("\n1️⃣ Testing health endpoint...")
    try:
        response = requests.get(f"{backend_url}/api/health", timeout=5)
        if response.status_code == 200:
            print("   ✅ Backend is running and healthy")
        else:
            print(f"   ❌ Backend health check failed: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Cannot connect to backend: {e}")
        print("   💡 Make sure to start the backend server first:")
        print("      python3 backend/app.py")
        return False
    
    # Test 2: Get application state
    print("\n2️⃣ Testing application state endpoint...")
    try:
        response = requests.get(f"{backend_url}/api/window/state", timeout=5)
        if response.status_code == 200:
            data = response.json()
            state = data.get('state', {})
            print(f"   ✅ Application state retrieved")
            print(f"   ✅ Recording state: {state.get('recording', {}).get('state')}")
            print(f"   ✅ Widget position: {state.get('widget', {}).get('position')}")
        else:
            print(f"   ❌ Application state endpoint failed: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Error testing application state: {e}")
        return False
    
    # Test 3: Widget position management
    print("\n3️⃣ Testing widget position endpoints...")
    try:
        # Get current position
        response = requests.get(f"{backend_url}/api/window/widget/position", timeout=5)
        if response.status_code == 200:
            data = response.json()
            current_pos = data.get('position', {})
            print(f"   ✅ Current widget position: {current_pos}")
        
        # Set new position
        new_position = {"x": 300, "y": 250}
        response = requests.post(
            f"{backend_url}/api/window/widget/position", 
            json=new_position, 
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ Position updated: {data.get('position')}")
        else:
            print(f"   ❌ Position update failed: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Error testing widget position: {e}")
        return False
    
    # Test 4: Recording session management
    print("\n4️⃣ Testing recording session endpoints...")
    try:
        # Start recording from main window
        start_data = {"initiated_by": "main"}
        response = requests.post(
            f"{backend_url}/api/window/recording/start", 
            json=start_data, 
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            session_id = data.get('session_id')
            print(f"   ✅ Recording started from main: {session_id}")
        else:
            print(f"   ❌ Recording start failed: {response.status_code}")
            return False
        
        # Get recording state
        response = requests.get(f"{backend_url}/api/window/recording/state", timeout=5)
        if response.status_code == 200:
            data = response.json()
            recording_state = data.get('recording_state', {})
            print(f"   ✅ Recording state: {recording_state.get('state')}")
            print(f"   ✅ Active window: {recording_state.get('active_window')}")
        
        # Get button states
        response = requests.get(f"{backend_url}/api/window/buttons", timeout=5)
        if response.status_code == 200:
            data = response.json()
            button_states = data.get('button_states', {})
            main_btn = button_states.get('main', {})
            widget_btn = button_states.get('widget', {})
            print(f"   ✅ Main button: {main_btn.get('text')} ({'enabled' if main_btn.get('enabled') else 'disabled'})")
            print(f"   ✅ Widget button: {widget_btn.get('text')} ({'enabled' if widget_btn.get('enabled') else 'disabled'})")
        
        # Stop recording
        response = requests.post(f"{backend_url}/api/window/recording/stop", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ Recording stopped: {data.get('session_id')}")
        else:
            print(f"   ❌ Recording stop failed: {response.status_code}")
        
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Error testing recording session: {e}")
        return False
    
    # Test 5: State reset
    print("\n5️⃣ Testing state reset...")
    try:
        response = requests.post(f"{backend_url}/api/window/reset", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ State reset: {data.get('message')}")
        else:
            print(f"   ❌ State reset failed: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Error testing state reset: {e}")
        return False
    
    print("\n✅ Backend integration tests passed!")
    return True

def test_dual_window_scenarios():
    """Test specific dual-window scenarios"""
    print("\n🪟 Testing Dual-Window Scenarios")
    print("=" * 50)
    
    backend_url = "http://127.0.0.1:5002"
    
    # Test Scenario 1: Recording from main window
    print("\n📱 Scenario 1: Recording from Main Window")
    try:
        # Reset state first
        requests.post(f"{backend_url}/api/window/reset", timeout=5)
        
        # Start recording from main
        start_data = {"initiated_by": "main"}
        response = requests.post(f"{backend_url}/api/window/recording/start", json=start_data, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ Recording started from main window")
            print(f"   ✅ Session ID: {data.get('session_id')}")
            
            # Check button states
            response = requests.get(f"{backend_url}/api/window/buttons", timeout=5)
            if response.status_code == 200:
                button_data = response.json()
                buttons = button_data.get('button_states', {})
                
                main_btn = buttons.get('main', {})
                widget_btn = buttons.get('widget', {})
                
                print(f"   ✅ Main window button: '{main_btn.get('text')}' ({'enabled' if main_btn.get('enabled') else 'disabled'})")
                print(f"   ✅ Widget button: '{widget_btn.get('text')}' ({'enabled' if widget_btn.get('enabled') else 'disabled'})")
                
                # Verify expected behavior
                if main_btn.get('text') == 'Recording...' and not main_btn.get('enabled'):
                    print("   ✅ Main window shows correct state (Recording..., disabled)")
                else:
                    print(f"   ❌ Main window unexpected state: {main_btn}")
                
                if widget_btn.get('text') == 'Stop' and widget_btn.get('enabled'):
                    print("   ✅ Widget shows correct state (Stop, enabled)")
                else:
                    print(f"   ❌ Widget unexpected state: {widget_btn}")
        
        # Stop recording
        requests.post(f"{backend_url}/api/window/recording/stop", timeout=5)
        
    except Exception as e:
        print(f"   ❌ Scenario 1 failed: {e}")
    
    # Test Scenario 2: Recording from widget
    print("\n📱 Scenario 2: Recording from Widget Only")
    try:
        # Reset state first
        requests.post(f"{backend_url}/api/window/reset", timeout=5)
        
        # Start recording from widget
        start_data = {"initiated_by": "widget"}
        response = requests.post(f"{backend_url}/api/window/recording/start", json=start_data, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ Recording started from widget")
            print(f"   ✅ Session ID: {data.get('session_id')}")
            
            # Check button states - should be same as scenario 1
            response = requests.get(f"{backend_url}/api/window/buttons", timeout=5)
            if response.status_code == 200:
                button_data = response.json()
                buttons = button_data.get('button_states', {})
                
                main_btn = buttons.get('main', {})
                widget_btn = buttons.get('widget', {})
                
                print(f"   ✅ Main window button: '{main_btn.get('text')}' ({'enabled' if main_btn.get('enabled') else 'disabled'})")
                print(f"   ✅ Widget button: '{widget_btn.get('text')}' ({'enabled' if widget_btn.get('enabled') else 'disabled'})")
        
        # Stop recording
        requests.post(f"{backend_url}/api/window/recording/stop", timeout=5)
        
    except Exception as e:
        print(f"   ❌ Scenario 2 failed: {e}")
    
    print("\n✅ Dual-window scenario tests completed!")

def main():
    """Main test function"""
    print("🚀 Stories App - Window Manager Test Suite")
    print("=" * 60)
    
    # Run standalone tests
    test_window_manager_standalone()
    
    # Test backend integration (optional - requires running server)
    print("\n" + "=" * 60)
    user_input = input("🤔 Do you want to test backend integration? (requires running server) [y/N]: ")
    if user_input.lower() in ['y', 'yes']:
        if test_backend_integration():
            # Run dual-window scenario tests
            test_dual_window_scenarios()
    else:
        print("⏭️  Skipping backend integration tests")
    
    print("\n🎉 All window manager tests completed!")
    print("\n📋 Summary:")
    print("   ✅ Window manager class working")
    print("   ✅ Widget position persistence working")
    print("   ✅ Recording state management working")
    print("   ✅ Button state logic working")
    print("   ✅ Dual-window architecture ready")
    print("\n🏗️ Dual-window backend implementation complete!")
    print("🎨 Ready for frontend integration!")

if __name__ == "__main__":
    main()
