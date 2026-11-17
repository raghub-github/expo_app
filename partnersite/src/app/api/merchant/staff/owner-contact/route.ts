import { NextRequest, NextResponse } from "next/server";
import { assertStaffManageAccess, toE164In } from "@/lib/staff/assert-staff-manage";
import { client as sql } from "@/lib/drizzle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/merchant/staff/owner-contact?storeId= — owner-only contact edit */
export async function PATCH(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get("storeId");
    const access = await assertStaffManageAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    if (access.accessRole !== "OWNER") {
      return NextResponse.json(
        { error: "Only the owner can edit owner contact details." },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      owner_name?: string;
      owner_email?: string;
      registered_phone?: string;
    };

    const updates: Record<string, string> = {};
    if (typeof body.owner_name === "string" && body.owner_name.trim()) {
      updates.owner_name = body.owner_name.trim();
    }
    if (typeof body.owner_email === "string" && body.owner_email.trim()) {
      const email = body.owner_email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "Invalid email" }, { status: 400 });
      }
      updates.owner_email = email;
    }
    if (typeof body.registered_phone === "string" && body.registered_phone.trim()) {
      const d = body.registered_phone.replace(/\D/g, "").slice(-10);
      if (d.length !== 10) {
        return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
      }
      updates.registered_phone = toE164In(d);
      updates.registered_phone_normalized = d;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No changes" }, { status: 400 });
    }

    const ownerName = updates.owner_name ?? access.owner.owner_name;
    const ownerEmail = updates.owner_email ?? access.owner.owner_email;
    const phone = updates.registered_phone ?? access.owner.registered_phone;
    const phoneNorm =
      updates.registered_phone_normalized ??
      (phone ? phone.replace(/\D/g, "").slice(-10) : null);

    await sql`
      UPDATE merchant_parents
      SET
        owner_name = COALESCE(${ownerName}, owner_name),
        owner_email = COALESCE(${ownerEmail}, owner_email),
        registered_phone = COALESCE(${phone}, registered_phone),
        registered_phone_normalized = COALESCE(${phoneNorm}, registered_phone_normalized),
        updated_at = NOW()
      WHERE id = ${access.parentId}
    `;

    return NextResponse.json({
      owner: {
        owner_name: ownerName,
        owner_email: ownerEmail,
        registered_phone: phone,
        parent_name: access.owner.parent_name,
        store_logo: access.owner.store_logo,
      },
    });
  } catch (e) {
    console.error("[staff/owner-contact]", e);
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
  }
}
