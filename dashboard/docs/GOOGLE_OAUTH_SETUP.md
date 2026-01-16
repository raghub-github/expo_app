# Google OAuth Setup Guide

This guide will help you configure Google OAuth login for the GatiMitra Dashboard.

## Prerequisites

- A Supabase project
- A Google Cloud Platform (GCP) account

## Step 1: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. If prompted, configure the OAuth consent screen:
   - Choose **External** (unless you have a Google Workspace)
   - Fill in the required information:
     - App name: GatiMitra Dashboard
     - User support email: your email
     - Developer contact: your email
   - Add scopes: `email`, `profile`, `openid`
   - Add test users (for development)
6. Create OAuth client ID:
   - Application type: **Web application**
   - Name: GatiMitra Dashboard
   - Authorized redirect URIs: Add the following:
     ```
     https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
     ```
     Replace `YOUR_PROJECT_REF` with your Supabase project reference
7. Copy the **Client ID** and **Client Secret**

## Step 2: Configure Supabase

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** > **Providers**
3. Find **Google** in the list and click on it
4. Enable the Google provider
5. Enter your Google OAuth credentials:
   - **Client ID (for OAuth)**: Paste your Google Client ID
   - **Client Secret (for OAuth)**: Paste your Google Client Secret
6. Click **Save**

## Step 3: Update Redirect URLs

1. In Supabase, go to **Authentication** > **URL Configuration**
2. Add your site URL(s):
   - For development: `http://localhost:3000`
   - For production: `https://yourdomain.com`
3. Add redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://yourdomain.com/auth/callback`

## Step 4: Test Google Login

1. Start your development server:
   ```bash
   cd dashboard
   npm run dev
   ```
2. Navigate to `http://localhost:3000/login`
3. Click the **"Sign in with Google"** button
4. You should be redirected to Google's OAuth consent screen
5. After authorizing, you'll be redirected back to the dashboard

## Troubleshooting

### "redirect_uri_mismatch" Error

- Ensure the redirect URI in Google Cloud Console matches exactly:
  `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
- Check that your Supabase project reference is correct

### "Invalid client" Error

- Verify your Google Client ID and Client Secret are correct in Supabase
- Make sure the OAuth consent screen is properly configured

### User Not Created in Database

- Google OAuth creates a user in Supabase Auth automatically
- You may need to create a corresponding entry in your `system_users` table
- Consider setting up a database trigger or webhook to sync users

### Session Not Persisting

- Check that cookies are enabled in your browser
- Verify the middleware is properly handling the OAuth callback
- Ensure your site URL is correctly configured in Supabase

## Additional Notes

- Google OAuth requires HTTPS in production
- For development, `localhost` is allowed
- Users logging in with Google will have their email and profile information automatically synced from their Google account
