'use client';

import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  keepPreviousData,
} from '@tanstack/react-query';
import { merchantKeys } from '@/lib/query-keys';

// ---------- Types ----------
export interface WalletSummary {
  available_balance: number;
  pending_balance: number;
  today_earning: number;
  yesterday_earning: number;
  total_earned: number;
  total_withdrawn: number;
  pending_withdrawal_total: number;
}

export interface LedgerEntry {
  id: number;
  direction: 'CREDIT' | 'DEBIT';
  category: string;
  balance_type: string;
  amount: number;
  balance_after: number;
  reference_type: string;
  reference_id: number | null;
  reference_extra: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  order_id: number | null;
  formatted_order_id: string | null;
  table_id: string | null;
}

export interface LedgerResponse {
  entries: LedgerEntry[];
  total: number;
}

export interface BankAccount {
  id: number;
  account_holder_name: string;
  account_number_masked: string | null;
  ifsc_code: string;
  bank_name: string;
  upi_id: string | null;
  is_primary: boolean;
  is_active: boolean;
  is_disabled: boolean;
  payout_method: string;
}

export interface SelfDeliveryRider {
  id: number;
  rider_name: string;
  rider_mobile: string;
  has_active_orders: boolean;
}

export interface StoreOperationsData {
  operational_status: string;
  opens_at?: string | null;
  today_date?: string;
  today_slots?: { start: string; end: string }[];
  last_toggled_by_email?: string | null;
  last_toggle_type?: string | null;
  last_toggled_by_name?: string | null;
  last_toggled_by_id?: string | number | null;
  restriction_type?: string | null;
  within_hours_but_restricted?: boolean;
  last_toggled_at?: string | null;
  block_auto_open?: boolean;
  is_today_scheduled_closed?: boolean;
}

export interface StoreSettingsData {
  self_delivery?: boolean;
}

