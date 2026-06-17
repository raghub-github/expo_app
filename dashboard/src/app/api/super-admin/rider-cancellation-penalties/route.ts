import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getRiderPenaltyEnginePayload,
  saveRiderPenaltyEngineConfig,
  syncRiderPenaltyReasonRulesFromCatalog,
} from "@/lib/db/operations/rider-cancellation-penalty-engine";

export const runtime = "nodejs";

const patchSchema = z.object({
  parties: z
    .object({
      RIDER: z.object({ isEnabled: z.boolean().optional() }).optional(),
      MERCHANT: z.object({ isEnabled: z.boolean().optional() }).optional(),
      CUSTOMER: z.object({ isEnabled: z.boolean().optional() }).optional(),
    })
    .optional(),
  scenarios: z
    .object({
      AFTER_ACCEPT_DISPATCH: z
        .object({
          isEnabled: z.boolean().optional(),
          flatPenaltyAmount: z.coerce.number().min(0).nullable().optional(),
          ledgerTitle: z.string().max(500).optional(),
          ledgerDescription: z.string().max(2000).optional(),
        })
        .optional(),
      AFTER_MARK_PICKUP: z
        .object({
          isEnabled: z.boolean().optional(),
          penaltyTitle: z.string().max(500).optional(),
          ledgerDescription: z.string().max(2000).optional(),
          amountBase: z.enum(["DELIVERY_FARE", "COMPLETE_ORDER_VALUE"]).nullable().optional(),
        })
        .optional(),
    })
    .optional(),
  reasonRules: z
    .array(
      z.object({
        scenarioCode: z.enum(["AFTER_ACCEPT_DISPATCH", "AFTER_MARK_PICKUP"]),
        catalogReasonId: z.coerce.number().int().positive(),
        appliesPenalty: z.coerce.boolean(),
      })
    )
    .optional(),
  channel: z.enum(["web", "app"]).optional(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const channelParam = req.nextUrl.searchParams.get("channel");
  const channel = channelParam === "app" ? "app" : "web";
  try {
    await syncRiderPenaltyReasonRulesFromCatalog();
    const payload = await getRiderPenaltyEnginePayload({ channel });
    return NextResponse.json({ success: true, ...payload });
  } catch (e) {
    console.error("[super-admin rider-cancellation-penalties GET]", e);
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
    await syncRiderPenaltyReasonRulesFromCatalog();
    const payload = await saveRiderPenaltyEngineConfig({
      ...parsed.data,
      channel: parsed.data.channel ?? "web",
    });
    return NextResponse.json({ success: true, ...payload });
  } catch (e) {
    console.error("[super-admin rider-cancellation-penalties PATCH]", e);
    const msg = e instanceof Error ? e.message : "Failed to save";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
