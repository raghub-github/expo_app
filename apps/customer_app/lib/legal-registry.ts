/**
 * Single source of truth for every legal / policy / help document shipped
 * with the customer app. Powers:
 *   - Profile → Legal screen (lists everything in `category: 'legal' | 'about' | 'help'`)
 *   - Profile → Help & Support screen
 *   - Profile → About screen
 *   - Onboarding consent (which docs need consent acceptance)
 *   - Settings → Privacy controls (data-deletion + dpdpa flows)
 *   - In-app deep links from notifications (e.g., post-incident safety link)
 *
 * To add a document:
 *   1. Create the .md file under `apps/customer_app/legal/`.
 *   2. Add an entry below.
 *   3. Bump `LEGAL_PACK_VERSION` if it changes user rights/obligations so the
 *      app shows a re-consent modal to existing users.
 *
 * All documents are loaded at runtime via expo-asset; no rebuild needed for
 * editorial changes.
 */

export type LegalCategory = "legal" | "help" | "about" | "safety" | "subscription";

export type LegalDoc = {
  /** Stable id; used in deep links (gatimitra://legal/<id>). Do not rename. */
  id: string;
  /** Display title in the in-app list. */
  title: string;
  /** One-line description shown under the title on the list. */
  subtitle: string;
  /** Markdown file under `apps/customer_app/legal/`. */
  file: string;
  /** Which top-level Profile entry surfaces it. */
  category: LegalCategory;
  /** Whether onboarding must show + accept this doc. */
  requireConsentOnOnboarding: boolean;
  /**
   * Where consent state is persisted. Bump when the doc materially changes
   * so existing users get a re-consent prompt.
   */
  consentVersion?: number;
  /** Free-text tag for search/filter and grouping. */
  tags?: string[];
  /** Icon name (lucide-react-native) shown next to the title. */
  icon: string;
};

/**
 * Aggregate version of the legal pack. Bump when ANY document materially
 * changes (rights, obligations, data collection). The app compares this to
 * the value stored at last consent and re-prompts the user if they differ.
 */
export const LEGAL_PACK_VERSION = "2026-06-21-v2.0";

