# How to Update App Icon on Mobile Device

## Problem
The app icon (shown in app drawer/home screen) is not showing the brand logo even after updating `app.config.js`.

## Solution
You need to regenerate the native app icons by running `expo prebuild`. This creates/updates the native Android and iOS icon files.

## Steps to Update App Icon

### Option 1: Using Expo Prebuild (Recommended)

1. **Navigate to the app directory:**
   ```bash
   cd apps/gatimitra-riderApp
   ```

2. **Clear any existing native folders (if they exist):**
   ```bash
   # Remove Android native folder (if exists)
   rm -rf android
   
   # Remove iOS native folder (if exists)  
   rm -rf ios
   ```

3. **Regenerate native code with new icon:**
   ```bash
   npx expo prebuild --clean
   ```

   This will:
   - Generate native Android and iOS projects
   - Create all required icon sizes from `onlylogo.png`
   - Set the brand background color `#14b8a6`

4. **Rebuild the app:**
   
   **For Android:**
   ```bash
   npx expo run:android
   ```
   
   **For iOS:**
   ```bash
   npx expo run:ios
   ```

### Option 2: Using EAS Build

If you're using EAS Build, the icons will be automatically generated during the build process:

```bash
eas build --platform android
# or
eas build --platform ios
```

### Option 3: Development Build (Expo Go doesn't support custom icons)

If you're using Expo Go, **custom app icons are NOT supported**. You must:
1. Create a development build: `npx expo run:android` or `npx expo run:ios`
2. Or use EAS Build to create a development build

## Current Configuration

The app is configured to use:
- **App Icon**: `onlylogo.png` (logo without text - better for square icons)
- **Splash Screen**: `logo.png` (full logo with text)
- **Background Color**: `#14b8a6` (brand mint green)

## Icon Requirements

- **Format**: PNG
- **Recommended Size**: 1024x1024 pixels (square)
- **Aspect Ratio**: 1:1 (square)
- **Background**: Should work on brand color `#14b8a6`

## Verification

After rebuilding:

1. **Android**: Check `android/app/src/main/res/mipmap-*/ic_launcher.png` files
2. **iOS**: Check `ios/[AppName]/Images.xcassets/AppIcon.appiconset/` folder
3. **Install on device**: The app icon should show `onlylogo.png` on brand background

## Troubleshooting

### Icon still not showing?

1. **Uninstall the old app** from your device completely
2. **Clear app data/cache** if reinstalling
3. **Rebuild from scratch**: `npx expo prebuild --clean`
4. **Check icon file exists**: Verify `assets/images/onlylogo.png` exists
5. **Verify icon is square**: App icons must be square (1:1 aspect ratio)

### Icon looks distorted?

- Ensure `onlylogo.png` is square (same width and height)
- Recommended: 1024x1024 pixels
- The icon will be automatically resized for different screen densities

## Notes

- **Expo Go**: Custom icons are NOT supported in Expo Go. Use development builds.
- **Native Folders**: After `expo prebuild`, you'll have `android/` and `ios/` folders. These are generated and can be regenerated.
- **Git**: You may want to add `android/` and `ios/` to `.gitignore` if using managed workflow.
