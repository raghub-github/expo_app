# Address-Share Deep Link — `https://gatimitra.com/address/share/<token>`

Shared saved-address links use the existing apex domain `gatimitra.com`.
No subdomain. No third-party link provider.

## Why the browser used to open

Android App Links verification was failing because the Customer App
`autoVerify` intent-filter mixed `https://gatimitra.com/...` with custom
`gatimitra://` hosts in the **same** filter. Android then refuses to verify
the domain, so WhatsApp / Chrome / Gmail open the website instead of the app.

`https://gatimitra.com/address/share/<token>` was also not proxied by nginx,
so that path 404'd on the marketing site.

## Current flow

- **App installed (verified App Links):** tap → Customer App → Shared Address modal
- **App not installed:** tap → official Play Store listing
  `https://play.google.com/store/apps/details?id=com.gatimitra.customer`
- **Logged out:** app opens → token stored → login → Shared Address modal

## Code paths

- `apps/customer_app/app.config.js` — https-only `autoVerify` intent filters + iOS `applinks:gatimitra.com`
- `apps/customer_app/app/+native-intent.ts` — rewrites `/address/share/<token>` → `/address/save?id=`
- `infra/nginx/nginx.conf` — proxies `/.well-known/assetlinks.json`, AASA, `/address/share`, `/addr/`
- `backend/src/lib/assetlinks.ts` — Digital Asset Links + AASA
- `backend/src/lib/address-share.ts` — token URL builder + claim (never mutates sender)

## One remaining action

Ship a **new Customer App Play/EAS production build**. App Link intent filters
live in the APK; Android re-verifies `gatimitra.com` on install.

```bash
adb shell pm get-app-links com.gatimitra.customer
# gatimitra.com → verified

adb shell am start -a android.intent.action.VIEW \
  -d "https://gatimitra.com/address/share/<token>"
```

There is no iOS App Store listing in this repo. Universal Links entitlements
are declared; AASA is served only when `APPLE_TEAM_ID` is set on the backend.
