/** Cross-component sync for GET /api/store-operations (dashboard card + header) without full page reload. */
export const PARTNER_STORE_OPERATIONS_REFRESH_EVENT = 'mx_partner:store_operations_refresh';

export type PartnerStoreOperationsRefreshDetail = { storeId: string };

export function emitPartnerStoreOperationsRefresh(storeId: string): void {
  if (typeof window === 'undefined' || !storeId) return;
  window.dispatchEvent(
    new CustomEvent<PartnerStoreOperationsRefreshDetail>(PARTNER_STORE_OPERATIONS_REFRESH_EVENT, {
      detail: { storeId },
    })
  );
}
