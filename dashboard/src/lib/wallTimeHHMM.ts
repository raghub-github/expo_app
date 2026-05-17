/**
 * Normalize DB / JSON time values to `HH:mm` for UI and validators.
 * Supports `09:30`, `09:30:00`, ISO fragments (`1970-01-01T09:30:00Z`), and offset suffixes.
 */

export function normalizeWallTimeToHHMM(value: unknown): string | null {
  if (value == null || value === "" || value === false) return null;
  if (typeof value === "object" && value !== null && value instanceof Date && !isNaN(value.getTime())) {
    const h = Math.min(23, Math.max(0, value.getHours()));
    const m = Math.min(59, Math.max(0, value.getMinutes()));
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  let s = String(value).trim();
  if (!s || s === "null" || s === "undefined") return null;
  const tIdx = s.indexOf("T");
  if (tIdx !== -1) {
    s = s.slice(tIdx + 1);
  }
  s = s.replace(/Z$/i, "").trim();
  s = s.replace(/\.\d+/, "");
  const withTz = s.match(/^(.+?)([+-]\d{2}:?\d{2})$/);
  if (withTz) s = withTz[1].trim();
  const match = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
