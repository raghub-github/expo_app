# GatiMitra Customer App — Legal & Policy Document Index

**Effective Date:** 21 June 2026
**Applicable Jurisdiction:** Republic of India
**Owner:** GatiMitra Legal & Compliance

This directory contains every legal, privacy, safety, and information document required to ship the GatiMitra customer app on Google Play Store, Apple App Store, and in compliance with Indian law.

Each file is the authoritative source; in-app screens render them at runtime. Update the file → users see the update on next app launch (no Play Store re-submission needed for content changes).

## Document register

| # | File | Audience | Required by |
|---|---|---|---|
| 01 | [terms-of-service.md](./terms-of-service.md) | All users | Apple 3.1.2 • Google App Content • IT Act 2000 |
| 02 | [privacy-policy.md](./privacy-policy.md) | All users | DPDPA 2023 • Play Data Safety • App Tracking |
| 03 | [content-policy.md](./content-policy.md) | All users | IT Rules 2021 §3(1)(b) |
| 04 | [refund-cancellation-policy.md](./refund-cancellation-policy.md) | All users | Consumer Protection (E-Comm) Rules 2020 §5(2) |
| 05 | [shipping-delivery-policy.md](./shipping-delivery-policy.md) | All users | Consumer Protection (E-Comm) Rules 2020 §5(2) |
| 06 | [community-guidelines.md](./community-guidelines.md) | All users | Apple 1.1.3 • IT Rules 2021 |
| 07 | [acceptable-use-policy.md](./acceptable-use-policy.md) | All users | Apple 1.2 |
| 08 | [cookie-tracking-policy.md](./cookie-tracking-policy.md) | All users | DPDPA 2023 • Play Data Safety |
| 09 | [eula.md](./eula.md) | All users | Apple 3.1.2 |
| 10 | [safety-policy.md](./safety-policy.md) | Ride + delivery users | MV Aggregator Guidelines 2020 |
| 11 | [anti-discrimination-policy.md](./anti-discrimination-policy.md) | All users | Aggregator Guidelines 2020 §5(d) |
| 12 | [lost-and-found-policy.md](./lost-and-found-policy.md) | Ride + parcel users | Aggregator Guidelines |
| 13 | [surge-pricing-disclosure.md](./surge-pricing-disclosure.md) | Ride users | Aggregator Guidelines §10(2) |
| 14 | [fair-pricing-policy.md](./fair-pricing-policy.md) | All users | Consumer Protection Act |
| 15 | [subscription-terms-gmitra-max.md](./subscription-terms-gmitra-max.md) | Subscribers | Apple 3.1.2(a) • Play Subscriptions |
| 16 | [accessibility-statement.md](./accessibility-statement.md) | All users | Rights of Persons with Disabilities Act 2016 |
| 17 | [children-privacy-policy.md](./children-privacy-policy.md) | All users | DPDPA 2023 §9 • Play Families |
| 18 | [grievance-redressal-mechanism.md](./grievance-redressal-mechanism.md) | All users | IT Rules 2021 §3(2) — **mandatory** |
| 19 | [dpdpa-compliance-notice.md](./dpdpa-compliance-notice.md) | All users | DPDPA 2023 §6, §8, §10 |
| 20 | [permissions-rationale.md](./permissions-rationale.md) | All users | Play Data Safety • iOS PrivacyInfo |
| 21 | [data-deletion-policy.md](./data-deletion-policy.md) | All users | Play Store May-2024 mandatory |
| 22 | [open-source-licenses.md](./open-source-licenses.md) | All users | Apple 5.6.1 • Play OSS |
| 23 | [faq.md](./faq.md) | All users | UX |
| 24 | [about-us.md](./about-us.md) | All users | Companies Act §12(3)(c) |
| 25 | [contact-us.md](./contact-us.md) | All users | IT Rules 2021 §3(2) |

## In-app rendering convention

Each file follows the same Markdown skeleton so the in-app renderer can produce a consistent UI:

```
# Title
**Effective Date:** YYYY-MM-DD
**Last Updated:** YYYY-MM-DD
**Version:** X.Y

> One-line summary (renders as the policy card subtitle on the Legal screen).

## 1. Section Title
…

## N. Contact
…
```

## Loading in the app

These files are bundled as static assets and read via `expo-asset`:

```ts
import { Asset } from 'expo-asset';
const asset = Asset.fromModule(require('@/legal/terms-of-service.md'));
await asset.downloadAsync();
const text = await fetch(asset.localUri ?? asset.uri).then(r => r.text());
```

A `<MarkdownView />` component renders `text` with `react-native-markdown-display`.

## Update procedure

1. Edit the relevant `.md` file in this directory.
2. Bump the `**Last Updated:**` date and `**Version:**` at the top of the file.
3. **Material change** (rights/obligations/data collection): bump the `**Effective Date:**` AND show a re-consent modal on next app launch (logic in `lib/legal/version-gate.ts`).
4. **Editorial change** (typo / formatting): just commit; users see it on next launch.
5. Append a one-line note to `CHANGELOG.md` in this folder.

## Review cadence

| Trigger | Required review |
|---|---|
| Any new feature touching payment / location / identity / photos | Privacy Policy + Permissions Rationale |
| New service vertical (e.g., grocery) | T&C §5 expansion + new Service-specific policy file |
| Indian regulatory update (DPDPA Rules notification, MeitY circular, RBI directive, FSSAI) | All affected documents within 30 days |
| Annual | Every document, regardless of changes |

## Files **not** in this folder (live elsewhere)

| Document | Location | Why separate |
|---|---|---|
| Merchant / Partner T&C | partnersite/legal/ | Different signing party |
| Rider / Delivery Partner Agreement | apps/gatimitra-riderApp/legal/ | Different signing party |
| Driver onboarding documents | dashboard/admin docs | Internal |
| Internal employment / vendor policies | Confluence / HR | Not user-facing |
