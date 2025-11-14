<!-- 8a203336-855a-4605-8d50-d63809765751 77c7573f-4e2d-4918-9700-b5ad46ea8eb2 -->
# Open Source Migration Plan - Stories App

## Current Status

- Phase 1: Telemetry Configuration - COMPLETED
- Phase 2: Repository Cleanup - COMPLETED
- Phase 3: MIT License - COMPLETED
- Phase 4: Repository Preparation - COMPLETED
- Phase 5: Update References - COMPLETED
- Phase 6: Documentation - IN PROGRESS
- Phases 7-9: Pending

## Phase 2: Repository Cleanup (IN PROGRESS)

### Files to Remove (Individual Approval)

Following files are being removed one by one with user confirmation:

- docs/BACKLOG.md - REMOVED
- docs/SECURITY_AUDIT.md - REMOVED
- docs/PRODUCTION_CHECKLIST.md - REMOVED
- docs/STORIES_RELEASES_README.md - REMOVED
- docs/UNINSTALLER_NOTARIZATION_GUIDE.md - REMOVED
- docs/CODE_SIGNING_GUIDE.md - REMOVED
- docs/OPEN_SOURCE_AUDIT.md - KEEP (currently in use)
- docs/IMPLEMENTATION_PLAN.md - Convert to Cursor plan (this document)
- docs/archive/ - Entire folder (8 old files)
- Tests/check_files.py - Internal diagnostic tool
- Tests/diagnose.py - Internal diagnostic tool
- scripts/diagnose-user.sh - Internal diagnostic script
- scripts/README-DIAGNOSTIC.md - Internal documentation
- RELEASE_NOTES_v0.9.8.md - Move content to CHANGELOG.md then remove

### Files to Review (May contain credentials)

- scripts/notarize.sh - Check for Apple Team ID references
- scripts/check-notarization.sh - Check for credentials
- scripts/publish-release.sh - Check for tokens/keys
- forge.config.js - Check for hardcoded Team ID
- docs/PRD.md - Check for confidential information
- scripts/fix-dock-icon.sh - Check if temporary

### Build Artifacts to Remove

- out/ directory (if exists in repo)
- dist/ directory (if exists in repo)
- backend/build/ directory
- backend/dist/ directory
- backend/**pycache**/ directory
- analytics/**pycache**/ directory

## Phase 3: MIT License

### 3.1 Create LICENSE File

- File: LICENSE (root directory)
- Content: MIT License template
- Copyright: 2025 Pixelspace Studio
- Status: CREATED

### 3.2 Update README.md

- Verify LICENSE section exists
- Update to reference MIT License
- Status: VERIFIED (already has License section)

## Phase 4: Repository Preparation

### 4.1 Create GitHub Repository

- Create new repo: pixelspace-studio/stories-app
- Set as Private initially
- Do not initialize with README, .gitignore, or LICENSE (we already have them)

### 4.2 Backup Current Repository

- Create backup: stories-app-backup-YYYYMMDD
- Verify backup exists

### 4.3 Create Work Branch

- Create branch: open-source-prep
- Work on this branch for all changes

## Phase 5: Update References (After Repo Created)

### 5.1 Update package.json

- Change repository URL to pixelspace-studio/stories-app
- Update homepage URL
- Update bugs URL

### 5.2 Update forge.config.js

- Change homepage reference
- Update any hardcoded URLs

### 5.3 Search and Replace

- Find all references to Floristeady/stories-app
- Replace with pixelspace-studio/stories-app
- Update any other Pixelspace-specific URLs

## Phase 6: Release Configuration

### 6.1 Update Release Scripts

- Verify make:community and make:internal scripts
- Update any release-related configurations

### 6.2 Consolidate Releases

- Move releases from pixelspace-studio/stories-releases to main repo
- Update auto-update configuration if needed

## Phase 7: Documentation

### 7.1 Create CONTRIBUTING.md

- Add contribution guidelines
- Code style guidelines
- Pull request process

### 7.2 Update Existing Documentation

- Review and update README.md for open source
- Update docs/TELEMETRY.md
- Clean up any remaining internal references

## Phase 8: Publication

### 8.1 Repository Transfer Decision

- Option 1: New repository (clean slate)
- Option 2: Clean history with git-filter-repo (2-3 hours)
- Option 3: Squash history (recommended, 5 minutes)

### 8.2 Push to Public Repository

- Execute chosen transfer method
- Push to pixelspace-studio/stories-app
- Make repository public

## Phase 9: Final Verification

### 9.1 Security Check

- Search for any remaining sensitive information
- Verify no credentials in code
- Check .gitignore is complete

### 9.2 Build Verification

- Test community build: npm run make:community
- Test internal build: npm run make:internal
- Verify telemetry behavior in both

### 9.3 Documentation Verification

- All links work
- No broken references
- README is complete

### To-dos

- [x] Complete Phase 2 cleanup: Remove remaining approved files (archive/, test scripts, release notes) - COMPLETED
- [x] Review sensitive files: scripts/notarize.sh, scripts/check-notarization.sh, scripts/publish-release.sh, forge.config.js - COMPLETED (now use .signing.config)
- [x] Phase 3: Create LICENSE file with MIT License (2025 Pixelspace Studio) - COMPLETED
- [x] Phase 3: Update README.md LICENSE section - VERIFIED (already correct)
- [ ] Phase 4: Create GitHub repository pixelspace-studio/stories-app (private initially)
- [ ] Phase 4: Create backup of current repository
- [ ] Phase 4: Create work branch open-source-prep
- [ ] Phase 5: Update package.json repository URLs to pixelspace-studio/stories-app
- [ ] Phase 5: Search and replace all Floristeady/stories-app references with pixelspace-studio/stories-app
- [ ] Phase 6: Verify release scripts and consolidate releases configuration
- [ ] Phase 7: Create CONTRIBUTING.md with guidelines
- [ ] Phase 7: Update existing documentation for open source
- [ ] Phase 8: Decide on repository transfer method (Option 1/2/3)
- [ ] Phase 8: Push to pixelspace-studio/stories-app and make public
- [ ] Phase 9: Final security check - search for sensitive information
- [ ] Phase 9: Test both community and internal builds
- [ ] Phase 9: Verify all documentation links and references