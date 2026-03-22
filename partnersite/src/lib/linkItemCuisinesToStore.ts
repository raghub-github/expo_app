/**
 * Link item cuisine selections to the store profile via cuisine_master + plan limits
 * (POST /api/merchant/store-cuisines/link). Call after a menu item is saved successfully.
 */
export async function linkItemCuisineSelectionsToStoreProfile(
  storeId: string,
  cuisineTypeCsv: string | null | undefined
): Promise<{ linked: number; errors: string[] }> {
  const names = (cuisineTypeCsv ?? "")
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length === 0) return { linked: 0, errors: [] };

  const res = await fetch(`/api/merchant/store-cuisines?storeId=${encodeURIComponent(storeId)}`, {
    credentials: 'include',
  });
  const data = (await res.json().catch(() => ({}))) as {
    cuisines?: unknown;
    cuisineDetails?: Array<{ id?: number; name?: string }>;
    catalog?: Array<{ id?: number; name?: string }>;
  };
  if (!res.ok) {
    return { linked: 0, errors: ['Could not load store cuisines'] };
  }

  const linkedNames = new Set<string>();
  if (Array.isArray(data.cuisines)) {
    for (const c of data.cuisines) {
      if (typeof c === 'string') linkedNames.add(c.toLowerCase().trim());
    }
  }
  if (Array.isArray(data.cuisineDetails)) {
    for (const d of data.cuisineDetails) {
      const n = typeof d?.name === 'string' ? d.name.toLowerCase().trim() : '';
      if (n) linkedNames.add(n);
    }
  }

  const catalog = Array.isArray(data.catalog) ? data.catalog : [];
  const catalogByName = new Map(
    catalog
      .filter((c) => c && typeof c.name === 'string' && typeof c.id === 'number')
      .map((c) => [c.name!.toLowerCase().trim(), c])
  );

  let linked = 0;
  const errors: string[] = [];

  for (const name of names) {
    const key = name.toLowerCase().trim();
    if (!key) continue;
    if (linkedNames.has(key)) continue;

    const cat = catalogByName.get(key);
    if (cat?.id) {
      const lr = await fetch('/api/merchant/store-cuisines/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ storeId, cuisine_id: cat.id }),
      });
      if (lr.ok) {
        linked++;
        linkedNames.add(key);
        catalogByName.delete(key);
      } else {
        const err = (await lr.json().catch(() => ({}))) as { message?: string; error?: string };
        errors.push(
          typeof err.message === 'string' && err.message.trim()
            ? err.message
            : typeof err.error === 'string'
              ? err.error
              : `Could not link "${name}"`
        );
      }
    } else {
      errors.push(
        `"${name}" is not available in the cuisine catalog. Pick a cuisine from the list or ask support to add it.`
      );
    }
  }

  return { linked, errors };
}
