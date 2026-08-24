export type MerchantFormSection = "PAN" | "AADHAAR" | "LICENCE" | "GST" | "BANK";

export type MerchantDocRequirement = {
  code: string;
  label: string;
  hint?: string | null;
  formSection: MerchantFormSection;
  isMandatory: boolean;
  displayOrder: number;
};

export const MERCHANT_SECTION_ORDER: MerchantFormSection[] = [
  "PAN",
  "AADHAAR",
  "LICENCE",
  "GST",
  "BANK",
];

export const PHARMA_DOC_CODES = new Set([
  "RETAIL_DRUG_LICENSE",
  "WHOLESALE_DRUG_LICENSE",
  "PHARMACIST_CERTIFICATE",
  "PHARMACIST_REGISTRATION_NUMBER",
  "STATE_PHARMACY_COUNCIL_PROOF",
]);

const FORM_SECTIONS = new Set<MerchantFormSection>(MERCHANT_SECTION_ORDER);

export function inferFormSectionFromCode(code: string): MerchantFormSection {
  const c = (code || "").trim().toUpperCase();
  if (c === "PAN") return "PAN";
  if (c === "AADHAAR" || c === "AADHAR") return "AADHAAR";
  if (c === "GST") return "GST";
  if (c === "BANK_PROOF" || c === "BANK") return "BANK";
  return "LICENCE";
}

export function coerceFormSection(value: unknown, code: string): MerchantFormSection {
  const s = String(value || "").trim().toUpperCase();
  if (FORM_SECTIONS.has(s as MerchantFormSection)) return s as MerchantFormSection;
  return inferFormSectionFromCode(code);
}

const FOOD_STORE_TYPES = new Set([
  "FOOD",
  "RESTAURANT",
  "CAFE",
  "BAKERY",
  "CLOUD_KITCHEN",
  "GROCERY",
]);

function doc(
  code: string,
  label: string,
  formSection: MerchantFormSection,
  isMandatory: boolean,
  displayOrder: number,
  hint?: string
): MerchantDocRequirement {
  return { code, label, hint: hint ?? null, formSection, isMandatory, displayOrder };
}

/** Stable empty list so onboarding effects do not loop on a new `[]` every render. */
export const EMPTY_MERCHANT_DOCS: MerchantDocRequirement[] = [];

/** Used only as a last-resort template (admin seeding). Onboarding never uses this. */
export function fallbackDocsForStoreType(storeType: string): MerchantDocRequirement[] {
  const t = (storeType || "RESTAURANT").trim().toUpperCase();
  const rows: MerchantDocRequirement[] = [
    doc("PAN", "PAN Card", "PAN", true, 10),
    doc("AADHAAR", "Aadhaar Card", "AADHAAR", false, 20),
    doc("GST", "GST Certificate", "GST", false, 30),
    doc("BANK_PROOF", "Bank Account Details", "BANK", true, 40),
    doc("TRADE_LICENSE", "Trade License", "LICENCE", false, 60),
    doc("SHOP_ACT", "Shop & Establishment", "LICENCE", false, 70),
  ];
  if (t === "PHARMA") {
    rows.push(
      doc("RETAIL_DRUG_LICENSE", "Retail Drug License", "LICENCE", true, 90),
      doc("PHARMACIST_CERTIFICATE", "Pharmacist Certificate", "LICENCE", true, 110),
      doc("PHARMACIST_REGISTRATION_NUMBER", "Pharmacist Registration", "LICENCE", true, 120),
      doc("STATE_PHARMACY_COUNCIL_PROOF", "Pharmacy Council Proof", "LICENCE", true, 130)
    );
  } else if (FOOD_STORE_TYPES.has(t)) {
    rows.push(doc("FSSAI", "FSSAI License", "LICENCE", true, 50));
  }
  return rows;
}

export function resolveMerchantDocs(
  fetched: MerchantDocRequirement[] | null | undefined,
  _storeType?: string
): MerchantDocRequirement[] {
  // null/undefined = still loading or request failed → show nothing (never
  // re-inject hardcoded TRADE/SHOP/FSSAI that Super Admin removed).
  // [] = Super Admin mapped nothing for this store type → show nothing.
  if (fetched == null) return EMPTY_MERCHANT_DOCS;
  return fetched;
}

const LEGACY_FORM_SECTIONS = new Set<string>(MERCHANT_SECTION_ORDER);

const LEGACY_NAV_ALIASES: Record<string, MerchantFormSection> = {
  pan: "PAN",
  aadhar: "AADHAAR",
  aadhaar: "AADHAAR",
  licence: "LICENCE",
  license: "LICENCE",
  gst: "GST",
  bank: "BANK",
  bank_proof: "BANK",
  other: "LICENCE",
  optional: "LICENCE",
};

