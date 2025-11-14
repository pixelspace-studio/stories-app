#!/bin/bash

# Test Script for Uninstaller
# This verifies that the uninstaller removes all Stories data
# Run AFTER executing the uninstaller

echo ""
echo "╔════════════════════════════════════════╗"
echo "║   Uninstaller Test - Verification     ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Define paths (same as uninstaller)
APP_PATH="/Applications/Stories.app"
DATA_PATH="$HOME/Library/Application Support/Stories"
PREFS_PATH="$HOME/Library/Preferences/com.pixelspace.stories.plist"
LOGS_PATH="$HOME/Library/Logs/Stories"

# Track test results
ALL_PASSED=true

# Function to check if path exists
check_path() {
    local path=$1
    local name=$2
    
    if [ -e "$path" ]; then
        echo "  ❌ FAIL: $name still exists"
        echo "     Path: $path"
        ALL_PASSED=false
    else
        echo "  ✅ PASS: $name successfully removed"
    fi
}

echo "Checking if all Stories files were removed..."
echo ""

# Check each path
check_path "$APP_PATH" "Stories.app"
check_path "$DATA_PATH" "User data"
check_path "$PREFS_PATH" "Preferences"
check_path "$LOGS_PATH" "Logs"

echo ""

# Check if Stories process is running
if pgrep -x "Stories" > /dev/null; then
    echo "  ❌ FAIL: Stories is still running"
    ALL_PASSED=false
else
    echo "  ✅ PASS: Stories process not running"
fi

echo ""
echo "═══════════════════════════════════════════"

if [ "$ALL_PASSED" = true ]; then
    echo "✅ ALL TESTS PASSED - Uninstaller works correctly!"
    echo ""
    echo "Stories has been completely removed from your Mac."
    exit 0
else
    echo "❌ SOME TESTS FAILED - Uninstaller did not remove everything"
    echo ""
    echo "Please manually delete remaining files or report this issue."
    exit 1
fi

