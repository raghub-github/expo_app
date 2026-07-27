/**
 * Verification policy engine.
 *
 * Consulted before ANY provider call. Returns the effective policy for the
 * (subject, doc_kind) tuple, respecting:
 *
 *   1. Kill switches (verification_switches) — provider-wide or per-doc.
 *      A switch in state 'disabled' or 'force_manual' overrides any policy.
 *   2. Active policy row (verification_policies WHERE effective_to IS NULL).
 *      Mode + provider + retry / timeout / threshold / auto_approve flags.
 *   3. subject_filter — narrows the policy to specific subjects
 *      (e.g. "only own-vehicle riders for DL auto verify").
 *
 * Never throws. If no policy exists for a slot, returns { mode: 'manual' } —
 * the safest default because it delegates to the existing manual flow.
 */
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "../../../db/client.js";
import {
  verificationPolicies,
  verificationPolicyVersions,
  verificationSwitches,
} from "../../../db/schema.js";
import type {
  EffectivePolicy,
  VerificationDocumentKind,
  VerificationProvider,
  VerificationSubjectKind,
} from "../types.js";

export type PolicyDecisionInput = {
  subjectType: VerificationSubjectKind;
  documentKind: VerificationDocumentKind;
  /** Optional subject facts used to evaluate subject_filter (has_own_vehicle, service_type, …). */
  subjectFacts?: Record<string, unknown>;
};

/**
 * Returns the effective policy. `mode = 'manual'` is the safe default;
 * callers should skip provider submission and route the doc to the existing
 * manual approval workflow.
 */
export async function resolveEffectivePolicy(input: PolicyDecisionInput): Promise<EffectivePolicy> {
  const db = getDb();

  // 1. Kill switches — provider-wide OR per doc kind. If any switch says
  // 'disabled' / 'force_manual', we short-circuit before touching the policy.
  const activeSwitches = await db
    .select()
    .from(verificationSwitches)
    .where(
      and(
        isNull(verificationSwitches.restoredAt),
        or(
          eq(verificationSwitches.documentKind, input.documentKind),
          isNull(verificationSwitches.documentKind),
        ),
      ),
    );

  for (const sw of activeSwitches) {
    if (sw.state === "disabled" || sw.state === "force_manual") {
      return manualDefault({ reason: `switch_state_${sw.state}_provider_${sw.provider}` });
    }
  }

  const forceHybrid = activeSwitches.some((sw) => sw.state === "force_hybrid");

  // 2. Active policy for this (subject, doc_kind).
  const rows = await db
    .select()
    .from(verificationPolicies)
    .where(
      and(
        eq(verificationPolicies.subjectType, input.subjectType),
        eq(verificationPolicies.documentKind, input.documentKind),
        isNull(verificationPolicies.effectiveTo),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    return forceHybrid
      ? {
          ...manualDefault({ reason: "no_policy_row_force_hybrid" }),
          mode: "hybrid" as const,
          fallbackToManual: true,
        }
      : manualDefault({ reason: "no_policy_row" });
  }
  const p = rows[0]!;

  // 3. subject_filter narrowing.
  const filter = (p.subjectFilter as Record<string, unknown>) ?? {};
  if (!matchesFilter(filter, input.subjectFacts ?? {})) {
    // Subject falls outside the auto-verify slice — respect fallback_to_manual.
    return manualDefault({
      reason: "subject_filter_no_match",
      keepPolicyId: p.id,
    });
  }

  // 4. Fetch the latest policy_version so verification_requests can reference it.
  const versions = await db
    .select({ id: verificationPolicyVersions.id })
    .from(verificationPolicyVersions)
    .where(eq(verificationPolicyVersions.policyId, p.id))
    .orderBy(verificationPolicyVersions.versionNumber);
  const policySnapshotId = versions[versions.length - 1]?.id ?? p.id;

  const baseMode = p.mode as EffectivePolicy["mode"];
  return {
    policyId: p.id,
    policySnapshotId,
    mode: forceHybrid && (baseMode === "auto" || baseMode === "manual") ? "hybrid" : baseMode,
    provider: (p.provider as VerificationProvider | null) ?? null,
    autoApprove: p.autoApprove,
    confidenceThreshold: p.confidenceThreshold != null ? Number(p.confidenceThreshold) : null,
    retryLimit: p.retryLimit,
    retryBackoffSeconds: p.retryBackoffSeconds,
    timeoutMs: p.timeoutMs,
    fallbackToManual: p.fallbackToManual,
    subjectFilter: filter,
  };
}

function manualDefault(_details?: { reason: string; keepPolicyId?: number }): EffectivePolicy {
  return {
    policyId: 0,
    policySnapshotId: 0,
    mode: "manual",
    provider: null,
    autoApprove: true,
    confidenceThreshold: null,
    retryLimit: 0,
    retryBackoffSeconds: 30,
    timeoutMs: 15000,
    fallbackToManual: true,
    subjectFilter: {},
  };
}

/**
 * Very small filter evaluator: every key in `filter` must match the same key
 * in `facts`. Values can be scalars (equality) or arrays (membership).
 *
 * Examples the seed policies use:
 *   {} → matches every subject
 *   { "has_own_vehicle": true } → only riders whose fact.has_own_vehicle === true
 *   { "store_service_type": ["FOOD"] } → only stores with service_type ∈ that list
 */
function matchesFilter(filter: Record<string, unknown>, facts: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    const actual = facts[key];
    if (Array.isArray(expected)) {
      if (!expected.includes(actual as string | number | boolean)) return false;
    } else {
      if (actual !== expected) return false;
    }
  }
  return true;
}
