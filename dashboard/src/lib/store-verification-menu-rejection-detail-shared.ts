/**
 * Types + parse only (safe for client components — no DB imports).
 */

export type MenuReferenceRejectionDetailFile = {
  media_file_id: number;
  source_entity: string | null;
  label: string;
  row_verification_status: string;
  original_file_name: string | null;
  reference_images?: Array<{
    entry_id: string;
    file_name: string | null;
    verification_status: string;
  }>;
};

export type MenuReferenceRejectionDetail = {
  version: 1;
  kind: "MENU_REFERENCE";
  captured_at: string;
  files: MenuReferenceRejectionDetailFile[];
};

export function parseMenuReferenceRejectionDetail(raw: unknown): MenuReferenceRejectionDetail | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind !== "MENU_REFERENCE" || o.version !== 1) return null;
  if (!Array.isArray(o.files)) return null;
  return raw as MenuReferenceRejectionDetail;
}

export function statusChipClass(status: string): string {
  const u = status.toUpperCase();
  if (u === "VERIFIED") return "bg-emerald-100 text-emerald-900";
  if (u === "REJECTED") return "bg-red-100 text-red-900";
  if (u === "REUPLOADED") return "bg-indigo-100 text-indigo-900";
  return "bg-amber-50 text-amber-950";
}

export function statusLabel(status: string): string {
  const u = status.toUpperCase();
  if (u === "VERIFIED") return "Verified";
  if (u === "REJECTED") return "Rejected";
  if (u === "REUPLOADED") return "Reuploaded";
  return "Pending";
}

/** One-line summary for compact UI (e.g. store card). */
export function summarizeMenuRejectionDetail(detail: unknown): string | null {
  const p = parseMenuReferenceRejectionDetail(detail);
  if (!p?.files?.length) return null;
  let rej = 0;
  let ver = 0;
  let pen = 0;
  for (const f of p.files) {
    if (f.reference_images && f.reference_images.length > 0) {
      for (const e of f.reference_images) {
        const u = (e.verification_status || "PENDING").toUpperCase();
        if (u === "REJECTED") rej += 1;
        else if (u === "VERIFIED") ver += 1;
        else pen += 1;
      }
    } else {
      const u = (f.row_verification_status || "PENDING").toUpperCase();
      if (u === "REJECTED") rej += 1;
      else if (u === "VERIFIED") ver += 1;
      else pen += 1;
    }
  }
  const parts: string[] = [];
  if (rej) parts.push(`${rej} rejected`);
  if (ver) parts.push(`${ver} verified`);
  if (pen) parts.push(`${pen} pending`);
  return parts.length ? `Menu: ${parts.join(", ")}` : null;
}
