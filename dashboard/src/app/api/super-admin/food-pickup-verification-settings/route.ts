import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

const putSchema = z.object({
  barcode_verification_enabled: z.boolean(),
  otp_verification_enabled: z.boolean(),
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT
        barcode_verification_enabled,
        otp_verification_enabled,
        is_active,
        updated_at
      FROM platform_food_pickup_verification_settings
      WHERE id = 1
      LIMIT 1
    `) as Array<Record<string, unknown>>;

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "Food pickup verification settings missing" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      settings: {
        barcode_verification_enabled: Boolean(row.barcode_verification_enabled),
        otp_verification_enabled: Boolean(row.otp_verification_enabled),
        is_active: Boolean(row.is_active),
        updated_at: row.updated_at,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load settings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let input: z.infer<typeof putSchema>;
  try {
    input = putSchema.parse(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid input";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const sql = getSql();
  try {
    await sql`
      INSERT INTO platform_food_pickup_verification_settings (
        id,
        barcode_verification_enabled,
        otp_verification_enabled,
        is_active
      )
      VALUES (
        1,
        ${input.barcode_verification_enabled},
        ${input.otp_verification_enabled},
        true
      )
      ON CONFLICT (id) DO UPDATE SET
        barcode_verification_enabled = EXCLUDED.barcode_verification_enabled,
        otp_verification_enabled = EXCLUDED.otp_verification_enabled,
        is_active = true,
        updated_at = NOW()
    `;

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
