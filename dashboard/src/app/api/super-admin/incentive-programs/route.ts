import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { incentiveProgramBodySchema } from "@/lib/incentive/incentive-program-api-schema";
import {
  createIncentiveProgram,
  listIncentivePrograms,
} from "@/lib/db/operations/incentive-programs";
import {
  ensureIncentiveProgramSlotColumns,
  isIncentiveEngineMigrated,
} from "@/lib/db/ensure-incentive-program-slot-columns";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    if (!(await isIncentiveEngineMigrated())) {
      await ensureIncentiveProgramSlotColumns();
    }
    const programs = await listIncentivePrograms();
    return NextResponse.json({ programs, migrationRequired: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to list incentive programs";
    const migrationRequired =
      msg.includes("incentive_programs") &&
      (msg.includes("does not exist") || msg.includes("relation"));
    return NextResponse.json(
      { error: msg, migrationRequired, programs: [] },
      { status: migrationRequired ? 503 : 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    await ensureIncentiveProgramSlotColumns();
    const body = incentiveProgramBodySchema.parse(await req.json());
    const result = await createIncentiveProgram(body);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create incentive program";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
