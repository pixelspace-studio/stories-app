#!/usr/bin/env node

/**
 * Post-Make Hook for Electron Forge
 * 
 * This script runs after `npm run make` and modifies the DMG to include:
 * - Uninstall Stories.app at the root
 * - DMG_README.txt at the root
 * 
 * These files need to be visible when users open the DMG.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read version and build type from package.json and environment
const pkg = require(path.join(__dirname, '..', 'package.json'));
const version = pkg.version;
const buildType = process.env.BUILD_TYPE || 'community';
const dmgName = `Stories-v${version}-${buildType}.dmg`;

const DMG_PATH = path.join(__dirname, '..', 'out', 'make', dmgName);
const TEMP_MOUNT = '/tmp/stories_dmg_modify';
const UNINSTALLER_SOURCE = path.join(__dirname, 'Uninstall Stories.command');
const README_SOURCE = path.join(__dirname, '..', 'DMG_README.txt');

console.log('\n🔧 Post-Make Hook: Modifying DMG...\n');
console.log(`📦 Looking for: ${dmgName}`);

// Check if DMG exists
if (!fs.existsSync(DMG_PATH)) {
  console.log('⏭️  No DMG found at expected path, skipping post-make hook');
  console.log(`   Expected: ${DMG_PATH}`);
  process.exit(0);
}

// Check if sources exist
if (!fs.existsSync(UNINSTALLER_SOURCE)) {
  console.error('❌ Uninstaller not found:', UNINSTALLER_SOURCE);
  process.exit(1);
}

if (!fs.existsSync(README_SOURCE)) {
  console.error('❌ README not found:', README_SOURCE);
  process.exit(1);
}

try {
  console.log('📦 Converting DMG to read-write format...');
  
  // Convert DMG to read-write
  const RW_DMG = DMG_PATH.replace('.dmg', '-rw.dmg');
  execSync(`hdiutil convert "${DMG_PATH}" -format UDRW -o "${RW_DMG}"`, { stdio: 'pipe' });
  
  console.log('💿 Mounting DMG...');
  
  // Mount the read-write DMG
  execSync(`hdiutil attach "${RW_DMG}" -mountpoint "${TEMP_MOUNT}" -nobrowse`, { stdio: 'pipe' });
  
  console.log('📋 Copying README to DMG root...');
  
  // Copy README to DMG root
  execSync(`cp "${README_SOURCE}" "${TEMP_MOUNT}/DMG_README.txt"`, { stdio: 'pipe' });
  
  console.log('🗑️  Copying Uninstaller to DMG root...');
  
  // Remove old .app if it exists
  try {
    execSync(`rm -rf "${TEMP_MOUNT}/Uninstall Stories.app"`, { stdio: 'pipe' });
  } catch (e) {
    // Ignore if doesn't exist
  }
  
  // Copy Uninstaller to DMG root
  execSync(`cp "${UNINSTALLER_SOURCE}" "${TEMP_MOUNT}/Uninstall Stories.command"`, { stdio: 'pipe' });
  
  console.log('💾 Unmounting DMG...');
  
  // Unmount
  execSync(`hdiutil detach "${TEMP_MOUNT}"`, { stdio: 'pipe' });
  
  console.log('🗜️  Converting back to compressed format...');
  
  // Convert back to compressed (replace original)
  execSync(`rm "${DMG_PATH}"`, { stdio: 'pipe' });
  execSync(`hdiutil convert "${RW_DMG}" -format UDZO -o "${DMG_PATH}"`, { stdio: 'pipe' });
  execSync(`rm "${RW_DMG}"`, { stdio: 'pipe' });
  
  console.log('\n✅ DMG successfully modified!\n');
  console.log('📦 DMG Contents:');
  console.log('   • Stories.app');
  console.log('   • Uninstall Stories.command');
  console.log('   • DMG_README.txt');
  console.log('   • Applications (link)\n');
  
  // Sign the DMG after modifications
  console.log('🔐 Signing DMG with Pixelspace, LLC certificate...');
  try {
    execSync(`codesign --sign "Developer ID Application: Pixelspace, LLC (N7MMJYTBG2)" "${DMG_PATH}"`, { stdio: 'inherit' });
    console.log('✅ DMG signed successfully!\n');
    console.log('📝 To notarize, run: npm run notarize');
    console.log('   Or for full release: npm run release\n');
  } catch (signError) {
    console.error('❌ DMG signing failed:', signError.message);
    console.log('⚠️  DMG created but not signed. You can sign it manually with:');
    console.log(`   codesign --sign "Developer ID Application: Pixelspace, LLC (N7MMJYTBG2)" "${DMG_PATH}"\n`);
  }
  
} catch (error) {
  console.error('\n❌ Error modifying DMG:', error.message);
  
  // Cleanup on error
  try {
    execSync(`hdiutil detach "${TEMP_MOUNT}" 2>/dev/null`, { stdio: 'ignore' });
  } catch (e) {
    // Ignore cleanup errors
  }
  
  process.exit(1);
}

