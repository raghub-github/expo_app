import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getAuthenticatedApiUser } from "@/lib/auth/api-session";
import {
  getCancellationPolicy,
  saveCancellationPolicy,
  CancellationPolicyValidationError,
  CANCELLATION_POLICY_SERVICES,
} from "@/lib/db/operations/rider-cancellation-policy";

export const runtime = "nodejs";

/** GET — per-service rider-fault cancellation slab policy. */
export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const policy = await getCancellationPolicy();
    return NextResponse.json({ success: true, policy });
  } catch (e) {
    console.error("[super-admin rider-cancellation-policy GET]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

const slabSchema = z.object({
  slabNumber: z.number().int().min(1),
  minAccepted: z.number().int().min(1),
  maxAccepted: z.number().int().min(1).nullable(),
  blockingEnabled: z.boolean(),
  thresholdPct: z.number().min(0).max(100),
});

const putSchema = z.object({
  policy: z
    .array(
      z.object({
        serviceType: z.enum(CANCELLATION_POLICY_SERVICES),
        enabled: z.boolean(),
        slabs: z.array(slabSchema).min(1),
      })
    )
    .min(1),
});

/** PUT — save slabs (validated by the shared engine). Backend reconciler applies within ~60s. */
export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdminApi(req);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid policy", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  let updatedBy = "super_admin";
  try {
    const auth = await getAuthenticatedApiUser(req);
    if (auth.ok && auth.user?.email) updatedBy = auth.user.email;
  } catch {
    /* keep default */
  }

  try {
    const policy = await saveCancellationPolicy(parsed.data.policy, updatedBy);
    return NextResponse.json({ success: true, policy });
  } catch (e) {
    if (e instanceof CancellationPolicyValidationError) {
      return NextResponse.json(
        { success: false, error: e.message, service: e.serviceType, errors: e.errors },
        { status: 400 }
      );
    }
    console.error("[super-admin rider-cancellation-policy PUT]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
