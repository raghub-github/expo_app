/**
 * Parse corporate web enquiry fields from ticket description (portal body text).
 * Matches lines like **Company:** GMitra, **Work email:** a@b.c, **Phone:** 9113194305
 */

export type CorporateEnquiryParsed = {
  corporateEntityName: string | null;
  corporateEntityPhone: string | null;
  corporateEntityEmail: string | null;
};

function stripMarkdownBold(s: string): string {
  return s.replace(/\*\*/g, "").trim();
}

/** Capture value after Label: on a line (optional ** around label). */
function matchLabelLine(text: string, label: string): string | null {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(?:^|\\n)\\s*(?:\\*\\*)?${esc}\\s*:\\s*(?:\\*\\*)?\\s*(.+?)(?=\\n|$)`,
    "ims"
  );
  const m = text.match(re);
  if (!m?.[1]) return null;
  const v = stripMarkdownBold(m[1]);
  return v.length ? v : null;
}

export function parseCorporateEnquiryFromDescription(description: string | null | undefined): CorporateEnquiryParsed {
  if (!description || typeof description !== "string") {
    return { corporateEntityName: null, corporateEntityPhone: null, corporateEntityEmail: null };
  }
  const text = description;
  return {
    corporateEntityName: matchLabelLine(text, "Company"),
    corporateEntityPhone: matchLabelLine(text, "Phone"),
    corporateEntityEmail: matchLabelLine(text, "Work email"),
  };
}

export function isCorporateEnquiryTicket(subject: string, description: string, titleText: string | null | undefined): boolean {
  const sub = (subject || "").toLowerCase();
  if (/\bcorporate\s+enquiry\b/i.test(subject || "")) return true;
  const desc = description || "";
  if (/CORPORATE_WEB|corporate\s+web\s+enquiry/i.test(desc)) return true;
  const tt = (titleText || "").toLowerCase();
  if (tt.includes("corporate") && tt.includes("enquir")) return true;
  const parsed = parseCorporateEnquiryFromDescription(desc);
  return Boolean(parsed.corporateEntityName || (parsed.corporateEntityEmail && parsed.corporateEntityPhone));
}

export function isSystemOtherTicketGroup(group: { groupName?: string; groupCode?: string } | null | undefined): boolean {
  if (!group) return false;
  const name = (group.groupName ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (name === "system / other" || name === "system/other") return true;
  const code = (group.groupCode ?? "").toUpperCase().replace(/-/g, "_");
  return code === "SYSTEM_OTHER" || code === "SYSTEM/OTHER";
}
