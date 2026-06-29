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
    file: "refund-policy.md",
    title: "Refund Policy",
    description:
      "When and how refunds are processed for food orders, rides, parcel delivery, wallet recharges and GMitra Plus membership. Refund timelines and methods.",
    category: "money",
    inFooter: true,
  },
  {
    slug: "cancellation-policy",
    file: "cancellation-policy.md",
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
      "How to close your GatiMitra account: raise a request in the app, how it is reviewed, what is deactivated, what we must legally retain (documents, mobile number, invoices) and why a closed account cannot be revived.",
    category: "user-rights",
    inFooter: true,
  },
  {
    slug: "refund-cancellation-policy",
    file: "refund-cancellation-policy.md",
    title: "Refund & Cancellation Policy",
    description:
      "Combined refund and cancellation rules across GatiMitra food orders, rides, parcels, wallet recharges and membership — when you can cancel, fees and refund timelines.",
    category: "money",
  },
  {
    slug: "permissions-rationale",
    file: "permissions-rationale.md",
    title: "App Permissions — What We Use & Why",
    description:
      "Every Android and iOS permission the GatiMitra app requests — location, camera, notifications, contacts — what each is used for and how to control it.",
    category: "user-rights",
  },
  {
    slug: "dpdpa-compliance-notice",
    file: "dpdpa-compliance-notice.md",
    title: "DPDPA Compliance Notice",
    description:
      "GatiMitra's Digital Personal Data Protection Act 2023 compliance notice and Data Protection Officer contact — lawful processing, your rights and grievance escalation.",
    category: "user-rights",
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
    file: "data-retention-policy.md",
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
    file: "dpdpa-notice.md",
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
const SLUG_BY_FILE = new Map(LEGAL_DOCS.map((d) => [d.file, d.slug]));

export function getLegalDoc(slug: string): LegalDoc | null {
  return BY_SLUG.get(slug) ?? null;
}

/**
 * Rewrite a link href found inside a policy markdown body to its real cxsite
 * route. The shared markdown (also rendered inside the customer app) uses
 * relative `./<file>.md` cross-links and a couple of legacy absolute URLs that
 * don't exist as web routes. On gatimitra.com those must resolve to the
 * registered slug, e.g. `./data-deletion-policy.md` -> `/account-deletion`.
 *
 * Anything we don't recognise is returned unchanged.
 */
export function resolveLegalHref(href: string): string {
  const raw = href.trim();

  // Every legacy account-deletion entry point folds into the single page
  // /account-deletion (the form and the old data-deletion-policy.md URL are gone).
  if (
    /^(https?:\/\/[^/]*gatimitra\.com)?\/(account\/delete|account-delete|delete-account-request|data-deletion-policy(\.md)?)\/?$/i.test(
      raw,
    )
  ) {
    return "/account-deletion";
  }

  // Relative markdown cross-links: ./file.md , file.md , /file.md (+ optional #anchor)
  const mdMatch = raw.match(/^\.?\/?([a-z0-9-]+)\.md(#[a-zA-Z0-9-]+)?$/);
  if (mdMatch) {
    const slug = SLUG_BY_FILE.get(`${mdMatch[1]}.md`);
    if (slug) return `/${slug}${mdMatch[2] ?? ""}`;
  }

  return raw;
}

export function getLegalDocsByCategory(category: LegalDocCategory): LegalDoc[] {
  return LEGAL_DOCS.filter((d) => d.category === category);
}

export const FOOTER_LEGAL_DOCS: LegalDoc[] = LEGAL_DOCS.filter((d) => d.inFooter);
