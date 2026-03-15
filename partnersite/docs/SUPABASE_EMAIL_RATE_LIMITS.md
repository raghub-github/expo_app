# How to Increase Supabase Email OTP Rate Limits

## Understanding Supabase Email Rate Limits

Supabase enforces rate limits on email OTP (One-Time Password) requests to prevent spam and abuse. The default limits are:

- **Free Plan**: ~3-5 emails per hour per email address
- **Pro Plan**: Higher limits (varies)
- **Team/Enterprise Plans**: Custom limits

## Option 1: Increase Rate Limits in Supabase Dashboard

### Steps to Configure Rate Limits:

1. **Go to Supabase Dashboard**
   - Visit: https://supabase.com/dashboard
   - Select your project: `uoxkwznciiibubtiiffh`

2. **Navigate to Authentication Settings**
   - Go to: **Authentication** → **Settings** (or **Configuration**)
   - Look for **Rate Limits** or **Email Rate Limits** section

3. **Adjust Rate Limits** (if available on your plan)
   - Find **Email OTP Rate Limit** settings
   - Increase the limit per hour/day
   - **Note**: Free tier may not allow custom rate limits

4. **Save Changes**
   - Click **Save** or **Update**

### Alternative: Upgrade Your Plan

If you can't increase limits on your current plan:
- **Pro Plan** ($25/month): Higher rate limits
- **Team Plan** ($599/month): Custom rate limits
- **Enterprise Plan**: Unlimited or custom limits

## Option 2: Use Custom SMTP Provider (Recommended)

Using a custom SMTP provider bypasses Supabase's email rate limits and gives you full control.

### Steps to Configure Custom SMTP:

1. **Choose an SMTP Provider**
   - **SendGrid** (Free: 100 emails/day)
   - **Mailgun** (Free: 5,000 emails/month)
   - **AWS SES** (Pay-as-you-go, very cheap)
   - **Resend** (Free: 3,000 emails/month)
   - **Postmark** (Free: 100 emails/month)

2. **Get SMTP Credentials**
   - Sign up for your chosen provider
   - Get SMTP host, port, username, password

3. **Configure in Supabase Dashboard**
   - Go to: **Authentication** → **Settings** → **Email Templates**
   - Scroll to **SMTP Settings** or **Custom SMTP**
   - Enter your SMTP credentials:
     ```
     SMTP Host: smtp.sendgrid.net (or your provider's host)
     SMTP Port: 587 (or 465 for SSL)
     SMTP Username: your_username
     SMTP Password: your_password
     From Email: noreply@yourdomain.com
     From Name: Your App Name
     ```
   - **Enable** custom SMTP
   - **Save** changes

4. **Test Email Sending**
   - Try sending an OTP email
   - Check if it arrives successfully

### Recommended: Resend (Easy Setup)

**Resend** is developer-friendly and has good free tier:

1. Sign up at: https://resend.com
2. Verify your domain (or use their test domain)
3. Get API key
4. In Supabase Dashboard → Authentication → Settings:
   ```
   SMTP Host: smtp.resend.com
   SMTP Port: 587
   SMTP Username: resend
   SMTP Password: [Your Resend API Key]
   From Email: onboarding@resend.dev (or your verified domain)
   ```

## Option 3: Implement Client-Side Rate Limiting

Prevent hitting Supabase limits by adding client-side rate limiting:

### Current Implementation

The code already includes a 60-second cooldown timer. You can increase this:

**File**: `src/app/auth/register/page.tsx`

```typescript
// Increase cooldown to 5 minutes (300 seconds) to be safer
setResendCooldown(300); // Instead of 60
```

### Add Per-Email Rate Limiting

Store rate limit state per email address:

```typescript
const [emailRateLimits, setEmailRateLimits] = useState<Record<string, number>>({});

// Before sending OTP, check rate limit
const lastSent = emailRateLimits[email];
const now = Date.now();
const cooldownMs = 5 * 60 * 1000; // 5 minutes

if (lastSent && (now - lastSent) < cooldownMs) {
  const remaining = Math.ceil((cooldownMs - (now - lastSent)) / 1000);
  setError(`Please wait ${remaining} seconds before requesting another code for this email.`);
  return;
}

// After successful send
setEmailRateLimits(prev => ({ ...prev, [email]: now }));
```

## Option 4: Use Database to Track Rate Limits

Store rate limit data in your database:

1. Create a table to track OTP requests:
```sql
CREATE TABLE email_otp_rate_limits (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  last_request_at TIMESTAMP WITH TIME ZONE NOT NULL,
  request_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_email_otp_rate_limits_email ON email_otp_rate_limits(email);
```

2. Check rate limit before sending OTP in your API route
3. Update the table after each request

## Best Practices

1. **Use Custom SMTP** (Option 2) - Best long-term solution
2. **Increase client-side cooldown** - Prevents accidental spam
3. **Show clear error messages** - Users understand why they need to wait
4. **Monitor rate limit errors** - Track when limits are hit
5. **Consider alternative auth** - Phone OTP or magic links for some users

## Quick Fix: Increase Cooldown Timer

**Immediate solution** - Increase the cooldown from 60 seconds to 5 minutes:

**File**: `src/app/auth/register/page.tsx`

Find all instances of `setResendCooldown(60)` and change to `setResendCooldown(300)` (5 minutes).

This won't increase Supabase's limit, but it will prevent users from hitting it as quickly.

## Checking Your Current Supabase Plan

1. Go to: https://supabase.com/dashboard/project/uoxkwznciiibubtiiffh/settings/billing
2. Check your current plan
3. See rate limit details in **Usage** or **Limits** section

## Support

If you need help:
- **Supabase Support**: https://supabase.com/support
- **Supabase Discord**: https://discord.supabase.com
- **Supabase Docs**: https://supabase.com/docs/guides/auth
