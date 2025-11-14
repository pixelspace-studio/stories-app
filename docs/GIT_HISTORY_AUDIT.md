# Git History Audit - Stories App

**Date:** 2025-11-13  
**Total commits:** 437  
**Purpose:** Determine if safe to transfer repository with history or create new repo

---

## Summary

**RECOMMENDATION: CREATE NEW REPOSITORY (Option 1 or 3)**

**Reason:** History contains multiple references to Pixelspace-specific infrastructure and credentials.

---

## Findings

### Critical - Exposed Information

#### 1. Hardcoded Analytics URL
**Commit:** `2450b7a` - "Connect telemetry to production backend on Render"  
**File:** `frontend/components/TelemetryClient.js`  
**Content:**
```javascript
this.apiUrl = 'https://stories-app-e9ya.onrender.com'; // Production
```

**Risk:** Medium - URL exposes Pixelspace's Render.com backend

---

#### 2. Apple Team ID
**Commits:** Multiple (7+ commits)
- `9396932` - Current
- `2cbd742` - Uninstaller
- `a7530f8` - Code signing setup
- And more...

**Files:** 
- `scripts/notarize.sh`
- `forge.config.js`
- `scripts/sign-all-binaries.sh`

**Content:**
```bash
Developer ID Application: Pixelspace, LLC (N7MMJYTBG2)
```

**Risk:** Low-Medium - Team ID is semi-public but links directly to Pixelspace

---

#### 3. Repository References
**Commits:** Multiple
- `4024804` - "Configure auto-update with Pixelspace/stories-releases repo"
- `a4d3819` - "Update to pixelspace-studio organization name"

**Risk:** Low - Just organization references

---

### Medium Risk - Infrastructure Details

#### 4. Render.com Configuration
**Commit:** `e45fdbf` - "Phase 2 Complete: Analytics backend infrastructure"  
**File:** `analytics/render.yaml`

**Content:**
- Database structure
- Environment variables (no values, but structure)
- Service configuration

**Risk:** Low - No actual credentials, just config structure

---

#### 5. Notarization Process
**Multiple commits** with details about Apple notarization flow

**Risk:** Low - Just documentation/process

---

## Analysis by Risk Level

### HIGH RISK (Actual Credentials)
- ✅ **NONE FOUND** - No API keys, passwords, or tokens hardcoded

### MEDIUM RISK (Infrastructure Details)
- ⚠️ **Analytics URL** - `stories-app-e9ya.onrender.com` (437 commits)
- ⚠️ **Apple Team ID** - `N7MMJYTBG2` (7+ commits)
- ⚠️ **Pixelspace references** - Throughout history

### LOW RISK (Public/Semi-Public Info)
- Organization names
- Repository structures
- Configuration templates

---

## Comparison of Options

### Option 1: New Repository (Clean Slate)
**Pros:**
- ✅ Zero risk - no history = no exposure
- ✅ Clean start for open source
- ✅ Simple to execute
- ✅ Professional: "Initial Release v0.9.8"

**Cons:**
- ❌ Lose 437 commits of history
- ❌ No development transparency

**Risk Level:** 🟢 ZERO

---

### Option 2: Transfer with git-filter-repo
**Pros:**
- ✅ Keeps commit history
- ✅ Shows project evolution

**Cons:**
- ❌ Complex process
- ❌ Must rewrite 437 commits
- ❌ Analytics URL exposed in 3+ commits
- ❌ Team ID exposed in 7+ commits
- ❌ Easy to miss something
- ❌ Changes all commit hashes

**Risk Level:** 🟡 MEDIUM (if done incorrectly: 🔴 HIGH)

---

### Option 3: Squash History (Hybrid)
**Pros:**
- ✅ Safe - one commit only
- ✅ Clean history from now on
- ✅ Honest approach
- ✅ Easy to execute

**Cons:**
- ❌ Lose detailed history

**Risk Level:** 🟢 ZERO

---

## Specific Commits to Watch

If choosing Option 2 (filter history), these commits MUST be cleaned:

```bash
2450b7a - Connect telemetry to production backend on Render
9af2452 - Update telemetry plan: Phase 1-6 complete and deployed
a7530f8 - Complete code signing setup with Pixelspace, LLC certificate
2cbd742 - Implement notarizable Uninstall Stories.app
e45fdbf - Phase 2 Complete: Analytics backend infrastructure
4024804 - Configure auto-update with Pixelspace/stories-releases repo
```

**Total strings to remove from history:**
- `stories-app-e9ya.onrender.com` (3+ occurrences)
- `N7MMJYTBG2` (7+ occurrences)
- `Developer ID Application: Pixelspace, LLC` (7+ occurrences)

---

## Recommendation

### OPTION 3: Squash History (Recommended)

**Why:**
1. **Secure** - No exposure risk
2. **Simple** - One command
3. **Honest** - "Initial open source release v0.9.8"
4. **Professional** - Common practice for internal→open source

**How:**
```bash
# 1. Create new repo on GitHub: pixelspace-studio/stories-app

# 2. Squash all history into one commit
git reset --soft $(git rev-list --max-parents=0 HEAD)
git add -A
git commit -m "Initial release v0.9.8 - Open source release"

# 3. Add new remote and push
git remote add opensource https://github.com/pixelspace-studio/stories-app.git
git push opensource main

# 4. Keep private repo as backup
# Original repo stays at Floristeady/stories-app (private)
```

---

## Alternative: Option 1 (New Repo)

If you prefer absolute clean start:

```bash
# 1. Create new empty repo: pixelspace-studio/stories-app

# 2. Copy current state (no git)
cp -r ~/Sites/pixelspace/stories-app ~/stories-app-clean
cd ~/stories-app-clean
rm -rf .git

# 3. Initialize new repo
git init
git add -A
git commit -m "Initial release v0.9.8 - Open source release"

# 4. Push to new repo
git remote add origin https://github.com/pixelspace-studio/stories-app.git
git branch -M main
git push -u origin main
```

---

## Decision

**Waiting for user confirmation:**

- [ ] Option 1: New Repository (clean slate)
- [ ] Option 2: Filter History (complex, risky)
- [ ] Option 3: Squash History (recommended)

**Preferred:** Option 3 (Squash) - Best balance of security and simplicity


