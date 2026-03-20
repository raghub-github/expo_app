/**
 * Normalize `db.execute()` results: postgres-js returns a RowList (array-like);
 * some drivers return `{ rows: T[] }`.
 */
export function rowsFromExecute<T = Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const r = (result as { rows?: T[] }).rows;
    return Array.isArray(r) ? r : [];
  }
  return [];
}
