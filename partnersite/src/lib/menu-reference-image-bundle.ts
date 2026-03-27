import { createHash, randomUUID } from "crypto";
import { extractR2KeyFromUrl } from "@/lib/r2";

/**
 * Display filename for menu thumbnails when JSONB bundle has no file_name — avoids stale names from registration_progress JSON.
 */
export function fileNameFromMenuStoredUrl(storedUrlOrKey: string | null | undefined): string | null {
  if (!storedUrlOrKey || typeof storedUrlOrKey !== "string") return null;
  const key =
    extractR2KeyFromUrl(storedUrlOrKey) ||
    (storedUrlOrKey.includes("://") ? null : storedUrlOrKey.replace(/^\/+/, ""));
  let path = key || "";
  if (!path && storedUrlOrKey.includes("://")) {
    try {
      path = new URL(storedUrlOrKey).pathname;
    } catch {
      path = storedUrlOrKey;
    }
  }
  if (!path) return null;
  const seg = path.split("/").filter(Boolean).pop();
  if (!seg) return null;
  const base = seg.split("?")[0];
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
}

export type MenuReferenceVerificationStatus = "PENDING" | "VERIFIED" | "REJECTED" | "REUPLOADED";

export type MenuReferenceImageEntry = {
  id: string;
  url: string;
  file_name?: string | null;
  verification_status?: MenuReferenceVerificationStatus | null;
};

export function normalizeMenuReferenceVerificationStatus(raw: unknown): MenuReferenceVerificationStatus {
  const u = String(raw ?? "").toUpperCase();
  if (u === "VERIFIED" || u === "REJECTED" || u === "REUPLOADED") return u;
  return "PENDING";
}

export function stableEntryIdForUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
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
        verification_status: normalizeMenuReferenceVerificationStatus(o.verification_status),
      });
    }
  }
  return out;
}

export function dedupeEntriesByUrl(entries: MenuReferenceImageEntry[]): MenuReferenceImageEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (!e.url || seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });
}

export type MenuReferenceMediaImageRow = {
  id: number;
  menu_reference_image_urls?: unknown;
  menu_url?: string | null;
  public_url?: string | null;
  r2_key?: string | null;
  original_file_name?: string | null;
  /** Row-level status when there is no JSONB bundle (single URL columns). */
  verification_status?: string | null;
};

/** Flatten one or more DB rows (legacy per-image rows or jsonb bundle) into deduped entries. */
export function entriesFromImageMediaRows(rows: MenuReferenceMediaImageRow[]): MenuReferenceImageEntry[] {
  const out: MenuReferenceImageEntry[] = [];
  for (const r of rows) {
    const parsed = parseMenuReferenceImageUrls(r.menu_reference_image_urls);
    if (parsed.length) {
      out.push(...parsed);
      continue;
    }
    const u = String(r.menu_url || r.public_url || r.r2_key || "").trim();
    if (u) {
      out.push({
        id: stableEntryIdForUrl(u),
        url: u,
        file_name: r.original_file_name ?? null,
        verification_status: normalizeMenuReferenceVerificationStatus(r.verification_status),
      });
    }
  }
  return dedupeEntriesByUrl(out);
}

export function newImageEntry(url: string, fileName: string | null | undefined): MenuReferenceImageEntry {
  return {
    id: randomUUID(),
    url,
    file_name: fileName ?? null,
    verification_status: "PENDING",
  };
}

/** One entry per image with the DB row that holds it (supports legacy one-row-per-image). */
export type MenuReferenceImageWithRow = MenuReferenceImageEntry & { rowId: number };

/**
 * URLs to resolve to R2 keys when deleting a MENU_REFERENCE row (jsonb bundle or legacy single URL columns).
 */
export function collectMenuReferenceRowUrlsForR2Purge(row: {
  menu_reference_image_urls?: unknown;
  menu_url?: string | null;
  public_url?: string | null;
  r2_key?: string | null;
}): string[] {
  const fromBundle = parseMenuReferenceImageUrls(row.menu_reference_image_urls)
    .map((e) => String(e.url || "").trim())
    .filter(Boolean);
  if (fromBundle.length > 0) {
    return [...new Set(fromBundle)];
  }
  const singles = [row.menu_url, row.public_url, row.r2_key]
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean);
  return [...new Set(singles)];
}

export function entriesWithRowMetaFromImageRows(rows: MenuReferenceMediaImageRow[]): MenuReferenceImageWithRow[] {
  const merged = new Map<string, MenuReferenceImageWithRow>();
  for (const r of rows) {
    const parsed = parseMenuReferenceImageUrls(r.menu_reference_image_urls);
    const put = (e: MenuReferenceImageEntry) => {
      if (!e.url || merged.has(e.url)) return;
      merged.set(e.url, { ...e, rowId: r.id });
    };
    if (parsed.length) {
      for (const e of parsed) put(e);
    } else {
      const u = String(r.menu_url || r.public_url || r.r2_key || "").trim();
      if (u) {
        put({
          id: stableEntryIdForUrl(u),
          url: u,
          file_name: r.original_file_name ?? null,
          verification_status: normalizeMenuReferenceVerificationStatus(r.verification_status),
        });
      }
    }
  }
  return [...merged.values()];
}
