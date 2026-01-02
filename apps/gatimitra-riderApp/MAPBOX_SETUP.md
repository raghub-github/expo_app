# Mapbox Setup Guide

## Issue: Map Not Loading

If the map is not loading, follow these steps:

### 1. Create/Update `.env` File

Create a file named `.env` in the `apps/gatimitra-riderApp/` directory with the following content:

```env
# Backend base URL
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000

# OTP Provider
EXPO_PUBLIC_OTP_PROVIDER=msg91

# Mapbox Public Token (REQUIRED FOR MAPS)
EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN=pk.eyJ1Ijo...
```

**Important:** Replace `pk.eyJ1Ijo...` with your actual Mapbox public token.

### 2. Get Your Mapbox Token

1. Go to https://account.mapbox.com/
2. Sign in or create an account
3. Navigate to "Access tokens"
4. Copy your **Public token** (starts with `pk.`)
5. Paste it in the `.env` file

### 3. Restart Development Server

After updating the `.env` file:

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm start
# or
expo start --clear
```

**Important:** Expo caches environment variables. You MUST restart the server after changing `.env`.

### 4. Verify Token is Loaded

Check the console logs when the app starts. You should see:

```
[Mapbox] Initialization check: { hasToken: true, ... }
[Mapbox] Successfully initialized with token
```

If you see:
```
[Mapbox] ❌ Token not configured!
```

Then the token is not being read. Check:
- File is named exactly `.env` (not `.env.txt` or `.env.local`)
- File is in `apps/gatimitra-riderApp/` directory
- Token starts with `pk.`
- You restarted the server after adding the token

### 5. Debug Component

The app includes a debug component (only in development mode) that shows:
- Whether the token is detected
- Whether Mapbox module is available
- Any errors

Look for the debug panel on the orders screen.

### 6. Common Issues

**Issue:** "Token not configured"
- **Solution:** Make sure `.env` file exists and has `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN=...`

**Issue:** "Mapbox module not available"
- **Solution:** Make sure `@rnmapbox/maps` is installed: `npm install @rnmapbox/maps`
- **Note:** Mapbox requires a native build. In Expo Go, maps won't work. You need a development build.

**Issue:** Map shows but is blank/gray
- **Solution:** Check your Mapbox account has active billing/quota
- Check token permissions include map styles

### 7. Testing

After setup, the map should:
1. Load immediately (even without GPS location)
2. Show a default location (Mumbai, India)
3. Update to your actual location when GPS is available

If the map still doesn't load, check the console for error messages and share them for debugging.
