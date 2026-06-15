/** postgres.js bind params must be string/number — not raw Date objects. */
export function toTimestamptzParam(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

/** JSON for sql`...${json}::jsonb` — Dates/bigints are safe for postgres.js. */
export function jsonForSql(v: unknown): string {
  return JSON.stringify(v ?? {}, (_, val) => {
    if (typeof val === "bigint") return String(val);
    if (val instanceof Date) return val.toISOString();
    return val;
  });
}
