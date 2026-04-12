/**
 * Normalize Postgres text[] / JS array / occasional string literal for ticket tags and similar columns.
 */
export function coerceSqlTextArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (s === "") return [];
    if (s.startsWith("{") && s.endsWith("}")) {
      const inner = s.slice(1, -1);
      if (inner === "") return [];
      const parts: string[] = [];
      let buf = "";
      let quoted = false;
      for (let i = 0; i < inner.length; i++) {
        const c = inner[i]!;
        if (c === '"') {
          quoted = !quoted;
          continue;
        }
        if (!quoted && c === ",") {
          const t = buf.trim();
          if (t) parts.push(t.replace(/^"(.*)"$/, "$1").replace(/""/g, '"'));
          buf = "";
          continue;
        }
        buf += c;
      }
      const last = buf.trim();
      if (last) parts.push(last.replace(/^"(.*)"$/, "$1").replace(/""/g, '"'));
      return parts.map((p) => p.trim()).filter(Boolean);
    }
    return [s];
  }
  const one = String(value).trim();
  return one ? [one] : [];
}
