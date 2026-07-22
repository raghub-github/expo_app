import type { PartnerLegalSlug } from "@/lib/legal/registry";

export type PartnerLegalNavItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  slug?: PartnerLegalSlug;
};

export const PARTNER_LEGAL_NAV: PartnerLegalNavItem[] = [
  {
    id: "terms",
    slug: "terms",
    title: "Terms of Service",
    subtitle: "Merchant Agreements",
    href: "/terms",
  },
  {
    id: "privacy-policy",
    slug: "privacy-policy",
    title: "Privacy Policy",
    subtitle: "Data & Privacy",
    href: "/privacy-policy",
  },
  {
    id: "coc",
    slug: "coc",
    title: "Code of Conduct",
    subtitle: "Our Standards",
    href: "/coc",
  },
  {
    id: "partnership",
    slug: "partnership-agreement",
    title: "Partnership Agreement",
    subtitle: "Legal Partnership",
    href: "/partnership-agreement",
  },
  {
    id: "service-policies",
    slug: "service-policies",
    title: "Service Policies",
    subtitle: "Platform Policies",
    href: "/service-policies",
  },
  {
    id: "help",
    slug: "help-support",
    title: "Help & Support",
    subtitle: "Get Assistance",
    href: "/help-support",
  },
  {
    id: "account-deletion",
    slug: "account-deletion",
    title: "Account & Store Deletion",
    subtitle: "Close & Delete",
    href: "/delete-account",
  },
];
