#!/bin/bash

# Stories App - Notarization Script
# This script handles code signing and notarization for the DMG
#
# Configuration:
#   Option 1: Create .signing.config file with your credentials (gitignored)
#   Option 2: Set environment variables:
#     export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Company (TEAMID)"
#     export APPLE_KEYCHAIN_PROFILE="your-profile-name"
#
#   See docs/CODE_SIGNING.md for setup instructions

set -e  # Exit on error

# Load private config if it exists (for Pixelspace team)
if [ -f "$(dirname "$0")/../.signing.config" ]; then
    source "$(dirname "$0")/../.signing.config"
fi

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}Stories App Notarization Script${NC}"
echo "========================================"

# Check for required environment variables
if [ -z "$APPLE_SIGNING_IDENTITY" ]; then
    echo -e "${RED}Error: APPLE_SIGNING_IDENTITY not set${NC}"
    echo ""
    echo "Please set your Apple Developer ID signing identity:"
    echo '  export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Company (TEAMID)"'
    echo ""
    echo "See docs/CODE_SIGNING.md for setup instructions"
    exit 1
fi

if [ -z "$APPLE_KEYCHAIN_PROFILE" ]; then
    echo -e "${RED}Error: APPLE_KEYCHAIN_PROFILE not set${NC}"
    echo ""
    echo "Please set your Apple keychain profile name:"
    echo '  export APPLE_KEYCHAIN_PROFILE="your-profile-name"'
    echo ""
    echo "See docs/CODE_SIGNING.md for setup instructions"
    exit 1
fi

# Check if DMG exists
DMG_PATH="out/make/Stories.dmg"
if [ ! -f "$DMG_PATH" ]; then
    echo -e "${RED}Error: DMG not found at $DMG_PATH${NC}"
    echo "Run 'npm run make' first!"
    exit 1
fi

# Step 1: Sign the DMG
echo -e "\n${BLUE}Step 1: Signing DMG...${NC}"
echo "Using identity: $APPLE_SIGNING_IDENTITY"
codesign --force --sign "$APPLE_SIGNING_IDENTITY" "$DMG_PATH"

# Verify signature
if codesign -dvv "$DMG_PATH" 2>&1 | grep -q "$APPLE_SIGNING_IDENTITY"; then
    echo -e "${GREEN}DMG signed successfully!${NC}"
else
    echo -e "${RED}DMG signing failed!${NC}"
    exit 1
fi

# Step 2: Submit for notarization
echo -e "\n${BLUE}Step 2: Submitting to Apple for notarization...${NC}"
echo -e "${YELLOW}This will take 5-15 minutes. Please wait...${NC}"

SUBMIT_OUTPUT=$(xcrun notarytool submit "$DMG_PATH" \
    --keychain-profile "$APPLE_KEYCHAIN_PROFILE" \
    --wait 2>&1)

echo "$SUBMIT_OUTPUT"

# Check if notarization succeeded
if echo "$SUBMIT_OUTPUT" | grep -q "status: Accepted"; then
    echo -e "${GREEN}✅ Notarization successful!${NC}"
    
    # Extract submission ID
    SUBMISSION_ID=$(echo "$SUBMIT_OUTPUT" | grep "id:" | head -1 | awk '{print $2}')
    
    # Step 3: Staple the ticket
    echo -e "\n${BLUE}📎 Step 3: Stapling notarization ticket to DMG...${NC}"
    xcrun stapler staple "$DMG_PATH"
    
    echo -e "\n${GREEN}🎉 SUCCESS! Your DMG is now signed and notarized!${NC}"
    echo -e "${GREEN}✅ Ready for distribution: $DMG_PATH${NC}"
    
    # Verify stapling
    echo -e "\n${BLUE}🔍 Verifying stapled ticket...${NC}"
    xcrun stapler validate "$DMG_PATH"
    
elif echo "$SUBMIT_OUTPUT" | grep -q "status: Invalid"; then
    echo -e "${RED}❌ Notarization failed!${NC}"
    
    # Extract submission ID
    SUBMISSION_ID=$(echo "$SUBMIT_OUTPUT" | grep "id:" | head -1 | awk '{print $2}')
    
    echo -e "\n${YELLOW}Fetching error log...${NC}"
    xcrun notarytool log "$SUBMISSION_ID" --keychain-profile "$APPLE_KEYCHAIN_PROFILE"
    
    exit 1
else
    echo -e "${YELLOW}Notarization is still in progress.${NC}"
    echo -e "To check status later, run:"
    echo -e "${BLUE}  xcrun notarytool history --keychain-profile \"$APPLE_KEYCHAIN_PROFILE\"${NC}"
    exit 1
fi

