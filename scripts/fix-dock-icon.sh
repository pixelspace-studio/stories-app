#!/bin/bash

# Fix Dock Icon Not Showing
# This script clears macOS Launch Services cache to fix dock icon issues

echo "🔧 Fixing Dock Icon Issue..."
echo ""

# Close Stories if running
echo "1️⃣ Closing Stories..."
killall Stories 2>/dev/null || echo "   Stories not running"
echo ""

# Clear Launch Services cache
echo "2️⃣ Clearing Launch Services cache..."
echo "   (This may take 10-15 seconds)"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -kill -r -domain local -domain system -domain user
echo "   ✅ Cache cleared"
echo ""

# Restart Dock
echo "3️⃣ Restarting Dock..."
killall Dock
echo "   ✅ Dock restarted"
echo ""

echo "✨ Done! Wait 5 seconds, then open Stories."
echo ""
echo "If the icon still doesn't appear, try:"
echo "  1. Remove Stories.app from Applications"
echo "  2. Run this script again"
echo "  3. Reinstall from DMG"

