import type { SupabaseClient } from '@supabase/supabase-js';

export async function resolveMerchantStoreId(
  db: SupabaseClient,
  publicStoreId: string
): Promise<number | null> {
  const { data, error } = await db
    .from('merchant_stores')
    .select('id')
    .eq('store_id', publicStoreId.trim())
    .single();
  if (error || !data) return null;
  return data.id as number;
}

export async function resolveMerchantWalletId(
  db: SupabaseClient,
  merchantStoreId: number
): Promise<number | null> {
  const { data } = await db
    .from('merchant_wallet')
    .select('id')
    .eq('merchant_store_id', merchantStoreId)
    .maybeSingle();
  return data?.id != null ? (data.id as number) : null;
}

/** IST calendar date key YYYY-MM-DD */
export function istDateKeyFromIso(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function istTodayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Last N calendar days in IST ending today (inclusive). */
export function istDateKeysForLastDays(dayCount: number): string[] {
  const keys: string[] = [];
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const now = new Date();
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    keys.push(fmt.format(d));
  }
  return keys;
}

export function istDayLabel(dateKey: string, style: 'short' | 'weekday'): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (style === 'weekday') {
    return dt.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });
  }
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
