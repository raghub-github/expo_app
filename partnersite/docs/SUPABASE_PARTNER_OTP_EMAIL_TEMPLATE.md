# GatiMitra Partner — Premium OTP Email Template (Supabase)

Partner registration uses Supabase `signInWithOtp` → email OTP.

## Recommended: Send Email hook (auto premium template)

1. Deploy partnersite with SMTP env (`EMAIL_ID`, `EMAIL_APP_PASSWORD`, `SMTP_HOST=smtppro.zoho.com` for custom domain).
2. Supabase Dashboard → **Authentication** → **Hooks** → **Send Email** → Enable.
3. **HTTP URL:** `https://partner.gatimitra.com/api/auth/send-email`  
   Local dev (ngrok): `https://<ngrok>/api/auth/send-email`
4. Generate secret → add to partnersite `.env`:
   ```
   SUPABASE_SEND_EMAIL_HOOK_SECRET=v1,whsec_...
   ```
5. Save hook. Supabase will call our API; email uses `partner-auth-otp-email-template.ts` (signup copy, brand colors).

**Subject:** `Verify your GatiMitra Partner account`  
**Body:** Registration-first copy (not "Login Verification").

## Fallback: paste HTML in Dashboard

If hook is not enabled, paste manually:

1. **Authentication** → **Email Templates** → **Magic Link**
2. **Subject:** `Verify your GatiMitra Partner account`
3. **Body:** `SUPABASE_PARTNER_OTP_EMAIL_HTML` from  
   `partnersite/src/lib/email/partner-auth-otp-email-template.ts`

## Copy (registration)

| Field | Text |
|-------|------|
| Headline | Verify your business email |
| Body | Continue **creating your GatiMitra Partner account** |

## SMTP

Custom domain → **`smtppro.zoho.com`** — see `SUPABASE_ZOHO_SMTP_FIX.md`.