export const LEGAL_DOCS: readonly LegalDoc[] = [
  // ── Onboarding consent docs ─────────────────────────────────────────
  {
    id: "terms-of-service",
    title: "Terms of Service",
    subtitle: "Your contract with GatiMitra",
    file: "terms-of-service.md",
    category: "legal",
    requireConsentOnOnboarding: true,
    consentVersion: 2,
    icon: "FileText",
    tags: ["t&c", "terms", "agreement"],
  },
  {
    id: "privacy-policy",
    title: "Privacy Policy",
    subtitle: "What we collect and why",
    file: "privacy-policy.md",
    category: "legal",
    requireConsentOnOnboarding: true,
    consentVersion: 2,
    icon: "ShieldCheck",
    tags: ["privacy", "dpdpa", "data"],
  },
  {
    id: "eula",
    title: "End-User License Agreement",
    subtitle: "App-use licence",
    file: "eula.md",
    category: "legal",
    requireConsentOnOnboarding: false,
    consentVersion: 1,
    icon: "ScrollText",
    tags: ["eula", "licence", "apple"],
  },

  // ── DPDPA & data-rights ─────────────────────────────────────────────
  {
    id: "dpdpa-compliance-notice",
    title: "DPDPA Notice & DPO Contact",
    subtitle: "Your data rights under DPDPA 2023",
    file: "dpdpa-compliance-notice.md",
    category: "legal",
    requireConsentOnOnboarding: false,
    icon: "ShieldCheck",
    tags: ["dpdpa", "dpo", "rights"],
  },
  {
    id: "cookie-tracking-policy",
    title: "Cookie & Tracking Policy",
    subtitle: "SDKs, identifiers, opt-outs",
    file: "cookie-tracking-policy.md",
    category: "legal",
    requireConsentOnOnboarding: false,
    icon: "Cookie",
    tags: ["cookies", "tracking", "sdks"],
  },
  {
    id: "permissions-rationale",
    title: "App Permissions Explained",
    subtitle: "What each permission unlocks",
    file: "permissions-rationale.md",
    category: "legal",
    requireConsentOnOnboarding: false,
    icon: "KeyRound",
    tags: ["permissions", "camera", "location"],
  },
  {
    id: "data-deletion-policy",
    title: "Account Deletion & Data Erasure",
    subtitle: "How to delete your account",
    file: "data-deletion-policy.md",
    category: "legal",
    requireConsentOnOnboarding: false,
    icon: "Trash2",
    tags: ["delete", "deletion", "account", "erase"],
  },

  // ── Commercial / consumer-protection ───────────────────────────────
  {
    id: "refund-cancellation-policy",
    title: "Refund & Cancellation Policy",
    subtitle: "When you can cancel and what you get back",
    file: "refund-cancellation-policy.md",
    category: "legal",
    requireConsentOnOnboarding: false,
    icon: "Banknote",
    tags: ["refund", "cancel", "money"],
  },
  {
    id: "shipping-delivery-policy",
    title: "Shipping & Delivery Policy",
    subtitle: "Coverage, timing, fees",
    file: "shipping-delivery-policy.md",
    category: "legal",
    requireConsentOnOnboarding: false,
    icon: "Truck",
    tags: ["delivery", "shipping", "eta"],
  },
  {
    id: "fair-pricing-policy",
    title: "Fair Pricing Policy",
    subtitle: "Transparent fees, no hidden charges",
    file: "fair-pricing-policy.md",
    category: "legal",
    requireConsentOnOnboarding: false,
    icon: "Receipt",
    tags: ["pricing", "fees", "transparency"],
  },
  {
    id: "surge-pricing-disclosure",
    title: "Surge / Fair Pricing Disclosure",
    subtitle: "When and why prices change",
    file: "surge-pricing-disclosure.md",
    category: "legal",
    requireConsentOnOnboarding: false,
    icon: "TrendingUp",
    tags: ["surge", "ride", "pricing"],
  },
  {
    id: "subscription-terms-gmitra-max",
    title: "GMitra Max Subscription Terms",
    subtitle: "Membership benefits, billing, cancellation",
    file: "subscription-terms-gmitra-max.md",
    category: "subscription",
    requireConsentOnOnboarding: false,
    icon: "Crown",
    tags: ["subscription", "gmitra max", "billing"],
  },

  // ── User-content / behavior ─────────────────────────────────────────
  {
    id: "content-policy",
    title: "Content Policy",
    subtitle: "What you can post",
    file: "content-policy.md",
    category: "legal",
    requireConsentOnOnboarding: false,
    consentVersion: 2,
    icon: "FileEdit",
    tags: ["content", "ip", "reviews"],
  },
  {
    id: "community-guidelines",
    title: "Community Guidelines",
    subtitle: "How to write reviews and engage",
    file: "community-guidelines.md",
    category: "legal",
    requireConsentOnOnboarding: false,
    icon: "Users",
    tags: ["reviews", "ratings"],
  },
  {
    id: "acceptable-use-policy",
    title: "Acceptable Use Policy",
    subtitle: "What's not allowed on GatiMitra",
    file: "acceptable-use-policy.md",
    category: "legal",
    requireConsentOnOnboarding: false,
    icon: "Ban",
    tags: ["use", "rules", "ban"],
  },

  // ── Safety & inclusion ──────────────────────────────────────────────
  {
    id: "safety-policy",
    title: "Safety Policy",
    subtitle: "SOS, women safety, ride safety",
    file: "safety-policy.md",
    category: "safety",
    requireConsentOnOnboarding: false,
    icon: "ShieldAlert",
    tags: ["safety", "sos", "women", "emergency"],
  },
  {
    id: "anti-discrimination-policy",
    title: "Anti-Discrimination Policy",
    subtitle: "Zero tolerance for discrimination",
    file: "anti-discrimination-policy.md",
    category: "safety",
    requireConsentOnOnboarding: false,
    icon: "Scale",
    tags: ["discrimination", "rights"],
  },
  {
    id: "lost-and-found-policy",
    title: "Lost & Found Policy",
    subtitle: "Forgotten something? How to get it back",
    file: "lost-and-found-policy.md",
    category: "safety",
    requireConsentOnOnboarding: false,
    icon: "PackageSearch",
    tags: ["lost", "found", "items"],
  },
  {
    id: "accessibility-statement",
    title: "Accessibility Statement",
    subtitle: "Usable by everyone",
    file: "accessibility-statement.md",
    category: "about",
    requireConsentOnOnboarding: false,
    icon: "Accessibility",
    tags: ["accessibility", "wcag", "disability"],
  },
  {
    id: "children-privacy-policy",
    title: "Children's Privacy & Use",
    subtitle: "Protections for users under 18",
    file: "children-privacy-policy.md",
    category: "safety",
    requireConsentOnOnboarding: false,
    icon: "Baby",
    tags: ["children", "minors", "parental"],
  },

  // ── Grievance / contact (IT Rules 2021 mandatory) ───────────────────
  {
    id: "grievance-redressal-mechanism",
    title: "Grievance Redressal Mechanism",
    subtitle: "How to file a complaint — IT Rules 2021",
    file: "grievance-redressal-mechanism.md",
    category: "help",
    requireConsentOnOnboarding: false,
    icon: "Gavel",
    tags: ["grievance", "complaint", "escalation"],
  },
  {
    id: "contact-us",
    title: "Contact Us",
    subtitle: "Every channel, every officer",
    file: "contact-us.md",
    category: "help",
    requireConsentOnOnboarding: false,
    icon: "Phone",
    tags: ["contact", "support", "phone"],
  },

  // ── Information / about ─────────────────────────────────────────────
  {
    id: "about-us",
    title: "About GatiMitra",
    subtitle: "Company, principles, leadership",
    file: "about-us.md",
    category: "about",
    requireConsentOnOnboarding: false,
    icon: "Info",
    tags: ["about", "company"],
  },
  {
    id: "open-source-licenses",
    title: "Open-Source Licenses",
    subtitle: "OSS attributions",
    file: "open-source-licenses.md",
    category: "about",
    requireConsentOnOnboarding: false,
    icon: "GitBranch",
    tags: ["oss", "licenses", "attribution"],
  },
  {
    id: "faq",
    title: "FAQ",
    subtitle: "Common questions, fast answers",
    file: "faq.md",
    category: "help",
    requireConsentOnOnboarding: false,
    icon: "HelpCircle",
    tags: ["faq", "help"],
  },
] as const;

