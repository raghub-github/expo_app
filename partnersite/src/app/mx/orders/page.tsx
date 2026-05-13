import { redirect } from 'next/navigation';

/**
 * Redirect /mx/orders to /partners/orders.
 * Orders management is now under the /partners namespace.
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
  redirect(`/partners/orders${query ? `?${query}` : ''}`);
}
