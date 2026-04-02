/**
 * Structured search: customer id (GM…) or phone digits — goes straight to a single user when one match.
 * Everything else is treated as a name/text search (can return multiple rows → list).
 */
export function isStructuredCustomerSearch(query: string): boolean {
  const raw = query.trim();
  if (!raw) return false;
  const compact = raw.replace(/\s/g, "");
  if (/^GM\d+$/i.test(compact)) return true;
  const digits = compact.replace(/^\+/, "");
  if (/^91\d{10}$/.test(digits)) return true;
  if (/^\d{10,15}$/.test(digits)) return true;
  return false;
}
