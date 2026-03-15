# Netlify Deployment Guide

## Issue
Build failed with error: "Supabase environment variables are missing"

## Solution

### Step 1: Add Environment Variables to Netlify

1. Go to [Netlify Dashboard](https://app.netlify.com/)
2. Select your project
3. Navigate to: **Site configuration** → **Environment variables**
4. Click **Add a variable** or **Add environment variables**

### Step 2: Required Environment Variables

Add ALL of the following variables (copy values from `.env.local`):

#### Critical (Build will fail without these):
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

#### Additional (Required for full functionality):
```
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
MAPBOX_PUBLIC_TOKEN
NEXT_PUBLIC_MAPBOX_TOKEN
R2_TOKEN_VALUE
R2_BUCKET_NAME
R2_ACCESS_KEY
R2_SECRET_KEY
R2_REGION
R2_ENDPOINT
R2_ACCOUNT_ID
R2_PUBLIC_BASE_URL
NEXT_PUBLIC_R2_PUBLIC_BASE_URL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXTAUTH_URL
NEXTAUTH_SECRET
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
```

#### Auth redirect (Google login on production):
- **`NEXT_PUBLIC_APP_URL`**: Set to your production site URL (e.g. `https://your-app.netlify.app`). This ensures after Google sign-in the user is redirected back to your deployed site, not localhost. Leave unset for local dev.

#### Optional – store location step:
- **`NEXT_PUBLIC_DISABLE_CURRENT_LOCATION`**: Set to `true` to hide the “Use current location” button on the store address step (avoids unreliable browser/IP geolocation; users can still use address search).

#### Important Notes:
- For `NEXTAUTH_URL`: Use your Netlify domain (e.g., `https://your-app.netlify.app`)
- For `NEXTAUTH_SECRET`: Generate a new secure secret for production (not the dev one)
  ```bash
  # Generate a secure secret:
  openssl rand -base64 32
  ```

### Step 3: Deploy

After adding environment variables:
1. Go to **Deploys** tab
2. Click **Trigger deploy**
3. Select **Deploy site**

Or push a new commit to trigger automatic deployment.

## Quick Reference: Environment Variables from .env.local

Here's a checklist of all variables you need to add:

- [ ] NEXT_PUBLIC_SUPABASE_URL
- [ ] NEXT_PUBLIC_SUPABASE_ANON_KEY
- [ ] SUPABASE_SERVICE_ROLE_KEY
- [ ] DATABASE_URL
- [ ] MAPBOX_PUBLIC_TOKEN
- [ ] NEXT_PUBLIC_MAPBOX_TOKEN
- [ ] R2_TOKEN_VALUE
- [ ] R2_BUCKET_NAME
- [ ] R2_ACCESS_KEY
- [ ] R2_SECRET_KEY
- [ ] R2_REGION
- [ ] R2_ENDPOINT
- [ ] R2_ACCOUNT_ID
- [ ] R2_PUBLIC_BASE_URL
- [ ] NEXT_PUBLIC_R2_PUBLIC_BASE_URL
- [ ] GOOGLE_CLIENT_ID
- [ ] GOOGLE_CLIENT_SECRET
- [ ] NEXT_PUBLIC_APP_URL (production site URL, e.g. https://your-app.netlify.app — for Google login redirect)
- [ ] NEXTAUTH_URL (update for production)
- [ ] NEXTAUTH_SECRET (generate new for production)
- [ ] RAZORPAY_KEY_ID
- [ ] RAZORPAY_KEY_SECRET
- [ ] RAZORPAY_WEBHOOK_SECRET

## Razorpay webhook (payment auto-success)

To handle payments even when the user closes the tab or refreshes after paying:

1. In **Razorpay Dashboard** → **Settings** → **Webhooks**, add your webhook URL:  
   `https://your-production-domain.com/api/webhooks/razorpay`
2. Subscribe to events: **payment.captured**, **payment.failed**.
3. Copy the **Webhook Secret** and set it as `RAZORPAY_WEBHOOK_SECRET` in Netlify (and redeploy).

The app will then mark onboarding and subscription payments as successful when Razorpay sends `payment.captured`, and the UI will show the update when the user returns or when polling detects it.

## Google login redirecting to localhost or 403 resolve-session in production

If after Google sign-in users are sent to `http://localhost:3000`, or if `GET /api/auth/resolve-session` returns 403:

1. **Set `NEXT_PUBLIC_APP_URL`** (and redeploy) to your production URL, e.g. `https://partner.gatimitra.com` or your Netlify URL.
2. **Supabase Dashboard** → Authentication → URL Configuration:
   - **Site URL**: Set to your primary app URL (e.g. `https://partner.gatimitra.com`). Do **not** use localhost for production.
   - **Redirect URLs**: Must include your production callback and localhost (e.g. `https://partner.gatimitra.com/auth/callback`, `http://localhost:3000/auth/callback`).
   - For full auth setup and multiple apps on one project, see **`docs/AUTH-SUPABASE-CONFIG.md`**.

## Troubleshooting

If the build still fails:
1. Check that all environment variables are properly set
2. Ensure there are no typos in variable names
3. Make sure variable values don't have extra spaces
4. Check Netlify build logs for specific errors
5. Try clearing cache and retrying: **Deploys** → **Trigger deploy** → **Clear cache and deploy site**
