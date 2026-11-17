import { NextRequest, NextResponse } from "next/server";
import { assertDashboardStoreStaffAccess } from "@/lib/merchant/assert-store-staff-access";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; staffId: string }> }
) {
  try {
    const { id, staffId: staffIdRaw } = await params;
    const staffId = parseInt(staffIdRaw, 10);
    if (!Number.isFinite(staffId) || staffId < 1) {
      return NextResponse.json({ success: false, error: "Invalid staff id" }, { status: 400 });
    }
    const access = await assertDashboardStoreStaffAccess(id);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const sql = getSql();
    const existing = await sql`
      SELECT id FROM store_staff
      WHERE id = ${staffId} AND store_id = ${access.storeIdNum}
      LIMIT 1
    `;
    const row = Array.isArray(existing) ? existing[0] : existing;
    if (!row) {
      return NextResponse.json({ success: false, error: "Staff not found" }, { status: 404 });
    }

    await sql`DELETE FROM store_staff WHERE id = ${staffId} AND store_id = ${access.storeIdNum}`;

    try {
      await sql`
        UPDATE user_device_sessions
        SET is_active = FALSE, logged_out_at = NOW()
        WHERE login_method = ${`staff:${staffId}`} AND is_active = TRUE
      `;
    } catch {
      /* ignore */
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[dashboard staff DELETE]", e);
    return NextResponse.json({ success: false, error: "Failed to remove staff" }, { status: 500 });
  }
}
