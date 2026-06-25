import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { incentiveProgramBodySchema } from "@/lib/incentive/incentive-program-api-schema";
import {
  deleteIncentiveProgram,
  getIncentiveProgramDetail,
  updateIncentiveProgram,
  updateIncentiveProgramStatus,
} from "@/lib/db/operations/incentive-programs";
import { ensureIncentiveProgramSlotColumns } from "@/lib/db/ensure-incentive-program-slot-columns";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
  is_active: z.boolean().optional(),
  is_paused: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  try {
    await ensureIncentiveProgramSlotColumns();
    const detail = await getIncentiveProgramDetail(id);
    if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load program";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  try {
    await ensureIncentiveProgramSlotColumns();
    const raw = await req.json();
    if (raw.name != null || raw.code != null) {
      const body = incentiveProgramBodySchema.parse(raw);
      await updateIncentiveProgram(id, body);
      return NextResponse.json({ success: true });
    }
    const body = patchSchema.parse(raw);
    await updateIncentiveProgramStatus(id, body);
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update program";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  try {
    const body = incentiveProgramBodySchema.parse(await req.json());
    await updateIncentiveProgram(id, body);
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update program";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  try {
    await deleteIncentiveProgram(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete program";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
