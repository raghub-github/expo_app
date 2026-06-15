# GatiMitra Customer App

Production-ready customer mobile app for GatiMitra (GatiMitra-style food delivery).

## Tech stack

- **Expo** (SDK 54) + **React Native**
- **TypeScript**
- **Expo Router** (file-based routing)
- **TanStack Query** (API state & caching)
- **Zustand** (global state: auth, cart)
- **Axios** (API client with interceptors)
- **expo-secure-store** (tokens; localStorage on web)
- **NativeWind** (Tailwind for RN)
- **React Native Reanimated**

## Structure

```
customer_app/
├── app/                 # Expo Router screens
│   ├── (auth)/          # Login, OTP
│   ├── (tabs)/         # Home, Orders, Profile
│   ├── home/            # Merchant detail
│   ├── checkout/        # Cart, Place order
│   ├── orders/          # Order tracking
│   └── profile/         # Addresses, Help
├── components/         # Reusable UI
├── features/           # Auth, merchants, cart, orders, payments
├── services/           # api.ts, auth.service, order.service, merchant.service
├── store/              # authStore, cartStore (persisted)
├── hooks/
├── utils/
├── constants/
├── config/             # env.ts (EXPO_PUBLIC_API_BASE_URL)
└── theme/
```

## Setup

1. From repo root: `npm install`
2. Copy `env.example` to `.env` and set `EXPO_PUBLIC_API_BASE_URL`
3. Add assets (see `assets/README.md`) or copy from rider app
4. Run: `npm run start` (or `npx expo start`)

## API contract (expected backend)

- `POST /v1/auth/otp/request` – body: `{ phoneE164 }` → `{ requestId, expiresInSec, otp? }`
- `POST /v1/auth/otp/verify` – body: `{ requestId, phoneE164, otp, deviceId }` → Session (JWT)
- `POST /v1/me/logout-all` – logout all sessions
- `GET /v1/me/profile`, `PATCH /v1/me/profile` – profile read/update
- `GET /v1/me/addresses` – list saved addresses | `POST /v1/me/addresses` – add | `PATCH/DELETE /v1/me/addresses/:id` | `POST /v1/me/addresses/:id/default`
- `GET /v1/me/active-location`, `PUT /v1/me/active-location` – current delivery location (lock on order)
- `GET /v1/merchants` – query: `lat?, lng?, limit?` → list of merchants
- `GET /v1/merchants/:id/menu` → merchant + menu
- `GET /v1/search` – query: `q` → search dishes/stores
- `GET /v1/bookmarks/check`, `POST /v1/bookmarks` – store save/unsave
- `POST /v1/orders` – create order | `GET /v1/orders`, `GET /v1/orders/:id` – my orders, detail
- `POST /v1/support/tickets`, `GET /v1/support/tickets`, `GET /v1/support/tickets/:id` – help tickets

All authenticated requests: `Authorization: Bearer <accessToken>`.

**Which tables are used where:** see [docs/CUSTOMER_APP_TABLES_AND_API.md](docs/CUSTOMER_APP_TABLES_AND_API.md) – project mein kaun konse backend/DB tables use ho rahe hain aur unka kya use hai (updated).

## Auth flow

1. Splash → if token exists, go to (tabs); else (auth)/login
2. Login: phone → send OTP → (auth)/otp
3. OTP verify → persist session → (tabs)
4. Logout clears token and redirects to login

## Cart

- Stored in SecureStore (native) / localStorage (web)
- Persists across app restarts
- Per-merchant (switching merchant clears/overwrites cart)

## Scripts

- `npm run start` – start Expo
- `npm run typecheck` – TypeScript check
