import "server-only";
import { getSql } from "@/lib/db/client";

/**
 * Row types returned to the Verification Policy Center UI.
 * These mirror the DB tables directly — the UI is a control surface,
 * not an abstraction layer.
 */
export type PolicyRow = {
  id: number;
  subject_type: string;      // 'rider' | 'merchant_store' | ...
  document_kind: string;     // 'pan' | 'aadhaar' | ... | 'gstin' | 'bank_account' | ...
  mode: string;              // 'manual' | 'auto_optional' | 'auto_required' | 'hybrid'
  provider_order: string[];
  retry_limit: number;
  retry_backoff_seconds: number;
  timeout_ms: number;
  confidence_threshold: string | null;
  reject_confidence_threshold: string | null;
  requires_manual_review_on: unknown;
  subject_filter: unknown;
  effective_from: string;
  effective_to: string | null;
};

export type SwitchRow = {
  id: number;
  provider: string;
  document_kind: string | null; // null = provider-wide
  state: string;                 // 'enabled' | 'disabled' | 'read_only' | 'shadow'
  reason: string | null;
  updated_at: string;
};

export async function listPolicies(): Promise<PolicyRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, subject_type::text, document_kind::text, mode::text,
           provider_order, retry_limit, retry_backoff_seconds, timeout_ms,
           confidence_threshold::text, reject_confidence_threshold::text,
           requires_manual_review_on, subject_filter,
           effective_from, effective_to
      FROM public.verification_policies
     WHERE effective_to IS NULL
     ORDER BY subject_type, document_kind
  `) as unknown as PolicyRow[];
  return rows;
}

export async function listSwitches(): Promise<SwitchRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, provider::text, document_kind::text, state::text, reason, updated_at
      FROM public.verification_switches
     ORDER BY provider, document_kind NULLS FIRST
  `) as unknown as SwitchRow[];
  return rows;
}

type Actor = { actorId: number; ip?: string | null; ua?: string | null };

/** Update a single policy's mode, capturing the before/after snapshot. */
export async function updatePolicyMode(
  policyId: number,
  newMode: "manual" | "auto_optional" | "auto_required" | "hybrid",
  actor: Actor,
  reason: string | null,
): Promise<PolicyRow> {
  const sql = getSql();
  const before = (await sql`
    SELECT id, subject_type::text, document_kind::text, mode::text
      FROM public.verification_policies WHERE id = ${policyId}
  `) as unknown as Array<{ id: number; subject_type: string; document_kind: string; mode: string }>;
  if (before.length === 0) throw new Error("policy_not_found");
  const prev = before[0]!;

  const updated = (await sql`
    UPDATE public.verification_policies
       SET mode = ${newMode}::verification_policy_mode,
           updated_at = NOW()
     WHERE id = ${policyId}
     RETURNING id, subject_type::text, document_kind::text, mode::text,
               provider_order, retry_limit, retry_backoff_seconds, timeout_ms,
               confidence_threshold::text, reject_confidence_threshold::text,
               requires_manual_review_on, subject_filter,
               effective_from, effective_to
  `) as unknown as PolicyRow[];

  await sql`
    INSERT INTO public.verification_audit_logs
      (actor_id, action, target_kind, target_id, before_snapshot, after_snapshot, reason, ip_address, user_agent)
    VALUES
      (${actor.actorId}, 'policy_change', 'policy', ${policyId},
       ${JSON.stringify(prev)}::jsonb,
       ${JSON.stringify({ ...prev, mode: newMode })}::jsonb,
       ${reason}, ${actor.ip ?? null}, ${actor.ua ?? null})
  `;
  return updated[0]!;
}

/** Bulk apply a mode to many policies at once. Used by the "all docs" / "app-wide" quick actions. */
export async function bulkUpdatePolicyMode(
  filter: { subjectType?: string; documentKinds?: string[] },
  newMode: "manual" | "auto_optional" | "auto_required" | "hybrid",
  actor: Actor,
  reason: string | null,
): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, subject_type::text, document_kind::text, mode::text
      FROM public.verification_policies
     WHERE effective_to IS NULL
       AND (${filter.subjectType ?? null}::text IS NULL OR subject_type = ${filter.subjectType ?? null}::verification_subject_kind)
       AND (${filter.documentKinds && filter.documentKinds.length > 0 ? "yes" : "no"} = 'no'
            OR document_kind::text = ANY(${filter.documentKinds ?? []}))
  `) as unknown as Array<{ id: number; subject_type: string; document_kind: string; mode: string }>;

  for (const r of rows) {
    await sql`
      UPDATE public.verification_policies
         SET mode = ${newMode}::verification_policy_mode, updated_at = NOW()
       WHERE id = ${r.id}
    `;
    await sql`
      INSERT INTO public.verification_audit_logs
        (actor_id, action, target_kind, target_id, before_snapshot, after_snapshot, reason, ip_address, user_agent)
      VALUES
        (${actor.actorId}, 'policy_change', 'policy', ${r.id},
         ${JSON.stringify(r)}::jsonb,
         ${JSON.stringify({ ...r, mode: newMode })}::jsonb,
         ${reason}, ${actor.ip ?? null}, ${actor.ua ?? null})
    `;
  }
  return rows.length;
}

/** Flip a kill switch state. */
export async function updateSwitchState(
  switchId: number,
  newState: "enabled" | "disabled" | "read_only" | "shadow",
  actor: Actor,
  reason: string | null,
): Promise<SwitchRow> {
  const sql = getSql();
  const before = (await sql`
    SELECT id, provider::text, document_kind::text, state::text
      FROM public.verification_switches WHERE id = ${switchId}
  `) as unknown as Array<{ id: number; provider: string; document_kind: string | null; state: string }>;
  if (before.length === 0) throw new Error("switch_not_found");
  const prev = before[0]!;

  const updated = (await sql`
    UPDATE public.verification_switches
       SET state = ${newState}::verification_switch_state,
           reason = ${reason},
           updated_at = NOW()
     WHERE id = ${switchId}
     RETURNING id, provider::text, document_kind::text, state::text, reason, updated_at
  `) as unknown as SwitchRow[];

  await sql`
    INSERT INTO public.verification_audit_logs
      (actor_id, action, target_kind, target_id, before_snapshot, after_snapshot, reason, ip_address, user_agent)
    VALUES
      (${actor.actorId}, 'switch_flipped', 'switch', ${switchId},
       ${JSON.stringify(prev)}::jsonb,
       ${JSON.stringify({ ...prev, state: newState })}::jsonb,
       ${reason}, ${actor.ip ?? null}, ${actor.ua ?? null})
  `;
  return updated[0]!;
}
