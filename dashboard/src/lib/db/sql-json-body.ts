/**
 * Coerce `Record<string, unknown>` JSON fields for postgres.js tagged templates.
 * postgres infers fragment types; `unknown` breaks inference (becomes `never`).
 */

export function bodyOptionalStr(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return String(v);
}

export function bodyNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function bodyNumOrNull(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function bodyBool(v: unknown, fallback: boolean): boolean {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "boolean") return v;
  if (v === "false" || v === 0 || v === "0") return false;
  return Boolean(v);
}

/** POST: text[] columns (allergens, item_tags) — array or comma-separated string; empty → null */
export function bodyTextArrayOrNull(v: unknown): string[] | null {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) {
    const a = v.map((x) => String(x).trim()).filter(Boolean);
    return a.length ? a : null;
  }
  if (typeof v === "string") {
    const a = v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return a.length ? a : null;
  }
  return null;
}

/** PATCH/PUT: optional string column */
export function mergeOptionalStr(bodyVal: unknown, existing: unknown): string | null {
  if (bodyVal !== undefined) {
    if (bodyVal === null) return null;
    return String(bodyVal);
  }
  if (existing === undefined || existing === null) return null;
  return String(existing);
}

/** PATCH/PUT: required numeric column */
export function mergeNum(bodyVal: unknown, existing: unknown): number {
  if (bodyVal !== undefined) {
    const n = Number(bodyVal);
    if (Number.isFinite(n)) return n;
  }
  const n = Number(existing);
  return Number.isFinite(n) ? n : 0;
}

/** PATCH/PUT: nullable numeric column */
export function mergeNumNullable(bodyVal: unknown, existing: unknown): number | null {
  if (bodyVal !== undefined) {
    if (bodyVal === null) return null;
    const n = Number(bodyVal);
    return Number.isFinite(n) ? n : null;
  }
  if (existing === undefined || existing === null) return null;
  const n = Number(existing);
  return Number.isFinite(n) ? n : null;
}

/** PATCH/PUT: boolean column */
export function mergeBool(bodyVal: unknown, existing: unknown): boolean {
  if (bodyVal !== undefined) {
    if (typeof bodyVal === "boolean") return bodyVal;
    if (bodyVal === "false" || bodyVal === 0 || bodyVal === "0") return false;
    return Boolean(bodyVal);
  }
  return Boolean(existing);
}

/** PATCH/PUT: allergens / string[] JSON */
export function mergeStringArray(bodyVal: unknown, existing: unknown): string[] {
  if (bodyVal !== undefined) {
    if (!Array.isArray(bodyVal)) return [];
    return bodyVal.map((x) => String(x));
  }
  if (Array.isArray(existing)) return existing.map((x) => String(x));
  return [];
}

/** PATCH/PUT: optional text[] from JSON array or comma-separated string */
export function mergeStringArrayOrComma(bodyVal: unknown, existing: unknown): string[] {
  if (bodyVal !== undefined) {
    if (bodyVal === null) return [];
    if (Array.isArray(bodyVal)) return bodyVal.map((x) => String(x).trim()).filter(Boolean);
    if (typeof bodyVal === "string") {
      return bodyVal
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  }
  if (Array.isArray(existing)) return existing.map((x) => String(x));
  return [];
}
