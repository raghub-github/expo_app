/**
 * Merchant partner portal — legal document registry.
 * Content lives in src/content/legal/*.md; pages are served at /terms, /privacy-policy, /coc.
 */

export type PartnerLegalSlug =
  | "terms"
  | "privacy-policy"
  | "coc"
  | "partnership-agreement"
  | "service-policies"
  | "help-support"
  | "account-deletion";

export type PartnerLegalDoc = {
  slug: PartnerLegalSlug;
  file: string;
  title: string;
  description: string;
  /** Public path on partner.gatimitra.com (no trailing slash). */
  path: string;
};

export const PARTNER_LEGAL_PACK_VERSION = "2026.07";

export const PARTNER_LEGAL_DOCS: PartnerLegalDoc[] = [
  {
    slug: "terms",
    file: "merchant-terms.md",
    title: "Terms of Service",
    description:
      "The agreement between you and GatiMitra for listing your restaurant or store, accepting orders, settlements, and use of the partner portal and merchant app.",
    path: "/terms",
  },
  {
    slug: "privacy-policy",
    file: "merchant-privacy-policy.md",
    title: "Privacy Policy",
    description:
      "How GatiMitra collects, uses, stores, and shares merchant and outlet information when you use partner.gatimitra.com and the GatiMitra Merchant app.",
    path: "/privacy-policy",
  },
  {
    slug: "coc",
    file: "merchant-code-of-conduct.md",
    title: "Code of Conduct",
    description:
      "Operational and ethical standards for merchants on GatiMitra — food safety, customer respect, fair pricing, and platform integrity.",
    path: "/coc",
  },
  {
    slug: "partnership-agreement",
    file: "merchant-partnership-agreement.md",
    title: "Partnership Agreement",
    description:
      "The commercial and legal partnership between your outlet and GatiMitra for listing, orders, settlements, and onboarding.",
    path: "/partnership-agreement",
  },
  {
    slug: "service-policies",
    file: "merchant-service-policies.md",
    title: "Service Policies",
    description:
      "Platform policies for refunds, cancellations, settlements, subscriptions, and merchant operations on GatiMitra.",
    path: "/service-policies",
  },
  {
    slug: "help-support",
    file: "merchant-help-support.md",
    title: "Help & Support",
    description:
      "How merchant partners can get help with onboarding, orders, payments, legal documents, and account issues.",
    path: "/help-support",
  },
  {
    slug: "account-deletion",
    file: "merchant-account-deletion.md",
    title: "Account & Store Deletion",
    description:
      "How a GatiMitra merchant permanently closes their outlet and deletes their partner account — the in-app closure request, what data is removed, and what records are retained.",
    path: "/delete-account",
  },
];

const BY_SLUG = new Map(PARTNER_LEGAL_DOCS.map((d) => [d.slug, d]));
const BY_FILE = new Map(PARTNER_LEGAL_DOCS.map((d) => [d.file, d]));

export function getPartnerLegalDoc(slug: string): PartnerLegalDoc | undefined {
  return BY_SLUG.get(slug as PartnerLegalSlug);
}

/** Resolve markdown cross-links to partner legal routes. */
export function resolvePartnerLegalHref(href: string): string {
  const raw = href.trim();

  const mdMatch = raw.match(/^\.?\/?([a-z0-9-]+)\.md(#[a-zA-Z0-9-]+)?$/i);
  if (mdMatch) {
    const file = `${mdMatch[1]!.toLowerCase()}.md`;
    const anchor = mdMatch[2] ?? "";
    const doc = BY_FILE.get(file);
    if (doc) return `${doc.path}${anchor}`;
  }

  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;

  return raw;
}

export function getPartnerLegalMetadata(slug: PartnerLegalSlug) {
  const doc = getPartnerLegalDoc(slug);
  if (!doc) return { title: "Legal" };
  return {
    title: `${doc.title} | GatiMitra Partner`,
    description: doc.description,
  };
}
