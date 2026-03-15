/**
 * Central query key factory for cache consistency and invalidation.
 * Use these keys in hooks and when invalidating after mutations.
 */

export const merchantKeys = {
  all: ['merchant'] as const,
  wallet: (storeId: string) => [...merchantKeys.all, 'wallet', storeId] as const,
  ledger: (
    storeId: string,
    params?: { limit?: number; offset?: number; from?: string; to?: string; direction?: string; category?: string; search?: string }
  ) => [...merchantKeys.all, 'ledger', storeId, params ?? {}] as const,
  bankAccounts: (storeId: string) => [...merchantKeys.all, 'bank-accounts', storeId] as const,
  storeOperations: (storeId: string) => [...merchantKeys.all, 'store-operations', storeId] as const,
  storeSettings: (storeId: string) => [...merchantKeys.all, 'store-settings', storeId] as const,
  selfDeliveryRiders: (storeId: string) => [...merchantKeys.all, 'self-delivery-riders', storeId] as const,
  auditLogs: (storeId: string) => [...merchantKeys.all, 'audit-logs', storeId] as const,
  payoutQuote: (storeId: string, amount: number) => [...merchantKeys.all, 'payout-quote', storeId, amount] as const,
  orderDetails: (storeId: string, orderId: number) => [...merchantKeys.all, 'order-details', storeId, orderId] as const,
  payoutRequest: (storeId: string, payoutRequestId: number) => [...merchantKeys.all, 'payout-request', storeId, payoutRequestId] as const,
};
