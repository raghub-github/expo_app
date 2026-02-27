import { redirect } from 'next/navigation';

/**
 * Redirect /mx/orders to /mx/food-orders.
 * Orders management is now in the Food Orders page.
 */
export default async function OrdersRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = new URLSearchParams();
  if (params?.storeId && typeof params.storeId === 'string') q.set('storeId', params.storeId);
  if (params?.store_id && typeof params.store_id === 'string') q.set('storeId', params.store_id);
  if (params?.filter && typeof params.filter === 'string') q.set('filter', params.filter);
  const query = q.toString();
  redirect(`/mx/food-orders${query ? `?${query}` : ''}`);
}
