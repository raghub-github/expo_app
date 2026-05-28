import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { updatePaymentCancellationRule } from "@/lib/db/operations/payment-cancellation-rules";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const row = await updatePaymentCancellationRule(id, body);
    return NextResponse.json({ success: true, row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  try {
    const sql = getSql();
    await sql`UPDATE payment_cancellation_rules SET is_active = false, updated_at = NOW() WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
