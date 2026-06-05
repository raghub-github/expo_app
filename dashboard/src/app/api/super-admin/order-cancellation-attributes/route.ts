import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  insertCancellationAttribute,
  listCancellationAttributes,
} from "@/lib/db/operations/order-cancellation-reason-catalog";

export const runtime = "nodejs";

const postSchema = z.object({
  code: z.string().min(1).max(32),
  displayLabel: z.string().min(1).max(120),
  defaultFault: z.string().max(64).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const attributes = await listCancellationAttributes({ activeOnly: false });
    return NextResponse.json({ success: true, attributes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const row = await insertCancellationAttribute({
      code: parsed.data.code,
      displayLabel: parsed.data.displayLabel,
      defaultFault: parsed.data.defaultFault,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive,
    });
    return NextResponse.json({ success: true, row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create attribute";
    const status = msg.includes("unique") || msg.includes("duplicate") ? 409 : 500;
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
