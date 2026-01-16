# EAS Build Guide for GatiMitra Rider App

## Overview

This app uses **Mapbox** for maps, which requires **native code compilation**. This means:
- ❌ **Cannot run in Expo Go** (pre-built app without your native modules)
- ✅ **Requires EAS Build** (development build or production build)
- ✅ **Can run locally** with `npx expo run:android` or `npx expo run:ios`

## Prerequisites

1. **EAS CLI installed globally:**
   ```bash
   npm install -g eas-cli
   ```

2. **Expo account:**
   ```bash
   eas login
   ```

3. **Mapbox Token:**
   - Get your Mapbox public token from https://account.mapbox.com/
   - Token should start with `pk.`

## Environment Variables Setup

### 1. Create `.env` file

Create `.env` in `apps/gatimitra-riderApp/` directory:

```env
# Backend API URL
EXPO_PUBLIC_API_BASE_URL=https://your-backend-url.com

# Mapbox Public Token (REQUIRED)
# This token is used at runtime in the app
EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN=pk.eyJ1Ijo...

# Mapbox Download Token (REQUIRED for EAS builds)
# This token is used during native build to download Mapbox SDK
# Can be same as public token, or use a secret token
RNMAPBOX__MAPS_DOWNLOAD_TOKEN=pk.eyJ1Ijo...
```

### 2. Set EAS Secrets (Recommended)

For production builds, set secrets in EAS:

```bash
# Set Mapbox token as EAS secret
eas secret:create --scope project --name EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN --value "pk.eyJ1Ijo..."
eas secret:create --scope project --name RNMAPBOX__MAPS_DOWNLOAD_TOKEN --value "pk.eyJ1Ijo..."
```

**Note:** EAS secrets are automatically injected during build. You don't need to commit tokens to `.env` if using secrets.

## Building the App

### Option 1: EAS Build (Cloud Build - Recommended)

#### Development Build (for testing)

```bash
cd apps/gatimitra-riderApp

# Build for Android
eas build --profile development --platform android

# Build for iOS
eas build --profile development --platform ios
```

#### Preview Build (for internal testing)

```bash
eas build --profile preview --platform android
eas build --profile preview --platform ios
```

#### Production Build

```bash
eas build --profile production --platform android
eas build --profile production --platform ios
```

### Option 2: Local Build (Faster iteration)

#### Android

```bash
cd apps/gatimitra-riderApp

# Generate native projects
npx expo prebuild

# Build and run
npx expo run:android
```

#### iOS (macOS only)

```bash
cd apps/gatimitra-riderApp

# Generate native projects
npx expo prebuild

# Build and run
npx expo run:ios
```

## Build Profiles Explained

### Development Profile
- Includes `expo-dev-client`
- Allows hot reloading and development tools
- Distribution: Internal (for testing)
- Use for: Active development

### Preview Profile
- Production-like build without dev client
- Distribution: Internal
- Use for: Testing before production release

### Production Profile
- Optimized production build
- Auto-increments version
- Distribution: App stores
- Use for: App Store / Play Store releases

## Installing Development Build

After EAS build completes:

1. **Download the build:**
   - Android: `.apk` or `.aab` file
   - iOS: `.ipa` file (requires TestFlight or ad-hoc distribution)

2. **Install on device:**
   - **Android:** Transfer `.apk` to device and install, or use `adb install`
   - **iOS:** Use TestFlight or install via Xcode

3. **Start development server (Keep it running):**
   ```bash
   cd apps/gatimitra-riderApp
   npx expo start --dev-client
   ```
   **Important:** Keep this terminal running while developing. You don't need to restart it when opening/closing the app.

4. **Connect to server:**
   - **First time:** Scan QR code with your device
   - **Subsequent times:** Just open the app - it will auto-connect
   - **Different networks:** Use `npx expo start --dev-client --tunnel`

**See `DEVELOPMENT_WORKFLOW.md` for detailed development workflow guide.**

## Troubleshooting

### Issue: "Mapbox token not configured"

**Solution:**
1. Check `.env` file exists in `apps/gatimitra-riderApp/`
2. Verify `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN` is set
3. Restart development server after changing `.env`
4. For EAS builds, ensure token is set as EAS secret or in build environment

### Issue: "Native code not available"

**Solution:**
- This error appears in Expo Go. You **must** use a development build.
- Create a development build using EAS or local build commands above.

### Issue: Map shows but is blank/gray

**Solution:**
1. Check Mapbox account has active billing/quota
2. Verify token permissions include map styles
3. Check token is valid (starts with `pk.`)

### Issue: Build fails with "RNMAPBOX__MAPS_DOWNLOAD_TOKEN not found"

**Solution:**
1. Set `RNMAPBOX__MAPS_DOWNLOAD_TOKEN` in `.env` file
2. Or set as EAS secret: `eas secret:create --name RNMAPBOX__MAPS_DOWNLOAD_TOKEN --value "pk.eyJ1Ijo..."`
3. Token can be same as `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN`

## Performance Optimization

### Lightweight App Tips

1. **Use production builds** - Development builds are larger
2. **Enable code splitting** - Already configured with Expo Router
3. **Optimize images** - Use WebP format, compress assets
4. **Remove unused dependencies** - Regularly audit `package.json`

### Battery Optimization

1. **Location tracking:**
   - Uses `distanceInterval` and `timeInterval` for efficient tracking
   - Background location only when on duty

2. **Map rendering:**
   - Map only loads when needed (lazy loading)
   - Uses efficient Mapbox styles

## CI/CD Integration

### GitHub Actions Example

```yaml
name: EAS Build
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install -g eas-cli
      - run: eas login --non-interactive
      - run: eas build --profile production --platform android --non-interactive
```

## Additional Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [@rnmapbox/maps Installation](https://rnmapbox.github.io/docs/install)
- [Expo Development Builds](https://docs.expo.dev/development/introduction/)
- [Mapbox Account Setup](https://account.mapbox.com/)

## Quick Start Checklist

- [ ] Install EAS CLI: `npm install -g eas-cli`
- [ ] Login to Expo: `eas login`
- [ ] Create `.env` file with Mapbox tokens
- [ ] Set EAS secrets (optional but recommended)
- [ ] Run `eas build --profile development --platform android`
- [ ] Install build on device
- [ ] Start dev server: `npx expo start --dev-client`
- [ ] Verify map loads correctly
