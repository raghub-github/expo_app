/**
 * GET /api/merchant/stores/[id]/order-acceptance-settings
 * Same resolution as partnersite (platform_food_acceptance_settings_by_store_type + merchant slot).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ensureMerchantStoreDashboardAccess } from "@/lib/merchant-food-orders/store-access";

export const runtime = "nodejs";

const PLATFORM_FOOD_ALERT_SOUND_SLOT_META_KEY = "platform_food_alert_sound_slot";

const DEFAULTS = {
  acceptance_window_minutes: 5,
  alert_sound_enabled: true,
  alert_sound_url: null as string | null,
  alert_sound_repeat_count: 1,
  alert_sound_urls_by_slot: [null, null, null] as [string | null, string | null, string | null],
  alert_sound_slot_choice: 0,
};

function trimUrl(v: unknown): string | null {
  if (v == null || typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function slotsFromPlatformRow(
  row: Record<string, unknown> | null | undefined
): [string | null, string | null, string | null] {
  if (!row) return [null, null, null];
  return [trimUrl(row.alert_sound_url), trimUrl(row.alert_sound_url_2), trimUrl(row.alert_sound_url_3)];
}

function resolveEffectiveUrl(slots: [string | null, string | null, string | null], choice: number) {
  const c = Math.max(0, Math.min(2, Math.floor(choice)));
  if (slots[c]) return slots[c];
  for (let i = 0; i < 3; i++) {
    if (slots[i]) return slots[i];
  }
  return null;
}

function parseStoredSlot(meta: Record<string, unknown> | null | undefined): number {
  const raw = meta?.[PLATFORM_FOOD_ALERT_SOUND_SLOT_META_KEY];
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 2) return raw;
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    if (Number.isInteger(n) && n >= 0 && n <= 2) return n;
  }
  return 0;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    const access = await ensureMerchantStoreDashboardAccess(storeId);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ settings: { store_type: "GENERAL", ...DEFAULTS } });
    }

    const db = supabaseAdmin;
    const storeType = String(access.store.store_type ?? "GENERAL").toUpperCase();
    const internalId = access.store.id;

    let storedChoice = 0;
    const { data: sett } = await db
      .from("merchant_store_settings")
      .select("settings_metadata")
      .eq("store_id", internalId)
      .maybeSingle();
    storedChoice = parseStoredSlot(sett?.settings_metadata as Record<string, unknown> | undefined);

    const pickPlatformRow = async (stype: string) => {
      return db
        .from("platform_food_acceptance_settings_by_store_type")
        .select(
          "store_type,acceptance_window_minutes,alert_sound_enabled,alert_sound_url,alert_sound_url_2,alert_sound_url_3,alert_sound_repeat_count"
        )
        .eq("store_type", stype)
        .maybeSingle();
    };

    let { data, error } = await pickPlatformRow(storeType);
    if (error) {
      return NextResponse.json({ settings: { store_type: storeType, ...DEFAULTS } });
    }
    if (!data) {
      const { data: g } = await pickPlatformRow("GENERAL");
      data = g ?? null;
    }

    const row = (data ?? {}) as Record<string, unknown>;
    const slots = slotsFromPlatformRow(row);
    let choice = Math.max(0, Math.min(2, Math.floor(storedChoice)));
    if (!slots[choice]) {
      choice = slots.findIndex((s) => s) >= 0 ? slots.findIndex((s) => s) : 0;
    }
    const effectiveUrl = resolveEffectiveUrl(slots, choice);

    return NextResponse.json({
      settings: {
        store_type: storeType,
        acceptance_window_minutes: Number(row.acceptance_window_minutes ?? DEFAULTS.acceptance_window_minutes),
        alert_sound_enabled: row.alert_sound_enabled !== false,
        alert_sound_url: effectiveUrl,
        alert_sound_repeat_count: Number(row.alert_sound_repeat_count ?? DEFAULTS.alert_sound_repeat_count),
        alert_sound_urls_by_slot: slots,
        alert_sound_slot_choice: choice,
      },
    });
  } catch (e) {
    console.error("[order-acceptance-settings GET]", e);
    return NextResponse.json({ settings: { store_type: "GENERAL", ...DEFAULTS } });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    const access = await ensureMerchantStoreDashboardAccess(storeId);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const slotRaw = body.platform_food_alert_sound_slot;
    if (slotRaw === undefined) {
      return NextResponse.json({ error: "platform_food_alert_sound_slot required" }, { status: 400 });
    }
    const slot = Number(slotRaw);
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) {
      return NextResponse.json({ error: "platform_food_alert_sound_slot must be 0, 1, or 2" }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from("merchant_store_settings")
      .select("settings_metadata")
      .eq("store_id", access.store.id)
      .maybeSingle();

    const meta = { ...((existing?.settings_metadata as Record<string, unknown>) ?? {}) };
    meta[PLATFORM_FOOD_ALERT_SOUND_SLOT_META_KEY] = slot;

    await supabaseAdmin.from("merchant_store_settings").upsert(
      {
        store_id: access.store.id,
        settings_metadata: meta,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id" }
    );

    return NextResponse.json({ ok: true, alert_sound_slot_choice: slot });
  } catch (e) {
    console.error("[order-acceptance-settings PATCH]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
