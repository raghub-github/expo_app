# EAS Build Fix - Mapbox Configuration

## Issue
Build fails with "Unknown error. See logs of the Build complete hook build phase"

## Root Cause
The Mapbox plugin configuration was trying to access `process.env` during config evaluation, which isn't available during EAS builds. The plugin should automatically read environment variables.

## Fixes Applied

### 1. Simplified Plugin Configuration
**File:** `app.config.js`

**Before:**
```javascript
[
  "@rnmapbox/maps",
  {
    RNMapboxMapsDownloadToken: process.env.RNMAPBOX__MAPS_DOWNLOAD_TOKEN || process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN
  }
]
```

**After:**
```javascript
"@rnmapbox/maps"
```

The plugin automatically reads `RNMAPBOX__MAPS_DOWNLOAD_TOKEN` from the environment during build.

### 2. Added Missing Environment Variable to EAS Config
**File:** `eas.json`

Added `RNMAPBOX__MAPS_DOWNLOAD_TOKEN` to all build profiles so it's available during the build process.

## Required Setup

### Step 1: Set EAS Secrets

You MUST set both tokens as EAS secrets before building:

```bash
# Set runtime token (used by app)
eas secret:create --scope project --name EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN --value "pk.eyJ1Ijo..."

# Set build token (used during native build to download Mapbox SDK)
eas secret:create --scope project --name RNMAPBOX__MAPS_DOWNLOAD_TOKEN --value "pk.eyJ1Ijo..."
```

**Important:** Both tokens can be the same (your Mapbox public token starting with `pk.`)

### Step 2: Verify Secrets

```bash
eas secret:list
```

You should see both:
- `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN`
- `RNMAPBOX__MAPS_DOWNLOAD_TOKEN`

### Step 3: Build Again

```bash
eas build --profile development --platform android
```

## Why This Fixes the Issue

1. **Plugin Auto-Detection:** The `@rnmapbox/maps` plugin automatically reads `RNMAPBOX__MAPS_DOWNLOAD_TOKEN` from the environment during the build. We don't need to pass it explicitly.

2. **Environment Variable Availability:** By adding `RNMAPBOX__MAPS_DOWNLOAD_TOKEN` to `eas.json`, EAS ensures it's available during the build phase.

3. **No Config Evaluation Issues:** Removing the `process.env` access from `app.config.js` prevents errors during config evaluation.

## Troubleshooting

### If build still fails:

1. **Check EAS secrets are set:**
   ```bash
   eas secret:list
   ```

2. **Verify token format:**
   - Token must start with `pk.`
   - Token must be valid (check at https://account.mapbox.com/)

3. **Check build logs:**
   - Visit the build URL provided in the error message
   - Look for Mapbox-related errors in the logs

4. **Try clearing cache:**
   ```bash
   eas build --profile development --platform android --clear-cache
   ```

## Additional Notes

- The Android Gradle file (`android/build.gradle`) checks for `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (single underscore) as a fallback, but the standard is `RNMAPBOX__MAPS_DOWNLOAD_TOKEN` (double underscore).

- Mapbox may have removed the download token requirement in newer versions, but it's still recommended to set it for compatibility.
