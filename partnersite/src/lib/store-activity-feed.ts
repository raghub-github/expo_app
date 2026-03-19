/**
 * Unified store activity feed logger for partnersite (merchant actions).
 * Writes to the same store_activity_feed table as backend and dashboard.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface LogStoreActivityParams {
  storeId: number;
  section: string;
  action: string;
  entityId?: number | null;
  entityName?: string | null;
  summary: string;
  diff?: Record<string, unknown> | null;
  actorType?: 'merchant' | 'agent' | 'system';
  actorName?: string | null;
  actorEmail?: string | null;
}

export async function logStoreActivity(params: LogStoreActivityParams): Promise<void> {
  try {
    const db = getDb();
    await db.from('store_activity_feed').insert({
      store_id: params.storeId,
      section: params.section,
      action: params.action,
      entity_id: params.entityId ?? null,
      entity_name: params.entityName ?? null,
      summary: params.summary,
      diff: params.diff ?? null,
      actor_type: params.actorType ?? 'merchant',
      actor_name: params.actorName ?? null,
      actor_email: params.actorEmail ?? null,
      actor_id: null,
      source: 'partnersite',
    });
  } catch (e) {
    console.error('[store-activity-feed] partnersite log failed:', e);
  }
}
