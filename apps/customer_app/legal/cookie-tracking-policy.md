# Cookie & Tracking Policy

**Effective Date:** 21 June 2026
**Last Updated:** 21 June 2026
**Version:** 1.0

> What cookies, SDKs, identifiers, and tracking technologies we use in the GatiMitra app and on gatimitra.com — and how to control them.

This Policy supplements our [Privacy Policy](./privacy-policy.md) and [DPDPA Compliance Notice](./dpdpa-compliance-notice.md).

## 1. Why a "cookie" policy in a mobile app?

Mobile apps don't use cookies the way websites do, but they use **equivalent technologies** — local storage, SDKs, device identifiers, push tokens, advertising IDs — that perform similar tracking and personalisation functions. Indian DPDPA 2023 + EU GDPR + Apple PrivacyInfo + Google Play Data Safety require disclosure of all of them.

## 2. Categories

### 2.1 Strictly necessary (always on)

Without these the app cannot function. No consent needed.

| Technology | Purpose | Identifier scope |
|---|---|---|
| Auth tokens | Keep you signed in | Per device |
| Session storage | Remember cart, draft orders | Per device |
| CSRF tokens | Prevent attacks | Per session |
| Crash recovery | Survive app restart | Per device |
| Push notification token (FCM / APNS) | Deliver order / ride updates | Per device |
| Device fingerprint (basic) | Detect fraud, account takeover | Hashed, per device |

### 2.2 Functional (defaults to on, you can disable)

| Technology | Purpose | Toggle |
|---|---|---|
| Recent searches | Suggest restaurants / addresses you've searched | `Settings → Privacy → Search history` |
| Saved addresses | Auto-fill | `Settings → Addresses` |
| Saved payment tokens | Faster checkout | `Settings → Payments` |
| Language preference | Render in your language | `Settings → Language` |

### 2.3 Analytics (off by default; opt-in)

| Technology | Purpose | Identifier scope |
|---|---|---|
| Aggregate event tracking | Understand which features are used | User ID + anonymised event |
| A/B testing | Improve UX | Cohort ID, no PII |
| Crash reporting (Sentry) | Diagnose app crashes | Anonymised stack, app version |

Toggle: `Settings → Privacy → Help improve GatiMitra`.

### 2.4 Advertising (off by default; opt-in only)

| Technology | Purpose | Identifier scope |
|---|---|---|
| Personalised promo notifications | Show you offers that match your service usage | Hashed user ID |
| Promo cohort targeting | Show city-relevant offers | City, not individual ID |

We do **not** sell data to advertisers and do not run third-party ad SDKs.

Toggle: `Settings → Privacy → Personalised offers`.

## 3. Apple App Tracking Transparency (ATT)

On iOS, no advertising-related tracking is performed unless you tap "Allow" in the ATT prompt. If you say "Ask App Not to Track":

- IDFA is never read.
- No SDK that cross-app tracks is initialised.
- Personalised offers continue *if* you enabled them in our in-app toggle — but use only our own pseudonymous user ID, not IDFA.

## 4. Google Play Data Safety disclosure

Each SDK and tracker is declared in our Play Store Data Safety Form. Snapshot:

| Data | Collected? | Shared? | Purpose |
|---|---|---|---|
| Name | Yes | No | Account |
| Email | Yes | No | Account, communication |
| Phone | Yes | With OTP provider | Auth |
| Approx. location | Yes | No | City service availability |
| Precise location | Yes | With driver during trip | Live tracking |
| Photos | Yes (you pick) | With our cloud (Cloudflare R2) for storage | Profile, refund evidence |
| Payment info | No (tokenised by Razorpay) | With Razorpay only | Payments |
| Device IDs | Yes | No | Fraud detection |
| Crash logs | Optional | With Sentry only if opted in | Diagnostics |
| Performance data | Optional | No | Diagnostics |

Full table at https://gatimitra.com/data-safety.

## 5. Third-party SDKs that handle data

| SDK | Category | Data |
|---|---|---|
| **Supabase** | Necessary | Auth tokens, DB access |
| **Razorpay** | Necessary | Tokenised card / UPI |
| **Firebase Cloud Messaging** | Necessary | Push token only |
| **Apple Push Notification Service** | Necessary | Push token only |
| **MSG91** (server-side) | Necessary | Mobile number for OTP |
| **Mapbox** | Functional | Coordinates during active session |
| **Sentry** | Analytics (opt-in) | Anonymous stack |
| **Cloudflare R2** | Necessary | Uploaded photos |

Each processor is contractually bound under DPDPA processor terms.

## 6. Website cookies (gatimitra.com)

When you visit our website (we have only marketing pages, no login flow on web today), the following cookies may be set:

| Cookie | Type | Lifetime | Purpose |
|---|---|---|---|
| `__cf_bm` | Strictly necessary | 30 min | Cloudflare bot management |
| `cf_clearance` | Strictly necessary | Session | Cloudflare WAF |
| `gm_lang` | Functional | 1 year | Site language |
| `gm_consent` | Necessary | 1 year | Records your consent choice |

We do not load Google Analytics, Meta Pixel, or any third-party ad tracker on the website. If we add them in the future, this Policy and the consent banner will be updated, and tracking starts only after you grant consent.

## 7. Do Not Track / Global Privacy Control

We honour the OS-level "Do Not Track" / Global Privacy Control signal: any opt-in analytics or personalised offers will not be enabled if your browser or device sends a "do not track" preference, even if you have not separately toggled it in our app.

## 8. Consent withdrawal

| Function | How |
|---|---|
| Analytics opt-out | `Settings → Privacy → Help improve GatiMitra → Off` |
| Personalised offers off | `Settings → Privacy → Personalised offers → Off` |
| Push notifications off | `Settings → Notifications` or OS settings |
| Crash reporting off | `Settings → Privacy → Crash reporting → Off` |
| Revoke all marketing | `Settings → Privacy → Receive promotional content → Off` |
| Delete account → all data gone | `Settings → Privacy → Delete account` (see [Data Deletion Policy](./data-deletion-policy.md)) |

## 9. Updates

Material additions (new SDK, new data category, new processor) trigger a re-consent banner. We never enable a new tracker silently.

## 10. Contact

| Concern | Channel |
|---|---|
| General privacy | privacy@gatimitra.com |
| DPDPA / data rights | dpo@gatimitra.com |
| Cookie / tracking question | privacy@gatimitra.com |
| Grievance escalation | grievance.officer@gatimitra.com |

---
**Owner:** Privacy & Engineering
