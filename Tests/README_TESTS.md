# Test Suite - Stories App

This directory contains test scripts for the Stories App backend and core functionality.

## Manual Testing

### test_manual.py
**Purpose**: Test backend without Electron (browser-based interface)  
**When to use**: Isolating backend issues, testing API integration  
**What it does**:
- Starts Flask backend
- Creates a simple web interface
- Tests recording and transcription flow

```bash
python3 Tests/test_manual.py
```

**Opens**: Browser with test interface at http://localhost:5000

---

## Component Tests

### test_audio_storage.py
**Tests**: Audio file storage and retrieval system  
**Coverage**:
- Audio file saving and loading
- Storage directory management
- Audio metadata handling
- File cleanup and garbage collection

```bash
python3 Tests/test_audio_storage.py
```

---

### test_config_system.py
**Tests**: Configuration manager (settings, API keys)  
**Coverage**:
- Config file creation and loading
- API key storage and validation
- Settings persistence
- Default configuration handling

```bash
python3 Tests/test_config_system.py
```

---

### test_retry_logic.py
**Tests**: API retry mechanisms for resilience  
**Coverage**:
- Exponential backoff implementation
- Max retry limits
- Error handling and recovery
- Network failure scenarios

```bash
python3 Tests/test_retry_logic.py
```

---

### test_window_manager.py
**Tests**: Electron window state management  
**Coverage**:
- Window positioning and sizing
- State persistence across sessions
- Multi-window coordination (main + widget)
- Screen bounds validation

```bash
python3 Tests/test_window_manager.py
```

---

## Running All Tests

To run all component tests sequentially:

```bash
for test in Tests/test_*.py; do
    echo "Running $test..."
    python3 "$test"
    echo "---"
done
```

---

## Test Guidelines

### When to Run Tests

- **Before major refactoring**: Ensure baseline functionality
- **After backend changes**: Run relevant component tests
- **Before deployment**: Run all tests to validate system
- **When debugging**: Use manual test for backend isolation

### Writing New Tests

When adding new features, consider adding tests to cover:
1. Happy path (expected usage)
2. Error cases (invalid input, network failures)
3. Edge cases (empty data, large files)
4. Integration with existing systems

---

## Common Test Issues

**ImportError: No module named 'flask'**
```bash
pip3 install -r backend/requirements.txt
```

**Tests fail with "Backend not found"**
- Ensure you're running from project root
- Check `backend/app.py` exists

**Audio tests fail**
- Check audio storage directory permissions
- Verify disk space available

---

## Test Status

All tests were last updated: **November 2025**

| Test | Status | Coverage |
|------|--------|----------|
| test_manual.py | Active | Backend only |
| test_audio_storage.py | Active | Audio system |
| test_config_system.py | Active | Config manager |
| test_retry_logic.py | Active | API resilience |
| test_window_manager.py | Active | Window state |

---

**Need help?** See main [README.md](../README.md) or open an issue on GitHub.
