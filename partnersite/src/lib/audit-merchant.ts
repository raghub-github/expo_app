/**
 * Audit logging for merchant-scoped actions (bank accounts, withdrawals, etc.).
 * Writes to merchant_audit_logs so activity shows in the store's audit log.
 */

import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveMerchantOwnerDisplayName(user: {
  id: string;
  email?: string | null;
}): Promise<string | null> {
  try {
    const db = getSupabaseAdmin();
    const { data: byUser } = await db
      .from('merchant_parents')
      .select('owner_name, parent_name')
      .eq('supabase_user_id', user.id)
      .maybeSingle();
    const fromUser =
      (typeof byUser?.owner_name === 'string' && byUser.owner_name.trim()) ||
      (typeof byUser?.parent_name === 'string' && byUser.parent_name.trim()) ||
      null;
    if (fromUser) return fromUser;

    const email = user.email?.trim();
    if (!email) return null;
    const { data: byEmail } = await db
      .from('merchant_parents')
      .select('owner_name, parent_name')
      .eq('owner_email', email)
      .maybeSingle();
    return (
      (typeof byEmail?.owner_name === 'string' && byEmail.owner_name.trim()) ||
      (typeof byEmail?.parent_name === 'string' && byEmail.parent_name.trim()) ||
      null
    );
  } catch {
    return null;
  }
}

export type AuditActor = {
  performed_by: 'MERCHANT' | 'ADMIN' | 'SYSTEM' | 'AREA_MANAGER';
  performed_by_id: number | null;
  performed_by_name: string;
  performed_by_email: string | null;
};

/**
 * Resolves the current actor from the request session.
 * Use after successful mutations to record who performed the action.
 */
export async function getAuditActor(): Promise<AuditActor> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return {
        performed_by: 'SYSTEM',
        performed_by_id: null,
        performed_by_name: 'System',
        performed_by_email: null,
      };
    }
    const metaName =
      (typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()) ||
      (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
      null;
    const ownerName = await resolveMerchantOwnerDisplayName({
      id: user.id,
      email: user.email ?? null,
    });
    const name =
      ownerName ||
      metaName ||
      user.phone ||
      'Merchant';
    const email = user.email ?? null;
    return {
      performed_by: 'MERCHANT',
      performed_by_id: null,
      performed_by_name: name,
      performed_by_email: email,
    };
  } catch {
    return {
      performed_by: 'SYSTEM',
      performed_by_id: null,
      performed_by_name: 'System',
      performed_by_email: null,
    };
  }
}

export type LogMerchantAuditParams = {
  entity_type: 'STORE' | 'BANK_ACCOUNT' | 'PAYOUT' | string;
  entity_id: number;
  action: string;
  action_field?: string | null;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  performed_by: AuditActor['performed_by'];
  performed_by_id: number | null;
  performed_by_name: string;
  performed_by_email: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  audit_metadata?: Record<string, unknown> | null;
};

/**
 * Inserts one row into merchant_audit_logs. Does not throw; logs errors.
 * Use with getAuditActor() after a successful mutation.
 * Accepts Supabase client or any db with from().insert() (awaitable).
 */
export async function logMerchantAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { from: (table: string) => { insert: (row: unknown) => any } },
  params: LogMerchantAuditParams
): Promise<void> {
  try {
    const {
      entity_type,
      entity_id,
      action,
      action_field,
      old_value,
      new_value,
      performed_by,
      performed_by_id,
      performed_by_name,
      performed_by_email,
      ip_address,
      user_agent,
      audit_metadata,
    } = params;
    const row = {
      entity_type,
      entity_id,
      action,
      action_field: action_field ?? null,
      old_value: old_value ?? null,
      new_value: new_value ?? null,
      performed_by,
      performed_by_id,
      performed_by_name,
      performed_by_email,
      ip_address: ip_address ?? null,
      user_agent: user_agent ?? null,
      audit_metadata: audit_metadata ?? {},
    };
    const { error } = await db.from('merchant_audit_logs').insert(row);
    if (error) {
      console.error('[audit-merchant] insert failed:', error);
    }
  } catch (e) {
    console.error('[audit-merchant]', e);
  }
}
