import { DEMO_RESTAURANT_ID } from '@/lib/constants';

/** Shared store_id validation (safe for API routes and client). */
const INVALID = new Set([
  '',
  'no id',
  'loading...',
  'unknown store',
  '—',
  '-',
  DEMO_RESTAURANT_ID.toLowerCase(),
]);

export function isValidPartnerStoreId(id?: string | null): boolean {
  const raw = (id || '').trim();
  if (!raw) return false;
  return !INVALID.has(raw.toLowerCase());
}
