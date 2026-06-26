/**
 * Slug -> markdown filename + SEO metadata for every legal page on gatimitra.com.
 *
 * To add a new policy:
 *   1. Create the markdown at apps/customer_app/legal/<file>.md
 *   2. Add an entry below
 *   3. Create app/<slug>/page.tsx that exports `metadata` from getLegalMetadata(slug)
 *      and renders <LegalPage slug={slug} />
 *   4. Add to app/sitemap.ts if it should be indexed
 *
 * The same registry powers /sitemap.ts, breadcrumbs, related-links, and search.
 */

export type LegalDocCategory =
  | "must-read"
  | "user-rights"
  | "money"
  | "operations"
  | "safety"
  | "developer";

export type LegalDoc = {
  slug: string;
  file: string;
  title: string;
  description: string;
  category: LegalDocCategory;
  /** Show in footer "Support" column. Other docs are reachable via /sitemap and /help-center. */
  inFooter?: boolean;
};

export const LEGAL_PACK_VERSION = "2026.06";

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "privacy-policy",
    file: "privacy-policy.md",
    title: "Privacy Policy",
    description:
      "How GatiMitra collects, uses, stores and shares your information across food delivery, ride booking and parcel courier services. DPDPA 2023 compliant.",
    category: "must-read",
    inFooter: true,
  },
  {
    slug: "terms-and-conditions",
    file: "terms-of-service.md",
    title: "Terms & Conditions",
    description:
      "The agreement between you and GatiMitra On Demand Services Private Limited covering use of the platform, orders, rides, parcels, wallet and membership.",
    category: "must-read",
    inFooter: true,
  },
  {
    slug: "refund-policy",
    file: "refund-cancellation-policy.md",
    title: "Refund Policy",
    description:
      "When and how refunds are processed for food orders, rides, parcel delivery, wallet recharges and GMitra Plus membership. Refund timelines and methods.",
    category: "money",
    inFooter: true,
  },
  {
    slug: "cancellation-policy",
    file: "refund-cancellation-policy.md",
    title: "Cancellation Policy",
    description:
      "Cancellation rules for food orders, rides, parcels and membership. When you can cancel, applicable fees and refund eligibility.",
    category: "money",
    inFooter: true,
  },
  {
    slug: "shipping-delivery-policy",
    file: "shipping-delivery-policy.md",
    title: "Shipping & Delivery Policy",
    description:
      "Delivery timelines, delivery radius, address validation, force majeure and what to do if your order is delayed across GatiMitra services.",
    category: "operations",
    inFooter: true,
  },
  {
    slug: "account-deletion",
    file: "data-deletion-policy.md",
    title: "Account Deletion Policy",
    description:
      "How to delete your GatiMitra account, what data is removed immediately, what is retained for legal compliance and how to request a copy of your data.",
    category: "user-rights",
    inFooter: true,
  },
  {
    slug: "cookies",
    file: "cookie-tracking-policy.md",
    title: "Cookies & Tracking Policy",
    description:
      "Cookies and tracking technologies used on gatimitra.com — types, purposes, your choices and how to opt out.",
    category: "user-rights",
    inFooter: true,
  },
  {
    slug: "community-guidelines",
    file: "community-guidelines.md",
    title: "Community Guidelines",
    description:
      "How we expect customers, riders, captains and merchants to behave on GatiMitra. Reviews, ratings, photos and conduct standards.",
    category: "operations",
    inFooter: true,
  },
  {
    slug: "acceptable-use-policy",
    file: "acceptable-use-policy.md",
    title: "Acceptable Use Policy",
    description:
      "Prohibited activities on GatiMitra — fraud, abuse, illegal use, scraping, automation and the consequences of violations.",
    category: "operations",
  },
  {
    slug: "faq",
    file: "faq.md",
    title: "Frequently Asked Questions",
    description:
      "Answers to the most common questions about login, OTP, wallet, membership, orders, rides, parcels, refunds, payments and account.",
    category: "user-rights",
    inFooter: true,
  },
  {
    slug: "about-us",
    file: "about-us.md",
    title: "About GatiMitra",
    description:
      "The company behind India's multi-service on-demand platform — food delivery, ride booking and parcel courier in one app.",
    category: "operations",
  },
  {
    slug: "contact-us",
    file: "contact-us.md",
    title: "Contact Us",
    description:
      "Reach the GatiMitra customer support, grievance officer, business team or our registered office. Emails, phone and address.",
    category: "user-rights",
    inFooter: true,
  },
  {
    slug: "data-retention-policy",
    file: "dpdpa-compliance-notice.md",
    title: "Data Retention Policy",
    description:
      "How long GatiMitra keeps your data — account, orders, financial records, location history — and when it is deleted under DPDPA 2023.",
    category: "user-rights",
  },
  {
    slug: "eula",
    file: "eula.md",
    title: "End User License Agreement",
    description:
      "The licence terms for the GatiMitra mobile app for Android and iOS — your right to use the app and the restrictions that apply.",
    category: "developer",
  },
  {
    slug: "safety",
    file: "safety-policy.md",
    title: "Safety Policy",
    description:
      "How GatiMitra keeps customers, riders and captains safe — verification, SOS, share-trip, incident response and Aggregator Guidelines 2020 compliance.",
    category: "safety",
  },
  {
    slug: "accessibility",
    file: "accessibility-statement.md",
    title: "Accessibility Statement",
    description:
      "GatiMitra's commitment to accessibility for users with disabilities under the Rights of Persons with Disabilities Act 2016 and WCAG 2.2.",
    category: "user-rights",
  },
  {
    slug: "grievance-redressal",
    file: "grievance-redressal-mechanism.md",
    title: "Grievance Redressal Mechanism",
    description:
      "How to file a complaint with our Grievance Officer under IT Rules 2021 §3(2). Timelines, escalation and Data Protection Officer contact.",
    category: "user-rights",
  },
  {
    slug: "dpdpa-notice",
    file: "dpdpa-compliance-notice.md",
    title: "DPDPA 2023 Notice",
    description:
      "Your rights as a Data Principal under the Digital Personal Data Protection Act 2023 — consent, access, correction, erasure and grievance.",
    category: "user-rights",
  },
  {
    slug: "open-source",
    file: "open-source-licenses.md",
    title: "Open Source Licences",
    description:
      "Third-party open-source libraries used by GatiMitra and their licence notices.",
    category: "developer",
  },
  {
    slug: "fair-pricing",
    file: "fair-pricing-policy.md",
    title: "Fair Pricing Policy",
    description:
      "Our commitment to transparent, predictable pricing — base fares, taxes, fees and the rare cases when surge applies.",
    category: "money",
  },
  {
    slug: "surge-pricing",
    file: "surge-pricing-disclosure.md",
    title: "Surge Pricing Disclosure",
    description:
      "When and why ride fares may be temporarily higher under MV Aggregator Guidelines 2020. The cap, the disclosure and how to avoid surge.",
    category: "money",
  },
  {
    slug: "lost-and-found",
    file: "lost-and-found-policy.md",
    title: "Lost & Found Policy",
    description:
      "What to do if you forget something in a GatiMitra cab, with a rider, or in a parcel pickup. Recovery process and timelines.",
    category: "operations",
  },
  {
    slug: "gmitra-max-terms",
    file: "subscription-terms-gmitra-max.md",
    title: "GMitra Max Subscription Terms",
    description:
      "Terms and conditions of the GMitra Max premium membership — pricing, benefits, auto-renewal, cancellation and refunds.",
    category: "money",
  },
  {
    slug: "childrens-privacy",
    file: "children-privacy-policy.md",
    title: "Children's Privacy Policy",
    description:
      "GatiMitra is not intended for users under 18. How we handle data when we learn a user is a minor under DPDPA 2023 §9.",
    category: "user-rights",
  },
  {
    slug: "content-policy",
    file: "content-policy.md",
    title: "Content Policy",
    description:
      "Standards for user-generated content on GatiMitra — reviews, photos, ratings, chat messages. Prohibited content under IT Rules 2021.",
    category: "operations",
  },
  {
    slug: "anti-discrimination",
    file: "anti-discrimination-policy.md",
    title: "Anti-Discrimination Policy",
    description:
      "GatiMitra prohibits discrimination by anyone on the platform. Aggregator Guidelines 2020 §5(d) compliance.",
    category: "safety",
  },
];

const BY_SLUG = new Map(LEGAL_DOCS.map((d) => [d.slug, d]));

export function getLegalDoc(slug: string): LegalDoc | null {
  return BY_SLUG.get(slug) ?? null;
}

export function getLegalDocsByCategory(category: LegalDocCategory): LegalDoc[] {
  return LEGAL_DOCS.filter((d) => d.category === category);
}

export const FOOTER_LEGAL_DOCS: LegalDoc[] = LEGAL_DOCS.filter((d) => d.inFooter);
