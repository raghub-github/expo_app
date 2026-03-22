/**
 * Types + parse for step_rejection_detail (MENU_REFERENCE snapshot).
 * Mirrors dashboard/src/lib/store-verification-menu-rejection-detail-shared.ts (no DB imports).
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

export type MenuEntryVerificationTag = "REJECTED" | "VERIFIED" | "PENDING" | "REUPLOADED";

export function parseMenuReferenceRejectionDetail(raw: unknown): MenuReferenceRejectionDetail | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind !== "MENU_REFERENCE" || o.version !== 1) return null;
  if (!Array.isArray(o.files)) return null;
  return raw as MenuReferenceRejectionDetail;
}

const ONBOARDING_MENU_IMAGE = "ONBOARDING_MENU_IMAGE";
const ONBOARDING_MENU_PDF = "ONBOARDING_MENU_PDF";

/** Row-level status for the menu PDF file inside a MENU_REFERENCE rejection snapshot (if any). */
export function menuPdfStatusFromRejectionDetail(detail: unknown): MenuEntryVerificationTag | null {
  const p = parseMenuReferenceRejectionDetail(detail);
  if (!p?.files?.length) return null;
  const pdf = p.files.find((f) => f.source_entity === ONBOARDING_MENU_PDF);
  if (!pdf) return null;
  const u = (pdf.row_verification_status || "PENDING").toUpperCase();
  if (u === "REJECTED") return "REJECTED";
  if (u === "VERIFIED") return "VERIFIED";
  if (u === "REUPLOADED") return "REUPLOADED";
  return "PENDING";
}

/**
 * Partner Step 3 PDF row tag: DB wins for verified/rejected/reuploaded; then rejection snapshot; then verification-fix fallback.
 */
export function resolvePartnerMenuPdfVerificationTag(args: {
  rawDbStatus?: string | null;
  snapshotPdfStatus: MenuEntryVerificationTag | null;
  menuStepVerificationFixActive?: boolean;
}): MenuEntryVerificationTag | null {
  const raw =
    typeof args.rawDbStatus === "string" && args.rawDbStatus.trim()
      ? args.rawDbStatus.trim().toUpperCase()
      : "";
  if (raw === "VERIFIED") return "VERIFIED";
  if (raw === "REUPLOADED") return "REUPLOADED";
  if (raw === "REJECTED") return "REJECTED";
  if (args.snapshotPdfStatus != null) return args.snapshotPdfStatus;
  if (raw === "PENDING") return "PENDING";
  if (args.menuStepVerificationFixActive) return "REJECTED";
  return null;
}

/**
 * Map menu image bundle entry_id → status at rejection snapshot time.
 */
export function menuReferenceEntryStatusesFromRejectionDetail(
  detail: unknown
): Record<string, MenuEntryVerificationTag> {
  const p = parseMenuReferenceRejectionDetail(detail);
  const out: Record<string, MenuEntryVerificationTag> = {};
  if (!p?.files?.length) return out;

  for (const f of p.files) {
    if (f.source_entity !== ONBOARDING_MENU_IMAGE) continue;
    if (f.reference_images && f.reference_images.length > 0) {
      for (const e of f.reference_images) {
        const id = e.entry_id != null ? String(e.entry_id).trim() : "";
        if (!id) continue;
        const u = (e.verification_status || "PENDING").toUpperCase();
        out[id] =
          u === "REJECTED" ? "REJECTED" : u === "VERIFIED" ? "VERIFIED" : "PENDING";
      }
    }
  }
  return out;
}

/**
 * Partner Step 3 thumbnail tag: rejection snapshot wins, else DB `verification_status` per entry, else fix-mode default.
 */
export function resolvePartnerMenuImageVerificationTag(args: {
  entryId: string;
  menuEntryRejectionStatuses: Record<string, MenuEntryVerificationTag>;
  hasMenuRejectionEntrySnapshot: boolean;
  rawDbStatus?: string | null;
  menuStepVerificationFixActive?: boolean;
}): MenuEntryVerificationTag | null {
  const {
    entryId,
    menuEntryRejectionStatuses,
    hasMenuRejectionEntrySnapshot,
    rawDbStatus,
    menuStepVerificationFixActive,
  } = args;
  // Live DB: accepted images stay accepted even if an old rejection snapshot still lists them as rejected.
  if (typeof rawDbStatus === "string" && rawDbStatus.trim().toUpperCase() === "VERIFIED") {
    return "VERIFIED";
  }
  if (typeof rawDbStatus === "string") {
    const ru = rawDbStatus.trim().toUpperCase();
    if (ru === "REUPLOADED") return "REUPLOADED";
  }
  if (hasMenuRejectionEntrySnapshot) {
    if (entryId && menuEntryRejectionStatuses[entryId] != null) {
      return menuEntryRejectionStatuses[entryId];
    }
    return "PENDING";
  }
  if (typeof rawDbStatus === "string") {
    const u = rawDbStatus.trim().toUpperCase();
    if (u === "REJECTED" || u === "VERIFIED" || u === "PENDING") {
      return u as MenuEntryVerificationTag;
    }
  }
  if (menuStepVerificationFixActive) return "REJECTED";
  return null;
}
