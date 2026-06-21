# Data Deletion & Account Closure Policy

**Effective Date:** 21 June 2026
**Last Updated:** 21 June 2026
**Version:** 1.0

> How to delete your GatiMitra account, what data we erase, what we are required to retain, and how long it takes. **Mandated by Google Play Store policy (May 2024)** and Section 12 of the Digital Personal Data Protection Act, 2023.

## 1. Two ways to delete your account

### 1.1 In-app (fastest, recommended)

`Profile → Settings → Privacy → Delete my account` → confirm with the OTP sent to your registered mobile.

### 1.2 Web (no app install needed)

https://gatimitra.com/account/delete — authenticate with phone OTP, follow the same flow.

You **do not** need to email us, call us, or visit any office to delete your account. Per Play Store policy.

## 2. What happens immediately on deletion request

| Action | Timing |
|---|---|
| Account disabled — login blocked | Instant |
| Active rides cancelled at no charge to you | Within 1 minute |
| Active orders allowed to complete or refunded | Within 30 minutes |
| Wallet balance refunded to original payment method | Within 7 working days |
| GMitra Max auto-renewal cancelled | Instant |
| Email / SMS / push marketing stops | Within 24 hours |

## 3. What we delete (within 30 days)

- Profile (name, email, photo)
- Saved addresses
- Saved payment methods (tokens already with our PCI-DSS-compliant gateway are revoked)
- Search history, browsing history
- Cart items
- Wishlist / favourites
- Device tokens (push notification IDs)
- Behavioural analytics events tied to your user ID
- Contact-permission-derived data
- Photos uploaded to your profile

## 4. What we anonymise (we keep, but it can no longer be linked to you)

| Data | Why kept |
|---|---|
| Order, ride, parcel transaction records | Tax (Income Tax Act §44AA), GST, accounting compliance — **8 years** |
| Payment ledger entries | RBI compliance + reconciliation — **10 years** |
| Driver / restaurant ratings you gave | Aggregate quality metric (no longer attributed to you) |
| Aggregated analytics (cohorts, city heatmaps) | Business operation; cannot be re-linked |
| Court orders / law-enforcement records | As long as the legal hold persists |

Per DPDPA 2023 §8(7), this data is treated as not constituting personal data once de-identified.

## 5. What we must retain (Indian law)

| Data | Retention period | Authority |
|---|---|---|
| KYC documents (where collected) | 5 years post-deletion | PMLA, RBI KYC Master Direction |
| GSTIN-related invoices | 6 years | CGST Act §36 |
| Income-tax-relevant transaction records | 8 years from end of relevant assessment year | IT Act §44AA |
| Records under specific court order / notice u/s 91 CrPC | Per the order | CrPC |
| Cybersecurity incident logs | 6 months | CERT-In Direction 28 Apr 2022 |
| Anti-money-laundering records | 5 years | PMLA §12(1)(e) |

If your data falls into one of these categories, we cannot delete it within 30 days — but we **anonymise** and **isolate** it from any active user-facing system.

## 6. What is shared with third parties

We notify our processors (payment gateway Razorpay, push provider FCM/APNS, SMS provider MSG91, cloud R2/Supabase) to delete your data per their contracts within 30 days. We do not have control over backups retained by these processors per their published policies.

## 7. Restore window

You have **15 days** after submitting a deletion request to undo it by signing back in with your mobile + OTP. After day 15 the deletion is irreversible.

## 8. Re-registration

You may create a new account with the same mobile number at any time after deletion is final. The new account will not have any history, saved data, wallet balance, or GMitra Max benefits from the deleted one.

## 9. Refund of wallet balance

| Balance | Treatment |
|---|---|
| Wallet ≤ ₹100 | Donated to GatiMitra's empanelled NGO unless you raise a refund request |
| Wallet > ₹100 | Refunded to original payment method or bank account (UPI/IFSC requested during deletion flow) |
| Cashback / promotional credits | Forfeited (terms of cashback) |

## 10. Subscription handling

- GMitra Max: cancelled immediately. No further charge. Benefits cease on the next billing date OR immediately if you request.
- Trial subscriptions: ended instantly.

## 11. Pending transactions

If you have a pending payment, dispute, refund-in-flight, or legal hold at the time of deletion:

- Deletion is **paused** until resolution.
- You are notified by email / SMS.
- Once cleared, deletion proceeds.

## 12. Children's accounts

If a parent / guardian determines that an account belongs to a person below 18 and the account was created for ride services (which require 18+), they can request immediate deletion at safety@gatimitra.com. We verify and act within 72 hours.

## 13. Posthumous deletion

Legal heir / executor can request deletion with: death certificate, succession certificate / will, and ID. Email legal@gatimitra.com. Processed within 30 days.

## 14. Audit & evidence

For Play Store, App Store, and DPDPA audits we maintain — for each deletion request — the timestamp, channel, identity proof of the requester, scope of deletion, retention exceptions invoked, and final completion timestamp. Logs retained 180 days.

## 15. Contact

| Channel | Address |
|---|---|
| In-app | Profile → Settings → Privacy → Delete my account |
| Web | https://gatimitra.com/account/delete |
| Email | privacy@gatimitra.com |
| DPO | dpo@gatimitra.com (DPDPA matters) |
| Grievance | grievance@gatimitra.com (escalation) |

---
**Owner:** Privacy & Compliance
