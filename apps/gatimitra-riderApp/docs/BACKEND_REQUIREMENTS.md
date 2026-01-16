# Backend Server Requirements

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
```bash
# Terminal 1: Start backend
cd backend
npm run dev
# Backend runs on http://localhost:3000

# Terminal 2: Build and install app
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
