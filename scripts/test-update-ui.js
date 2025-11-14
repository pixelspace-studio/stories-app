/**
 * Test Update UI
 * 
 * This script simulates an update notification to test the UI
 * without needing a real GitHub release.
 * 
 * Usage:
 *   node scripts/test-update-ui.js
 *   Then launch the app with: npm start
 */

const fs = require('fs');
const path = require('path');

// Temporary patch to electron/main.js to trigger mock update
const mainJsPath = path.join(__dirname, '..', 'electron', 'main.js');
const backupPath = path.join(__dirname, '..', 'electron', 'main.js.backup');

console.log('🧪 Test Update UI Script');
console.log('========================\n');

console.log('This will temporarily modify electron/main.js to simulate an update.');
console.log('After testing, run: node scripts/test-update-ui.js restore\n');

const action = process.argv[2];

if (action === 'restore') {
  // Restore original
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, mainJsPath);
    fs.unlinkSync(backupPath);
    console.log('✅ Restored original electron/main.js');
    console.log('   You can now commit/build normally.\n');
  } else {
    console.log('⚠️  No backup found. File may already be restored.\n');
  }
} else {
  // Create backup
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(mainJsPath, backupPath);
    console.log('✅ Created backup: electron/main.js.backup\n');
  }

  // Read main.js
  let content = fs.readFileSync(mainJsPath, 'utf8');

  // Find the checkForUpdatesOnStartup function and add mock
  const mockCode = `
// ===== MOCK UPDATE FOR TESTING UI =====
// This simulates an update available notification
// Remove this code before production!
setTimeout(() => {
  console.log('[MOCK] Simulating update available...');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-available', {
      version: '99.99.99',
      releaseNotes: 'This is a test update to preview the UI.\\n\\n- New feature A\\n- Bug fix B\\n- Performance improvements',
      releaseDate: new Date().toISOString()
    });
  }
}, 5000); // 5 seconds after launch
// ===== END MOCK =====
`;

  // Insert after checkForUpdatesOnStartup function
  if (content.includes('===== MOCK UPDATE FOR TESTING UI =====')) {
    console.log('⚠️  Mock code already present in main.js');
    console.log('   If you want to refresh it, run: node scripts/test-update-ui.js restore');
    console.log('   Then run this script again.\n');
  } else {
    const insertPoint = content.indexOf('function checkForUpdatesOnStartup() {');
    if (insertPoint === -1) {
      console.error('❌ Could not find checkForUpdatesOnStartup function');
      console.error('   Make sure electron/main.js has the auto-update code.\n');
      process.exit(1);
    }

    // Find the end of the function (closing brace)
    const functionStart = insertPoint;
    let braceCount = 0;
    let inFunction = false;
    let functionEnd = -1;

    for (let i = functionStart; i < content.length; i++) {
      if (content[i] === '{') {
        braceCount++;
        inFunction = true;
      } else if (content[i] === '}') {
        braceCount--;
        if (inFunction && braceCount === 0) {
          functionEnd = i + 1;
          break;
        }
      }
    }

    if (functionEnd === -1) {
      console.error('❌ Could not find end of checkForUpdatesOnStartup function\n');
      process.exit(1);
    }

    // Insert mock code after the function
    content = content.slice(0, functionEnd) + '\n' + mockCode + content.slice(functionEnd);

    // Write modified content
    fs.writeFileSync(mainJsPath, content, 'utf8');
    console.log('✅ Added mock update code to electron/main.js\n');
  }

  console.log('📝 Next steps:');
  console.log('   1. Start the app: npm start');
  console.log('   2. Wait 5 seconds - the update notification should appear');
  console.log('   3. Test the UI: click buttons, see animations');
  console.log('   4. When done testing, restore: node scripts/test-update-ui.js restore\n');
  
  console.log('⚠️  Important: Don\'t forget to restore before committing!\n');
}

