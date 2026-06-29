# Account Deletion & Closure Policy

**Effective Date:** 21 June 2026
**Last Updated:** 28 June 2026
**Version:** 2.0

> How to close your GatiMitra account, how the request is reviewed, what is deactivated, what we are legally required to retain, and why a closed account cannot be revived. Aligned with **Google Play Store policy** and the **Digital Personal Data Protection Act, 2023 (DPDPA)**.

## 1. How account deletion works (request → review → deactivation)

Account deletion at GatiMitra is **request-based and reviewed** — it is not an instant, automated wipe. This protects you against accidental or fraudulent closure and lets us settle any pending orders, rides, refunds or disputes first.

| Step | What happens | Where |
|---|---|---|
| **1. Raise a request** | Open the GatiMitra app → `Profile → Settings → Privacy → Delete my account`, choose a **reason**, and submit. This creates a deletion request (a support ticket). | Customer app |
| **2. Review** | Our team reviews the request — verifies it is really you, and checks for pending payments, active orders/rides, refunds-in-flight or legal holds. | GatiMitra (typically within 7 days) |
| **3. Deactivation** | Once reviewed, your account is **deactivated and closed**: login is blocked, services stop, marketing stops, and any auto-renewing membership is cancelled. | GatiMitra |

You do not need to call us or visit an office. If you cannot access the app, you can request closure by emailing **grievance@gatimitra.com** from your registered email or mobile, and we will run the same reviewed process.

## 2. This is a one-way, irreversible action

> **A closed account cannot be revived.** There is no "undo", no restore window, and no way to sign back into a closed account.

- Once your request is reviewed and the account is deactivated, the closure is **permanent**.
- Your order/ride history, wallet balance, saved data and GMitra Max benefits **cannot be recovered**.
- If you change your mind, you must **register a fresh account**. A new account starts empty — no history, no saved data, no wallet balance, and no membership benefits from the closed account.

If you are not certain, do not submit the request. Contact support first.

## 3. What is deactivated and stopped

| Action | Timing |
|---|---|
| Login blocked / account closed | On deactivation (after review) |
| Active rides cancelled at no charge to you | Before closure |
| Active orders completed or refunded | Before closure |
| GMitra Max / subscription auto-renewal cancelled | On deactivation |
| Email / SMS / push marketing stops | Within 24 hours of deactivation |
| Device push tokens, search/cart/wishlist, behavioural marketing profiles removed | Within 30 days |

## 4. What we retain after closure — and why it is NOT deleted

When an account is closed, we **do not erase your identity record, documents, or registered mobile number**. Indian law requires us to keep identity and transaction records for fixed periods. This retained data is **isolated** from active, user-facing systems — it is not used to serve you, profile you, or market to you.

| Data we retain | Retention period | Legal basis |
|---|---|---|
| Account record (name, registered mobile number) | For the longest applicable period below | DPDPA 2023 §8(7) + the laws below |
| KYC / identity documents (where collected) | 5 years post-closure | PMLA, RBI KYC Master Direction |
| GSTIN-related invoices | 6 years | CGST Act §36 |
| Order / ride / parcel transaction records | 8 years from the end of the relevant assessment year | Income Tax Act §44AA |
| Payment ledger entries | As required for reconciliation / RBI compliance | RBI |
| Records under a court order / notice u/s 91 CrPC | For as long as the legal hold persists | CrPC |
| Anti-money-laundering records | 5 years | PMLA §12(1)(e) |
| Cybersecurity / audit logs | 6 months | CERT-In Direction, 28 Apr 2022 |

**Why your phone number and documents stay:** they are tied to invoices, tax records, KYC obligations and dispute/fraud evidence. We are legally barred from deleting them early. They remain locked away and are **permanently purged once the retention period lapses**, per our [Data Retention Policy](./data-retention-policy.md).

## 5. What we purge promptly (no retention obligation)

These have no legal retention requirement and are removed within 30 days of deactivation:

- Profile photo and bio
- Saved delivery addresses
- Saved payment tokens (revoked at our PCI-DSS gateway)
- Search history, browsing history, cart and wishlist
- Device tokens (push notification IDs)
- Marketing/behavioural analytics tied to your user ID
- Contact-permission-derived data

## 6. Pending transactions pause the request

If, at review time, you have a pending payment, an open dispute, a refund-in-flight, an active order/ride, or a legal hold:

- The deletion request is **paused** until it is resolved.
- You are notified by email / SMS.
- Once cleared, the request proceeds to deactivation.

## 7. Wallet balance

| Balance | Treatment |
|---|---|
| Wallet > ₹100 | Refunded to your original payment method or bank account (UPI/IFSC captured during review) before closure |
| Wallet ≤ ₹100 | Donated to GatiMitra's empanelled NGO unless you raise a refund request |
| Cashback / promotional credits | Forfeited per the cashback terms |

## 8. Subscriptions

- **GMitra Max:** auto-renewal is cancelled on deactivation; no further charge. Benefits cease on closure.
- **Trial subscriptions:** ended immediately.

## 9. Re-registration

Because your registered mobile number is **retained** with your closed account for the legal periods in §4, that number cannot be used to open a new account while it is under retention. If you need to return to GatiMitra during this period, contact **grievance@gatimitra.com**. A closed account is never reopened — any new account is entirely separate, with no history, saved data, wallet balance or membership from the closed one.

## 10. Third-party processors

We instruct our processors (payment gateway Razorpay, push provider FCM/APNS, SMS provider MSG91, cloud R2 / Supabase) to delete eligible data per their contracts, generally within 30 days. Data they retain in backups follows their own published retention schedules and is outside our direct control.

## 11. Children's accounts

If a parent / guardian believes an account belongs to a person under 18 (ride services require 18+), they can request immediate closure at **safety@gatimitra.com**. We verify and act within 72 hours.

## 12. Posthumous closure

A legal heir / executor can request closure with a death certificate, succession certificate / will, and ID, at **legal@gatimitra.com**. Reviewed and processed within 30 days.

## 13. Audit & evidence

For Play Store, App Store and DPDPA audits we keep, for each request: timestamp, channel, the reason given, verification of the requester, scope of closure, retention exceptions invoked, and the final deactivation timestamp. These audit logs are retained 180 days.

## 14. Contact

| Channel | Address |
|---|---|
| In-app | `Profile → Settings → Privacy → Delete my account` |
| Email | privacy@gatimitra.com |
| DPO | dpo@gatimitra.com (DPDPA matters) |
| Grievance / escalation | grievance@gatimitra.com |

---
**Owner:** Privacy & Compliance
