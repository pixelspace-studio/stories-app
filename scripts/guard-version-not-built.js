#!/usr/bin/env node
// Refuse to build a version that already has a `built/<version>` tag.
// Forces the dev to bump package.json to a fresh number before building,
// so two people can't independently produce different bits as the same
// version. The build log lives at electron/build_docs/BUILD_LOG.md.

const { execSync } = require('child_process');
const path = require('path');
const pkg = require(path.join(__dirname, '..', 'package.json'));

const version = pkg.version;
const tag = `built/${version}`;

let tagExistsLocally = false;
try {
  execSync(`git rev-parse --verify --quiet ${tag}`, { stdio: 'pipe' });
  tagExistsLocally = true;
} catch (_) {}

let tagExistsRemote = false;
try {
  const out = execSync(`git ls-remote --tags origin refs/tags/${tag}`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
  tagExistsRemote = out.length > 0;
} catch (_) {}

if (tagExistsLocally || tagExistsRemote) {
  console.error('');
  console.error(`❌ Refusing to build: tag ${tag} already exists${tagExistsRemote ? ' on origin' : ' locally'}.`);
  console.error('');
  console.error('   That version was already built by someone. Building it again would');
  console.error('   produce different bits under the same name — confusing for testers.');
  console.error('');
  console.error(`   Bump package.json to the next number, then re-run.`);
  console.error(`   Check electron/build_docs/BUILD_LOG.md for the latest claimed version.`);
  console.error('');
  process.exit(1);
}

console.log(`✓ Version ${version} is not yet claimed — proceeding with build.`);
