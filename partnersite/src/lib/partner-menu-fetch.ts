export async function fetchMenuItemsList(storeId: string) {
  const res = await fetch(
    `/api/merchant/menu-items?storeId=${encodeURIComponent(storeId)}&view=list`,
    { credentials: 'include' },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? 'Failed to load menu');
  }
  const items = await res.json();
  return Array.isArray(items) ? items : [];
}
