# Setting EAS Environment Variables - Step by Step

## Problem
When running `eas env:create`, you're getting "No environments selected" error.

## Solution
You need to specify the `--environment` flag when creating environment variables.

## Quick Setup (Copy & Paste)

Replace `YOUR_MAPBOX_TOKEN` with your actual token (starts with `pk.`):

```bash
# For DEVELOPMENT builds
eas env:create --scope project --name EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN --value "YOUR_MAPBOX_TOKEN" --environment development
eas env:create --scope project --name RNMAPBOX__MAPS_DOWNLOAD_TOKEN --value "YOUR_MAPBOX_TOKEN" --environment development

# For PREVIEW builds (optional)
eas env:create --scope project --name EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN --value "YOUR_MAPBOX_TOKEN" --environment preview
eas env:create --scope project --name RNMAPBOX__MAPS_DOWNLOAD_TOKEN --value "YOUR_MAPBOX_TOKEN" --environment preview

# For PRODUCTION builds (optional)
eas env:create --scope project --name EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN --value "YOUR_MAPBOX_TOKEN" --environment production
eas env:create --scope project --name RNMAPBOX__MAPS_DOWNLOAD_TOKEN --value "YOUR_MAPBOX_TOKEN" --environment production
```

## Example with Real Token

```bash
# Your token (from the terminal output)
TOKEN="pk.eyJ1IjoicmFnaHViaHVuaWEiLCJhIjoiY21qcHc2d2tlM291YzNnczU4eHpvNjcxdiJ9.ozfZWJvnP8f2DJekeHBELw"

# Set for development
eas env:create --scope project --name EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN --value "$TOKEN" --environment development
eas env:create --scope project --name RNMAPBOX__MAPS_DOWNLOAD_TOKEN --value "$TOKEN" --environment development
```

## Verify It Worked

```bash
# Check development environment
eas env:list --environment development

# You should see:
# EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN
# RNMAPBOX__MAPS_DOWNLOAD_TOKEN
```

## Then Build

```bash
eas build --profile development --platform android
```

## Troubleshooting

### If you get "environment not found"
Make sure you're using lowercase: `development`, `preview`, `production` (not `Development`)

### If you want to set for all environments at once
You need to run the command separately for each environment. There's no "all environments" option.

### If you prefer interactive mode
Run without `--environment` and use arrow keys to select when prompted:
```bash
eas env:create --scope project --name EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN --value "YOUR_TOKEN"
# Use ↑/↓ arrow keys to select "development" and press Enter
```
