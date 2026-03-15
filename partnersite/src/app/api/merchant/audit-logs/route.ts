import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveStoreId(db: ReturnType<typeof getSupabase>, storeIdParam: string): Promise<number | null> {
  const { data, error } = await db
    .from('merchant_stores')
    .select('id')
    .eq('store_id', storeIdParam)
    .single();
  if (error || !data) return null;
  return data.id as number;
}

/**
 * GET /api/merchant/audit-logs?storeId=GMMC1001&limit=100
 * Returns combined audit logs from:
 * 1. merchant_store_status_log (who opened/closed, when, restriction type)
 * 2. merchant_audit_logs (settings changes, etc.)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 200);

    if (!storeId) return NextResponse.json({ error: 'storeId is required' }, { status: 400 });

    const db = getSupabase();
    const internalId = await resolveStoreId(db, storeId);
    if (internalId === null) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    // Fetch store status logs (open/close actions)
    const { data: statusLogs, error: statusError } = await db
      .from('merchant_store_status_log')
      .select('id, action, restriction_type, performed_by_id, performed_by_email, performed_by_name, created_at')
      .eq('store_id', internalId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (statusError) {
      console.error('Error fetching status logs:', statusError);
    }

    // Fetch audit logs (settings changes, etc.) — STORE entity
    const { data: auditLogs, error: auditError } = await db
      .from('merchant_audit_logs')
      .select('id, entity_type, action, action_field, entity_id, performed_by_id, performed_by_email, performed_by_name, created_at, audit_metadata')
      .eq('entity_type', 'STORE')
      .eq('entity_id', internalId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (auditError) {
      console.error('Error fetching audit logs:', auditError);
    }

    // Fetch offer IDs for this store, then audit logs for those offers
    const { data: offerRows } = await db
      .from('merchant_offers')
      .select('id')
      .eq('store_id', internalId);
    const offerIds = (offerRows || []).map((r: { id: number }) => r.id);
    let offerLogs: any[] = [];
    if (offerIds.length > 0) {
      const { data: offerAuditData } = await db
        .from('merchant_audit_logs')
        .select('id, entity_type, action, action_field, entity_id, performed_by_id, performed_by_email, performed_by_name, created_at, audit_metadata')
        .eq('entity_type', 'OFFER')
        .in('entity_id', offerIds)
        .order('created_at', { ascending: false })
        .limit(limit);
      offerLogs = offerAuditData || [];
    }

    // Combine and format logs
    const combinedLogs: any[] = [];

    // Format status logs
    if (statusLogs) {
      statusLogs.forEach((log: any) => {
        combinedLogs.push({
          id: `status-${log.id}`, // Prefix with type to ensure uniqueness
          originalId: log.id,
          action: log.action === 'OPEN' ? 'Store opened' : log.action === 'CLOSED' ? 'Store closed' : log.action,
          action_field: log.restriction_type || null,
          restriction_type: log.restriction_type || null,
          performed_by_id: log.performed_by_id,
          performed_by_email: log.performed_by_email,
          performed_by_name: log.performed_by_name,
          created_at: log.created_at,
          type: 'status',
        });
      });
    }

    // Format audit logs (settings changes — STORE)
    if (auditLogs) {
      auditLogs.forEach((log: any) => {
        const metadata = log.audit_metadata || {};
        const description = metadata.description || (log.action_field ? `${log.action_field} updated` : `${log.action} updated`);
        combinedLogs.push({
          id: `audit-${log.id}`,
          originalId: log.id,
          action: description,
          action_field: log.action_field || null,
          restriction_type: null,
          performed_by_id: log.performed_by_id,
          performed_by_email: log.performed_by_email,
          performed_by_name: log.performed_by_name,
          created_at: log.created_at,
          type: 'settings',
        });
      });
    }

    // Format offer audit logs (created/updated/deleted by whom)
    if (offerLogs.length > 0) {
      offerLogs.forEach((log: any) => {
        const metadata = log.audit_metadata || {};
        const description = metadata.description || `Offer ${log.action.toLowerCase()}`;
        combinedLogs.push({
          id: `offer-audit-${log.id}`,
          originalId: log.id,
          action: description,
          action_field: log.action_field || null,
          restriction_type: null,
          performed_by_id: log.performed_by_id,
          performed_by_email: log.performed_by_email,
          performed_by_name: log.performed_by_name,
          created_at: log.created_at,
          type: 'offer',
          entity_type: 'OFFER',
          entity_id: log.entity_id,
        });
      });
    }

    // Sort by created_at descending and limit
    combinedLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const limitedLogs = combinedLogs.slice(0, limit);

    return NextResponse.json({ logs: limitedLogs });
  } catch (err) {
    console.error('[audit-logs]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
