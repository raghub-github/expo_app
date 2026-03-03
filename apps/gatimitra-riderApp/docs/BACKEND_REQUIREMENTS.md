# Backend Server Requirements

## 🚀 How to Start the App (Quick Reference)

| What you want to do | Command | Uses EAS build? |
|---------------------|--------|------------------|
| **Daily development** (emulator or device with USB) | See [Start for development](#start-for-development) below | ❌ No |
| **Installable APK on your phone** (no USB, over the air) | `eas build --profile preview --platform android` | ✅ Yes (uses 1 build) |
| **Production / Play Store** | `eas build --profile production --platform android` | ✅ Yes (uses 1 build) |
| **Fix cache/weird build issues** | Add `--clear-cache` to any `eas build` | Same build count |

**If your Expo subscription is limited (e.g. one build):** Prefer **local development** and **local builds** so you don’t use EAS build credits. Use the **preview** EAS build only when you really need an APK to share or test on a device without a cable.

---

## Start for development (no EAS build)

Use this for normal coding and testing. **Does not use your EAS build quota.**

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Rider app (from repo root or from apps/gatimitra-riderApp)
cd apps/gatimitra-riderApp
npx expo start
```

Then:

- Press **`a`** for Android emulator, or
- Scan QR with **Expo Go** on a physical device (if the app works in Expo Go), or
- Use **Run on device** with USB: `npx expo run:android` (builds native app on your machine, **no EAS build**).

---

## When to use which command

| Command | When to use it |
|--------|-----------------|
| `eas build --profile preview --platform android` | You need an **APK** to install on a phone (e.g. internal testing, no USB). Uses **1 EAS build**. |
| `eas build --profile preview --platform android --clear-cache` | Same as above, but clear EAS cache first (use only if preview build is broken or outdated). Still **1 EAS build**. |
| `eas build --profile production --platform android` | You are building for **Play Store / production**. Uses **1 EAS build**. |

**Rule of thumb:** Use **one preview build** when you need a shareable APK. Use **production** only when you’re ready to ship. For everything else, use **development** (Expo start + run:android) to save builds.

---

## Preview build: real-time updates while coding

**Yes — open the app you installed (preview/development build) and run Expo start on your computer.** That's the right process.

1. **On your computer:** From the rider app folder run:
   ```bash
   cd apps/gatimitra-riderApp
   npx expo start
   ```
2. **On your device:** Open the **installed preview/development build** (the APK you installed from EAS or from `npx expo run:android`).
3. **Connect to Metro:** In the app, connect to the dev server (e.g. "Enter URL manually" and type your machine's URL like `http://10.19.200.18:8081`, or scan the QR if the build supports it). Device and computer must be on the same Wi‑Fi.
4. **Result:** The app loads the bundle from Metro. You get **live reload / fast refresh** — code changes show up in the installed app without reinstalling. No other process needed.

You don't need to re-run EAS build for every code change when using this flow; only when you change native code or env at build time.

---

## ✅ **YES - Backend Server is REQUIRED**

The GatiMitra Rider App **requires** the backend server to be running for most features to work. The app is not fully functional without it.

## What Requires Backend?

### Critical Features (Won't Work Without Backend):
1. **Authentication** - OTP request/verification
2. **Orders** - Viewing, accepting, rejecting orders
3. **Earnings** - Wallet balance, earnings history
4. **Duty Status** - Going ON/OFF duty
5. **Location Tracking** - Sending location pings to backend
6. **Profile** - User profile data
7. **KYC** - Document uploads and verification status

### Features That Work Without Backend:
- Language selection (local storage)
- Permission requests (device-level)
- UI navigation (but no data)

## Backend URL Configuration

The app uses `EXPO_PUBLIC_API_BASE_URL` to connect to the backend.

### Default Configuration:
- **If not set:** Defaults to `http://localhost:3000`
- **Location:** `apps/gatimitra-riderApp/src/config/env.ts`

### Setting Backend URL:

#### Option 1: Environment Variable (Recommended)
Create `apps/gatimitra-riderApp/.env`:
```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

#### Option 2: For Production Builds
Set via EAS Secrets:
```bash
eas secret:create --scope project --name EXPO_PUBLIC_API_BASE_URL --value https://api.gatimitra.com
```

Or in `eas.json`:
```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_API_BASE_URL": "https://api.gatimitra.com"
      }
    }
  }
}
```

## Testing Scenarios

### Scenario 1: Local Development (Emulator/Simulator)
```bash
# Terminal 1: Start backend
cd backend
npm run dev
# Backend runs on http://localhost:3000

# Terminal 2: Run app
cd apps/gatimitra-riderApp
npx expo start
```
✅ **Works:** `localhost:3000` is accessible from emulator

### Scenario 2: Preview Build on Real Device (Local Backend)

💡 **Limited EAS builds?** Prefer testing with USB: run `npx expo run:android` with device connected — no EAS build used. Use `eas build --profile preview` only when you need an APK to install without cable.

```bash
# Terminal 1: Start backend
cd backend
npm run dev
# Backend runs on http://localhost:3000

