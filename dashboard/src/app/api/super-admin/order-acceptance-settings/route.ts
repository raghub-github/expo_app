import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";
import { deleteR2ObjectForStoredUrl } from "@/lib/r2-proxy-url";
import { deleteMerchantStoreTypeDocumentMaps } from "@/lib/db/operations/merchant-onboarding-document-types";
import {
  applySourceSoundsToAllTypes,
  countSoundUrlReferences,
} from "@/lib/order-acceptance-apply";

export const runtime = "nodejs";

const optionalSoundUrl = z.union([z.string().max(4000), z.literal(""), z.null()]).optional();

const upsertSchema = z.object({
  store_type: z.string().min(1).max(64),
  acceptance_window_minutes: z.number().int().min(1).max(180),
  alert_sound_enabled: z.boolean(),
  alert_sound_url: optionalSoundUrl,
  alert_sound_url_2: optionalSoundUrl,
  alert_sound_url_3: optionalSoundUrl,
  alert_sound_repeat_count: z.number().int().min(0).max(25),
});

function normalizeSoundUrl(v: z.infer<typeof optionalSoundUrl>): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi(req);
  if (!gate.ok) return gate.response;

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT
        store_type,
        acceptance_window_minutes,
        alert_sound_enabled,
        alert_sound_url,
        alert_sound_url_2,
        alert_sound_url_3,
        alert_sound_repeat_count
      FROM platform_food_acceptance_settings_by_store_type
      ORDER BY store_type ASC
    `) as any[];

    return NextResponse.json({ ok: true, rows: rows ?? [] });
  } catch (e) {
    console.error("[super-admin order-acceptance GET]", e);
    const msg = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdminApi(req);
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

  const soundUrl = normalizeSoundUrl(input.alert_sound_url);
  const soundUrl2 = normalizeSoundUrl(input.alert_sound_url_2);
  const soundUrl3 = normalizeSoundUrl(input.alert_sound_url_3);

  const storeType = String(input.store_type || "").trim().toUpperCase();

  try {
    const previous = (await sql`
      SELECT alert_sound_url, alert_sound_url_2, alert_sound_url_3
      FROM platform_food_acceptance_settings_by_store_type
      WHERE store_type = ${storeType}
      LIMIT 1
    `) as Array<{
      alert_sound_url: string | null;
      alert_sound_url_2: string | null;
      alert_sound_url_3: string | null;
    }>;

    await sql`
    INSERT INTO platform_food_acceptance_settings_by_store_type (
      store_type,
      acceptance_window_minutes,
      alert_sound_enabled,
      alert_sound_url,
      alert_sound_url_2,
      alert_sound_url_3,
      alert_sound_repeat_count
    )
    VALUES (
      ${storeType},
      ${input.acceptance_window_minutes}::int,
      ${input.alert_sound_enabled}::boolean,
      ${soundUrl},
      ${soundUrl2},
      ${soundUrl3},
      ${input.alert_sound_repeat_count}::int
    )
    ON CONFLICT (store_type) DO UPDATE SET
      acceptance_window_minutes = EXCLUDED.acceptance_window_minutes,
      alert_sound_enabled = EXCLUDED.alert_sound_enabled,
      alert_sound_url = EXCLUDED.alert_sound_url,
      alert_sound_url_2 = EXCLUDED.alert_sound_url_2,
      alert_sound_url_3 = EXCLUDED.alert_sound_url_3,
      alert_sound_repeat_count = EXCLUDED.alert_sound_repeat_count
  `;

    const nextUrls = new Set(
      [soundUrl, soundUrl2, soundUrl3].filter((u): u is string => Boolean(u))
    );
    const prev = previous[0];
    if (prev) {
      const oldUrls = [prev.alert_sound_url, prev.alert_sound_url_2, prev.alert_sound_url_3];
      for (const oldUrl of oldUrls) {
        const t = typeof oldUrl === "string" ? oldUrl.trim() : "";
        if (!t || nextUrls.has(t)) continue;
        try {
          const refs = await countSoundUrlReferences(t, storeType);
          if (refs === 0) await deleteR2ObjectForStoredUrl(t);
        } catch {
          /* replacing audio must not fail the save */
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[super-admin order-acceptance PUT]", e);
    const msg = e instanceof Error ? e.message : "Save failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const applySchema = z.object({
  action: z.literal("apply_source_to_all"),
  source_store_type: z.string().min(1).max(64).optional(),
  acceptance_window_minutes: z.number().int().min(1).max(180).optional(),
});

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi(req);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const result = await applySourceSoundsToAllTypes({
      sourceType: parsed.data.source_store_type,
      windowMinutes: parsed.data.acceptance_window_minutes ?? 15,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[super-admin order-acceptance POST]", e);
    const msg = e instanceof Error ? e.message : "Apply failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const deleteSchema = z.object({
  store_type: z.string().min(1).max(64),
  alert_sound_url: optionalSoundUrl,
  alert_sound_url_2: optionalSoundUrl,
  alert_sound_url_3: optionalSoundUrl,
});

export async function DELETE(req: NextRequest) {
  const gate = await requireSuperAdminApi(req);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let input: z.infer<typeof deleteSchema>;
  try {
    input = deleteSchema.parse(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid input";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const storeType = String(input.store_type || "").trim().toUpperCase();
  if (!storeType) {
    return NextResponse.json({ error: "store_type is required" }, { status: 400 });
  }

  const sql = getSql();
  try {
    const existing = (await sql`
      SELECT
        store_type,
        alert_sound_url,
        alert_sound_url_2,
        alert_sound_url_3
      FROM platform_food_acceptance_settings_by_store_type
      WHERE store_type = ${storeType}
      LIMIT 1
    `) as Array<{
      store_type: string;
      alert_sound_url: string | null;
      alert_sound_url_2: string | null;
      alert_sound_url_3: string | null;
    }>;

    const soundUrls = new Set<string>();
    const collect = (v: string | null | undefined) => {
      const t = typeof v === "string" ? v.trim() : "";
      if (t) soundUrls.add(t);
    };
    collect(input.alert_sound_url);
    collect(input.alert_sound_url_2);
    collect(input.alert_sound_url_3);
    if (existing[0]) {
      collect(existing[0].alert_sound_url);
      collect(existing[0].alert_sound_url_2);
      collect(existing[0].alert_sound_url_3);
    }

    try {
      await deleteMerchantStoreTypeDocumentMaps(storeType);
    } catch (e) {
      console.warn("[super-admin order-acceptance DELETE] merchant doc map", e);
    }
    try {
      await sql`
        DELETE FROM merchant_store_type_onboarding_flags
        WHERE store_type = ${storeType}
      `;
    } catch (e) {
      console.warn("[super-admin order-acceptance DELETE] onboarding flags", e);
    }

    await sql`
      DELETE FROM platform_food_acceptance_settings_by_store_type
      WHERE store_type = ${storeType}
    `;

    for (const url of soundUrls) {
      try {
        const refs = await countSoundUrlReferences(url);
        if (refs === 0) await deleteR2ObjectForStoredUrl(url);
      } catch {
        /* deleting a type must not fail because one R2 object is missing */
      }
    }

    return NextResponse.json({ ok: true, store_type: storeType });
  } catch (e) {
    console.error("[super-admin order-acceptance DELETE]", e);
    const msg = e instanceof Error ? e.message : "Remove failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
