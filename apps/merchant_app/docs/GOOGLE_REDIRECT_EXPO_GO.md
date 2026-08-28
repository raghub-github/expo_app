# Fix: Redirected to gatimitra.com after Google login (Expo Go)

## Why it happens

Supabase sends you to its **Site URL** (e.g. `https://gatimitra.com`) when the redirect URL your app sends is **not** in the **Redirect URLs** allow list. The URL must match **exactly** (including the path).

## What to do (Expo Go)

1. In the **terminal** where the app is running, tap **Continue with Google** and note the log: `[Google OAuth] redirectTo: exp://... (Expo Go)`.
2. Open **Supabase** → **Authentication** → **URL Configuration** → **Redirect URLs**.
3. Ensure that **exact** URL is in the list (e.g. `exp://10.168.39.181:8081/--/auth/callback`). If not, click **Add URL**, paste it, and **Save**.
4. Try **Continue with Google** again. You should return to the app instead of gatimitra.com.

## If it still redirects to gatimitra.com

- Check the **terminal log** when you tap "Continue with Google". It prints `[Google OAuth] redirectTo: <url>`. That `<url>` must be **exactly** one of the entries in Supabase **Redirect URLs**.
- If you see a different URL (e.g. `exp://192.168.x.x:8081/...`), add that full URL to Supabase Redirect URLs as well. Note: that URL can change when your machine’s IP changes, so prefer adding the `https://auth.expo.io/...` URL above so the app uses it (the code uses the proxy URL when running in Expo Go).

## Development build (not Expo Go)

For a custom dev build, the app uses `gatimitra-merchant://auth/callback`. Ensure that URL is in Supabase Redirect URLs.
