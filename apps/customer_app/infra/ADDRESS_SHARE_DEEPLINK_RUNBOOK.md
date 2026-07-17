# Address-Share Deep Link — Runbook (`gatimitra.com/addr/...`)

Fixes the production blocker where the shared-address link opened a browser and
did not open the app.

## Design decision (2026-07-16)

Address-share was previously planned on a dedicated `link.gatimitra.com`
subdomain. That plan was abandoned after it caused a full-site outage on
2026-07-14: an nginx `server { link.gatimitra.com; }` block was merged before
the TLS cert was issued, and nginx refused to start with error
`cannot load certificate "/etc/letsencrypt/live/link.gatimitra.com/fullchain.pem": No such file or directory`.
All four sites went down for the duration.

The current design serves address-share directly under the apex `gatimitra.com`
domain:

- `https://gatimitra.com/.well-known/assetlinks.json` — Android App Links
- `https://gatimitra.com/addr/<shortCode>?id=<token>` — landing page + app open
- `https://gatimitra.com/addr/og-logo.png` — WhatsApp / social preview image

**Why it's better**:
- The cert for `gatimitra.com` already exists (covers apex + www)
- No new DNS record, no separate certbot cron, no risk of orphan subdomain
- URL is shorter and more trustworthy in WhatsApp shares
- `pathPrefix: /addr` on the intent filter scopes App Link verification to
  only the address paths — marketing pages under `gatimitra.com/` still open
  normally in the browser

## Code paths (all in this repo)

- `apps/customer_app/app.config.js` — Android intent filter declares
  `host: "gatimitra.com", pathPrefix: "/addr"` with `autoVerify: true`.
- `apps/customer_app/app/+native-intent.ts` — rewrites `/addr/<code>?id=<token>`
  → `/address/save?id=<token>` (and the `gatimitra://addr/...` short form).
- `backend/src/lib/assetlinks.ts` + `backend/src/index.ts` — serves
  `GET /.well-known/assetlinks.json` from env-configured fingerprints.
- `infra/nginx/nginx.conf` — inside the existing `gatimitra.com` server block,
  two `location` blocks proxy `/.well-known/assetlinks.json` and `/addr/*` to
  the backend container; catch-all `/` still goes to cxsite.
- `backend/src/modules/addresses/address-share-page.ts` — Play Store fallback
  (with `referrer=addr_<token>`) when the app is not installed.

## Operational steps (VPS / EAS)

### 1. Backend env vars

Add on the VPS at `/opt/gatimitra/backend/.env`:

```env
ADDRESS_LINK_BASE_URL=https://gatimitra.com
ANDROID_APP_LINK_SHA256=<SHA-256 from Play Console — colon-separated hex>
ANDROID_APP_PACKAGE=com.gatimitra.customer
```

Fingerprint sources (list both, comma-separated, if you have separate upload
and app-signing keys):

```
Google Play Console → your app → Test and release → Setup → App integrity
  → App signing key certificate → SHA-256 certificate fingerprint
  → Upload key certificate       → SHA-256 certificate fingerprint
```

### 2. Redeploy backend + nginx

After pushing this repo, CI runs `backend-deploy` (recreates the backend
container) and `cxsite-deploy` (validates + reloads nginx with `nginx -t`).
No manual step needed on the VPS beyond confirming the deploys finished.

Verify:

```bash
curl -sS https://gatimitra.com/.well-known/assetlinks.json | head -5
# → JSON array with your package name and SHA-256, NOT 503

curl -sSI https://gatimitra.com/addr/og-logo.png | head -3
# → HTTP/2 200, content-type: image/png
```

### 3. Rebuild + ship the customer app

The intent filter change ships inside the app binary — a new EAS build + Play
release is required. On install, Android re-runs App Link verification against
`gatimitra.com/.well-known/assetlinks.json` (steps 1–2 must be live first).

## End-to-end verify (after Play release)

```bash
adb shell pm get-app-links com.gatimitra.customer      # gatimitra.com → verified
adb shell am start -a android.intent.action.VIEW \
  -d "https://gatimitra.com/addr/abc123?id=<token>"    # opens app → Save sheet
```

## Follow-up (not blocking)

True "install-then-continue" deferred deep linking needs the **Play Install
Referrer API** read on first launch (the landing page already forwards
`referrer=addr_<token>`). Requires a native module + reading the referrer into
`storePendingAddressShareToken` before `resumePendingAddressShare` runs.
