# Google Play Review Mode

> Audience: GatiMitra engineers + ops. Reviewers do not read this — they
> read [PLAY_REVIEWER_NOTES.md](./PLAY_REVIEWER_NOTES.md).

A reversible, env-gated path that lets the Google Play review team log in
to GatiMitra without a real SMS arriving on a phone they don't possess.

## Purpose

The Play review team installs the production APK on their own devices.
They cannot receive SMS on our test SIM. Without a way around the OTP
SMS, every review attempt fails and Play rejects the release for
"reviewers cannot evaluate the app".

Review Mode solves this for **one phone number, only when an env flag is
on**. Everything else — JWT, role, middleware, user table — stays
identical to a normal login.

## How it works

Two routes are involved: `POST /v1/auth/otp/request` and
`POST /v1/auth/otp/verify`.

```
                  ┌──────────────────────────────────────┐
                  │ POST /v1/auth/otp/request            │
                  │  body: { phoneE164 }                 │
                  └────────────┬─────────────────────────┘
                               │
                               ▼
                ┌───────────────────────────────┐
                │ reviewMode.isReviewLogin(phone)│
                │  - GOOGLE_REVIEW_MODE === true │
                │  - phone matches GOOGLE_REVIEW │
                │    _PHONE (trailing 10 digits) │
                │  - OTP env var is set          │
                └─────┬─────────────────────┬────┘
                      │ true                │ false
                      ▼                     ▼
        ┌───────────────────────┐  ┌─────────────────────────┐
        │ store OTP =            │  │ generate random OTP +   │
        │   GOOGLE_REVIEW_OTP    │  │ deliverViaMsg91()       │
        │ SKIP MSG91 entirely    │  │ (existing behaviour)    │
        │ log review event       │  │                         │
        └───────────┬───────────┘  └────────────┬────────────┘
                    │                            │
                    └──────────┬─────────────────┘
                               ▼
                ┌──────────────────────────────┐
                │ POST /v1/auth/otp/verify     │
                │  unchanged — compares stored │
                │  otp to submitted otp        │
                └──────────────────────────────┘
```

Key invariant: **the stored OTP for the review phone is the fixed value
from env, and the verify route compares it with `===`**. So if a wrong
OTP is submitted for the review phone, the existing `invalid_otp` reply
fires. The review path widens the door, it doesn't unlock it.

## Environment variables

| Var | Type | Default | Purpose |
|---|---|---|---|
| `GOOGLE_REVIEW_MODE` | boolean | `false` | Master kill switch. False → behaves exactly like today. |
| `GOOGLE_REVIEW_PHONE` | E.164 string | — | The single phone allowed to skip SMS. Matching is by trailing 10 digits, so `+919999999999`, `919999999999`, `9999999999` all resolve to the same identity. |
| `GOOGLE_REVIEW_OTP` | 4–8 digit string | — | The fixed code the reviewer enters. Stored in env only. |
| `GOOGLE_REVIEW_NAME` | string (seed only) | `Google Play Reviewer` | Display name written by the seed script. |
| `GOOGLE_REVIEW_EMAIL` | string (seed only) | `play-reviewer@gatimitra.com` | Stored on the customer row. |
| `GOOGLE_REVIEW_WALLET` | number (INR, seed only) | `1000` | Initial wallet balance for the seeded review user. |

If `GOOGLE_REVIEW_MODE` is true but either `GOOGLE_REVIEW_PHONE` or
`GOOGLE_REVIEW_OTP` is missing, `isReviewLogin()` returns false (safe
default: a misconfigured flag must not weaken auth).

## How to enable

1. Set the three env vars on the production backend:

   ```bash
   GOOGLE_REVIEW_MODE=true
   GOOGLE_REVIEW_PHONE=+919999999999
   GOOGLE_REVIEW_OTP=123456
   ```

2. Restart the backend (or trigger `docker compose up -d backend` on the
   VPS — the route only reads env at boot).

3. Run the seed script ONCE to provision the review user, addresses, and
   wallet:

   ```bash
   tsx backend/scripts/seedGoogleReviewUser.ts
   ```

   The script is idempotent — running it again only refreshes the
   wallet balance and full name; it never duplicates the customer or
   the demo addresses.

