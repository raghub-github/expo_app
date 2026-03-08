# GatiMitra Merchant App

Professional merchant app for GatiMitra (Swiggy/Zomato/Magicpin/Eatsure-style). Built in the `apps` folder with GatiMitra brand colors and a high-level SaaS UI.

## Features

- **Bottom navigation**: Home | Orders | Menu | Earnings | Profile
- **Dashboard (Home)**: Store status, today’s stats (orders, earnings, menu items, rating), quick actions, recent orders
- **Orders**: Filter chips (All, Pending, Preparing, Ready, Completed), order cards with status
- **Menu / Items**: Add item CTA, category filters, item list with availability
- **Earnings & Payments**: Balance hero card, today/month mini cards, recent payouts
- **Profile**: Store info, account (business details, address, hours, bank), preferences, support, logout

## Tech

- Expo SDK 54, Expo Router (file-based)
- React Native, TypeScript
- GatiMitra theme: primary mint `#16A34A`, deep mint gradient, white/surface cards
- Icons: `@expo/vector-icons` (Ionicons)

## Run

### 1. Start the backend first

From repo root, in one terminal:

```bash
npm install
npm run dev:backend
```

Backend runs at **http://localhost:3000** (or the `PORT` in `backend/.env`). Ensure `backend/.env` has at least:

- `DATABASE_URL` (Postgres)
- `SUPABASE_JWT_SECRET` (for issuing merchant tokens)
- Optional: `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` for real OTP SMS; without these, OTP is only logged in the backend console.

### 2. Start the merchant app

In a **second terminal**, from repo root:

```bash
npm run dev:merchant
```

Or from the app folder:

```bash
cd apps/merchant_app && npx expo start
```

Then press **a** for Android or **i** for iOS (simulator) or scan the QR code on a device.

### 3. Point the app at the backend

Create **`apps/merchant_app/.env`** (if missing) and set:

```env
# Must match backend URL (use 10.0.2.2:3000 for Android emulator if backend is on host)
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000

# Required for Google login (use Web client ID from Google Cloud Console)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
```

#### Supabase: Google provider and redirect URLs

For "Continue with Google" to work, add the correct **Authorized redirect URIs** in [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → your OAuth 2.0 **Web client** (the same one whose Client ID you put in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`):

- **Development build / standalone**: `gatimitra-merchant://redirect`
- **Expo Go**: If you use Expo Go, add the redirect URI shown in the app’s dev log when you tap "Continue with Google" (e.g. `https://auth.expo.io/@your-username/gatimitra-merchant`), or build a development build and use `gatimitra-merchant://redirect` only.

Without the correct redirect URI, Google returns to a URL the app can’t handle and you see "Google sign-in failed".

- **iOS simulator**: `http://localhost:3000` is fine.
- **Android emulator**: use `http://10.0.2.2:3000` (the app’s config resolves this automatically when it sees localhost).
- **Physical device**: use your machine’s LAN IP, e.g. `http://192.168.1.5:3000`, and ensure the device and PC are on the same network.

Restart Expo after changing `.env` (`npx expo start --clear` or Ctrl+C and run again).

## Reuse

- `@gatimitra/contracts` (shared DTOs)
- Same backend API as customer/dashboard
