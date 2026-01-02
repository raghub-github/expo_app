# Quick Fix Instructions - EAS Build Error

## ✅ What Was Fixed

1. **Simplified Mapbox plugin config** - Removed `process.env` access that was causing build failures
2. **Added missing environment variables** to `eas.json` for all build profiles
3. **Added compatibility variable** - Set both `RNMAPBOX__MAPS_DOWNLOAD_TOKEN` and `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` for Android Gradle compatibility

## 🚀 Next Steps (REQUIRED)

### Step 1: Set EAS Environment Variables

You MUST set these environment variables before building. You need to set them for each environment (development, preview, production):

```bash
# Login to EAS (if not already)
eas login

# Set the Mapbox tokens for DEVELOPMENT environment
eas env:create --scope project --name EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN --value "pk.eyJ1Ijo..." --environment development
eas env:create --scope project --name RNMAPBOX__MAPS_DOWNLOAD_TOKEN --value "pk.eyJ1Ijo..." --environment development

# Set the Mapbox tokens for PREVIEW environment (optional but recommended)
eas env:create --scope project --name EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN --value "pk.eyJ1Ijo..." --environment preview
eas env:create --scope project --name RNMAPBOX__MAPS_DOWNLOAD_TOKEN --value "pk.eyJ1Ijo..." --environment preview

# Set the Mapbox tokens for PRODUCTION environment (optional but recommended)
eas env:create --scope project --name EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN --value "pk.eyJ1Ijo..." --environment production
eas env:create --scope project --name RNMAPBOX__MAPS_DOWNLOAD_TOKEN --value "pk.eyJ1Ijo..." --environment production
```

**Note:** 
- Both tokens can be the same (your Mapbox public token)
- Replace `pk.eyJ1Ijo...` with your actual Mapbox token
- You can use the same token value for all environments

### Alternative: Interactive Mode

If you prefer interactive mode, run without `--environment` flag and select when prompted:

```bash
eas env:create --scope project --name EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN --value "pk.eyJ1Ijo..."
# When prompted "Select environment:", use arrow keys to select "development" and press Enter
# Repeat for preview and production if needed
```

### Step 2: Verify Environment Variables

```bash
# List all environment variables for a specific environment
eas env:list --environment development

# Or list all environments
eas env:list
```

You should see both variables listed for each environment.

### Step 3: Build Again

```bash
cd apps/gatimitra-riderApp
eas build --profile development --platform android
```

## 🔍 What Changed

### app.config.js
- **Before:** Plugin tried to access `process.env` during config evaluation
- **After:** Plugin auto-detects environment variables (simpler, works correctly)

### eas.json
- **Before:** Only had `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN`
- **After:** Has both tokens needed for Mapbox SDK download during build

## ❓ Why This Fixes It

The build was failing because:
1. The plugin config was trying to read `process.env` which isn't available during EAS config evaluation
2. The `RNMAPBOX__MAPS_DOWNLOAD_TOKEN` wasn't being passed to the build environment
3. Android Gradle was looking for the token but couldn't find it

Now:
- Plugin automatically reads from environment (no config needed)
- EAS passes the token to the build environment
- Both variable name formats are set for compatibility

## 🐛 If It Still Fails

1. **Check the build logs** at the URL provided in the error
2. **Verify secrets are set:**
   ```bash
   eas secret:list
   ```
3. **Try clearing cache:**
   ```bash
   eas build --profile development --platform android --clear-cache
   ```
4. **Verify token is valid:**
   - Must start with `pk.`
   - Check at https://account.mapbox.com/
