# Play Reviewer Notes — GatiMitra Customer App

Hi, reviewer! Here is everything you need to verify the app end-to-end
without installing additional tools. Anything you cannot reach from
inside the app is reachable from the public website.

---

## 1. Test login

| Field | Value |
|---|---|
| Country code | +91 |
| Phone | 99999 99999 |
| OTP | `123456` (no real SMS sent — phone is whitelisted via Google Review Mode) |

How the bypass works (for the curious reviewer): the backend has a
single, env-gated short-circuit that recognises this one phone number
and accepts the fixed 6-digit code above. No SMS provider is called,
and no other phone number is affected. The flag is removed after the
review is approved. Full design + security audit:
`docs/google-review-mode.md` in the repository.

## 2. Account deletion — web path (no install required)

URL: <https://gatimitra.com/delete-account-request>

Steps:
1. Enter `+91 99999 99999` and tap “Send OTP”.
2. Enter `123456`.
3. Confirm the deletion screen — it clearly lists what will be deleted
   and what is retained for tax / RBI compliance.
4. Account is soft-deleted, all PII is anonymised, and the session
   token is invalidated server-side.

After deletion, the same number can sign up again (a new customer
record is created). Note: the in-app deletion flow likewise accepts the
fixed OTP `123456` for this single test number.

## 3. Account deletion — in-app path

`Profile → Settings → Account → Delete my account`.

A confirmation modal explains identical retention rules. Same backend
endpoint as the web flow.

## 4. Required permissions — when they are asked

We *do not* request any permission at first launch. Each permission is
asked in-context with a short reason:

- **Approximate location** — asked the first time you tap “Find food
  near me” / “Book a ride”.
- **Precise location** — asked the moment a ride or delivery becomes
  active, so we can show the live map.
- **Notifications** — asked once on first launch of the home screen.
- **Camera** — only asked if you tap “Attach photo” inside a support
  ticket or delivery proof screen.

We do NOT request background location, contacts, SMS, call log,
microphone, or storage.

## 5. Where the data goes

- **MSG91** — receives the phone number to send a one-time SMS. No
  message body other than the OTP.
- **Razorpay** — receives the order amount + email/phone for the
  payment gateway. Card data never touches our servers.
- **Mapbox** — receives anonymous coordinates for routing only.
- **Sentry** — opt-in crash logs. Toggle in Settings → Privacy.
- **Supabase** — our managed Postgres provider (data residency: India).
- **No advertising or analytics SDK** is bundled.

## 6. Children

The app is rated 18+. Any account that self-identifies as a minor is
blocked at sign-up. See <https://gatimitra.com/childrens-privacy>.

## 7. Pricing transparency

Surge / dynamic pricing rules are publicly documented:

- <https://gatimitra.com/fair-pricing>
- <https://gatimitra.com/surge-pricing>

The app shows the user the *final* fare before payment, including
every surcharge, with a one-tap “Why is it this much?” explainer.

## 8. Grievance & DPDPA Officer

| Role | Contact |
|---|---|
| Grievance Officer | grievance@gatimitra.com — response within 24 hours, resolution within 15 days |
| Data Protection Officer | dpo@gatimitra.com |
| Nodal Officer (LEA) | nodal@gatimitra.com |
| Support | support@gatimitra.com |
| Phone | +91 80 1234 5678 |

## 9. Source of truth

| Asset | Location |
|---|---|
| Privacy policy text | `apps/customer_app/legal/privacy-policy.md` |
| Account deletion text | `apps/customer_app/legal/account-deletion.md` |
| Deletion backend route | `backend/src/modules/me/me.routes.ts → DELETE /v1/me/account` |
| Web deletion UI | `cxsite/app/delete-account-request/page.tsx` |
| In-app deletion UI | `apps/customer_app/screens/settings/DeleteAccountScreen.tsx` |

The same Markdown source is bundled into both the mobile app and
gatimitra.com so the user sees identical text whether they read in-app
or on the web.

— GatiMitra Trust & Safety Team
