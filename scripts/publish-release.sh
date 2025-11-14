#!/bin/bash

#############################################################
# PUBLISH RELEASE TO GITHUB
#############################################################
# This script publishes a new release to GitHub
#
# Usage:
#   ./scripts/publish-release.sh
#
# Configuration:
#   Option 1: Create .signing.config file with your repo (gitignored)
#   Option 2: Set environment variable:
#     export GITHUB_REPO="pixelspace-studio/stories-app"
#
# Prerequisites:
#   1. GitHub CLI installed (brew install gh)
#   2. Authenticated with gh auth login
#   3. npm run release already executed (built + notarized)
#############################################################

set -e

# Load private config if it exists (for Pixelspace team)
if [ -f "$(dirname "$0")/../.signing.config" ]; then
    source "$(dirname "$0")/../.signing.config"
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  PUBLISH RELEASE - Stories${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")

# Get repository from environment variable or use default
GITHUB_REPO="${GITHUB_REPO:-pixelspace-studio/stories-app}"

echo -e "${BLUE}→${NC} Version: ${GREEN}v${VERSION}${NC}"
echo -e "${BLUE}→${NC} Repository: ${GREEN}${GITHUB_REPO}${NC}"
echo ""

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}✗${NC} GitHub CLI not installed"
    echo -e "${YELLOW}→${NC} Install with: brew install gh"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${RED}✗${NC} Not authenticated with GitHub CLI"
    echo -e "${YELLOW}→${NC} Run: gh auth login"
    exit 1
fi

echo -e "${GREEN}✓${NC} GitHub CLI authenticated"
echo ""

# Check if build exists
ZIP_PATH="out/make/zip/darwin/arm64/Stories-darwin-arm64-${VERSION}.zip"
if [ ! -f "$ZIP_PATH" ]; then
    echo -e "${RED}✗${NC} Build not found: $ZIP_PATH"
    echo -e "${YELLOW}→${NC} Run: npm run release"
    exit 1
fi

echo -e "${GREEN}✓${NC} Build found: $(du -h "$ZIP_PATH" | cut -f1)"
echo ""

# Check if latest-mac.yml exists
YML_PATH="out/make/latest-mac.yml"
if [ ! -f "$YML_PATH" ]; then
    echo -e "${YELLOW}⚠${NC} latest-mac.yml not found, generating..."
    
    # Generate latest-mac.yml
    ZIP_SIZE=$(stat -f%z "$ZIP_PATH")
    ZIP_SHA512=$(shasum -a 512 "$ZIP_PATH" | cut -d' ' -f1 | base64)
    
    cat > "$YML_PATH" << EOF
version: ${VERSION}
files:
  - url: Stories-darwin-arm64-${VERSION}.zip
    sha512: ${ZIP_SHA512}
    size: ${ZIP_SIZE}
path: Stories-darwin-arm64-${VERSION}.zip
sha512: ${ZIP_SHA512}
releaseDate: $(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
EOF
    
    echo -e "${GREEN}✓${NC} Generated latest-mac.yml"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  RELEASE NOTES${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}→${NC} Enter release notes (Ctrl+D when done):"
echo ""

# Read release notes from stdin
RELEASE_NOTES=$(cat)

if [ -z "$RELEASE_NOTES" ]; then
    RELEASE_NOTES="Release v${VERSION}"
fi

echo ""
echo -e "${GREEN}✓${NC} Release notes captured"
echo ""

# Confirm
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  SUMMARY${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Version:     ${GREEN}v${VERSION}${NC}"
echo -e "  Repository:  ${BLUE}${GITHUB_REPO}${NC}"
echo -e "  File:        Stories-darwin-arm64-${VERSION}.zip"
echo -e "  Size:        $(du -h "$ZIP_PATH" | cut -f1)"
echo ""
echo -e "${YELLOW}Release notes:${NC}"
echo "$RELEASE_NOTES" | sed 's/^/  /'
echo ""

read -p "$(echo -e ${YELLOW}Continue? [y/N]:${NC} )" -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}✗${NC} Cancelled"
    exit 1
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  PUBLISHING${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Create release
echo -e "${BLUE}→${NC} Creating release on ${GITHUB_REPO}..."

gh release create "v${VERSION}" \
  --repo "${GITHUB_REPO}" \
  --title "Stories v${VERSION}" \
  --notes "$RELEASE_NOTES" \
  "$ZIP_PATH" \
  "$YML_PATH"

echo ""
echo -e "${GREEN}✓${NC} Release published successfully!"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  SUCCESS! 🎉${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  View release: ${BLUE}https://github.com/${GITHUB_REPO}/releases/tag/v${VERSION}${NC}"
echo ""
echo -e "${YELLOW}→${NC} Users will automatically receive update notification!"
echo ""

