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

/** GET /api/merchant/staff?storeId=GMMC1031 */
export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get("storeId");
    const access = await assertStaffManageAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const rows = await sql`
      SELECT id, store_id, name, phone_number, role, status, created_at, updated_at
      FROM store_staff
      WHERE store_id = ${access.storeIdNum} AND status = TRUE
      ORDER BY created_at ASC
    `;

    return NextResponse.json({
      staff: (rows as Record<string, unknown>[]).map(mapStaffRow),
      owner: access.owner,
      storeIdNum: access.storeIdNum,
      accessRole: access.accessRole,
    });
  } catch (e) {
    console.error("[merchant/staff GET]", e);
    return NextResponse.json({ error: "Failed to load staff" }, { status: 500 });
  }
}

/** POST /api/merchant/staff?storeId= — body: { name, phone_number, role } */
export async function POST(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get("storeId");
    const access = await assertStaffManageAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      phone_number?: string;
      role?: string;
    };
    const name = String(body.name ?? "").trim();
    const phoneRaw = String(body.phone_number ?? "").trim();
    const roleNorm = String(body.role ?? "").trim().toUpperCase();

    if (!name || name.length < 2) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (roleNorm !== "STAFF" && roleNorm !== "MANAGER") {
      return NextResponse.json(
        { error: "Invite role must be Staff or Manager" },
        { status: 400 }
      );
    }

    const phoneDigits = phoneRaw.replace(/\D/g, "");
    const phoneLast10 = phoneDigits.slice(-10);
    if (phoneLast10.length !== 10) {
      return NextResponse.json({ error: "Enter a valid 10-digit phone number" }, { status: 400 });
    }
    const phoneE164 = toE164In(phoneLast10);

    const ownerPhone = String(access.owner.registered_phone ?? "").replace(/\D/g, "");
    if (ownerPhone.slice(-10) === phoneLast10) {
      return NextResponse.json(
        {
          error: "phone_already_owner",
          message: "This number is already registered as the Owner. Use a different number.",
        },
        { status: 409 }
      );
    }

    const dupStaff = await sql`
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
    if (dupStaff.length > 0) {
      const row = dupStaff[0] as { name?: string; role?: string };
      const existingRole = String(row.role ?? "").toUpperCase() === "MANAGER" ? "Manager" : "Staff";
      return NextResponse.json(
        {
          error: "phone_already_invited",
          message: `This number is already invited as ${existingRole}${row.name ? ` (${row.name})` : ""}. Each number can only have one role.`,
        },
        { status: 409 }
      );
    }

    const inserted = await sql`
      INSERT INTO store_staff (store_id, name, phone_number, role)
      VALUES (${access.storeIdNum}, ${name}, ${phoneE164}, ${roleNorm})
      RETURNING id, store_id, name, phone_number, role, status, created_at, updated_at
    `;
    return NextResponse.json(mapStaffRow(inserted[0] as Record<string, unknown>), { status: 201 });
  } catch (e) {
    console.error("[merchant/staff POST]", e);
    return NextResponse.json({ error: "Failed to add staff" }, { status: 500 });
  }
}
