# EAS Build Profiles Explained

## Overview

EAS Build supports different build profiles for different purposes. This document explains the differences between `development`, `preview`, and `production` profiles.

## Build Profiles Comparison

### 1. Development Profile (`development`)

**Command:**
```bash
eas build --profile development --platform android --clear-cache
```

**Characteristics:**
- ✅ **Development Client**: Includes Expo Dev Client for hot reloading and debugging
- ✅ **Debug Build**: Uses `assembleDebug` (faster builds, includes debug symbols)
- ✅ **Internal Distribution**: For testing within your team
- ✅ **Hot Reload**: Can connect to Metro bundler for live code updates
- ✅ **Debugging Tools**: Full debugging capabilities, console logs, React DevTools
- ❌ **Larger Size**: Includes debug symbols and dev tools (larger APK)
- ❌ **Not Optimized**: No code minification or optimization
- ❌ **Slower Runtime**: Debug builds are slower than release builds

**When to Use:**
- During active development
- When you need hot reload and fast iteration
- For debugging issues in real-time
- When testing new features before release
- For local development builds

**Build Type:** `apk` (Debug)

---

### 2. Preview Profile (`preview`)

**Command:**
```bash
eas build --profile preview --platform android --clear-cache
```

**Characteristics:**
- ✅ **Release Build**: Uses `assembleRelease` (optimized, production-like)
- ✅ **Optimized**: Code minification, ProGuard/R8 enabled, resource shrinking
- ✅ **Smaller Size**: Optimized APK size (what users will experience)
- ✅ **Faster Runtime**: Release builds are faster
- ✅ **Internal Distribution**: For testing with real users (QA, beta testers)
- ❌ **No Dev Client**: Cannot use Expo Dev Client or hot reload
- ❌ **Harder to Debug**: No debug symbols, console logs may be limited
- ❌ **Slower Builds**: Takes longer to build (optimization process)

**When to Use:**
- For QA testing before production release
- For beta testing with real users
- To test the actual production experience
- To verify app size and performance
- Before submitting to app stores
- For internal distribution to stakeholders

**Build Type:** `apk` (Release)

---

### 3. Production Profile (`production`)

**Command:**
```bash
eas build --profile production --platform android --clear-cache
```

**Characteristics:**
- ✅ **App Bundle (AAB)**: Google Play Store format (smaller, optimized)
- ✅ **Fully Optimized**: Maximum optimization for production
- ✅ **Auto Versioning**: Automatically increments version numbers
- ✅ **Store Ready**: Ready for Google Play Store submission
- ✅ **Smallest Size**: AAB format is more efficient than APK
- ❌ **No Dev Client**: Production build, no debugging
- ❌ **Longest Build Time**: Most optimization takes time

**When to Use:**
- For Google Play Store submission
- For production releases
- When you're ready to publish to end users
- For final release builds

**Build Type:** `app-bundle` (AAB)

---

## Quick Decision Guide

### Use **Development** when:
- 🔧 Actively coding and testing
- 🐛 Need to debug issues
- ⚡ Want hot reload
- 🧪 Testing new features

### Use **Preview** when:
- ✅ Ready to test production-like experience
- 👥 Sharing with QA or beta testers
- 📦 Want to verify app size/performance
- 🚀 Pre-release testing

### Use **Production** when:
- 📱 Ready to submit to Google Play Store
- 🎯 Final release to end users
- 🏪 Publishing to app stores

---

## Build Time Comparison

1. **Development** (Fastest): ~10-15 minutes
   - Debug build, minimal optimization

2. **Preview** (Medium): ~15-20 minutes
   - Release build with optimization

3. **Production** (Slowest): ~20-30 minutes
   - Maximum optimization, AAB generation

---

## Size Comparison

1. **Development**: Largest (~200-300MB)
   - Includes debug symbols and dev tools

2. **Preview**: Medium (~150-200MB)
   - Optimized but still APK format

3. **Production**: Smallest (~100-150MB)
   - AAB format, maximum optimization

---

## Current Configuration

Based on `eas.json`:

```json
{
  "development": {
    "developmentClient": true,
    "buildType": "apk",
    "gradleCommand": ":app:assembleDebug"
  },
  "preview": {
    "buildType": "apk",
    "gradleCommand": ":app:assembleRelease"
  },
  "production": {
    "buildType": "app-bundle",
    "gradleCommand": ":app:bundleRelease"
  }
}
```

---

## Recommendations

1. **Daily Development**: Use `development` profile
2. **Before Release**: Use `preview` profile to test
3. **Store Submission**: Use `production` profile

---

## Notes

- All profiles use the same codebase
- Environment variables can be different per profile
- Build credentials are shared across profiles
- Cache can be cleared with `--clear-cache` flag
