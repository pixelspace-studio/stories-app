#!/usr/bin/env node
// Refuse to produce a `community` build from anywhere except `main`.
// Community DMGs go to outside users — they must come from the canonical
// branch, not from a feature/fix branch with in-progress code.

const { execSync } = require('child_process');

let branch;
try {
  branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
} catch (e) {
  console.error('❌ Could not determine git branch:', e.message);
  process.exit(1);
}

if (branch !== 'main') {
  console.error('');
  console.error(`❌ Refusing to build community DMG from branch "${branch}".`);
  console.error('');
  console.error('   Community builds are only allowed from main.');
  console.error('   For internal/testing builds from any branch, use:  npm run make:internal');
  console.error('');
  process.exit(1);
}

console.log(`✓ On branch main — community build allowed.`);
