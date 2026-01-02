# Backend (shared)

This backend is shared by **Rider / Customer / Merchant / Admin** apps.

## Local dev

1) Copy `env.example` to `.env` (create it manually) and fill values.
   - Optional machine-specific overrides: copy `env.local.example` to `.env.local`.
2) Run:

```bash
npm --workspace backend run dev
```

API:
- Health: `GET /v1/health`
- Docs: `GET /docs`
- Auth:
  - `POST /v1/auth/firebase/session` (dev Firebase Phone Auth → session exchange)
  - `POST /v1/auth/otp/request` (MSG91 provider; stubbed)
  - `POST /v1/auth/otp/verify` (MSG91 provider; stubbed)
- Rider:
  - `POST /v1/rider/location/ping` (authenticated live location + fraud scoring)
  - `GET /v1/rider/me`

## Location + Map (Rider app)

### Backend DB
This change adds a new table `rider_location_events` in `src/db/schema.ts`.

To generate + apply a migration:

```bash
npm --workspace backend run db:generate
npm --workspace backend run db:push
```

### Fraud scoring (v1)
The backend scores each ping and stores:
- `fraud_score` (0..100)
- `fraud_signals` (array of string flags)

Current signals include mock location, teleporting, unrealistic speed, low accuracy, and heading/bearing mismatch.

## Hosting on a VPS (Hostinger) – recommended production setup

### Option A: systemd + Nginx (simple + reliable)

1) Install Node LTS on VPS (recommended Node 20+).
2) Deploy repo to `/opt/gatimitra` (git clone / rsync / CI).
3) Install deps and build:

```bash
cd /opt/gatimitra
npm install
npm --workspace backend run build
```

4) Create `/opt/gatimitra/backend/.env` (do NOT commit it).
5) Create a systemd service (see `gatimitra-backend.service.example`) and enable it.
6) Put Nginx in front and terminate TLS (see `nginx.site.example`).
7) Issue SSL cert (Let’s Encrypt / Certbot) for `api.gatimitra.com`.

### Option B: Docker (portable)

Build and run the image using `Dockerfile` and inject env vars from your secrets store.

## How apps connect

Apps must call:
- **Production**: `https://api.gatimitra.com`
- **Local**: your machine LAN IP (real devices) or emulator loopback

Rider app reads `EXPO_PUBLIC_API_BASE_URL`.


