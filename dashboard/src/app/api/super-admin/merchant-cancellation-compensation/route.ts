import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getMerchantCompensationEnginePayload,
  saveMerchantCompensationEngineConfig,
} from "@/lib/db/operations/merchant-cancellation-compensation-engine";

export const runtime = "nodejs";

const scenarioPatchSchema = z.object({
  isEnabled: z.boolean().optional(),
  compensationPct: z.coerce.number().min(0).max(100).optional(),
  policyTitle: z.string().max(500).optional(),
  policyDescription: z.string().max(2000).optional(),
  ledgerTitle: z.string().max(500).optional(),
  ledgerDescription: z.string().max(2000).optional(),
});

const patchSchema = z.object({
  settings: z
    .object({
      isEnabled: z.boolean().optional(),
      orderReadyAccuracyThreshold: z.coerce.number().min(0).max(100).optional(),
      customerCancelGraceSeconds: z.coerce.number().int().min(0).max(3600).optional(),
      amountBase: z.enum(["NET_ORDER_VALUE"]).optional(),
      policyModalTitle: z.string().max(200).optional(),
    })
    .optional(),
  scenarios: z
    .object({
      ORDER_PICKED_UP: scenarioPatchSchema.optional(),
      ORDER_READY_HIGH_ACCURACY: scenarioPatchSchema.optional(),
      ORDER_READY_LOW_ACCURACY: scenarioPatchSchema.optional(),
      NOT_ORDER_READY: scenarioPatchSchema.optional(),
    })
    .optional(),
  exclusions: z
    .object({
      CUSTOMER_CANCEL_WITHIN_GRACE: z
        .object({
          isEnabled: z.boolean().optional(),
          policyTitle: z.string().max(500).optional(),
          policyDescription: z.string().max(2000).optional(),
        })
        .optional(),
      MERCHANT_ACCEPTED_CANCEL: z
        .object({
          isEnabled: z.boolean().optional(),
          policyTitle: z.string().max(500).optional(),
          policyDescription: z.string().max(2000).optional(),
        })
        .optional(),
    })
    .optional(),
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const payload = await getMerchantCompensationEnginePayload();
    return NextResponse.json({ success: true, ...payload });
  } catch (e) {
    console.error("[super-admin merchant-cancellation-compensation GET]", e);
    const msg = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const payload = await saveMerchantCompensationEngineConfig(parsed.data);
    return NextResponse.json({ success: true, ...payload });
  } catch (e) {
    console.error("[super-admin merchant-cancellation-compensation PATCH]", e);
    const msg = e instanceof Error ? e.message : "Failed to save";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
