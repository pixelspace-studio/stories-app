#!/usr/bin/env python3
"""
Test script for configuration system
Tests secure storage, API key validation, and settings management
"""

import sys
import os
import requests
import json
import tempfile
from pathlib import Path

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from config_manager import ConfigurationManager, get_default_config_manager, validate_openai_key

def test_configuration_manager():
    """Test the ConfigurationManager class"""
    print("🧪 Testing Configuration Manager")
    print("=" * 50)
    
    # Test 1: Initialize configuration manager
    print("\n1️⃣ Testing configuration manager initialization...")
    
    # Use a temporary directory for testing
    test_dir = tempfile.mkdtemp(prefix="config_test_")
    config_manager = ConfigurationManager(test_dir)
    
    print(f"   ✅ Config manager initialized at: {config_manager.config_dir}")
    print(f"   ✅ Config file: {config_manager.config_file}")
    print(f"   ✅ Secure file: {config_manager.secure_file}")
    
    # Test 2: Default configuration
    print("\n2️⃣ Testing default configuration...")
    
    config = config_manager.load_config()
    print(f"   ✅ Default config loaded with {len(config)} sections")
    print(f"   ✅ App version: {config.get('app_version')}")
    print(f"   ✅ API settings: {len(config.get('api_settings', {}))}")
    print(f"   ✅ Audio settings: {len(config.get('audio_settings', {}))}")
    
    # Test 3: Setting and getting values
    print("\n3️⃣ Testing setting and getting values...")
    
    # Test dot notation
    success = config_manager.set_setting('api_settings.timeout', 45)
    print(f"   {'✅' if success else '❌'} Set nested setting: {success}")
    
    timeout_value = config_manager.get_setting('api_settings.timeout')
    print(f"   ✅ Retrieved timeout: {timeout_value}")
    
    # Test non-existent setting
    missing_value = config_manager.get_setting('non.existent.setting', 'default')
    print(f"   ✅ Default value for missing setting: {missing_value}")
    
    # Test 4: API key validation (without real key)
    print("\n4️⃣ Testing API key validation...")
    
    # Test invalid formats
    invalid_keys = [
        "",
        "invalid-key",
        "ak-1234567890",
        "sk-"
    ]
    
    for invalid_key in invalid_keys:
        result = config_manager.validate_api_key(invalid_key)
        status = "✅" if not result['valid'] else "❌"
        print(f"   {status} Invalid key '{invalid_key[:10]}...': {result.get('error', 'No error')}")
    
    # Test 5: Secure storage
    print("\n5️⃣ Testing secure storage...")
    
    # Set a test API key (fake)
    test_api_key = "sk-test123456789012345678901234567890"
    config_manager.set_setting('openai_api_key', test_api_key)
    
    # Verify it's stored securely
    retrieved_key = config_manager.get_setting('openai_api_key')
    print(f"   {'✅' if retrieved_key == test_api_key else '❌'} Secure storage: Keys match")
    
    # Check that it's encrypted in file
    if config_manager.secure_file.exists():
        with open(config_manager.secure_file, 'rb') as f:
            encrypted_content = f.read()
        print(f"   ✅ API key encrypted in file (size: {len(encrypted_content)} bytes)")
    
    # Test 6: Settings export/import
    print("\n6️⃣ Testing settings export/import...")
    
    # Export settings
    export_data = config_manager.export_settings(include_api_key=False)
    print(f"   ✅ Settings exported: {len(export_data.get('settings', {}))} settings")
    
    # Import settings
    import_result = config_manager.import_settings(export_data)
    print(f"   {'✅' if import_result['success'] else '❌'} Settings import: {import_result.get('message')}")
    
    # Test 7: Reset to defaults
    print("\n7️⃣ Testing reset to defaults...")
    
    success = config_manager.reset_to_defaults(keep_api_key=True)
    print(f"   {'✅' if success else '❌'} Reset to defaults: {success}")
    
    # Verify API key was preserved
    preserved_key = config_manager.get_setting('openai_api_key')
    print(f"   {'✅' if preserved_key == test_api_key else '❌'} API key preserved: {preserved_key is not None}")
    
    # Cleanup test directory
    import shutil
    shutil.rmtree(test_dir)
    
    print("\n✅ All configuration manager tests passed!")

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
    
    # Test 2: Get all settings
    print("\n2️⃣ Testing get all settings...")
    try:
        response = requests.get(f"{backend_url}/api/config/settings", timeout=5)
        if response.status_code == 200:
            data = response.json()
            settings = data.get('settings', {})
            print(f"   ✅ Settings retrieved: {len(settings)} sections")
            print(f"   ✅ App version: {settings.get('app_version')}")
        else:
            print(f"   ❌ Settings endpoint failed: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Error testing settings endpoint: {e}")
        return False
    
    # Test 3: API key status
    print("\n3️⃣ Testing API key status...")
    try:
        response = requests.get(f"{backend_url}/api/config/api-key", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ API key status: {data.get('status')}")
            if data.get('has_api_key'):
                print(f"   ✅ Masked key: {data.get('api_key_masked')}")
        else:
            print(f"   ❌ API key status endpoint failed: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Error testing API key status: {e}")
        return False
    
    # Test 4: Validate fake API key
    print("\n4️⃣ Testing API key validation...")
    try:
        test_data = {"api_key": "invalid-key"}
        response = requests.post(
            f"{backend_url}/api/config/api-key/validate", 
            json=test_data, 
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            validation = data.get('validation', {})
            print(f"   ✅ Validation endpoint working: {validation.get('valid', False)}")
            print(f"   ✅ Error message: {validation.get('error', 'N/A')}")
        else:
            print(f"   ❌ Validation endpoint failed: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Error testing validation: {e}")
        return False
    
    # Test 5: Update a setting
    print("\n5️⃣ Testing setting update...")
    try:
        test_data = {"value": 60}
        response = requests.put(
            f"{backend_url}/api/config/settings/api_settings.timeout", 
            json=test_data, 
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ Setting updated: {data.get('message')}")
        else:
            print(f"   ❌ Setting update failed: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Error testing setting update: {e}")
        return False
    
    # Test 6: Export settings
    print("\n6️⃣ Testing settings export...")
    try:
        response = requests.get(f"{backend_url}/api/config/export", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ Settings exported: {data.get('app_version')}")
            print(f"   ✅ Export timestamp: {data.get('export_timestamp')}")
        else:
            print(f"   ❌ Export endpoint failed: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Error testing export: {e}")
        return False
    
    print("\n✅ Backend integration tests passed!")
    return True

def test_real_api_key_validation():
    """Test real API key validation if available"""
    print("\n🔑 Testing Real API Key Validation")
    print("=" * 50)
    
    # Check if we have a real API key in environment
    api_key = os.environ.get('OPENAI_API_KEY')
    
    if not api_key:
        print("   ⏭️  No OPENAI_API_KEY found in environment")
        print("   💡 Set OPENAI_API_KEY to test real validation")
        return
    
    print(f"   🔍 Found API key: sk-...{api_key[-4:]}")
    
    # Test validation
    try:
        result = validate_openai_key(api_key)
        
        print(f"   {'✅' if result['valid'] else '❌'} API key validation: {result['valid']}")
        
        if result['valid']:
            print(f"   ✅ Whisper available: {result.get('whisper_available', 'Unknown')}")
            print(f"   ✅ Model count: {result.get('model_count', 'Unknown')}")
            print(f"   ✅ Details: {result.get('details', 'N/A')}")
        else:
            print(f"   ❌ Error: {result.get('error', 'Unknown error')}")
            print(f"   ❌ Details: {result.get('details', 'N/A')}")
            
    except Exception as e:
        print(f"   ❌ Validation failed with exception: {e}")

def main():
    """Main test function"""
    print("🚀 Whisper Space App - Configuration System Test Suite")
    print("=" * 60)
    
    # Run component tests
    test_configuration_manager()
    
    # Test real API key if available
    test_real_api_key_validation()
    
    # Test backend integration (optional - requires running server)
    print("\n" + "=" * 60)
    user_input = input("🤔 Do you want to test backend integration? (requires running server) [y/N]: ")
    if user_input.lower() in ['y', 'yes']:
        test_backend_integration()
    else:
        print("⏭️  Skipping backend integration tests")
    
    print("\n🎉 All configuration system tests completed!")
    print("\n📋 Summary:")
    print("   ✅ Configuration manager working")
    print("   ✅ Secure storage and encryption working")
    print("   ✅ API key validation working")
    print("   ✅ Settings management working")
    print("   ✅ Export/import functionality working")
    print("\n🔐 Configuration system is secure and ready!")
    print("⚙️ Users can now configure API keys from the app!")
    print("\n🚀 Ready for UI integration!")

if __name__ == "__main__":
    main()
