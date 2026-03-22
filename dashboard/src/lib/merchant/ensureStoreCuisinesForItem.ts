/**
 * After saving a menu item, link any selected cuisines that exist in cuisine_master
 * but are not yet on the store profile. Plan limits are enforced by the link API.
 */
export async function ensureStoreCuisinesLinkedForItemNames(
  storeId: string,
  cuisineTypeCsv: string | null | undefined
): Promise<{ linked: number; skippedMessages: string[] }> {
  const names = (cuisineTypeCsv ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length === 0) return { linked: 0, skippedMessages: [] };

  const res = await fetch(`/api/merchant/stores/${storeId}/menu/cuisines`, { credentials: "include" });
  const j = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    cuisines?: Array<{ id: number; name: string }>;
    catalog?: Array<{ id: number; name: string }>;
  };
  if (!res.ok || j.success === false) {
    return { linked: 0, skippedMessages: ["Could not load store cuisines"] };
  }

  const linkedList = Array.isArray(j.cuisines) ? j.cuisines : [];
  const catalogList = Array.isArray(j.catalog) ? j.catalog : [];
  const linkedLower = new Set(linkedList.map((c) => c.name.toLowerCase().trim()));
  const catalogByLower = new Map(catalogList.map((c) => [c.name.toLowerCase().trim(), c]));

  let linked = 0;
  const skippedMessages: string[] = [];

  for (const name of names) {
    const key = name.toLowerCase().trim();
    if (!key) continue;
    if (linkedLower.has(key)) continue;

    const cat = catalogByLower.get(key);
    if (cat) {
      const lr = await fetch(`/api/merchant/stores/${storeId}/menu/cuisines/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cuisine_id: cat.id }),
      });
      if (lr.ok) {
        linked++;
        linkedLower.add(key);
        catalogByLower.delete(key);
      } else {
        const err = (await lr.json().catch(() => ({}))) as { message?: string; error?: string };
        skippedMessages.push(
          typeof err.message === "string" && err.message.trim()
            ? err.message
            : typeof err.error === "string"
              ? err.error
              : `Could not link "${name}"`
        );
      }
    } else {
      const cr = await fetch(`/api/merchant/stores/${storeId}/menu/cuisines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      if (cr.ok || cr.status === 409) {
        linked++;
        linkedLower.add(key);
      } else {
        const err = (await cr.json().catch(() => ({}))) as { message?: string; error?: string };
        skippedMessages.push(
          typeof err.message === "string" && err.message.trim()
            ? err.message
            : typeof err.error === "string"
              ? err.error
              : `Could not add "${name}" to store cuisines`
        );
      }
    }
  }

  return { linked, skippedMessages };
}
