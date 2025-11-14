#!/bin/bash

# Stories - Uninstall Script
# This script removes Stories and all its data from your Mac
# Version: 1.1 (Updated Nov 2025)

set -e

echo ""
echo "╔════════════════════════════════════════╗"
echo "║     Stories - Uninstall Utility       ║"
echo "║              v1.1                      ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Check if running as root (we don't want that)
if [ "$EUID" -eq 0 ]; then 
    echo "❌ Please do not run this script as root/sudo"
    echo "   Run it as: ./uninstall.sh"
    exit 1
fi

# Define paths
APP_PATH="/Applications/Stories.app"
DATA_PATH="$HOME/Library/Application Support/Stories"
PREFS_PATH="$HOME/Library/Preferences/com.pixelspace.stories.plist"
LOGS_PATH="$HOME/Library/Logs/Stories"

# Check if Stories is running
if pgrep -x "Stories" > /dev/null; then
    echo "⚠️  Stories is currently running"
    echo ""
    read -p "   Close Stories before continuing? (y/N): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "   Closing Stories..."
        killall "Stories" 2>/dev/null || true
        sleep 2
        echo "   ✅ Stories closed"
    else
        echo "❌ Please close Stories manually and run this script again"
        exit 1
    fi
fi

echo ""
echo "This will remove:"
echo "  • Stories.app"
echo "  • All transcription data and audio recordings"
echo "  • Settings and API key (encrypted)"
echo "  • Logs and temporary files"
echo ""

# Calculate total size
TOTAL_SIZE=0
if [ -d "$APP_PATH" ]; then
    APP_SIZE=$(du -sh "$APP_PATH" 2>/dev/null | awk '{print $1}')
    echo "  📦 Application: $APP_SIZE"
fi
if [ -d "$DATA_PATH" ]; then
    DATA_SIZE=$(du -sh "$DATA_PATH" 2>/dev/null | awk '{print $1}')
    echo "  💾 User Data: $DATA_SIZE"
fi
if [ -d "$LOGS_PATH" ]; then
    LOGS_SIZE=$(du -sh "$LOGS_PATH" 2>/dev/null | awk '{print $1}')
    echo "  📝 Logs: $LOGS_SIZE"
fi

echo ""
read -p "❓ Continue with uninstallation? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Uninstallation cancelled"
    exit 0
fi

echo ""
echo "🗑️  Uninstalling Stories..."
echo ""

# Function to remove path safely
remove_path() {
    local path=$1
    local name=$2
    
    if [ -e "$path" ]; then
        if rm -rf "$path" 2>/dev/null; then
            echo "  ✅ Removed $name"
        else
            echo "  ⚠️  Failed to remove $name (may need elevated permissions)"
            return 1
        fi
    else
        echo "  ⏭️  $name not found (already removed)"
    fi
}

# Track if any removal failed
REMOVAL_FAILED=0

# Remove application
remove_path "$APP_PATH" "Stories.app" || REMOVAL_FAILED=1

# Remove user data (includes database, audio files, backend logs, settings)
remove_path "$DATA_PATH" "User data" || REMOVAL_FAILED=1

# Remove preferences
remove_path "$PREFS_PATH" "Preferences" || REMOVAL_FAILED=1

# Remove logs (main.log, widget.log)
remove_path "$LOGS_PATH" "Logs" || REMOVAL_FAILED=1

echo ""

if [ $REMOVAL_FAILED -eq 0 ]; then
    echo "╔════════════════════════════════════════╗"
    echo "║   ✅ Stories Successfully Uninstalled  ║"
    echo "╚════════════════════════════════════════╝"
    echo ""
    echo "Thank you for using Stories! 👋"
else
    echo "╔════════════════════════════════════════╗"
    echo "║   ⚠️  Uninstall Partially Completed    ║"
    echo "╚════════════════════════════════════════╝"
    echo ""
    echo "Some files could not be removed."
    echo "You may need to manually delete them or restart your Mac."
fi

echo ""
echo "💡 To reinstall: Download from https://github.com/pixelspace-studio/stories-app"
echo ""
echo "Press any key to close this window..."
read -n 1

exit 0

