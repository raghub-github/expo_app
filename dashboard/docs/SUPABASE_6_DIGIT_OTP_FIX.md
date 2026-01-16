# Fix: Configure Supabase to Send 6-Digit OTP Codes

## Problem
Supabase is sending 8-digit OTP codes, but the UI only accepts 6 digits.

## Solution
Configure Supabase Dashboard to send 6-digit OTP codes.

## Quick Steps

### Step 1: Access Supabase Dashboard
1. Go to https://app.supabase.com
2. Select your project
3. Navigate to **Authentication** > **Settings**

### Step 2: Configure OTP Length
1. Look for **OTP Length** or **OTP Configuration** section
2. Set the OTP length to **6 digits**
3. Save the changes

**Note:** If this setting is not visible in the dashboard, proceed to Step 3.

### Step 3: Configure Email Template (Alternative Method)
If OTP length setting is not available:

1. Go to **Authentication** > **Email Templates**
2. Find the **Magic Link** or **OTP** template
3. Click **Edit**
4. Modify the template to format the OTP to 6 digits:

**Option A: Using Template Variables**
```
Your verification code is: {{ substr .Token 0 6 }}

This code will expire in 10 minutes.
```

**Option B: Using String Functions**
```
Your verification code is: {{ .Token | truncate 6 }}

This code will expire in 10 minutes.
```

**Option C: Custom Formatting**
If the above don't work, use JavaScript in the template:
```
Your verification code is: {{ .Token.substring(0, 6) }}

This code will expire in 10 minutes.
```

5. Save the template

### Step 4: For Self-Hosted Supabase
If you're self-hosting Supabase:

1. Edit your `config.toml` file
2. Add or modify:
   ```toml
   [auth.email]
   otp_length = 6
   ```
3. Restart your Supabase instance:
   ```bash
   supabase stop
   supabase start
   ```

## Verification

After configuration:
1. Request a new OTP code from the login page
2. Check your email
3. You should receive a 6-digit code
4. Enter it in the login form (which accepts exactly 6 digits)

## Troubleshooting

### Still Receiving 8-Digit Codes?
1. Clear browser cache
2. Wait a few minutes for changes to propagate
3. Request a new OTP code
4. Check Supabase logs: **Logs** > **Auth Logs**

### Template Variables Not Working?
1. Check Supabase documentation for your version
2. Try different template variable formats
3. Contact Supabase support if needed

### Need Help?
- Supabase Documentation: https://supabase.com/docs/guides/auth/auth-otp
- Supabase Community: https://github.com/supabase/supabase/discussions

## Important Notes

- The UI is **fixed at 6 digits** - it will only accept 6-digit codes
- If you receive an 8-digit code, you can temporarily use the first 6 digits (but this may fail verification)
- **Best solution:** Configure Supabase to send 6-digit codes as described above
