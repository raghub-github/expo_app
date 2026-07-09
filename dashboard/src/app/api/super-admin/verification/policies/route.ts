import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import {
  listPolicies,
  listSwitches,
  updatePolicyMode,
  bulkUpdatePolicyMode,
  updateSwitchState,
} from "@/lib/db/operations/verification-policies";

export const runtime = "nodejs";

const MODES = ["auto", "manual", "hybrid", "disabled"] as const;
// Must match the DB enum verification_switch_state (0390_verification_enums.sql).
const STATES = ["enabled", "disabled", "force_manual", "force_hybrid"] as const;

const singlePolicySchema = z.object({
  kind: z.literal("single"),
  policyId: z.number().int().positive(),
  mode: z.enum(MODES),
  reason: z.string().max(500).optional().nullable(),
});
const bulkPolicySchema = z.object({
  kind: z.literal("bulk"),
  subjectType: z.enum(["rider", "merchant_store", "rider_document", "merchant_document"]).optional(),
  documentKinds: z.array(z.string().max(64)).optional(),
  mode: z.enum(MODES),
  reason: z.string().max(500).optional().nullable(),
});
const switchSchema = z.object({
  kind: z.literal("switch"),
  switchId: z.number().int().positive(),
  state: z.enum(STATES),
  reason: z.string().max(500).optional().nullable(),
});
const patchSchema = z.discriminatedUnion("kind", [singlePolicySchema, bulkPolicySchema, switchSchema]);

/** Read: policies + kill-switches. UI renders both. */
export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const [policies, switches] = await Promise.all([listPolicies(), listSwitches()]);
    return NextResponse.json({ success: true, policies, switches });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

/** Write: single policy, bulk policy, or a switch flip — all use one endpoint keyed by `kind`. */
export async function PATCH(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const systemUser = await getSystemUserByEmail(user?.email ?? undefined);
  if (!systemUser?.id) {
    return NextResponse.json({ success: false, error: "system_user_missing" }, { status: 403 });
  }
  const actor = {
    actorId: systemUser.id,
    ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null,
    ua: req.headers.get("user-agent") ?? null,
  };

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    if (parsed.data.kind === "single") {
      const row = await updatePolicyMode(parsed.data.policyId, parsed.data.mode, actor, parsed.data.reason ?? null);
      return NextResponse.json({ success: true, row });
    }
    if (parsed.data.kind === "bulk") {
      const count = await bulkUpdatePolicyMode(
        { subjectType: parsed.data.subjectType, documentKinds: parsed.data.documentKinds },
        parsed.data.mode, actor, parsed.data.reason ?? null,
      );
      return NextResponse.json({ success: true, updated: count });
    }
    const row = await updateSwitchState(parsed.data.switchId, parsed.data.state, actor, parsed.data.reason ?? null);
    return NextResponse.json({ success: true, row });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
