import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { updateCancellationAttribute } from "@/lib/db/operations/order-cancellation-reason-catalog";

export const runtime = "nodejs";

const patchSchema = z.object({
  displayLabel: z.string().min(1).max(120).optional(),
  defaultFault: z.string().max(64).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { code } = await context.params;
  if (!code?.trim()) {
    return NextResponse.json({ success: false, error: "Invalid code" }, { status: 400 });
  }
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
    const row = await updateCancellationAttribute(code, parsed.data);
    if (!row) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { code } = await context.params;
  if (!code?.trim()) {
    return NextResponse.json({ success: false, error: "Invalid code" }, { status: 400 });
  }
  try {
    const row = await updateCancellationAttribute(code, { isActive: false });
    if (!row) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to deactivate";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
