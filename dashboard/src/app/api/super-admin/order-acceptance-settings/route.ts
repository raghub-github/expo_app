import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

const upsertSchema = z.object({
  store_type: z.string().min(1).max(64),
  acceptance_window_minutes: z.number().int().min(1).max(180),
  alert_sound_enabled: z.boolean(),
  alert_sound_url: z.union([z.string().max(4000), z.literal(""), z.null()]).optional(),
  alert_sound_repeat_count: z.number().int().min(0).max(25),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sql = getSql();
  const rows = (await sql`
    SELECT
      store_type,
      acceptance_window_minutes,
      alert_sound_enabled,
      alert_sound_url,
      alert_sound_repeat_count
    FROM platform_food_acceptance_settings_by_store_type
    ORDER BY store_type ASC
  `) as any[];

  return NextResponse.json({ ok: true, rows: rows ?? [] });
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

  let input: z.infer<typeof upsertSchema>;
  try {
    input = upsertSchema.parse(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid input";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const sql = getSql();

  const soundUrl =
    input.alert_sound_url == null
      ? null
      : typeof input.alert_sound_url === "string" && input.alert_sound_url.trim() === ""
        ? null
        : input.alert_sound_url;

  const storeType = String(input.store_type || "").trim().toUpperCase();

  await sql`
    INSERT INTO platform_food_acceptance_settings_by_store_type (
      store_type,
      acceptance_window_minutes,
      alert_sound_enabled,
      alert_sound_url,
      alert_sound_repeat_count
    )
    VALUES (
      ${storeType},
      ${input.acceptance_window_minutes}::int,
      ${input.alert_sound_enabled}::boolean,
      ${soundUrl},
      ${input.alert_sound_repeat_count}::int
    )
    ON CONFLICT (store_type) DO UPDATE SET
      acceptance_window_minutes = EXCLUDED.acceptance_window_minutes,
      alert_sound_enabled = EXCLUDED.alert_sound_enabled,
      alert_sound_url = EXCLUDED.alert_sound_url,
      alert_sound_repeat_count = EXCLUDED.alert_sound_repeat_count
  `;

  return NextResponse.json({ ok: true });
}

