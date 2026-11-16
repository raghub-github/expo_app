import { NextRequest, NextResponse } from "next/server";
import { assertStaffManageAccess, toE164In } from "@/lib/staff/assert-staff-manage";
import { client as sql } from "@/lib/drizzle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapStaffRow(r: Record<string, unknown>) {
  return {
    id: Number(r.id),
    store_id: Number(r.store_id),
    name: String(r.name ?? ""),
    phone_number: String(r.phone_number ?? ""),
    role: String(r.role ?? "STAFF"),
    status: r.status !== false && r.status !== "f",
    created_at: r.created_at != null ? String(r.created_at) : "",
    updated_at: r.updated_at != null ? String(r.updated_at) : "",
  };
}

/** PATCH /api/merchant/staff/[staffId]?storeId= */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  try {
    const { staffId: staffIdRaw } = await params;
    const staffId = parseInt(staffIdRaw, 10);
    if (!Number.isFinite(staffId) || staffId < 1) {
      return NextResponse.json({ error: "Invalid staff id" }, { status: 400 });
    }
    const storeId = req.nextUrl.searchParams.get("storeId");
    const access = await assertStaffManageAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const existing = await sql`
      SELECT * FROM store_staff
      WHERE id = ${staffId} AND store_id = ${access.storeIdNum}
      LIMIT 1
    `;
    if (!existing[0]) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      phone_number?: string;
      role?: string;
      status?: boolean;
    };

    let name = String((existing[0] as { name?: string }).name ?? "");
    let phone = String((existing[0] as { phone_number?: string }).phone_number ?? "");
    let role = String((existing[0] as { role?: string }).role ?? "STAFF");
    let status = (existing[0] as { status?: boolean }).status !== false;

    if (typeof body.name === "string" && body.name.trim()) name = body.name.trim();
    if (typeof body.phone_number === "string" && body.phone_number.trim()) {
      const d = body.phone_number.replace(/\D/g, "").slice(-10);
      if (d.length !== 10) {
        return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
      }
      phone = toE164In(d);
    }
    if (typeof body.role === "string") {
      const r = body.role.trim().toUpperCase();
      if (r !== "STAFF" && r !== "MANAGER") {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      role = r;
    }
    if (typeof body.status === "boolean") status = body.status;

    const updated = await sql`
      UPDATE store_staff
      SET name = ${name}, phone_number = ${phone}, role = ${role}, status = ${status}, updated_at = NOW()
      WHERE id = ${staffId} AND store_id = ${access.storeIdNum}
      RETURNING id, store_id, name, phone_number, role, status, created_at, updated_at
    `;
    return NextResponse.json(mapStaffRow(updated[0] as Record<string, unknown>));
  } catch (e) {
    console.error("[merchant/staff PATCH]", e);
    return NextResponse.json({ error: "Failed to update staff" }, { status: 500 });
  }
}

/** DELETE /api/merchant/staff/[staffId]?storeId= */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  try {
    const { staffId: staffIdRaw } = await params;
    const staffId = parseInt(staffIdRaw, 10);
    if (!Number.isFinite(staffId) || staffId < 1) {
      return NextResponse.json({ error: "Invalid staff id" }, { status: 400 });
    }
    const storeId = req.nextUrl.searchParams.get("storeId");
    const access = await assertStaffManageAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const existing = await sql`
      SELECT id FROM store_staff
      WHERE id = ${staffId} AND store_id = ${access.storeIdNum}
      LIMIT 1
    `;
    if (!existing[0]) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    await sql`DELETE FROM store_staff WHERE id = ${staffId} AND store_id = ${access.storeIdNum}`;

    // Best-effort: deactivate user_device_sessions tagged staff:<id>
    try {
      await sql`
        UPDATE user_device_sessions
        SET is_active = FALSE, logged_out_at = NOW()
        WHERE login_method = ${`staff:${staffId}`}
          AND is_active = TRUE
      `;
    } catch {
      /* column may differ */
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[merchant/staff DELETE]", e);
    return NextResponse.json({ error: "Failed to remove staff" }, { status: 500 });
  }
}
