#!/bin/bash

# Stories - Uninstall Script
# This script removes Stories and all its data from your Mac

set -e

echo ""
echo "╔════════════════════════════════════════╗"
echo "║     Stories - Uninstall Utility       ║"
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

echo "This will remove:"
echo "  • Stories.app"
echo "  • All transcription data"
echo "  • Audio recordings"
echo "  • Settings and API key"
echo "  • Logs"
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
        rm -rf "$path"
        echo "  ✅ Removed $name"
    else
        echo "  ⏭️  $name not found (already removed)"
    fi
}

# Remove application
remove_path "$APP_PATH" "Stories.app"

# Remove user data
remove_path "$DATA_PATH" "User data"

# Remove preferences
remove_path "$PREFS_PATH" "Preferences"

# Remove logs
remove_path "$LOGS_PATH" "Logs"

echo ""
echo "╔════════════════════════════════════════╗"
echo "║   ✅ Stories Successfully Uninstalled  ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "Thank you for using Stories! 👋"
echo ""
echo "💡 To reinstall: Download from https://github.com/pixelspace-studio/stories-app"
echo ""

exit 0

