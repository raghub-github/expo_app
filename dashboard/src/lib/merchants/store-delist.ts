/** Operational delist is `delisted_at` (and legacy `approval_status = DELISTED`). */
export function isStoreDelisted(row: {
  approval_status?: unknown;
  delisted_at?: unknown;
  is_delisted?: unknown;
  isDelisted?: unknown;
} | null | undefined): boolean {
  if (!row) return false;
  if (row.is_delisted === true || row.isDelisted === true) return true;
  if (row.delisted_at != null && String(row.delisted_at).trim() !== "") return true;
  return String(row.approval_status ?? "").toUpperCase() === "DELISTED";
}
