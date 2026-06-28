# Data Retention Policy

**Effective Date:** 21 June 2026
**Last Updated:** 21 June 2026
**Version:** 1.0

> Exactly how long we keep your data, why, and what happens when retention ends.

This Policy details retention periods for every category of personal data we hold. It operates with the [Privacy Policy](./privacy-policy.md), the [DPDPA 2023 Notice](./dpdpa-notice.md) and the [Account Deletion Policy](./data-deletion-policy.md).

The default rule is simple: **we keep personal data only as long as we need it for the purpose it was collected for, or as long as Indian law requires it.** Then we delete or anonymise.

---

## 1. Retention by data category

| Category | Retention | Reason |
|---|---|---|
| Account profile (name, email, phone, photo) | Until you delete the account + 30 days grace period | User control; grace period covers accidental deletion |
| Address book | Same as account; addresses you remove are purged within 24 hours | User control |
| Order / ride / parcel transactional records | **8 years** | GST audit obligation under CGST Act, 2017 §36 |
| Wallet, recharges, refunds, ledger entries | **7 years** | RBI master directions on payment-system operators |
| Tax invoices, GST returns input | **8 years** | CGST Act §36 |
| KYC documents (where collected) | **8 years** from end of relationship | PMLA, 2002 + RBI KYC Master Direction |
| Driver / rider verification records | **8 years** from end of engagement | MV Aggregator Guidelines 2020 + RTO requirements |
| Customer complaints + resolution trail | **3 years** | IT Rules 2021 §3(2) and Consumer Protection Act, 2019 |
| Grievance officer correspondence | **3 years** | IT Rules 2021 |
| Chat transcripts (customer ↔ support) | **18 months** | Quality, dispute resolution; auto-purged after |
| Push notification tokens (FCM, APNS) | Until logout / token rotation | Operational |
| Crash logs (Sentry — opt-in) | **90 days** rolling | Stability investigation only |
| Server access logs (IP, route, response code) | **180 days** | Security investigations; CERT-In Direction 28 Apr 2022 §III |
| Marketing engagement (opens, clicks) | **24 months** if you have opt-in; deleted on opt-out | Personalisation; consent-based |
| Search history inside the app | **6 months** | Personalisation |
| Ride telemetry (GPS breadcrumbs) | **90 days** rolling for sampled audit; 24 hours for non-audited rides | Safety, dispute resolution |
| Photos / files you upload (delivery proof, receipts) | Same as the parent order — 8 years | Tax + dispute resolution |
| Cookies and analytics | See [Cookies & Tracking Policy](./cookie-tracking-policy.md) | Consent-based |

## 2. What "anonymised" means

When retention triggers anonymisation rather than deletion, we permanently and irreversibly:

- Replace `full_name` with `Deleted user`
- Replace `email` with `deleted-<id>@anonymised.invalid`
- NULL the photo URL, all address fields, GPS coordinates
- Replace `primary_mobile` with a one-way hash plus the last 4 digits
- Strip the user_id link from operational tables — the rows survive for tax / audit but cannot be tied back to you

After anonymisation, the records are no longer "personal data" under DPDPA §2(t) and the retention clock continues to run on the now-anonymous record purely for tax and audit purposes.

## 3. What triggers deletion or anonymisation

Any of:

- **You delete your account** — see [Account Deletion Policy](./data-deletion-policy.md). PII is anonymised immediately; the legal-retention clock continues on the anonymised records.
- **Inactivity** — if your account has had no logins, transactions or sessions for **24 months**, we notify by email + SMS; if no response within 30 days, the account is moved to "dormant" and PII is anonymised. Tax records remain.
- **Court order or legal direction** — we comply with valid orders. We notify you unless legally barred.
- **DPDPA §12 erasure request** — we honour it within 30 days unless a longer retention basis applies; we tell you which records survive and why.

## 4. Special retention exceptions

We hold data **longer** than the schedule above when:

- An active dispute, refund, chargeback or investigation is open
- A legal notice, summons, court order or regulatory enquiry references your account
- Your account is under suspension pending fraud investigation
- A tax / audit period is ongoing and unresolved

Once the trigger ends, the standard retention period resumes.

## 5. How to request early deletion

You may request erasure at any time under DPDPA §12. The flow:

1. In-app: `Profile → Settings → Account → Delete my account`, or
2. Web: <https://gatimitra.com/delete-account-request>, or
3. Email: privacy@gatimitra.com

We acknowledge within 24 hours and complete the deletion within 30 days. Records we cannot delete (legal retention) are listed in our confirmation reply, with the date when each can be erased.

Detailed deletion flow: [Account Deletion Policy](./data-deletion-policy.md).

## 6. How to request a data export (portability)

DPDPA does not yet codify a portability right, but we provide one voluntarily.

`Profile → Settings → Privacy → Download my data` exports a single ZIP containing:

- Your profile JSON
- All orders / rides / parcels
- All wallet transactions and refunds
- All chat transcripts
- All photos / files you uploaded

The export is delivered to your registered email within 7 days. Available once every 90 days.

## 7. Anonymised aggregates we retain forever

The following are not personal data and may be retained indefinitely for analytics, planning and reporting:

- Demand heatmaps (rides per cell per hour)
- Aggregate order volumes
- Fleet performance metrics
- Service-level reports

None of these contain identifiers.

## 8. Records of processing

We maintain a Record of Processing Activities (RoPA) per DPDPA Rules. It is available to the DPB on request and to you in summary form via dpo@gatimitra.com.

## 9. Audit & enforcement

This Policy is audited annually by an external auditor. The audit report's findings — without sensitive technical detail — are summarised in our annual transparency report.

## 10. Change history

| Version | Date | Change |
|---|---|---|
| 1.0 | 21 Jun 2026 | Initial release; split from combined DPDPA / Retention notice |

---
**Owner:** Privacy & Compliance — dpo@gatimitra.com
