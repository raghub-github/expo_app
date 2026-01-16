# EAS Build Instructions - IMPORTANT

## ⚠️ CRITICAL: Build from App Directory

**You MUST build from the app directory, NOT from the root!**

### ✅ Correct Way:

```powershell
# Navigate to the app directory
cd apps/gatimitra-riderApp

# Then build
eas build --profile development --platform android --clear-cache
```

### ❌ Wrong Way (Don't Do This):

```powershell
# DON'T build from root directory
cd C:\Users\HP\expo_app
eas build --profile development --platform android  # ❌ This creates wrong project!
```

## Why This Matters

- Building from root creates a new EAS project for the root
- Building from app uses the correct project (`gatimitra-riderapp`)
- The `eas.json` is in `apps/gatimitra-riderApp/`, not at root
- Environment variables are set for the app project, not root

## Current Setup

- ✅ `eas.json` is in `apps/gatimitra-riderApp/`
- ✅ Environment variables set for `gatimitra-riderapp` project
- ✅ Monorepo fix scripts are in app directory
- ❌ Root `eas.json` was created by mistake (should be deleted)

## Build Command

```powershell
cd apps/gatimitra-riderApp
eas build --profile development --platform android --clear-cache
```

## Verify You're in the Right Directory

Before building, check:
```powershell
# Should show: apps\gatimitra-riderApp
pwd

# Should show eas.json exists
Test-Path eas.json
```

## If You Already Built from Root

1. Delete root `eas.json` (if it exists)
2. Navigate to `apps/gatimitra-riderApp`
3. Build from there

The root build created project `expo_app`, but you need `gatimitra-riderapp`.
