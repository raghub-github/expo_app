export function parseYmdBound(ymd: string, endOfDay: boolean): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (endOfDay) return new Date(y, mo, d, 23, 59, 59, 999);
  return new Date(y, mo, d, 0, 0, 0, 0);
}
