# MSG91 + Supabase Auth for Phone OTP

This app uses **Supabase Auth** for phone OTP. Supabase does not ship with MSG91; you plug it in via a **Send SMS Hook** so that when a user requests phone OTP, Supabase calls your hook and you send the OTP using MSG91.

---

## 1. Flow

1. User enters mobile → app calls `supabase.auth.signInWithOtp({ phone: '+91...' })`.
2. Supabase generates an OTP token and invokes your **Send SMS** hook with `phone` and `token`.
3. Your hook calls **MSG91 API** to send the token (e.g. 6-digit code) to the phone.
4. User enters the code → app calls `supabase.auth.verifyOtp({ phone, token, type: 'sms' })` → Supabase validates and returns a session.

---

## 2. MSG91 account (when you’re ready)

1. Sign up at [msg91.com](https://msg91.com).
2. Get your **Auth Key** (and optionally a **Sender ID** and **OTP template**).
3. Use the **Send OTP** API:  
   [MSG91 OTP API](https://docs.msg91.com/p/tfYHtLk3k/send-otp)

Typical request:

- **Send OTP:** `GET/POST https://control.msg91.com/api/v5/otp?template_id=...&mobile=91XXXXXXXXXX&authkey=YOUR_AUTH_KEY`
- Or use the JSON API as per MSG91 docs.

Store the Auth Key (and template/sender if any) in Supabase Edge Function secrets or in your hook’s environment, **not** in the Next.js app (the hook runs on Supabase).

---

## 3. Supabase Send SMS Hook (Edge Function)

Supabase Auth can call a **webhook** when sending SMS. You implement that webhook so it sends the OTP via MSG91.

### 3.1 Create an Edge Function (Supabase project)

1. In your Supabase project: **Edge Functions** → Create a new function, e.g. `send-sms-msg91`.
2. The function receives the Auth hook payload (e.g. `phone`, `token`).
3. Inside the function, call MSG91’s Send OTP API with:
   - `mobile`: strip `+` and use the number (e.g. `91XXXXXXXXXX`)
   - `otp` / message body: the `token` Supabase passed you
4. Return a success response so Supabase considers the SMS sent.

Example (pseudo-code for the Edge Function):

```ts
// Supabase Edge Function: send-sms-msg91
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const MSG91_AUTH_KEY = Deno.env.get("MSG91_AUTH_KEY")!;

serve(async (req) => {
  const { phone, token } = await req.json();
  const mobile = phone.replace(/\D/g, ""); // e.g. 919876543210

  const res = await fetch(
    `https://control.msg91.com/api/v5/otp?mobile=${mobile}&otp=${token}&authkey=${MSG91_AUTH_KEY}`,
    { method: "GET" }
  );

  if (!res.ok) {
    return new Response(JSON.stringify({ error: "MSG91 failed" }), { status: 500 });
  }
  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

Adjust the URL and body to match MSG91’s current API (they may use a different endpoint or template_id). Set `MSG91_AUTH_KEY` in the Edge Function’s secrets.

### 3.2 Register the hook in Supabase

1. **Authentication** → **Hooks** (or **Auth Hooks**).
2. Add a **Send SMS** hook.
3. Hook URL: your Edge Function URL (e.g. `https://<project-ref>.supabase.co/functions/v1/send-sms-msg91`).
4. Supabase will send the request with the payload that includes `phone` and `token`; your function must send that token via MSG91 and return 200 on success.

Exact payload shape is in [Supabase Auth Hooks – Send SMS](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook).

---

## 4. Enable phone OTP in this app

After the hook is deployed and working:

1. **Registration (mobile OTP step):**  
   In `.env.local`:
   ```bash
   NEXT_PUBLIC_ENABLE_PHONE_OTP_REGISTER=true
   ```

2. **Login (mobile OTP):**  
   In `.env.local`:
   ```bash
   NEXT_PUBLIC_ENABLE_PHONE_OTP_LOGIN=true
   ```

3. Restart the Next.js dev server so the new env is picked up.

Until these are `true`, registration only **collects** the mobile number (no OTP), and login **hides** the mobile OTP option.

---

## 5. Summary

| Item | Where |
|------|--------|
| MSG91 credentials | MSG91 dashboard; store in Supabase Edge Function secrets |
| Send SMS logic | Supabase Edge Function that calls MSG91 API |
| Hook registration | Supabase Dashboard → Authentication → Hooks → Send SMS |
| Enable/disable phone OTP in app | `NEXT_PUBLIC_ENABLE_PHONE_OTP_REGISTER`, `NEXT_PUBLIC_ENABLE_PHONE_OTP_LOGIN` in `.env.local` |

No Twilio is required; the app is designed to use MSG91 via this hook once you have an account and the Edge Function is deployed.