# Terminal 2: Build and install app (uses 1 EAS build)
cd apps/gatimitra-riderApp
eas build --profile preview --platform android
```

⚠️ **Problem:** `localhost:3000` won't work on a real device!

**Solution:** Use your computer's local IP address:
1. Find your local IP:
   - **Windows:** `ipconfig` → Look for IPv4 Address (e.g., `192.168.1.100`)
   - **Mac/Linux:** `ifconfig` or `ip addr` → Look for inet address

2. Update `.env`:
```env
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:3000
```

3. Rebuild the app:
```bash
eas build --profile preview --platform android --clear-cache
```

4. Make sure your device and computer are on the **same WiFi network**

### Scenario 3: Preview Build with Production Backend
If you have a deployed backend server:

```env
EXPO_PUBLIC_API_BASE_URL=https://api.gatimitra.com
```

Then build:
```bash
eas build --profile preview --platform android
```

✅ **Works:** App connects to production backend (no local server needed)

### Scenario 4: Production Build
```env
EXPO_PUBLIC_API_BASE_URL=https://api.gatimitra.com
```

```bash
eas build --profile production --platform android
```

✅ **Works:** App connects to production backend

## Quick Setup Guide

### For Local Testing on Real Device:

1. **Start Backend:**
```bash
cd backend
npm run dev
```

2. **Find Your Local IP:**
```bash
# Windows
ipconfig

# Mac/Linux
ifconfig | grep "inet "
```

3. **Update App Config:**
Create/update `apps/gatimitra-riderApp/.env`:
```env
EXPO_PUBLIC_API_BASE_URL=http://YOUR_LOCAL_IP:3000
# Example: http://192.168.1.100:3000
```

4. **Build App:**
```bash
cd apps/gatimitra-riderApp
eas build --profile preview --platform android --clear-cache
```

5. **Install & Test:**
- Install the APK on your device
- Make sure device is on same WiFi as your computer
- Open app and test features

## Troubleshooting

### OTP not received / "Network request failed" / "Request timeout"
- ✅ **On a real device:** Set backend URL to your computer’s IP, not `localhost`. Example: in `apps/gatimitra-riderApp/.env` set `EXPO_PUBLIC_API_BASE_URL=http://10.19.200.18:3000` (use your machine’s IP from `ipconfig`). Restart Expo after changing `.env`.
- ✅ **Development (Expo Go / backend OTP):** The app does not send SMS; the backend returns a 4-digit OTP in the response. After tapping “Send OTP”, the code is shown on the login screen under “Development: use the code below”. Enter that code to continue.
- ✅ Backend must be running: `curl http://localhost:3000/v1/health` (or use your IP when testing from another machine).
- ✅ **Timeout:** OTP requests use a 30s timeout. If you still see a timeout, ensure the device can reach the backend (same Wi‑Fi, correct `EXPO_PUBLIC_API_BASE_URL`, backend running and not stuck).

**Does the backend send SMS?** No. The current backend **does not send OTP via SMS**. It only generates an OTP and stores it in memory; in non-production it returns the OTP in the API response so the app can show it on screen ("Development: use the code below"). For real SMS you must integrate an OTP provider (e.g. MSG91) in the backend (see `backend/src/modules/auth/auth.routes.ts` and `otp.provider.ts`).

**"OTP not requested yet":** Tap **Send OTP** first and wait for the code (or the dev box). Then enter the 4-digit code and tap Verify. If you see this after a hot reload, the app now passes the request ID from the screen state so verify should still work.

**Debug OTP (does it send?):**
1. Backend does **not** send SMS; it only returns OTP in the response in dev.
2. Run backend: `cd backend && npm run dev`.
3. From app: tap Send OTP. If the request succeeds, you see either the "Development: use the code below" box (with the 4-digit code) or move to the OTP step.
4. If you get a timeout/error: set `EXPO_PUBLIC_API_BASE_URL` to your machine IP (e.g. `http://10.19.200.18:3000`) in `apps/gatimitra-riderApp/.env`, same Wi‑Fi, restart Expo.
5. Test backend directly: `curl -X POST http://localhost:3000/v1/auth/otp/request -H "Content-Type: application/json" -d "{\"phoneE164\":\"+919876543210\"}"` — you should get `{"requestId":"...","expiresInSec":300,"otp":"1234"}` (otp only in non-production).

### "Network request failed" or "Connection refused"
- ✅ Check backend is running: `curl http://localhost:3000/v1/health`
- ✅ Check backend URL in app config
- ✅ For real device: Use local IP, not `localhost`
- ✅ Ensure device and computer on same network
- ✅ Check firewall isn't blocking port 3000

### "Cannot connect to backend"
- ✅ Verify backend is accessible: Open `http://YOUR_IP:3000/v1/health` in browser
- ✅ Check backend logs for errors
- ✅ Verify database connection in backend
- ✅ Check backend `.env` file is configured

### Backend Running But App Can't Connect
1. **Check Backend URL:**
   ```bash
   # In app, check what URL is being used
   # Look at console logs when app starts
   ```

2. **Test Backend Manually:**
   ```bash
   curl http://localhost:3000/v1/health
   # Should return: {"status":"ok"}
   ```

3. **Check Network:**
   - Device and computer on same WiFi?
   - Firewall allowing port 3000?
   - Router blocking local connections?

## Backend Health Check

Test if backend is running:
```bash
# Should return: {"status":"ok"}
curl http://localhost:3000/v1/health
```

## Summary

| Scenario | Backend Required? | Backend URL |
|----------|------------------|-------------|
| Local dev (emulator) | ✅ Yes | `http://localhost:3000` |
| Preview build (real device, local) | ✅ Yes | `http://YOUR_LOCAL_IP:3000` |
| Preview build (production backend) | ✅ Yes | `https://api.gatimitra.com` |
| Production build | ✅ Yes | `https://api.gatimitra.com` |

**Bottom Line:** The backend server **must be running** for the app to function. Configure the correct backend URL based on your testing scenario.