// ---------- Fetchers ----------
async function fetchWallet(storeId: string): Promise<WalletSummary> {
  const res = await fetch(`/api/merchant/wallet?storeId=${encodeURIComponent(storeId)}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return {
    available_balance: data.available_balance ?? 0,
    pending_balance: data.pending_balance ?? 0,
    today_earning: data.today_earning ?? 0,
    yesterday_earning: data.yesterday_earning ?? 0,
    total_earned: data.total_earned ?? 0,
    total_withdrawn: data.total_withdrawn ?? 0,
    pending_withdrawal_total: data.pending_withdrawal_total ?? 0,
  };
}

async function fetchLedger(
  storeId: string,
  params: { limit: number; offset: number; from?: string; to?: string; direction?: string; category?: string; search?: string }
): Promise<LedgerResponse> {
  const search = new URLSearchParams({ storeId, limit: String(params.limit), offset: String(params.offset) });
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (params.direction && params.direction !== 'all') search.set('direction', params.direction);
  if (params.category) search.set('category', params.category);
  if (params.search?.trim()) search.set('search', params.search.trim());
  const res = await fetch(`/api/merchant/wallet/ledger?${search}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return { entries: data.entries ?? [], total: data.total ?? 0 };
}

async function fetchBankAccounts(storeId: string): Promise<BankAccount[]> {
  const res = await fetch(`/api/merchant/bank-accounts?storeId=${encodeURIComponent(storeId)}`);
  const data = await res.json();
  if (!data.success || !Array.isArray(data.accounts)) return [];
  return data.accounts.map((a: Record<string, unknown>) => ({
    id: a.id as number,
    account_holder_name: a.account_holder_name as string,
    account_number_masked: (a.account_number_masked as string) ?? null,
    ifsc_code: a.ifsc_code as string,
    bank_name: a.bank_name as string,
    upi_id: (a.upi_id as string) ?? null,
    is_primary: !!a.is_primary,
    is_active: !!a.is_active,
    is_disabled: !!a.is_disabled,
    payout_method: (a.payout_method as string) ?? 'bank',
  }));
}

async function fetchStoreOperations(storeId: string): Promise<StoreOperationsData> {
  const res = await fetch(`/api/store-operations?store_id=${encodeURIComponent(storeId)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to fetch store operations');
  return data;
}

async function fetchStoreSettings(storeId: string): Promise<StoreSettingsData> {
  const res = await fetch(`/api/merchant/store-settings?storeId=${encodeURIComponent(storeId)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to fetch store settings');
  return data;
}

async function fetchSelfDeliveryRiders(storeId: string): Promise<SelfDeliveryRider[]> {
  const res = await fetch(`/api/merchant/self-delivery-riders?storeId=${encodeURIComponent(storeId)}`);
  const data = await res.json();
  if (!res.ok || !data.riders) return [];
  return data.riders.map((r: Record<string, unknown>) => ({
    id: r.id as number,
    rider_name: r.rider_name as string,
    rider_mobile: r.rider_mobile as string,
    has_active_orders: !!r.has_active_orders,
  }));
}

// ---------- Hooks ----------

/** Wallet summary; shared cache between dashboard and payments. */
export function useMerchantWallet(storeId: string | null, options?: { enabled?: boolean }) {
  const enabled = (options?.enabled ?? true) && !!storeId;
  return useQuery({
    queryKey: merchantKeys.wallet(storeId ?? ''),
    queryFn: () => fetchWallet(storeId!),
    enabled,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/** Paginated ledger with filters; keepPreviousData for smooth pagination. */
export function useMerchantLedger(
  storeId: string | null,
  params: { limit: number; offset: number; from?: string; to?: string; direction?: string; category?: string; search?: string },
  options?: { enabled?: boolean }
) {
  const enabled = (options?.enabled ?? true) && !!storeId;
  return useQuery({
    queryKey: merchantKeys.ledger(storeId ?? '', params),
    queryFn: () => fetchLedger(storeId!, params),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 45 * 1000,
  });
}

/** Bank accounts; refetch when withdrawal/bank section is opened. */
export function useMerchantBankAccounts(storeId: string | null, options?: { enabled?: boolean }) {
  const enabled = (options?.enabled ?? true) && !!storeId;
  return useQuery({
    queryKey: merchantKeys.bankAccounts(storeId ?? ''),
    queryFn: () => fetchBankAccounts(storeId!),
    enabled,
  });
}

/** Store open/closed, slots, last toggled; used by dashboard. */
export function useStoreOperations(storeId: string | null, options?: { enabled?: boolean }) {
  const enabled = (options?.enabled ?? true) && !!storeId;
  return useQuery({
    queryKey: merchantKeys.storeOperations(storeId ?? ''),
    queryFn: () => fetchStoreOperations(storeId!),
    enabled,
    staleTime: 20 * 1000,
  });
}

/** Self-delivery toggle; used by dashboard. */
export function useStoreSettings(storeId: string | null, options?: { enabled?: boolean }) {
  const enabled = (options?.enabled ?? true) && !!storeId;
  return useQuery({
    queryKey: merchantKeys.storeSettings(storeId ?? ''),
    queryFn: () => fetchStoreSettings(storeId!),
    enabled,
  });
}

/** Self-delivery riders list; only when self-delivery is on. */
export function useSelfDeliveryRiders(storeId: string | null, enabled: boolean) {
  const shouldFetch = !!storeId && enabled;
  return useQuery({
    queryKey: merchantKeys.selfDeliveryRiders(storeId ?? ''),
    queryFn: () => fetchSelfDeliveryRiders(storeId!),
    enabled: shouldFetch,
    staleTime: 30 * 1000,
  });
}

// ---------- Mutations with cache invalidation ----------

export function usePayoutRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { storeId: string; amount: number; bank_account_id: number }) => {
      const res = await fetch('/api/merchant/payout-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Withdrawal request failed');
      if (!data.success) throw new Error(data.error ?? 'Withdrawal request failed');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: merchantKeys.wallet(variables.storeId) });
      queryClient.invalidateQueries({ queryKey: [...merchantKeys.all, 'ledger', variables.storeId] });
    },
  });
}

export function useInvalidateMerchantWallet() {
  const queryClient = useQueryClient();
  return (storeId: string) => {
    queryClient.invalidateQueries({ queryKey: merchantKeys.wallet(storeId) });
  };
}

export function useInvalidateMerchantLedger() {
  const queryClient = useQueryClient();
  return (storeId: string) => {
    queryClient.invalidateQueries({ queryKey: [...merchantKeys.all, 'ledger', storeId] });
  };
}

export function useInvalidateBankAccounts() {
  const queryClient = useQueryClient();
  return (storeId: string) => {
    queryClient.invalidateQueries({ queryKey: merchantKeys.bankAccounts(storeId) });
  };
}

export function useInvalidateStoreOperations() {
  const queryClient = useQueryClient();
  return (storeId: string) => {
    queryClient.invalidateQueries({ queryKey: merchantKeys.storeOperations(storeId) });
  };
}

export function useInvalidateSelfDeliveryRiders() {
  const queryClient = useQueryClient();
  return (storeId: string) => {
    queryClient.invalidateQueries({ queryKey: merchantKeys.selfDeliveryRiders(storeId) });
  };
}
