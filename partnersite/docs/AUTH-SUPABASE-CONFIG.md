# Supabase Auth Configuration (Partner Dashboard)

Use these settings so **Sign in with Google** works on **partner.gatimitra.com** for all devices, new users, incognito, and fresh sessions.

## 1. Authentication → URL Configuration

### Site URL (critical)

- **Set to:** `https://partner.gatimitra.com` if this app is your primary one.
- **Do not use:** `http://localhost:3000` for production.
- The Site URL is the default redirect when one is not specified; it can affect cookie behavior.

### Redirect URLs

Add these **exact** URLs (one per line):

- `https://partner.gatimitra.com/api/auth/callback`
- `https://partner.gatimitra.com/auth/callback` (legacy / phone flows)
- `http://localhost:3002/api/auth/callback`
- `http://localhost:3002/auth/callback`

Add any other deployment URLs where this app runs (e.g. `https://your-app.example.com/api/auth/callback`).

Wildcards (if you use them):

- `https://partner.gatimitra.com/**`
- `http://localhost:3002/**`

**Note:** Google sign-in now uses `/api/auth/callback` for a server-side PKCE exchange (more reliable). Keep `/auth/callback` in the list for legacy flows.

### One Supabase project, multiple apps (one Site URL)

Supabase allows only **one Site URL** per project. If you have multiple apps (e.g. partner.gatimitra.com, gatimitra.com, another domain) using the same database:

- Set **Site URL** to `https://partner.gatimitra.com` (not localhost).
- For **all other apps**, the code passes an **explicit `redirectTo`** in `signInWithGoogle()` (production: `https://partner.gatimitra.com/api/auth/callback`), so the OAuth redirect target does **not** depend on Site URL once Redirect URLs are configured.
- Ensure **Redirect URLs** includes the callback URL for **each** app (e.g. `https://partner.gatimitra.com/api/auth/callback`, `https://gatimitra.com/auth/callback`).

## 2. Authentication → Providers → Google

- Enable Google.
- Use the same Client ID / Secret you use for the main dashboard if applicable, and ensure the **authorized redirect URI** in Google Cloud Console includes your Supabase project’s callback (Supabase docs show the exact URL).

## 3. After changing settings

- Click **Save** in Supabase.
- Have users do a **hard refresh** or use an **incognito window** when testing so old cookies/sessions don’t interfere.

## 4. If you still see 403 on resolve-session

- **401:** No or invalid session (cookies missing/expired). Check Site URL and that cookies are set on `partner.gatimitra.com`.
- **403 (MERCHANT_NOT_FOUND):** Session is valid but there is no `merchant_parents` row for this user (e.g. they haven’t registered as a merchant). The app will redirect to login with “No merchant account found. Please register first.”
