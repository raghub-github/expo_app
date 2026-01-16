# OAuth Callback Troubleshooting - Missing Code Parameter

## Problem
The callback handler receives the request but the `code` query parameter is missing. This means Supabase isn't redirecting with the authorization code.

## Root Cause
This happens when the redirect URL in Supabase's configuration doesn't match what your app is using.

## Solution: Check Supabase URL Configuration

### Step 1: Go to Supabase Dashboard
1. Open your Supabase project dashboard
2. Navigate to **Authentication** → **URL Configuration**

### Step 2: Verify Site URL
Make sure **Site URL** is set to:
```
http://localhost:3000
```

### Step 3: Add Redirect URLs
In the **Redirect URLs** section, add EXACTLY this URL:
```
http://localhost:3000/auth/callback
```

**IMPORTANT**: 
- Use `http://` (not `https://`) for localhost
- Include the port `:3000`
- The path must be exactly `/auth/callback`
- **DO NOT** include query parameters in the redirect URL (Supabase doesn't allow them)
- The redirect destination is handled via sessionStorage in the client

### Step 4: Verify Google OAuth Provider
1. Go to **Authentication** → **Providers**
2. Click on **Google**
3. Make sure it's **Enabled**
4. Verify **Client ID** and **Client Secret** are set correctly

### Step 5: Check Google Cloud Console
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Find your OAuth 2.0 Client ID
4. Verify **Authorized redirect URIs** includes:
   ```
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```
   (Replace `YOUR_PROJECT_REF` with your actual Supabase project reference)

## Testing

After updating the configuration:

1. **Restart your dev server**
2. **Clear browser cookies** for localhost:3000
3. **Try logging in again**
4. **Check the terminal logs** - you should now see:
   ```
   [callback] Code: present
   ```

## Expected Flow

1. User clicks "Sign in with Google"
2. Redirects to Supabase OAuth endpoint
3. Supabase redirects to Google
4. User authorizes on Google
5. Google redirects back to Supabase
6. **Supabase processes and redirects to YOUR callback WITH code parameter**
7. Your callback exchanges code for session
8. User is redirected to dashboard

## If Still Not Working

Check the browser's Network tab:
1. Open DevTools → Network tab
2. Try logging in
3. Look for the request to `/auth/callback`
4. Check the **Request URL** - does it have a `code` parameter?
5. If not, Supabase isn't redirecting properly - check the redirect URL configuration again

## Common Mistakes

❌ **Wrong**: `https://localhost:3000/auth/callback` (using https)
✅ **Correct**: `http://localhost:3000/auth/callback`

❌ **Wrong**: `localhost:3000/auth/callback` (missing protocol)
✅ **Correct**: `http://localhost:3000/auth/callback`

❌ **Wrong**: `http://localhost/auth/callback` (missing port)
✅ **Correct**: `http://localhost:3000/auth/callback`

❌ **Wrong**: `http://127.0.0.1:3000/auth/callback` (using IP instead of localhost)
✅ **Correct**: `http://localhost:3000/auth/callback`
