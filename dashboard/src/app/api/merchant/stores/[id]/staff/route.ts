import { NextRequest, NextResponse } from "next/server";
import {
  assertDashboardStoreStaffAccess,
  toE164In,
} from "@/lib/merchant/assert-store-staff-access";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await assertDashboardStoreStaffAccess(id);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    const sql = getSql();
    const rows = await sql`
      SELECT id, store_id, name, phone_number, role, status, created_at, updated_at
      FROM store_staff
      WHERE store_id = ${access.storeIdNum} AND status = TRUE
      ORDER BY created_at ASC
    `;
    const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
    return NextResponse.json({
      success: true,
      staff: list.map((r) => mapStaffRow(r as Record<string, unknown>)),
      owner: access.owner,
    });
  } catch (e) {
    console.error("[dashboard staff GET]", e);
    return NextResponse.json({ success: false, error: "Failed to load staff" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await assertDashboardStoreStaffAccess(id);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      phone_number?: string;
      role?: string;
    };
    const name = String(body.name ?? "").trim();
    const roleNorm = String(body.role ?? "").trim().toUpperCase();
    const phoneDigits = String(body.phone_number ?? "").replace(/\D/g, "");
    const phoneLast10 = phoneDigits.slice(-10);

    if (!name || name.length < 2) {
      return NextResponse.json({ success: false, error: "Name is required" }, { status: 400 });
    }
    if (roleNorm !== "STAFF" && roleNorm !== "MANAGER") {
      return NextResponse.json({ success: false, error: "Invalid role" }, { status: 400 });
    }
    if (phoneLast10.length !== 10) {
      return NextResponse.json({ success: false, error: "Invalid phone" }, { status: 400 });
    }

    const ownerPhone = String(access.owner.registered_phone ?? "").replace(/\D/g, "");
    if (ownerPhone.slice(-10) === phoneLast10) {
      return NextResponse.json(
        {
          success: false,
          error: "phone_already_owner",
          message: "This number is already registered as the Owner.",
        },
        { status: 409 }
      );
    }

    const sql = getSql();
    const dup = await sql`
      SELECT ss.id, ss.name, ss.role
      FROM store_staff ss
      INNER JOIN merchant_stores ms ON ms.id = ss.store_id
      WHERE ms.parent_id = ${access.parentId}
        AND ms.deleted_at IS NULL
        AND ss.status = TRUE
        AND (
          regexp_replace(COALESCE(ss.phone_number, ''), '\\D', '', 'g') = ${phoneDigits}
          OR regexp_replace(COALESCE(ss.phone_number, ''), '\\D', '', 'g') LIKE ${"%" + phoneLast10}
        )
      LIMIT 1
    `;
    const dupList = Array.isArray(dup) ? dup : dup ? [dup] : [];
    if (dupList.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "phone_already_invited",
          message: "This number is already invited for this brand.",
        },
        { status: 409 }
      );
    }

    const phoneE164 = toE164In(phoneLast10);
    const inserted = await sql`
      INSERT INTO store_staff (store_id, name, phone_number, role)
      VALUES (${access.storeIdNum}, ${name}, ${phoneE164}, ${roleNorm})
      RETURNING id, store_id, name, phone_number, role, status, created_at, updated_at
    `;
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    return NextResponse.json(
      { success: true, staff: mapStaffRow(row as Record<string, unknown>) },
      { status: 201 }
    );
  } catch (e) {
    console.error("[dashboard staff POST]", e);
    return NextResponse.json({ success: false, error: "Failed to add staff" }, { status: 500 });
  }
}
