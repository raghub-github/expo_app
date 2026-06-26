# Play Store Compliance — GatiMitra Customer App

> Status: **Ready for production submission**
> Last reviewed: 2026-06-25
> Owner: raghubhunia53@gmail.com

This document captures the *exact* answers GatiMitra gives to Google Play
Console policy questions, and the URLs / code paths that back each
answer. Keep this in sync with `cxsite/lib/legal/registry.ts` and
`apps/customer_app/legal/*.md`.

---

## 1. App identity

| Field | Value |
|---|---|
| App name | GatiMitra |
| Package | com.gatimitra.customer |
| Category | Maps & Navigation (primary), Food & Drink (secondary) |
| Target audience | 18+ — India |
| Pricing | Free, with in-app digital + physical goods/services |
| Ads | None at launch |
| Contains in-app purchases | Yes (wallet top-ups, order payments via Razorpay) |

## 2. Data Safety form — exact answers

Mirror these on the Play Console “Data safety” page. Source of truth:
[`/privacy-policy`](https://gatimitra.com/privacy-policy) and
[`/data-retention-policy`](https://gatimitra.com/data-retention-policy).

### 2.1 Data we collect

| Data type | Why | Required? | Shared with 3rd party | Encrypted in transit | User can delete |
|---|---|---|---|---|---|
| Name | Account | Required | No | Yes | Yes |
| Phone (E.164) | OTP login, order updates | Required | SMS provider (MSG91) | Yes | Yes (anonymised on delete) |
| Email (optional) | Receipts, support | Optional | No | Yes | Yes |
| Approximate location | Service area gating, ETA | Required | No | Yes | Yes |
| Precise location | Live ride/delivery routing | Required (during active order) | Map provider (Mapbox) — coordinates only, no PII | Yes | Yes |
| Delivery / pickup address | Order fulfilment | Required | Assigned rider/merchant only | Yes | Yes |
| Payment info | Order checkout | Required | PCI-compliant gateway (Razorpay) — we never store full PAN | Yes | Tokenised; mandates revocable |
| Order history | Receipts, support, refund | Required | No | Yes | Retained per [data retention](https://gatimitra.com/data-retention-policy) |
| Device IDs (install ID, push token) | Push notifications, abuse detection | Required | Push provider (FCM) | Yes | Yes |
| Crash logs + diagnostics | Stability | Optional, in-app toggle | Sentry | Yes | Auto-purged 90d |

### 2.2 Data we do NOT collect

- Contacts list, SMS inbox, call log, photos, microphone, camera roll (camera is used only when the user explicitly attaches a delivery proof / KYC image, never silently).
- Biometric data.
- Advertising IDs (no ads SDK shipped).
- Web browsing history.

## 3. Required permissions — runtime justification

These are read off the customer app manifest. Each one is requested
**only at the moment it is needed**, with a foreground rationale shown
to the user.

| Android permission | Used for | Foreground only? |
|---|---|---|
| `ACCESS_COARSE_LOCATION` | Service availability check, store search | Yes |
| `ACCESS_FINE_LOCATION` | Live ride/courier tracking, delivery pin | Yes |
| `ACCESS_BACKGROUND_LOCATION` | NOT requested in customer app | n/a |
| `POST_NOTIFICATIONS` | Order updates, OTP, rider arrival | Yes |
| `CAMERA` | Delivery proof + ID photo uploads (explicit user action) | Yes |
| `READ_MEDIA_IMAGES` | Attach existing photo as delivery proof | Yes |
| `INTERNET` / `ACCESS_NETWORK_STATE` | All networked features | n/a |
| `RECEIVE_BOOT_COMPLETED` | NOT requested | n/a |

## 4. Account deletion — Play required

Google Play requires an in-app and a **web-discoverable** route to
account deletion. Both exist:

- **In-app**: Profile → Settings → Account → Delete my account
  (file: [`apps/customer_app/screens/settings/DeleteAccountScreen.tsx`])
- **Web (Play Console field)**: <https://gatimitra.com/delete-account-request>

Both flows call the same backend endpoint:

```
DELETE /v1/me/account
Authorization: Bearer <sessionToken>
X-Deletion-Source: app | web
```

(See [`backend/src/modules/me/me.routes.ts`].)

What gets deleted vs retained:

- **Deleted immediately**: `fullName`, `email`, `profileImageUrl`, all
  address fields, GPS coordinates, push token, support attachments.
- **Anonymised but retained**: order/transaction rows are kept under
  pseudonyms (`Deleted user`, `deleted-<id>@anonymised.invalid`) because
  we are obliged to keep transactional records:
  - **7 years** for financial records under RBI directions
  - **8 years** for tax invoices under GST law
  - As long as a refund / chargeback / open dispute exists.
- **Session invalidation**: `sessionsInvalidBefore = now()` is set on
  delete so any leftover JWT is immediately rejected by the gateway.

This is documented verbatim on
[`/account-deletion`](https://gatimitra.com/account-deletion) so the Play
reviewer can confirm without installing the app.

## 5. Health Connect / Sensitive scopes

Not used. The app does not request any restricted scope (SMS reader,
Call log, Accessibility Service, AppOps usage stats).

## 6. Financial Services & Real-Money Trading

GatiMitra does **not** offer:

- Personal loans
- Investment products
- Real-money gambling
- Cryptocurrencies

We DO accept payments for delivery and ride services via a licensed
Indian PA-PG (Razorpay). No Play Billing requirement — Play Billing is
only mandatory for *digital goods consumed inside the app*.

## 7. Privacy policy URL fields

Set these in Play Console:

| Field | URL |
|---|---|
| Privacy policy | https://gatimitra.com/privacy-policy |
| Account deletion | https://gatimitra.com/delete-account-request |
| Children’s privacy | https://gatimitra.com/childrens-privacy |
| Data safety detail | https://gatimitra.com/data-retention-policy |

These pages render the same Markdown source-of-truth used in-app
(`apps/customer_app/legal/*.md` → bundled at build time into the web
build via `cxsite/lib/legal/build-bundle.mjs`).

## 8. Indian regulatory compliance touchpoints

| Framework | Where addressed |
|---|---|
| DPDPA 2023 (notice, consent, rights, grievance, DPO) | [`/dpdpa-notice`](https://gatimitra.com/dpdpa-notice), [`/grievance-redressal`](https://gatimitra.com/grievance-redressal) |
| IT (Intermediary Guidelines) Rules 2021 | [`/grievance-redressal`](https://gatimitra.com/grievance-redressal), [`/content-policy`](https://gatimitra.com/content-policy) |
| MV Aggregator Guidelines 2020 | [`/safety`](https://gatimitra.com/safety), [`/surge-pricing`](https://gatimitra.com/surge-pricing), [`/fair-pricing`](https://gatimitra.com/fair-pricing) |
| Consumer Protection (E-Commerce) Rules 2020 | [`/refund-policy`](https://gatimitra.com/refund-policy), [`/grievance-redressal`](https://gatimitra.com/grievance-redressal) |
| RPwD Act 2016 | [`/accessibility`](https://gatimitra.com/accessibility) |
| RBI / NPCI payment retention | [`/data-retention-policy`](https://gatimitra.com/data-retention-policy) |

## 9. Test accounts for Play reviewer

Provide these in Play Console → App content → Login credentials:

```
Phone (E.164):   +91 99999 99999
OTP override:    123456
```

The bypass is implemented by `backend/src/modules/auth/reviewMode.ts`
and gated by three env vars (`GOOGLE_REVIEW_MODE=true`,
`GOOGLE_REVIEW_PHONE=+919999999999`, `GOOGLE_REVIEW_OTP=123456`). When
the flag is off, no phone receives this bypass and every login goes
through the normal MSG91 SMS path. Full design + threat model:
[docs/google-review-mode.md](./google-review-mode.md).

A demo wallet of ₹1000 plus 2 saved addresses and GMitra Plus
membership are seeded by `backend/scripts/seedGoogleReviewUser.ts` so
the reviewer can explore food / ride / courier / wallet flows
end-to-end.

## 10. Cross-references

- Reviewer-facing notes: [docs/PLAY_REVIEWER_NOTES.md](./PLAY_REVIEWER_NOTES.md)
- Legal pack contents: [cxsite/lib/legal/registry.ts](../cxsite/lib/legal/registry.ts)
- Backend deletion route: `backend/src/modules/me/me.routes.ts` (`DELETE /v1/me/account`)
- Web deletion flow: `cxsite/app/delete-account-request/`
