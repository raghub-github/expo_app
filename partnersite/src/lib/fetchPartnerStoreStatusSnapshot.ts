import { fetchBackendJson } from '@/lib/fetch-backend';

export type PartnerStoreStatusSnapshot = {
  store_id: number;
  is_open: boolean;
  operational_status: 'OPEN' | 'CLOSED';
  surface_online: boolean;
  within_operating_hours: boolean;
  is_active: boolean | null;
  is_accepting_orders: boolean | null;
  is_available: boolean | null;
  approval_status: string | null;
  is_delisted?: boolean;
  delisted_at?: string | null;
  auto_open_from_schedule: boolean;
  block_auto_open: boolean;
  manual_close_until: string | null;
  unavailable_reason: string | null;
  restriction_type: string | null;
  last_toggle_type: string | null;
  last_toggled_at: string | null;
  last_toggled_by_email: string | null;
  last_toggled_by_name: string | null;
  last_toggled_by_id: string | null;
};

/** Same source of truth as merchant app GET /merchant-partner/stores/:id/status. */
export async function fetchPartnerStoreStatusSnapshot(
  storeInternalId: number
): Promise<PartnerStoreStatusSnapshot | null> {
  if (!Number.isInteger(storeInternalId) || storeInternalId < 1) return null;
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!secret) {
    console.warn('[fetchPartnerStoreStatusSnapshot] BACKEND_SCHEDULE_TICK_SECRET is not set');
    return null;
  }

  return fetchBackendJson<PartnerStoreStatusSnapshot>(
    `/v1/internal/stores/${storeInternalId}/partner-status`,
    {
      headers: { 'X-Internal-Secret': secret },
      // Fail fast when Fastify is down — store-operations falls back to local DB.
      // Keep above fetch-backend default so a healthy-but-busy Fastify is not dropped.
      timeoutMs: 3_500,
    }
  );
}
