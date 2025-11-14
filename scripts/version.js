#!/usr/bin/env node

/**
 * Version Management Script
 * 
 * Automatically updates version numbers across all project files:
 * - package.json
 * - backend/app.py (VERSION constant)
 * - README.md (if contains version)
 * 
 * Usage:
 *   npm run version:patch  -> 0.9.1 → 0.9.2
 *   npm run version:minor  -> 0.9.1 → 0.10.0
 *   npm run version:major  -> 0.9.1 → 1.0.0
 *   npm run version:set 1.2.3  -> Set specific version
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// File paths
const PACKAGE_JSON = path.join(__dirname, '..', 'package.json');
const APP_PY = path.join(__dirname, '..', 'backend', 'app.py');
const README = path.join(__dirname, '..', 'README.md');

/**
 * Parse version string to components
 */
function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid version format: ${version}`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10)
  };
}

/**
 * Increment version based on type
 */
function incrementVersion(currentVersion, type) {
  const { major, minor, patch } = parseVersion(currentVersion);
  
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid increment type: ${type}`);
  }
}

/**
 * Update package.json version
 */
function updatePackageJson(newVersion) {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  const oldVersion = pkg.version;
  pkg.version = newVersion;
  fs.writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`✅ package.json: ${oldVersion} → ${newVersion}`);
  return oldVersion;
}

/**
 * Update backend/app.py VERSION constant
 */
function updateAppPy(newVersion) {
  let content = fs.readFileSync(APP_PY, 'utf8');
  const versionRegex = /VERSION\s*=\s*["'][\d.]+["']/;
  
  if (!versionRegex.test(content)) {
    console.warn('⚠️  VERSION constant not found in app.py');
    return;
  }
  
  content = content.replace(versionRegex, `VERSION = "${newVersion}"`);
  fs.writeFileSync(APP_PY, content, 'utf8');
  console.log(`✅ backend/app.py: VERSION = "${newVersion}"`);
}

/**
 * Update README.md version references (optional)
 */
function updateReadme(oldVersion, newVersion) {
  if (!fs.existsSync(README)) {
    return;
  }
  
  let content = fs.readFileSync(README, 'utf8');
  const versionPattern = new RegExp(oldVersion.replace(/\./g, '\\.'), 'g');
  
  if (versionPattern.test(content)) {
    content = content.replace(versionPattern, newVersion);
    fs.writeFileSync(README, content, 'utf8');
    console.log(`✅ README.md: ${oldVersion} → ${newVersion}`);
  }
}

/**
 * Create git tag (optional)
 */
function createGitTag(version, skipGit) {
  if (skipGit) {
    console.log('⏭️  Skipping git tag');
    return;
  }
  
  try {
    // Check if we're in a git repository
    execSync('git status', { stdio: 'ignore' });
    
    // Create tag
    execSync(`git tag -a v${version} -m "Release v${version}"`, { stdio: 'inherit' });
    console.log(`✅ Git tag created: v${version}`);
    console.log(`   To push: git push origin v${version}`);
  } catch (error) {
    console.warn('⚠️  Could not create git tag (not a git repo or git not available)');
  }
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const skipGit = args.includes('--no-git');
  
  // Read current version
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  const currentVersion = pkg.version;
  
  let newVersion;
  
  // Determine new version
  if (command === 'patch' || command === 'minor' || command === 'major') {
    newVersion = incrementVersion(currentVersion, command);
  } else if (command === 'set' && args[1]) {
    newVersion = args[1];
    // Validate version format
    parseVersion(newVersion);
  } else {
    console.error(`
Usage:
  node scripts/version.js patch [--no-git]   # 0.9.1 → 0.9.2
  node scripts/version.js minor [--no-git]   # 0.9.1 → 0.10.0
  node scripts/version.js major [--no-git]   # 0.9.1 → 1.0.0
  node scripts/version.js set 1.2.3 [--no-git]  # Set specific version

Options:
  --no-git    Skip git tag creation
    `);
    process.exit(1);
  }
  
  console.log(`\n📦 Updating version: ${currentVersion} → ${newVersion}\n`);
  
  // Update all files
  const oldVersion = updatePackageJson(newVersion);
  updateAppPy(newVersion);
  updateReadme(oldVersion, newVersion);
  
  // Create git tag
  createGitTag(newVersion, skipGit);
  
  console.log(`\n✨ Version updated successfully to ${newVersion}\n`);
  console.log('Next steps:');
  console.log('  1. git add .');
  console.log(`  2. git commit -m "chore: bump version to ${newVersion}"`);
  console.log('  3. npm run make        # Build with new version');
  console.log('  4. npm run notarize    # Notarize for distribution');
  console.log('  5. git push origin main');
  console.log(`  6. git push origin v${newVersion}  # Push tag`);
}

// Run
main();

