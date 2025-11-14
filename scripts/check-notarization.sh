#!/bin/bash

# Check Notarization Status Script
# Shows the status of recent notarization submissions
#
# Configuration:
#   Option 1: Create .signing.config file with your credentials (gitignored)
#   Option 2: Set environment variable:
#     export APPLE_KEYCHAIN_PROFILE="your-profile-name"
#
#   See docs/CODE_SIGNING.md for setup instructions

set -e

# Load private config if it exists (for Pixelspace team)
if [ -f "$(dirname "$0")/../.signing.config" ]; then
    source "$(dirname "$0")/../.signing.config"
fi

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}Checking Recent Notarization Submissions${NC}"
echo "=============================================="
echo ""

# Check for required environment variable
if [ -z "$APPLE_KEYCHAIN_PROFILE" ]; then
    echo -e "${RED}Error: APPLE_KEYCHAIN_PROFILE not set${NC}"
    echo ""
    echo "Please set your Apple keychain profile name:"
    echo '  export APPLE_KEYCHAIN_PROFILE="your-profile-name"'
    echo ""
    echo "See docs/CODE_SIGNING.md for setup instructions"
    exit 1
fi

# Get recent submissions
HISTORY=$(xcrun notarytool history --keychain-profile "$APPLE_KEYCHAIN_PROFILE" 2>&1)

if echo "$HISTORY" | grep -q "Successfully received submission history"; then
    echo "$HISTORY"
    echo ""
    
    # Check if there are any submissions
    if echo "$HISTORY" | grep -q "status:"; then
        echo -e "${YELLOW}TIP:${NC}"
        echo "To see details of a specific submission, run:"
        echo -e "${BLUE}  xcrun notarytool info <SUBMISSION_ID> --keychain-profile \"$APPLE_KEYCHAIN_PROFILE\"${NC}"
        echo ""
        echo "To get logs of a failed submission:"
        echo -e "${BLUE}  xcrun notarytool log <SUBMISSION_ID> --keychain-profile \"$APPLE_KEYCHAIN_PROFILE\"${NC}"
        echo ""
        
        # Check for any Accepted submissions
        if echo "$HISTORY" | grep -q "status: Accepted"; then
            echo -e "${GREEN}✅ You have accepted submissions!${NC}"
            echo "Don't forget to staple the ticket to your DMG:"
            echo -e "${BLUE}  xcrun stapler staple out/make/Stories.dmg${NC}"
        fi
        
        # Check for any In Progress submissions
        if echo "$HISTORY" | grep -q "status: In Progress"; then
            echo -e "${YELLOW}⏳ You have submissions in progress. Check back in a few minutes.${NC}"
        fi
        
        # Check for any Invalid submissions
        if echo "$HISTORY" | grep -q "status: Invalid"; then
            echo -e "${YELLOW}⚠️  You have failed submissions. Check the logs for details.${NC}"
        fi
    else
        echo -e "${YELLOW}No submissions found.${NC}"
    fi
else
    echo -e "${YELLOW}Could not fetch submission history.${NC}"
    echo "Make sure you have configured your credentials:"
    echo -e "${BLUE}  xcrun notarytool store-credentials \"$APPLE_KEYCHAIN_PROFILE\"${NC}"
fi