/** Quick lookup by id (used by deep-link router and screen). */
export const LEGAL_DOC_BY_ID = LEGAL_DOCS.reduce<Record<string, LegalDoc>>(
  (acc, doc) => ({ ...acc, [doc.id]: doc }),
  {}
);

/** Group docs by category for screen rendering. */
export const LEGAL_DOCS_BY_CATEGORY: Record<LegalCategory, readonly LegalDoc[]> = {
  legal: LEGAL_DOCS.filter((d) => d.category === "legal"),
  help: LEGAL_DOCS.filter((d) => d.category === "help"),
  about: LEGAL_DOCS.filter((d) => d.category === "about"),
  safety: LEGAL_DOCS.filter((d) => d.category === "safety"),
  subscription: LEGAL_DOCS.filter((d) => d.category === "subscription"),
};

/** Docs that must be consented to during onboarding. */
export const ONBOARDING_CONSENT_DOCS = LEGAL_DOCS.filter(
  (d) => d.requireConsentOnOnboarding
);

/**
 * Async loader for the markdown body. Assumes the .md files are bundled as
 * static assets via metro.config.js asset extensions OR served from a CDN
 * at https://gatimitra.com/legal/<file>. Configure ONE path below before
 * shipping.
 */
export async function loadLegalDocBody(doc: LegalDoc): Promise<string> {
  // OPTION A — bundled assets (offline-capable, requires metro.config.js change)
  // const Asset = (await import("expo-asset")).Asset;
  // const asset = Asset.fromModule(
  //   require(`@/legal/${doc.file}`)  // metro config must allow .md
  // );
  // await asset.downloadAsync();
  // const res = await fetch(asset.localUri ?? asset.uri);
  // return res.text();

  // OPTION B — remote (lets you ship policy updates without app re-submission)
  const base =
    process.env.EXPO_PUBLIC_LEGAL_CDN_URL ?? "https://gatimitra.com/legal";
  const res = await fetch(`${base}/${doc.file}`);
  if (!res.ok) throw new Error(`Failed to load ${doc.file}: ${res.status}`);
  return res.text();
}
