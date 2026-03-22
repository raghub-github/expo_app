import { createHash } from "crypto";

export type MenuReferenceImageEntry = {
  id: string;
  url: string;
  file_name?: string | null;
  verification_status?: "PENDING" | "VERIFIED" | "REJECTED" | "REUPLOADED" | null;
};

export type MenuReferenceVerificationStatus = "PENDING" | "VERIFIED" | "REJECTED" | "REUPLOADED";

export function stableEntryIdForUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

function normalizeVerificationStatus(raw: unknown): MenuReferenceVerificationStatus {
  const u = String(raw ?? "").toUpperCase();
  if (u === "VERIFIED" || u === "REJECTED" || u === "REUPLOADED") return u;
  return "PENDING";
}

export function parseMenuReferenceImageUrls(raw: unknown): MenuReferenceImageEntry[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  const out: MenuReferenceImageEntry[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const u = item.trim();
      if (u) {
        out.push({
          id: stableEntryIdForUrl(u),
          url: u,
          verification_status: "PENDING",
        });
      }
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const u = typeof o.url === "string" ? o.url.trim() : "";
      if (!u) continue;
      const id =
        typeof o.id === "string" && o.id.trim()
          ? o.id.trim()
          : stableEntryIdForUrl(u);
      out.push({
        id,
        url: u,
        file_name: typeof o.file_name === "string" ? o.file_name : null,
        verification_status: normalizeVerificationStatus(o.verification_status),
      });
    }
  }
  return out;
}

export function serializeMenuReferenceEntriesForDb(entries: MenuReferenceImageEntry[]): unknown[] {
  return entries.map((e) => {
    const o: Record<string, unknown> = { id: e.id, url: e.url };
    if (e.file_name) o.file_name = e.file_name;
    const st = e.verification_status ?? "PENDING";
    if (st !== "PENDING") o.verification_status = st;
    return o;
  });
}

export function aggregateBundleVerificationStatus(
  entries: MenuReferenceImageEntry[]
): MenuReferenceVerificationStatus {
  if (entries.length === 0) return "PENDING";
  const normalized = entries.map((e) => {
    const s = String(e.verification_status ?? "PENDING").toUpperCase();
    if (s === "REUPLOADED") return "PENDING";
    return s;
  });
  if (normalized.every((s) => s === "VERIFIED")) return "VERIFIED";
  if (normalized.some((s) => s === "REJECTED")) return "REJECTED";
  return "PENDING";
}

export function setAllBundleEntryStatuses(
  raw: unknown,
  status: MenuReferenceVerificationStatus
): unknown[] | null {
  const entries = parseMenuReferenceImageUrls(raw);
  if (entries.length === 0) return null;
  return serializeMenuReferenceEntriesForDb(entries.map((e) => ({ ...e, verification_status: status })));
}

/**
 * Step-3 email rejection: mark non-verified bundle entries REJECTED; keep VERIFIED so re-uploads do not lose accepted images.
 */
export function setBundleEntriesRejectedPreservingVerified(raw: unknown): unknown[] | null {
  const entries = parseMenuReferenceImageUrls(raw);
  if (entries.length === 0) return null;
  return serializeMenuReferenceEntriesForDb(
    entries.map((e) => {
      const st = (e.verification_status ?? "PENDING").toUpperCase();
      if (st === "VERIFIED") return { ...e, verification_status: "VERIFIED" as const };
      return { ...e, verification_status: "REJECTED" as const };
    })
  );
}

/** Update one entry by `id` in a JSONB bundle; returns serialized array or null if bundle empty / id not found. */
export function patchBundleEntryVerification(
  raw: unknown,
  entryId: string,
  status: MenuReferenceVerificationStatus
): { next: unknown[]; found: boolean } | null {
  const entries = parseMenuReferenceImageUrls(raw);
  if (entries.length === 0) return null;
  let found = false;
  const next = entries.map((e) => {
    if (e.id === entryId) {
      found = true;
      return { ...e, verification_status: status };
    }
    return e;
  });
  if (!found) return null;
  return { next: serializeMenuReferenceEntriesForDb(next), found: true };
}
