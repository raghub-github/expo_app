export const REPORT_FRAUD_MENU_TITLE_CODES = [
  "CUST_MENU_INACCURATE_PHOTOS",
  "CUST_MENU_ITEMS_MISSING",
  "CUST_MENU_OTHER_ISSUE",
] as const;

export const REPORT_FRAUD_MENU_TOPIC_LABELS = [
  "Inaccurate Photos or Descriptions",
  "Items Missing from the Menu",
  "Other Issue",
] as const;

const ALIASES: Record<(typeof REPORT_FRAUD_MENU_TOPIC_LABELS)[number], string[]> = {
  "Inaccurate Photos or Descriptions": [
    "inaccurate photos or descriptions",
    "inaccurate photos/descriptions",
    "inaccurate photos or description",
  ],
  "Items Missing from the Menu": [
    "items missing from the menu",
    "items are missing in the menu",
    "items missing in the menu",
    "item missing from the menu",
  ],
  "Other Issue": ["other issue", "i have some other issue", "some other issue"],
};

function norm(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export type ReportFraudCatalogTitle = {
  ticket_title_id: number;
  title_code?: string | null;
  title_text?: string | null;
  section_id?: string | null;
};

export type ReportFraudMenuTopic = {
  ticket_title_id: number;
  title_code: string | null;
  title_text: string;
  section_id: string | null;
};

function matchLabel(
  section: ReportFraudCatalogTitle,
  canonical: (typeof REPORT_FRAUD_MENU_TOPIC_LABELS)[number]
): boolean {
  const code = (section.title_code ?? "").trim().toUpperCase();
  if (canonical === "Inaccurate Photos or Descriptions" && code === "CUST_MENU_INACCURATE_PHOTOS") {
    return true;
  }
  if (canonical === "Items Missing from the Menu" && code === "CUST_MENU_ITEMS_MISSING") {
    return true;
  }
  if (canonical === "Other Issue" && code === "CUST_MENU_OTHER_ISSUE") {
    return true;
  }
  const text = norm(section.title_text ?? "");
  return ALIASES[canonical].includes(text);
}

/** Keep Help Topics order: photos → missing items → other. */
export function pickReportFraudMenuTopics(sections: ReportFraudCatalogTitle[]): ReportFraudMenuTopic[] {
  const out: ReportFraudMenuTopic[] = [];
  for (const label of REPORT_FRAUD_MENU_TOPIC_LABELS) {
    const hit = sections.find((section) => matchLabel(section, label));
    if (!hit) continue;
    out.push({
      ticket_title_id: hit.ticket_title_id,
      title_code: hit.title_code ?? null,
      title_text: label,
      section_id: hit.section_id ?? null,
    });
  }
  return out;
}
