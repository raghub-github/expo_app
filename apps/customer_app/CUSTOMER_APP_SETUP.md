# Customer App – Backend & OTP Setup

The customer app uses the **shared backend** (`backend/`) for auth, orders, addresses, merchants, payment, and support. OTP is the same provider as the partnersite (MSG91).

---

## What you need to do

### 1. Customer app env

- Copy `env.example` to `.env` or `.env.local`.
- **Required for login:**  
  `EXPO_PUBLIC_API_BASE_URL` = backend base URL (no trailing slash).
  - Emulator: `http://localhost:3001` (or your backend port).
  - Physical device: use `EXPO_PUBLIC_DEV_HOST` = your PC’s IP (e.g. `192.168.1.5`); the app will use `http://<that IP>:3001`.
- Optional: `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` for maps and Realtime.

### 2. Backend env (for customer app to work)

In `backend/.env` (or `.env.local`):

- **Required:**  
  `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- **Production SMS OTP (same as partnersite – MSG91):**  
  Set `MSG91_AUTH_KEY`. Optionally: `MSG91_TEMPLATE_ID` (v5/DLT), `MSG91_SENDER_ID`, `MSG91_OTP_EXPIRY_SEC`.  
  If these are not set, backend still generates OTP and logs it to the console (dev only; no SMS).
- Run backend on the port the app expects (e.g. `PORT=3001 npm run dev` in `backend/`).

### 3. Partnersite / Supabase (no change for customer app)

Customer app does **not** use Supabase Auth or the partnersite Send SMS hook. It uses backend `/v1/auth/otp/request` and `/v1/auth/otp/verify`; the backend sends SMS via MSG91 when `MSG91_AUTH_KEY` is set. You can use the same MSG91 credentials as in `partnersite/.env.local` (e.g. `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`) in the **backend** `.env`.

### 4. Production checklist (millions of users)

- Backend: set `MSG91_AUTH_KEY` (and `MSG91_TEMPLATE_ID` if using DLT).
- Backend: use a real Postgres connection pool (e.g. Supabase pooler); rate limiting is already enabled.
- For very high scale, consider moving OTP storage from in-memory to Redis (backend today uses in-memory store).
- Customer app: set `EXPO_PUBLIC_API_BASE_URL` to your deployed backend URL (HTTPS).
- No changes needed in the partnersite for customer app OTP.

---

## Auth & login/signup (Swiggy/Zomato-style)

- **Customer app is mobile-only:** there is no email login. Only **mobile number + OTP**.
- **Unified flow:** There is no separate “signup” vs “login”. The user always enters mobile → OTP. The backend decides:
  - **Existing user:** phone already in `customers` table → returns JWT; app fetches profile; if `profile_completed` → go to home.
  - **New user:** phone not found → backend creates a new row in `customers` → returns JWT; app fetches profile; `profile_completed` is false → go to **onboarding**.
- **After OTP (automatic redirect):**
  - If **existing** and profile complete → **Home (tabs)**.
  - If **new** or profile incomplete → **Onboarding**:  
    1. **Profile** – name, email (optional), age, gender, referral.  
    2. **Delivery location** (optional) – add first address or skip.  
    3. **Permissions** – SMS, notifications, location.  
    Then → Home.

---

## Flow summary

1. User enters phone → app calls `POST /v1/auth/otp/request` (backend).
2. Backend generates 6-digit OTP, stores it, and if `MSG91_AUTH_KEY` is set sends SMS via MSG91.
3. User enters OTP → app calls `POST /v1/auth/otp/verify` with `appType: "customer"` (backend).
4. Backend finds or creates customer, returns JWT. App fetches profile; if `profile_completed` → home, else → onboarding (profile → address → permissions → home).
5. App uses JWT for all further API calls (`/v1/orders`, `/v1/me/*`, etc.).
