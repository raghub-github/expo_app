# Legal & Policy Document Changelog

Append a one-line entry every time you edit any file in this directory.

## 2026-06-21 — v2.0 / Initial release of expanded legal pack

| File | Version | Change |
|---|---|---|
| INDEX.md | 1.0 | New |
| terms-of-service.md | 2.0 | Supersedes 13 May 2026 PDF; references all sibling policies |
| privacy-policy.md | 2.0 | Supersedes 13 May 2026 PDF; DPDPA 2023 expansion |
| content-policy.md | 2.0 | Supersedes 13 May 2026 PDF; IT Rules 2021 timelines added |
| refund-cancellation-policy.md | 1.0 | New — Consumer Protection (E-Comm) Rules 2020 §5(2) |
| shipping-delivery-policy.md | 1.0 | New — Consumer Protection (E-Comm) Rules 2020 §5(2) |
| community-guidelines.md | 1.0 | New — App Store 1.1.3 |
| acceptable-use-policy.md | 1.0 | New — App Store 1.2 |
| cookie-tracking-policy.md | 1.0 | New — DPDPA + Play Data Safety |
| eula.md | 1.0 | New — Apple 3.1.2 |
| safety-policy.md | 1.0 | New — MV Aggregator Guidelines 2020 |
| anti-discrimination-policy.md | 1.0 | New — RPwD Act 2016 + Aggregator Guidelines §5(d) |
| lost-and-found-policy.md | 1.0 | New — Aggregator Guidelines |
| surge-pricing-disclosure.md | 1.0 | New — Aggregator Guidelines §10(2) |
| fair-pricing-policy.md | 1.0 | New — Consumer Protection Act |
| subscription-terms-gmitra-max.md | 1.0 | New — Apple 3.1.2(a) + Play Subscriptions |
| accessibility-statement.md | 1.0 | New — RPwD Act 2016 |
| children-privacy-policy.md | 1.0 | New — DPDPA §9 + Play Families |
| grievance-redressal-mechanism.md | 1.0 | New — IT Rules 2021 §3(2) — mandatory |
| dpdpa-compliance-notice.md | 1.0 | New — DPDPA 2023 §6/§8/§10 |
| permissions-rationale.md | 1.0 | New — Play Data Safety + iOS PrivacyInfo |
| data-deletion-policy.md | 1.0 | New — Play Store mandatory (May 2024) |
| open-source-licenses.md | 1.0 | New — Apple 5.6.1 + Play OSS |
| faq.md | 1.0 | New |
| about-us.md | 1.0 | New — Companies Act §12(3)(c) |
| contact-us.md | 1.0 | New — IT Rules 2021 §3(2) |

## How to update

1. Edit the file.
2. Bump the file's `Version:` line at the top.
3. Update the `Last Updated:` date.
4. **Material change** (changes rights, obligations, or data collection): also bump `Effective Date:` AND set the `gm_legal_version_required` flag in `lib/legal/version-gate.ts` so the next app launch shows a re-consent modal.
5. **Editorial change** only: don't bump effective date; just commit.
6. Append a one-line entry below.

## Subsequent entries

(Add new entries here.)