4. Smoke-test from a workstation:

   ```bash
   # request
   curl -X POST https://api.gatimitra.com/v1/auth/otp/request \
     -H "content-type: application/json" \
     -d '{"phoneE164":"+919999999999"}'

   # verify with the fixed OTP
   curl -X POST https://api.gatimitra.com/v1/auth/otp/verify \
     -H "content-type: application/json" \
     -d '{"requestId":"<id>","phoneE164":"+919999999999","otp":"123456","deviceId":"play-review","appType":"customer"}'
   ```

   Expected: a normal `accessToken` is returned — exactly the same shape
   as any real login.

## How to disable

Flip the flag, restart the backend:

```bash
GOOGLE_REVIEW_MODE=false
```

That is the complete kill switch. No code change. No DB migration. The
review user row stays (orders / wallet history are preserved) but the
review OTP is no longer accepted by the API.

## Security considerations

- **Credentials are server-only.** `GOOGLE_REVIEW_*` env vars are never
  returned in any API response, never read by the client, never written
  to the APK. Search the repo for `GOOGLE_REVIEW_` — every reference is
  in `backend/src` or `docs/`.
- **Logs mask the OTP.** `reviewMode.logReviewLogin()` logs only the
  trailing 4 digits of the phone, never the OTP. See
  `backend/src/modules/auth/reviewMode.test.ts` — the masking is unit-
  tested.
- **Misconfiguration fails closed.** If the flag is on but either the
  phone or OTP env var is missing/blank, `isReviewLogin()` returns false
  and the normal SMS path runs.
- **Single phone.** Only ONE phone is accepted, and matching is by
  trailing 10 digits — country code variations on either side are
  tolerated, but no wildcards.
- **JWT is normal.** The session token issued for the review phone is
  the exact same Supabase-compatible JWT as any customer. There is no
  "review" role, no elevated permissions, no middleware bypass.
- **Real customers unaffected.** Any phone that does not match
  `GOOGLE_REVIEW_PHONE` runs the existing MSG91 path with no
  modification.
- **Auditable.** Every review request and every verify outcome (success
  + failure) emits a structured `event: "google_review_login"` log line
  that Pino aggregation can alert on.

## Deployment steps (production)

1. Add the three env vars to the production secrets store
   (Doppler / GitHub Actions secrets, depending on infra stage):
   - `GOOGLE_REVIEW_MODE`
   - `GOOGLE_REVIEW_PHONE`
   - `GOOGLE_REVIEW_OTP`
2. Trigger the backend deploy. The `env.ts` parser will accept the new
   vars (they're optional with safe defaults).
3. SSH the VPS and seed the user:
   ```bash
   ssh root@<vps>
   cd /opt/gatimitra
   npx tsx backend/scripts/seedGoogleReviewUser.ts
   ```
4. Run the curl smoke test above to confirm a JWT is returned.
5. Submit the new build to Play Console. Paste the credentials into the
   "Login credentials" field (see [PLAY_REVIEWER_NOTES.md](./PLAY_REVIEWER_NOTES.md)).

## Removal process (after Play approval)

Once the build is approved and live:

1. Set `GOOGLE_REVIEW_MODE=false` in production env. Redeploy backend.
2. (Optional) Soft-delete the review user — same flow as any real user
   via `DELETE /v1/me/account` using the review JWT.
3. (Optional) Remove the env vars entirely on the next release cycle.
   The code path becomes dead and can stay — re-enabling for a future
   submission is just three env vars.

Leaving the code in place is intentional: each Play release cycle, we
flip the flag for the duration of review and back off afterwards.

## File map

| Concern | File |
|---|---|
| Env schema | `backend/src/config/env.ts` — `GOOGLE_REVIEW_*` block |
| Isolated helper | `backend/src/modules/auth/reviewMode.ts` |
| Hook in `/otp/request` | `backend/src/modules/auth/auth.routes.ts` — `if (reviewMode.isReviewLogin(...))` |
| Verify-time logging | same file, around the existing `entry.otp !== otp` check |
| Seed | `backend/scripts/seedGoogleReviewUser.ts` |
| Tests | `backend/src/modules/auth/reviewMode.test.ts` |
| Reviewer-facing notes | `docs/PLAY_REVIEWER_NOTES.md` |
| Play Console compliance | `docs/PLAY_STORE_COMPLIANCE.md` |
