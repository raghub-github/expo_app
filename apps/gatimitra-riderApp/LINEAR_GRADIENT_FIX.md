# Fix: IllegalViewOperationException After Language Selection

## Problem

After selecting a language, the app crashes with:
```
com.facebook.react.uimanager.IllegalViewOperationException
```

This happens when navigating to the permissions screen which uses `LinearGradient` from `expo-linear-gradient`.

## Root Cause

**Version Mismatch:** The app uses `expo-linear-gradient: ~14.0.1` but Expo SDK 54 requires `~15.0.8`.

When the native module version doesn't match the Expo SDK version, the native component isn't properly registered, causing `IllegalViewOperationException` when React Native tries to render it.

## Solution

### 1. Update Package Version

The `package.json` has been updated to use the correct version:
```json
"expo-linear-gradient": "~15.0.8"
```

### 2. Install Updated Dependencies

```bash
cd apps/gatimitra-riderApp
npm install
```

### 3. Rebuild the App

Since this is a native module change, you **must rebuild** the app:

```bash
# Option 1: EAS Build (Recommended)
eas build --profile development --platform android --clear-cache

# Option 2: Local Build
npx expo prebuild --clean
npx expo run:android
```

**Important:** You cannot just reload the app - native module changes require a full rebuild.

## Why This Happens

1. Expo SDK 54 requires specific versions of all Expo packages
2. `expo-linear-gradient` is a native module (requires native code compilation)
3. Version mismatch = native module not registered = crash when rendering
4. The error occurs when the permissions screen tries to render `<LinearGradient>`

## Verification

After rebuilding:
1. ✅ App should load without crashing
2. ✅ Language selection should work
3. ✅ Permissions screen should display with gradient cards
4. ✅ No `IllegalViewOperationException` errors

## Related Issues

This is the same issue mentioned in the build logs:
```
❗ Major version mismatches
package               expected  found    
expo-linear-gradient  ~15.0.8   14.0.2
```

Always run `npx expo install --check` to verify package versions match your Expo SDK version.
