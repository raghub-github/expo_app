# GatiMitra OTP Email Template (Gradient Branding)

Use this template in **Supabase Dashboard → Authentication → Email Templates** so that:
- **GatiMitra** appears with capital G and M and gradient color matching the logo.
- **OTP** text also uses the same gradient.

Brand gradient (logo colors): Emerald `#059669` → Mint `#34D399`.

---

## Steps

1. Go to [Supabase Dashboard](https://app.supabase.com) → your project → **Authentication** → **Email Templates**.
2. Open **Magic Link** (or the template used for OTP).
3. Set **Subject** to: `GatiMitra Login Verification` or `One-Time Password`.
4. Replace the **Message body** with the HTML below.

---

## HTML Template (copy-paste into Supabase)

```html
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <p style="margin: 0 0 16px; font-size: 14px; color: #6b7280;">From: GatiMitra &lt;support@gatimitra.com&gt;</p>
  
  <h1 style="margin: 0 0 24px; font-size: 22px; font-weight: 700; line-height: 1.3;">
    <span style="background: linear-gradient(135deg, #059669 0%, #10b981 50%, #34D399 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; color: #059669;">GatiMitra</span> Login Verification
  </h1>
  
  <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6;">
    Use the following One-Time Password (<span style="background: linear-gradient(135deg, #059669 0%, #34D399 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; color: #059669; font-weight: 700;">OTP</span>) to securely log in to your <span style="background: linear-gradient(135deg, #059669 0%, #34D399 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; color: #059669; font-weight: 600;">GatiMitra</span> account.
  </p>
  
  <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280;">Your 8-digit verification code:</p>
  <p style="margin: 0 0 24px; font-size: 28px; font-weight: 800; letter-spacing: 4px; font-variant-numeric: tabular-nums;">
    <span style="background: linear-gradient(135deg, #059669 0%, #10b981 50%, #34D399 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; color: #059669;">{{ .Token }}</span>
  </p>
  
  <p style="margin: 0 0 16px; font-size: 13px; color: #6b7280; line-height: 1.5;">
    This OTP is valid for a limited time. Please do not share this code with anyone for security reasons.
  </p>
  <p style="margin: 0 0 16px; font-size: 13px; color: #6b7280; line-height: 1.5;">
    If you did not attempt to log in, you can safely ignore this email. Your account will remain secure.
  </p>
  
  <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af;">
    <a href="https://gatimitra.com" style="color: #059669; text-decoration: none;">https://gatimitra.com</a>
  </p>
</div>
```

---

## 8-digit OTP

If your Supabase project sends a longer token, show only the first 8 digits in the email so it matches the login UI:

- Replace `{{ .Token }}` with the template equivalent of “first 8 characters”, e.g. `{{ substr .Token 0 8 }}` if your Supabase template engine supports it.
- If it only supports `{{ .Token }}`, keep it; the login page accepts 8 digits and Supabase validates the full token.

---

## Gradient fallback

Clients that don’t support gradient text will show the solid color `#059669` (emerald) because of `color: #059669` in the same spans. So “GatiMitra” and “OTP” will always be visible in brand color.

---

## Brand colors used

| Use        | Hex       |
|-----------|-----------|
| Emerald   | `#059669` |
| Emerald light | `#10b981` |
| Mint      | `#34D399` |

These match the GatiMitra logo gradient (emerald → mint).
