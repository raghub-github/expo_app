/**
 * Link item cuisine selections to the store profile via cuisine_master + plan limits
 * (POST /api/merchant/store-cuisines/link or ensure-name). Call after a menu item is saved successfully.
 *
 * Free-text cuisines that are not in the catalog are still added (created + linked).
 * Failures here must not block the already-saved menu item — keep errors soft.
 */
export async function linkItemCuisineSelectionsToStoreProfile(
  storeId: string,
  cuisineTypeCsv: string | null | undefined
): Promise<{ linked: number; errors: string[] }> {
  const names = (cuisineTypeCsv ?? '')
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

  // Auth / load failures: item is already saved — do not surface a hard toast.
  if (!res.ok) {
    console.warn('[linkItemCuisines] Could not load store cuisines', res.status);
    // Still try ensure-by-name so free-text cuisines get created/linked when possible.
    return ensureNamesWithoutCatalog(storeId, names);
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
        // Fall back to ensure-by-name (covers inactive catalog rows, etc.)
        const ensured = await ensureOneName(storeId, name);
        if (ensured.ok) {
          linked++;
          linkedNames.add(key);
        } else if (ensured.message) {
          errors.push(ensured.message);
        }
      }
    } else {
      // Not in catalog — create + link instead of blocking the partner.
      const ensured = await ensureOneName(storeId, name);
      if (ensured.ok) {
        linked++;
        linkedNames.add(key);
      } else if (ensured.message) {
        // Only surface plan-limit style errors; never "not in catalog".
        errors.push(ensured.message);
      }
    }
  }

  return { linked, errors };
}

async function ensureOneName(
  storeId: string,
  name: string
): Promise<{ ok: boolean; message?: string }> {
  const lr = await fetch('/api/merchant/store-cuisines/ensure-name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ storeId, name }),
  });
  if (lr.ok) return { ok: true };
  const err = (await lr.json().catch(() => ({}))) as { message?: string; error?: string };
  const message =
    typeof err.message === 'string' && err.message.trim()
      ? err.message
      : typeof err.error === 'string' && err.error !== 'Not authenticated' && err.error !== 'Merchant not found'
        ? err.error
        : undefined;
  // Soft-skip auth/transient failures so item save UX stays clean.
  if (lr.status === 401 || lr.status === 403) {
    console.warn('[linkItemCuisines] ensure-name auth failed', lr.status, name);
    return { ok: false };
  }
  return { ok: false, message: message || `Could not add "${name}"` };
}

async function ensureNamesWithoutCatalog(
  storeId: string,
  names: string[]
): Promise<{ linked: number; errors: string[] }> {
  let linked = 0;
  const errors: string[] = [];
  for (const name of names) {
    const ensured = await ensureOneName(storeId, name);
    if (ensured.ok) linked++;
    else if (ensured.message) errors.push(ensured.message);
  }
  return { linked, errors };
}
