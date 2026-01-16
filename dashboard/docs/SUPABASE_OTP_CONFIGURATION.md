# Supabase OTP Configuration Guide

## Problem
When using email OTP login, users receive magic links instead of OTP codes.

## Solution
Configure Supabase Dashboard to send OTP codes instead of magic links.

## Steps to Configure

### 1. Access Supabase Dashboard
1. Go to your Supabase project dashboard: https://app.supabase.com
2. Select your project
3. Navigate to **Authentication** > **Email Templates**

### 2. Configure Magic Link Template
1. Find the **Magic Link** template
2. Click **Edit** or **Configure**
3. You have two options:

#### Option A: Use OTP Code Template (Recommended)
1. Look for **OTP** or **One-Time Password** template
2. If available, switch to using the OTP template instead of Magic Link
3. Or modify the Magic Link template to send OTP codes

#### Option B: Modify Magic Link Template
1. Edit the Magic Link email template
2. Replace the magic link with an OTP code display
3. Use the template variable `{{ .Token }}` or `{{ .OTP }}` to display the code
4. Example template:
   ```
   Your verification code is: {{ .Token }}
   
   This code will expire in 10 minutes.
   ```

### 3. Alternative: Use Custom SMTP (Advanced)
If you want full control over email content:
1. Go to **Settings** > **Auth** > **SMTP Settings**
2. Configure custom SMTP server
3. Create custom email templates that send OTP codes

### 4. Verify Configuration
1. Test the OTP flow by requesting an OTP
2. Check your email - you should receive a 6-digit code
3. If you still receive magic links, the template configuration needs adjustment

## Important Notes

- **Default Behavior**: Supabase sends magic links by default for email OTP
- **Template Variables**: Available variables depend on your Supabase version
- **Testing**: Always test in a development environment first
- **Email Delivery**: Ensure your email provider is configured correctly

## Troubleshooting

### Still Receiving Magic Links?
1. Clear browser cache and cookies
2. Check if email template changes were saved
3. Verify you're using the correct Supabase project
4. Check Supabase logs for email sending errors

### OTP Code Not Received?
1. Check spam/junk folder
2. Verify email address is correct
3. Check Supabase logs: **Logs** > **Auth Logs**
4. Verify SMTP/email service is configured

### Code Expires Too Quickly?
1. Check OTP expiration settings in **Authentication** > **Settings**
2. Default is usually 10 minutes
3. Adjust `OTP_EXPIRY` or similar settings if needed

### Receiving 8-Digit OTP Instead of 6-Digit?

**For Supabase Cloud (Hosted):**
1. Go to **Authentication** > **Settings** in Supabase Dashboard
2. Look for **OTP Length** or **OTP Configuration** settings
3. Set OTP length to **6 digits** (if available)
4. If the setting is not available in the dashboard, you may need to:
   - Contact Supabase support to configure this
   - Or use a custom email template that formats the OTP to show only 6 digits

**For Self-Hosted Supabase:**
1. Edit your `config.toml` file
2. Add or modify:
   ```toml
   [auth.email]
   otp_length = 6
   ```
3. Restart your Supabase instance

**Alternative: Custom Email Template (Works for both)**
1. Go to **Authentication** > **Email Templates** > **Magic Link** (or OTP template)
2. Edit the template to format the OTP code
3. Use template variables to display only 6 digits:
   ```
   Your verification code is: {{ substr .Token 0 6 }}
   
   This code will expire in 10 minutes.
   ```
   Or if using a different template system:
   ```
   Your verification code is: {{ .Token | truncate 6 }}
   ```

**Important:** The UI is configured to accept only 6 digits. If you receive an 8-digit code, you can:
- Enter only the first 6 digits (the input will automatically limit to 6)
- Or configure Supabase to send 6-digit codes as described above

## Reference Links

- [Supabase Email Templates Documentation](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase OTP Configuration](https://supabase.com/docs/guides/auth/auth-otp)
- [Supabase SMTP Configuration](https://supabase.com/docs/guides/auth/auth-smtp)

## Quick Fix (If Dashboard Configuration Doesn't Work)

If you cannot configure the template in the dashboard, you can:
1. Use a custom email service (SendGrid, AWS SES, etc.)
2. Implement server-side OTP generation and email sending
3. Use Supabase Edge Functions to customize the email sending process
