# Address-Share Deep Link — Runbook (`link.gatimitra.com/addr/...`)

Fixes the production blocker where the shared-address link opened a browser and
showed `DNS_PROBE_FINISHED_NXDOMAIN`.

## Break chain (root causes)

1. **DNS** — `link.gatimitra.com` had **no** A record (NXDOMAIN). `gatimitra.com`
   resolves to the VPS; the `link` host did not.
2. **nginx** — no `server` block for `link.gatimitra.com`; requests fell through
   to the `default_server` (cxsite marketing site), which serves neither
   `/addr/...` nor `/.well-known/assetlinks.json`.
3. **assetlinks.json** — never served, so Android could not verify the App Link
   → browser/chooser instead of opening the app.
4. **In-app routing** — the App Link path is `/addr/<shortCode>` but the only
   Expo Router route is `/address/save`. Even a verified link opened the app to
   the "unmatched route" screen.

## Code/config changes (in this repo — deploy via normal pipelines)

- `apps/customer_app/app/+native-intent.ts` — rewrites `/addr/<code>?id=<token>`
  → `/address/save?id=<token>` (and the `gatimitra://addr/...` short form).
- `backend/src/lib/assetlinks.ts` + `backend/src/index.ts` — serves
  `GET /.well-known/assetlinks.json` from env-configured fingerprints.
- `infra/nginx/nginx.conf` — `link.gatimitra.com` server block → backend.
- `backend/src/modules/addresses/address-share-page.ts` — Play Store fallback
  (with `referrer=addr_<token>`) when the app is not installed.

## Operational steps (must be done ON the VPS / DNS provider / EAS — cannot be

## done from the repo)

### 1. DNS

Add an A record at the DNS provider:

```
link.gatimitra.com.  A  <same IP as api.gatimitra.com>   # currently 187.77.184.108
```

Verify: `dig +short link.gatimitra.com` returns the VPS IP.

### 2. TLS cert (on the VPS)

```
certbot certonly --webroot -w /var/www/certbot -d link.gatimitra.com
```

Must produce `/etc/letsencrypt/live/link.gatimitra.com/fullchain.pem`. Without
it `nginx -t` fails and the reload is skipped.

### 3. assetlinks fingerprints (backend env)

Get the SHA-256 signing fingerprint(s):

```
cd apps/customer_app && eas credentials      # Android → view the signing cert
# or Google Play Console → Test and release → App integrity → App signing
```

Set on the backend (both the Play "app signing" AND "upload" certs, comma-sep):

```
ANDROID_APP_LINK_SHA256="AA:BB:...:64hex,11:22:...:64hex"
# ANDROID_APP_PACKAGE defaults to com.gatimitra.customer
```

Redeploy backend. Verify:

```
curl https://link.gatimitra.com/.well-known/assetlinks.json   # 200 JSON, not 503
```

### 4. Rebuild + ship the app

The intent filter (`link.gatimitra.com`, `autoVerify: true`) and
`+native-intent.ts` ship inside the app binary — a new EAS build + Play release
is required. On install Android re-runs App Link verification against
assetlinks.json (steps 1–3 must be live first).

## Verify end-to-end

```
adb shell pm get-app-links com.gatimitra.customer      # link.gatimitra.com → verified
adb shell am start -a android.intent.action.VIEW \
  -d "https://link.gatimitra.com/addr/abc123?id=<token>"   # opens app → Save sheet
```

## Follow-up (not blocking)

True "install-then-continue" deferred deep linking needs the **Play Install
Referrer API** read on first launch (the landing page already forwards
`referrer=addr_<token>`). Requires a native module + reading the referrer into
`storePendingAddressShareToken` before `resumePendingAddressShare` runs.
