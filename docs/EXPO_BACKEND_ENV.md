# Expo apps — backend URL switching

This monorepo ships three Expo apps:

| App | Workspace | Production backend |
|---|---|---|
| Customer | `apps/customer_app` | `https://api.gatimitra.com` |
| Merchant | `apps/merchant_app` | `https://api.gatimitra.com` |
| Rider    | `apps/gatimitra-riderApp` | `https://api.gatimitra.com` |

All three apps point at the **production backend by default**. You can switch any of them to your local backend for dev work in 30 seconds, and switch back without rebuilding native code.

## TL;DR — the toggle

Each app has an `env.example` (committed to git) that contains a 3-option backend section:

```env
# (A) PRODUCTION backend (default — works out of the box):
EXPO_PUBLIC_API_BASE_URL=https://api.gatimitra.com
#
# (B) LOCAL backend, ANDROID EMULATOR:
# EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000
#
# (C) LOCAL backend, PHYSICAL PHONE on same Wi-Fi:
# EXPO_PUBLIC_API_BASE_URL=http://YOUR_LAN_IP:3000
```

**To use:**

```bash
cd apps/customer_app          # or apps/merchant_app, or apps/gatimitra-riderApp
cp env.example .env.local     # gitignored — your machine-specific config
# Edit .env.local: comment the current line, uncomment (A), (B), or (C)
npx expo start --clear        # --clear forces Metro to reload env
```

## Decision tree

| Scenario | Pick |
|---|---|
| Just exploring the app, no local backend running | **(A) Production** |
| Testing a backend change in `backend/src/...` on emulator | **(B) Android emulator** |
| Testing on real phone (Expo Go) on same Wi-Fi as PC | **(C) LAN IP** |
| Testing on real phone over cellular data | **(A) Production** |
| Submitting to Play Store / TestFlight | **(A) Production** (forced by `eas.json`) |

## How the layered env works (load order, highest priority wins)

1. **`eas.json` `env` block per build profile** — for EAS builds only. Always wins over `.env*` files.
2. **`.env.local`** — gitignored, your machine-specific overrides. This is the file you edit to toggle A/B/C.
3. **`.env`** — gitignored, lower-priority machine defaults. Usually you don't need this.
4. **App fallback** — `apps/<app>/config/env.ts` falls back to `https://api.gatimitra.com` if every layer above is empty.

The fallback in step 4 means: **a release build with no `.env.local` and no `eas.json` env still reaches production**. You can't accidentally ship a Play Store build pointing at `localhost`.

## EAS build profiles

Each app's `eas.json` defines three profiles:

| Profile | Use | API URL |
|---|---|---|
| `development` | EAS dev client (rare — most dev is via Expo Go) | (none — uses `.env.local`) |
| `preview` | Internal QA APK | `https://api.gatimitra.com` |
| `production` | Play Store / TestFlight bundle | `https://api.gatimitra.com` |

Build commands:

```bash
# Customer app, internal QA APK pointing at prod backend
eas build --profile preview --platform android   # cd into the app first

# Customer app, Play Store bundle
eas build --profile production --platform android
```

## "I'm on cellular but I want to test against local backend"

You have two options:

1. **ngrok / Cloudflare Tunnel** — expose your local backend over HTTPS:
   ```bash
   cd backend && npm run dev
   # in another terminal:
   ngrok http 3000
   # use the https://xxxx.ngrok.app URL in .env.local
   ```

2. **In-app runtime override** (customer app only) — the login screen has a "Configure API URL" sheet that writes to AsyncStorage and beats every env layer. Useful when an installed APK needs to be pointed somewhere new without a rebuild.

## What goes WHERE (security)

| Goes in app `.env.local` / `env.example` | Goes in `backend/.env` ONLY |
|---|---|
| `EXPO_PUBLIC_*` only (PUBLIC — baked into JS bundle) | `MSG91_AUTH_KEY` |
| Supabase URL + `ANON_KEY` (public) | Supabase `SERVICE_ROLE_KEY` |
| Mapbox **public** token (`pk.…`) | `RAZORPAY_KEY_SECRET` |
| Razorpay **public** key id (`rzp_live_…`) | Supabase JWT secret |
| Mapbox **download** token (`sk.…`) — used only by native Gradle at build time, NOT in JS | Database URL, R2 secret key, FCM service-account JSON |

If you put a secret in an Expo `.env.local`, it ends up in the public JS bundle — **assume any token there is leaked**.

## Common problems

**"Network Error" right after starting Expo Go**
- The app loaded a stale env. Run `npx expo start --clear`.
- On a physical phone with Option C, check that your firewall lets your phone reach port 3000 on your PC.

**Map shows blank tiles**
- The bundle wasn't built with `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`. Add it to `.env.local`, then `--clear` and reload.

**Phone OTP login screen says "Phone login is not enabled"**
- Make sure `EXPO_PUBLIC_ENABLE_PHONE_OTP_LOGIN=true` is in your `.env.local` (and the bundle was rebuilt).

**Build succeeded but the installed APK still hits the old backend**
- For EAS builds, the URL is baked at build time. Look at the profile's `env` block in `eas.json` — that's where to change it for production builds.
- For Expo Go reloads, you must `npx expo start --clear` after editing `.env.local`.
