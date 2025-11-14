# Version Management Guide

## Quick Reference

```bash
# Small fixes and patches
npm run version:patch      # 0.9.1 → 0.9.2

# New features (no breaking changes)
npm run version:minor      # 0.9.2 → 0.10.0

# Major release or breaking changes
npm run version:major      # 0.10.5 → 1.0.0

# Manual version control
npm run version:set 1.0.0  # Set any specific version
```

---

## Understanding Version Numbers

Format: **MAJOR.MINOR.PATCH** (e.g., `1.2.15`)

### PATCH (Third Number)
- **What**: Bug fixes, small corrections, typos
- **Examples**: 
  - Fixed transcription crash
  - Corrected UI alignment
  - Fixed dictionary not saving
  - Performance optimization
- **Progression**: `0.9.1` → `0.9.2` → `0.9.3` ... → `0.9.10` → `0.9.11` ... → `0.9.99` → `0.9.100`
- **Command**: `npm run version:patch`

### MINOR (Second Number)
- **What**: New features that don't break existing functionality
- **Examples**:
  - Added dictionary feature
  - New keyboard shortcut
  - New API integration
  - UI improvements
- **Resets**: Patch version goes back to 0
- **Progression**: `0.9.15` → `0.10.0` → `0.11.0`
- **Command**: `npm run version:minor`

### MAJOR (First Number)
- **What**: Big releases, breaking changes, complete rewrites
- **Examples**:
  - First production release (0.x → 1.0.0)
  - Complete UI redesign
  - Changed API that breaks backward compatibility
  - Major architecture change
- **Resets**: Both minor and patch go to 0
- **Progression**: `0.15.8` → `1.0.0` → `2.0.0`
- **Command**: `npm run version:major`

---

## Decision Flow Chart

```
┌─────────────────────────────────┐
│ What did you change?            │
└────────────┬────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
┌───▼──────┐    ┌────▼─────────┐
│ Bug fix? │    │ New feature? │
│ Small    │    │ Enhancement? │
│ change?  │    │              │
└───┬──────┘    └────┬─────────┘
    │                │
    │ PATCH          │ MINOR
    │ 0.9.1→0.9.2    │ 0.9.2→0.10.0
    │                │
    └────────┬───────┘
             │
    ┌────────▼──────────┐
    │ Major release or  │
    │ breaking change?  │
    └────────┬──────────┘
             │
             │ MAJOR
             │ 0.10.5→1.0.0
             │
    ┌────────▼──────────┐
    │ Special version   │
    │ number needed?    │
    └────────┬──────────┘
             │
             │ SET
             │ npm run version:set X.Y.Z
             │
```

---

## Real Examples from Stories App

### Scenario 1: Fixed API key bug
```bash
# Current: 0.9.1
npm run version:patch
# Result: 0.9.2
# Reason: Bug fix, no new features
```

### Scenario 2: Added dictionary prompt to Whisper
```bash
# Current: 0.9.2
npm run version:minor
# Result: 0.10.0
# Reason: New feature (prompt integration)
```

### Scenario 3: Ready for production release
```bash
# Current: 0.12.5
npm run version:set 1.0.0
# Result: 1.0.0
# Reason: First official production release
```

### Scenario 4: Multiple small fixes
```bash
# Current: 0.9.1
npm run version:patch  # → 0.9.2 (fixed icon)
npm run version:patch  # → 0.9.3 (fixed crash)
npm run version:patch  # → 0.9.4 (typo fix)
# After many fixes: 0.9.10, 0.9.11, 0.9.12... (unlimited)
```

### Scenario 5: Complete app redesign
```bash
# Current: 1.5.3
npm run version:major
# Result: 2.0.0
# Reason: Breaking changes, new architecture
```

---

## Common Questions

### Q: Can patch version go beyond 9?
**A:** Yes! `0.9.9` → `0.9.10` → `0.9.11` ... → `0.9.99` → `0.9.100`

### Q: When should I move from 0.x to 1.0?
**A:** When you consider the app production-ready and stable. Version 0.x typically means "still in development."

### Q: Can I skip versions?
**A:** Yes! Use `npm run version:set` to jump to any version: `0.9.3` → `0.12.0` (if you want)

### Q: What if I make a mistake?
**A:** Just set the correct version: `npm run version:set 0.9.5`

### Q: Should I create git tags?
**A:** The script creates tags automatically. Skip with `--no-git` flag if needed.

---

## Best Practices

### Development Phase (0.x.x)
- Start: `0.1.0`
- Bug fixes: `version:patch` → `0.1.1`, `0.1.2`, etc.
- New features: `version:minor` → `0.2.0`, `0.3.0`, etc.
- When stable: `version:set 1.0.0`

### Production Phase (1.x.x+)
- Bug fixes: `version:patch` → `1.0.1`, `1.0.2`
- New features: `version:minor` → `1.1.0`, `1.2.0`
- Breaking changes: `version:major` → `2.0.0`

### Your Current Workflow
```bash
# You're at: 0.9.1 (almost ready for 1.0)

# Option 1: Continue with patches until ready
0.9.1 → 0.9.2 → 0.9.3 ... → 1.0.0 (when ready)

# Option 2: Jump to 1.0 now
npm run version:set 1.0.0

# Then continue:
1.0.0 → 1.0.1 (fixes) → 1.1.0 (features) → 2.0.0 (major)
```

---

## What the Script Does

When you run any version command:

1. ✅ Updates `package.json` version
2. ✅ Updates `backend/app.py` VERSION constant
3. ✅ Updates `README.md` version references (if any)
4. ✅ Creates git tag (e.g., `v1.0.0`)
5. ✅ Shows next steps for build and release

### Files Updated:
- `package.json` → `"version": "1.0.0"`
- `backend/app.py` → `VERSION = "1.0.0"`
- `README.md` → Any version references

---

## Complete Workflow Example

```bash
# 1. Fix a bug
git checkout -b fix/api-key-bug
# ... make changes ...

# 2. Update version
npm run version:patch  # 0.9.1 → 0.9.2

# 3. Build and test
npm run make

# 4. Commit and tag
git add .
git commit -m "Fix: API key recognition issue"

# 5. Merge and release
git checkout main
git merge fix/api-key-bug
git push origin main
git push origin v0.9.2  # Push the tag

# 6. Notarize and distribute
npm run notarize
```

---

## Commands Summary

| Command | Current | Result | Use Case |
|---------|---------|--------|----------|
| `npm run version:patch` | 0.9.1 | 0.9.2 | Bug fixes |
| `npm run version:minor` | 0.9.2 | 0.10.0 | New features |
| `npm run version:major` | 0.10.5 | 1.0.0 | Major release |
| `npm run version:set 1.2.3` | any | 1.2.3 | Manual control |

---

## Skip Git Tag (Optional)

If you don't want git tags created automatically:

```bash
node scripts/version.js patch --no-git
node scripts/version.js minor --no-git
node scripts/version.js set 1.0.0 --no-git
```

---

## Next Steps After Version Update

The script will remind you:

```bash
✨ Version updated successfully to 1.0.0

Next steps:
  1. npm run make        # Build with new version
  2. npm run notarize    # Notarize for distribution
  3. git add .
  4. git commit -m "Release v1.0.0"
  5. git push origin v1.0.0  # Push tag
```