/** Collapse pharma catalogue rows into one Drug Lic. step so verify logic stays one page. */
export function onboardingNavDocs(docs: MerchantDocRequirement[]): MerchantDocRequirement[] {
  const out: MerchantDocRequirement[] = [];
  let pharmaInserted = false;
  for (const d of docs) {
    if (PHARMA_DOC_CODES.has(d.code)) {
      if (!pharmaInserted) {
        out.push({
          ...d,
          label: "Drug License",
        });
        pharmaInserted = true;
      }
      continue;
    }
    out.push(d);
  }
  return out;
}

export function shortDocNavLabel(doc: MerchantDocRequirement): string {
  const code = (doc.code || "").toUpperCase();
  if (code === "PAN") return "PAN";
  if (code === "AADHAAR") return "Aadhaar";
  if (code === "GST") return "GST";
  if (code === "BANK_PROOF" || code === "BANK") return "Bank";
  if (code === "FSSAI") return "FSSAI";
  if (code === "TRADE_LICENSE") return "Trade Lic.";
  if (code === "SHOP_ACT") return "Shop Act";
  if (code === "UDYAM") return "Udyam";
  if (PHARMA_DOC_CODES.has(code)) return "Drug Lic.";
  const label = (doc.label || code).trim();
  if (label.length <= 18) return label;
  return `${label.slice(0, 17)}…`;
}

export function formSectionOf(
  docs: MerchantDocRequirement[],
  code: string
): MerchantFormSection {
  const t = (code || "").trim();
  const row =
    docs.find((d) => d.code === t) ||
    docs.find((d) => d.code === t.toUpperCase());
  if (row) return row.formSection;
  const alias = LEGACY_NAV_ALIASES[t.toLowerCase()];
  if (alias) return alias;
  const upper = t.toUpperCase();
  if (LEGACY_FORM_SECTIONS.has(upper)) return upper as MerchantFormSection;
  return "PAN";
}

export function coerceToNavCode(
  raw: string | null | undefined,
  navDocs: MerchantDocRequirement[]
): string {
  if (!navDocs.length) return "PAN";
  const t = (raw || "").trim();
  if (!t) return navDocs[0]!.code;
  const exact =
    navDocs.find((d) => d.code === t) ||
    navDocs.find((d) => d.code === t.toUpperCase());
  if (exact) return exact.code;
  const form = formSectionOf(navDocs, t);
  const bySection = navDocs.find((d) => d.formSection === form);
  return bySection?.code ?? navDocs[0]!.code;
}

export type PartnerFormKey = "pan" | "aadhar" | "licence" | "gst" | "bank" | "other";

export function partnerFormKey(
  code: string,
  docs: MerchantDocRequirement[]
): PartnerFormKey {
  const t = (code || "").trim();
  if (t === "OTHER" || t === "OTHERS" || t.toLowerCase() === "other") return "other";
  const section = formSectionOf(docs, t);
  if (section === "PAN") return "pan";
  if (section === "AADHAAR") return "aadhar";
  if (section === "GST") return "gst";
  if (section === "BANK") return "bank";
  return "licence";
}

export function hasDoc(docs: MerchantDocRequirement[], code: string): boolean {
  return docs.some((d) => d.code === code);
}

export function isDocMandatory(docs: MerchantDocRequirement[], code: string): boolean {
  return docs.some((d) => d.code === code && d.isMandatory);
}

/** Sidebar hint under store type — catalog-driven, never "for food". */
export function storeTypeDocsSidebarHint(docs: MerchantDocRequirement[]): string {
  if (showPharmaLicence(docs)) return "Drug License & Pharmacist mandatory.";
  if (isDocMandatory(docs, "FSSAI")) return "FSSAI mandatory.";
  const mandatory = docs.filter((d) => d.isMandatory).length;
  return `${mandatory} mandatory${docs.length ? ` · ${docs.length} documents` : ""}.`;
}

export function visibleMerchantSections(docs: MerchantDocRequirement[]): MerchantFormSection[] {
  const present = new Set(docs.map((d) => d.formSection));
  return MERCHANT_SECTION_ORDER.filter((s) => present.has(s));
}

export function showPharmaLicence(docs: MerchantDocRequirement[]): boolean {
  return docs.some((d) => PHARMA_DOC_CODES.has(d.code));
}

export function showFssaiLicence(docs: MerchantDocRequirement[]): boolean {
  return hasDoc(docs, "FSSAI") && !showPharmaLicence(docs);
}
