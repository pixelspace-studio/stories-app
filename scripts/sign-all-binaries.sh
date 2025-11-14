#!/bin/bash
#
# Sign all binaries in Stories.app recursively
# Following Apple's best practices for nested code signing
#
# Usage: ./sign-all-binaries.sh /path/to/Stories.app
#
# Configuration:
#   Option 1: Create .signing.config file with your credentials (gitignored)
#   Option 2: Set environment variable:
#     export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Company (TEAMID)"
#
#   See docs/CODE_SIGNING.md for setup instructions

set -e

# Load private config if it exists (for Pixelspace team)
if [ -f "$(dirname "$0")/../.signing.config" ]; then
    source "$(dirname "$0")/../.signing.config"
fi

# Get signing identity from environment variable
IDENTITY="${APPLE_SIGNING_IDENTITY}"
ENTITLEMENTS="./entitlements.mac.plist"
APP_PATH="$1"

if [ -z "$APPLE_SIGNING_IDENTITY" ]; then
    echo "Error: APPLE_SIGNING_IDENTITY not set"
    echo ""
    echo "Please set your Apple Developer ID signing identity:"
    echo '  export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Company (TEAMID)"'
    echo ""
    echo "See docs/CODE_SIGNING.md for setup instructions"
    exit 1
fi

if [ -z "$APP_PATH" ]; then
    echo "Error: No app path provided"
    echo "Usage: $0 /path/to/Stories.app"
    exit 1
fi

if [ ! -d "$APP_PATH" ]; then
    echo "Error: App not found at $APP_PATH"
    exit 1
fi

echo "Signing all binaries in Stories.app..."
echo "   Identity: $IDENTITY"
echo "   App: $APP_PATH"
echo ""

# Function to sign a file
sign_file() {
    local file="$1"
    local needs_entitlements="$2"
    
    echo "  📝 Signing: $(basename "$file")"
    
    if [ "$needs_entitlements" = "yes" ]; then
        codesign --force --sign "$IDENTITY" \
            --options runtime \
            --entitlements "$ENTITLEMENTS" \
            --timestamp \
            "$file" 2>&1 | grep -v "replacing existing signature" || true
    else
        codesign --force --sign "$IDENTITY" \
            --options runtime \
            --timestamp \
            "$file" 2>&1 | grep -v "replacing existing signature" || true
    fi
}

# Step 1: Sign all .dylib files (libraries)
echo "📚 Step 1: Signing .dylib libraries..."
find "$APP_PATH" -type f -name "*.dylib" | while read -r dylib; do
    sign_file "$dylib" "no"
done
echo "✅ Libraries signed"
echo ""

# Step 2: Sign all .node files (Node.js native modules)
echo "🔌 Step 2: Signing .node modules..."
find "$APP_PATH" -type f -name "*.node" | while read -r node_module; do
    sign_file "$node_module" "no"
done
echo "✅ Node modules signed"
echo ""

# Step 3: Sign specific executables with entitlements
echo "⚙️  Step 3: Signing executables..."

# Backend
if [ -f "$APP_PATH/Contents/Resources/stories-backend" ]; then
    sign_file "$APP_PATH/Contents/Resources/stories-backend" "yes"
fi

# ShipIt (Squirrel auto-updater)
if [ -f "$APP_PATH/Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt" ]; then
    sign_file "$APP_PATH/Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt" "yes"
fi

echo "✅ Executables signed"
echo ""

# Step 4: Sign Frameworks
echo "📦 Step 4: Signing Frameworks..."

# Electron Framework
if [ -d "$APP_PATH/Contents/Frameworks/Electron Framework.framework" ]; then
    # Sign chrome_crashpad_handler first (if exists)
    if [ -f "$APP_PATH/Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler" ]; then
        echo "  📝 Signing chrome_crashpad_handler..."
        codesign --force --sign "$IDENTITY" \
            --options runtime \
            --timestamp \
            "$APP_PATH/Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler"
    fi
    
    echo "  📝 Signing Electron Framework binary..."
    codesign --force --sign "$IDENTITY" \
        --options runtime \
        --timestamp \
        "$APP_PATH/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"
    
    echo "  📝 Signing Electron Framework..."
    codesign --force --sign "$IDENTITY" \
        --options runtime \
        --timestamp \
        "$APP_PATH/Contents/Frameworks/Electron Framework.framework"
fi

# Other frameworks
for framework in "$APP_PATH/Contents/Frameworks"/*.framework; do
    if [ -d "$framework" ] && [ "$(basename "$framework")" != "Electron Framework.framework" ]; then
        echo "  📝 Signing framework: $(basename "$framework")"
        codesign --force --sign "$IDENTITY" \
            --options runtime \
            --timestamp \
            "$framework"
    fi
done

echo "✅ Frameworks signed"
echo ""

# Step 5: Sign Helper apps
echo "🔧 Step 5: Signing Electron Helpers..."
for helper in "$APP_PATH/Contents/Frameworks"/*.app; do
    if [ -d "$helper" ]; then
        echo "  📝 Signing: $(basename "$helper")"
        codesign --force --sign "$IDENTITY" \
            --options runtime \
            --entitlements "$ENTITLEMENTS" \
            --timestamp \
            "$helper"
    fi
done
echo "✅ Helpers signed"
echo ""

echo "🎉 All nested binaries signed successfully!"

