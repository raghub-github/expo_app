# Fix: "Error sending confirmation email" / "Error sending magic link email" with Zoho SMTP

You're using **support@gatimitra.com** (custom domain). For custom-domain addresses, Zoho requires a **different SMTP server**. Using `smtp.zoho.com` or `smtp.zoho.in` with a custom-domain sender often causes "Error sending confirmation email" / "Error sending magic link email".

## 1. Use the correct SMTP host (most likely fix)

| Account type | Region | SMTP host | Port |
|--------------|--------|-----------|------|
| @zohomail.com (personal/free) | Global | smtp.zoho.com | 465 or 587 |
| @zohomail.com | India | smtp.zoho.in | 465 or 587 |
| **Custom domain (e.g. @gatimitra.com)** | **Global** | **smtppro.zoho.com** | 465 or 587 |
| **Custom domain (e.g. @gatimitra.com)** | **India** | **smtppro.zoho.in** | 465 or 587 |

**Action:** In Supabase → Authentication → Email → SMTP:

- If your Zoho account is **India** (zoho.in): set **Host** to **`smtppro.zoho.in`** (not smtp.zoho.in).
- If your Zoho account is **Global** (zoho.com): set **Host** to **`smtppro.zoho.com`** (not smtp.zoho.com).
- Use **Port 465** (SSL) or **587** (TLS). Try 587 if 465 fails.
- Click **Save changes**

## 2. Use an Application-specific password (if 2FA is on)

If Two-Factor Authentication is enabled on your Zoho account, the normal password will not work for SMTP.

1. Go to: https://accounts.zoho.com/home#security/application-specific-passwords  
   (or Zoho Mail → Settings → Security → Application-Specific Passwords)
2. Click **Generate New Password**
3. Name it (e.g. "Supabase" or "GatiMitra")
4. Copy the **16-character password** (it won’t show again)
5. In Supabase SMTP settings, use this as the **Password** (not your Zoho login password)
6. Username stays: **support@gatimitra.com**

## 3. Verify sender mailbox

- The **Sender email** in Supabase must be a real mailbox (or alias) in Zoho for **support@gatimitra.com**.
- Log in to Zoho Mail and confirm you can send from support@gatimitra.com.
- If support@ is an alias, use the main account’s password (or app password) that owns that alias.

## 4. Try port 587 if 465 fails

Some environments work better with TLS on 587:

- **Host:** smtppro.zoho.com  
- **Port:** **587**  
- Save and test again.

## 5. Checklist in Supabase

In Supabase → Authentication → Email:

- [ ] **Host:** `smtppro.zoho.com` (for @gatimitra.com)
- [ ] **Port:** 465 or 587
- [ ] **Username:** support@gatimitra.com (full email)
- [ ] **Password:** Zoho app-specific password if 2FA is on, else account password
- [ ] **Sender email:** support@gatimitra.com
- [ ] **Sender name:** gatimitra (or your preferred name)
- [ ] **Save changes** and test "Send test email" if available

## 6. After changing settings

1. Save in Supabase.
2. Wait 1–2 minutes.
3. Try parent registration again and request a new OTP.
4. Check spam/junk for the recipient address.

## 7. If it still fails

- Check Supabase **Logs** (Dashboard → Logs → Auth) for the exact SMTP error.
- In Zoho: ensure no security rule or IP restriction is blocking Supabase’s servers.
- Confirm the Zoho account for support@gatimitra.com is active and not suspended.

## Quick reference

**Global (zoho.com):**
```
Host:     smtppro.zoho.com
Port:     465 (SSL) or 587 (TLS)
Username: support@gatimitra.com
Password: [App-specific password if 2FA enabled]
```

**India (zoho.in):**
```
Host:     smtppro.zoho.in
Port:     465 (SSL) or 587 (TLS)
Username: support@gatimitra.com
Password: [App-specific password if 2FA enabled]
```

**Do not use** `smtp.zoho.com` or `smtp.zoho.in` for custom-domain senders—use **smtppro**.
