#!/bin/bash

# Create Uninstall Stories.app bundle
# This creates a clickable .app that users can run from the DMG
# Version 1.1 - Updated Nov 2025

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP_PATH="$SCRIPT_DIR/Uninstall Stories.app"

echo "🔧 Creating Uninstall Stories.app v1.1..."

# Remove existing app if it exists
if [ -d "$APP_PATH" ]; then
    echo "   Removing old version..."
    rm -rf "$APP_PATH"
fi

# Create app bundle structure
mkdir -p "$APP_PATH/Contents/MacOS"
mkdir -p "$APP_PATH/Contents/Resources"

# Create Info.plist
cat > "$APP_PATH/Contents/Info.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>uninstall</string>
    <key>CFBundleIdentifier</key>
    <string>com.pixelspace.stories.uninstaller</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>Uninstall Stories</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.1</string>
    <key>CFBundleVersion</key>
    <string>2</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>LSUIElement</key>
    <false/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF

# Create executable script that runs in Terminal
cat > "$APP_PATH/Contents/MacOS/uninstall" << 'EOF'
#!/bin/bash

# This wrapper script opens Terminal and runs the uninstall script

SCRIPT_DIR="$(dirname "$0")"
UNINSTALL_SCRIPT="$SCRIPT_DIR/uninstall.sh"

# Make sure the uninstall script is executable
chmod +x "$UNINSTALL_SCRIPT"

# Run in Terminal with a clear title
osascript -e "tell application \"Terminal\" to do script \"cd \\\"$SCRIPT_DIR\\\" && bash \\\"$UNINSTALL_SCRIPT\\\"; exit\" activate"
EOF

# Copy the actual uninstall script into the app bundle
# Use the .command file which has the v1.1 improvements
cp "$SCRIPT_DIR/Uninstall Stories.command" "$APP_PATH/Contents/MacOS/uninstall.sh"
chmod +x "$APP_PATH/Contents/MacOS/uninstall.sh"

# Make the wrapper executable
chmod +x "$APP_PATH/Contents/MacOS/uninstall"

# Create a simple text icon using iconutil (or just skip if too complex)
# For now, we'll skip the icon - macOS will use a default

echo "✅ Uninstall Stories.app v1.1 created successfully!"
echo "📍 Location: $APP_PATH"
echo ""
echo "📝 Contents:"
echo "   - Info.plist (v1.1)"
echo "   - uninstall (wrapper script)"
echo "   - uninstall.sh (v1.1 with improved error handling)"
echo ""
echo "To test it:"
echo "  open '$APP_PATH'"
echo ""

