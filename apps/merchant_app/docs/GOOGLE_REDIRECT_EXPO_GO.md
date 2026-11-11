# Merchant app — Google sign-in redirect

## Correct redirect (do this once)

Supabase → **Authentication** → **URL Configuration** → **Redirect URLs** — add **exactly**:

```
https://partner.gatimitra.com/auth/merchant-app-callback
```

Also keep Site URL as your partnersite or app home if needed; do **not** rely on `https://gatimitra.com` for merchant Google login.

The merchant app always sends this stable HTTPS callback (via `getMerchantGoogleOAuthRedirectTo()`).  
`WebBrowser.openAuthSessionAsync` captures it and finishes login **inside the app**.

## Why gatimitra.com appeared before

If `redirectTo` is **not** in the allow list (old Expo Go `exp://10.x.x.x:8081/--/auth/callback` changes with Wi‑Fi IP), Supabase falls back to **Site URL** → consumer site `gatimitra.com`. Closing that browser shows **Sign-in was cancelled**.

## Optional override

```env
EXPO_PUBLIC_GOOGLE_OAUTH_REDIRECT_URL=https://partner.gatimitra.com/auth/merchant-app-callback
```

## Partnersite route

`partnersite/src/app/auth/merchant-app-callback/page.tsx` is the landing page for that URL (and deep-links to `gatimitra-merchant://` as a backup).
