# Fix: Mapbox 403 Forbidden Error in EAS Build

## Problem

Gradle build fails with:
```
Could not GET 'https://api.mapbox.com/downloads/v2/releases/maven/...'. 
Received status code 403 from server: Forbidden
```

**Note:** If you see 401 (Unauthorized), the token isn't being found. If you see 403 (Forbidden), the token is found but is the wrong type.

## Root Cause

The Mapbox Maven repository requires a **secret token** (starts with `sk.`), not a **public token** (starts with `pk.`). 

- **Public tokens (`pk.`)** are for client-side use in your app
- **Secret tokens (`sk.`)** are for server-side operations like downloading SDKs from Maven

## Solution

### 1. Get a Mapbox Secret Token

**CRITICAL:** You need a **secret token** (starts with `sk.`), not a public token (starts with `pk.`).

1. Go to https://account.mapbox.com/
2. Navigate to **Access Tokens**
3. Create a new token or use an existing one
4. **Make sure it's a SECRET token** (starts with `sk.`)
5. The token needs **Downloads:Read** scope

### 2. Set EAS Secrets

**IMPORTANT:** Use the secret token (starts with `sk.`), not the public token:

```bash
# Set the SECRET token (starts with sk., not pk.)
eas secret:create --scope project --name RNMAPBOX_MAPS_DOWNLOAD_TOKEN --value "sk.eyJ1Ijo..." --environment development

# Also set for preview and production environments
eas secret:create --scope project --name RNMAPBOX_MAPS_DOWNLOAD_TOKEN --value "sk.eyJ1Ijo..." --environment preview
eas secret:create --scope project --name RNMAPBOX_MAPS_DOWNLOAD_TOKEN --value "sk.eyJ1Ijo..." --environment production

# Optional: Also set the double underscore version for compatibility
eas secret:create --scope project --name RNMAPBOX__MAPS_DOWNLOAD_TOKEN --value "sk.eyJ1Ijo..." --environment development
```

**Note:** 
- `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN` should be a **public token** (`pk.`) - used in your app
- `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` should be a **secret token** (`sk.`) - used for Maven downloads

**Note:** The `env` section has been removed from `eas.json` because EAS automatically injects secrets as environment variables. You don't need to reference them in `eas.json`.

### 2. Updated Gradle Configuration

The `android/build.gradle` file has been updated to check multiple environment variable names:
- `MAPBOX_DOWNLOADS_TOKEN` (project property)
- `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (environment variable - what Gradle expects)
- `RNMAPBOX__MAPS_DOWNLOAD_TOKEN` (environment variable - alternative name)

### 3. Verify Token is Available

After setting the secrets, verify they're available:

```bash
# List all secrets
eas secret:list
```

### 4. Rebuild

After setting the secrets correctly, rebuild:

```bash
cd apps/gatimitra-riderApp
eas build --profile development --platform android --clear-cache
```

## Why This Happens

1. Gradle's `build.gradle` checks for `System.getenv('RNMAPBOX_MAPS_DOWNLOAD_TOKEN')`
2. EAS secrets are injected as environment variables
3. If the token is a public token (`pk.`), Mapbox Maven returns 403 Forbidden
4. Mapbox Maven repository requires a secret token (`sk.`) with Downloads:Read scope

## Verification

After the fix, the build logs should show:
- No 401/403 errors from Mapbox Maven repository
- Successful download of Mapbox SDK dependencies
- Build completes successfully

## Token Types Summary

| Token Type | Prefix | Use Case | Where to Get |
|------------|--------|----------|--------------|
| Public Token | `pk.` | Client-side app usage | Mapbox Account → Access Tokens |
| Secret Token | `sk.` | Maven downloads, server-side | Mapbox Account → Access Tokens (with Downloads:Read scope) |

**For EAS Build:**
- `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN` = `pk.eyJ1...` (public token)
- `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` = `sk.eyJ1...` (secret token)
