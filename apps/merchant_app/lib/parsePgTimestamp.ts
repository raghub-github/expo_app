/** Parse Postgres / API timestamps reliably (Hermes-safe). */
export function parsePgTimestamp(value: unknown): Date | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const raw = String(value).trim();
  if (!raw || raw === "[object Object]") return null;

  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    const ms = raw.length <= 10 ? n * 1000 : n;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const d1 = new Date(raw);
  if (!Number.isNaN(d1.getTime())) return d1;

  const spaceFmt = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)(.*)$/);
  if (spaceFmt) {
    let time = spaceFmt[2].replace(/\.(\d{3})\d+/, ".$1");
    let tz = (spaceFmt[3] ?? "").trim();
    if (tz) {
      const off = tz.match(/^([+-])(\d{2})(?::?(\d{2}))?$/);
      if (off) tz = `${off[1]}${off[2]}:${off[3] ?? "00"}`;
    }
    const d2 = new Date(`${spaceFmt[1]}T${time}${tz}`);
    if (!Number.isNaN(d2.getTime())) return d2;
  }

  const m =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:([+-]\d{2})(?::?(\d{2}))?)?$/.exec(
      raw,
    );
  if (!m) return null;

  const [, y, mo, da, h, mi, s, frac, offH, offM] = m;
  const ms = frac ? Number(frac.slice(0, 3).padEnd(3, "0")) : 0;
  let utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), Number(s), ms);
  if (offH) {
    const sign = offH.startsWith("-") ? -1 : 1;
    const absH = Math.abs(Number(offH));
    const absM = offM ? Number(offM) : 0;
    utcMs -= sign * (absH * 60 + absM) * 60 * 1000;
  }
  const d3 = new Date(utcMs);
  return Number.isNaN(d3.getTime()) ? null : d3;
}

export function ledgerEntryTimestamp(entry: {
  created_at?: unknown;
  metadata?: Record<string, unknown> | null;
}): Date | null {
  const meta = entry.metadata ?? null;
  const candidates: unknown[] = [
    entry.created_at,
    meta?.completed_at,
    meta?.payout_date,
    meta?.requested_at,
    meta?.created_at,
  ];
  for (const c of candidates) {
    const d = parsePgTimestamp(c);
    if (d) return d;
  }
  return null;
}
