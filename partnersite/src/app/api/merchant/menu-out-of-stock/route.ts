import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";
import { logStoreActivity } from "@/lib/store-activity-feed";
import { buildMenuItemOosModePatch } from "@/lib/merchant-menu-item-stock";
import { updateMerchantMenuItemOutOfStock } from "@/lib/merchant-menu-item-oos-update";
import { client as pgClient } from "@/lib/drizzle";
import { expireTimedMenuOutOfStockForStore } from "@/lib/menu-oos-expiry";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Mode = "CLEAR" | "MANUAL" | "HOURS" | "NEXT_OPEN" | "CUSTOM";

const STORE_TIMEZONE = "Asia/Kolkata";
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function nowInStoreTz(): { dayOfWeek: number; minutesSinceMidnight: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    // hourCycle alone (no hour12): `hour12: false` without an explicit hourCycle can resolve
    // to "h24" (1-24) on some ICU builds, reporting hour=24 at midnight instead of 0.
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const second = Number(parts.find((p) => p.type === "second")?.value ?? 0);
  const minutesSinceMidnight = hour * 60 + minute + second / 60;

  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: STORE_TIMEZONE, weekday: "short" });
  const dayShort = dayFormatter.format(new Date()).toLowerCase();
  const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const dayOfWeek = dayMap[dayShort.slice(0, 3)] ?? 0;
  return { dayOfWeek, minutesSinceMidnight };
}

type Slot = { startMin: number; endMin: number };

function parseTimeToMinutes(t: string | null | undefined): number | null {
  if (t == null || typeof t !== "string") return null;
  const s = String(t).trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!match) return null;
  const h = Math.min(23, Math.max(0, Number(match[1]) || 0));
  const m = Math.min(59, Math.max(0, Number(match[2]) || 0));
  const sec = match[3] != null ? Math.min(59, Math.max(0, Number(match[3]) || 0)) : 0;
  return h * 60 + m + sec / 60;
}

function getSlotsForDay(row: Record<string, unknown>, dayKey: string, sameForAll: boolean): Slot[] {
  const day = sameForAll ? "monday" : dayKey;
  const open = row[`${day}_open`] === true;
  if (!open) return [];
  const s1Start = parseTimeToMinutes(row[`${day}_slot1_start`] as string);
  const s1End = parseTimeToMinutes(row[`${day}_slot1_end`] as string);
  const s2Start = parseTimeToMinutes(row[`${day}_slot2_start`] as string);
  const s2End = parseTimeToMinutes(row[`${day}_slot2_end`] as string);
  const slots: Slot[] = [];
  if (s1Start != null && s1End != null && s1End > s1Start) slots.push({ startMin: s1Start, endMin: s1End });
  if (s2Start != null && s2End != null && s2End > s2Start) slots.push({ startMin: s2Start, endMin: s2End });
  return slots;
}

function minutesToTimeStr(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.floor(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getNextOpenIso(
  row: Record<string, unknown>,
  dayOfWeek: number,
  minutesSinceMidnight: number,
  refDate: Date
): string | null {
  if (row.is_24_hours === true) return null;
  const closedDays = (row.closed_days as string[] | null) ?? [];
  const sameForAll = row.same_for_all_days === true;
  const formatIstDate = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: STORE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value ?? "0";
    const mo = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    return { y, m: mo.padStart(2, "0"), d: day.padStart(2, "0") };
  };
  const addDaysInIst = (dateStr: string, days: number): string => {
    const d = new Date(dateStr + "T00:00:00+05:30");
    d.setTime(d.getTime() + days * 86400 * 1000);
    const p = formatIstDate(d);
    return `${p.y}-${p.m}-${p.d}`;
  };
  const refIst = formatIstDate(refDate);
  const todayStr = `${refIst.y}-${refIst.m}-${refIst.d}`;

  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const checkDay = (dayOfWeek + dayOffset) % 7;
    const dayKey = DAY_NAMES[checkDay];
    if (closedDays.some((d) => String(d).toLowerCase() === dayKey)) continue;
    const slots = getSlotsForDay(row, dayKey, sameForAll).sort((a, b) => a.startMin - b.startMin);
    if (slots.length === 0) continue;
    if (dayOffset === 0) {
      const later = slots.find((s) => s.startMin > minutesSinceMidnight);
      if (!later) continue;
      const timeStr = minutesToTimeStr(later.startMin);
      const isoInIst = `${todayStr}T${timeStr}:00+05:30`;
      const dt = new Date(isoInIst);
      return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
    }
    const dateStr = addDaysInIst(todayStr, dayOffset);
    const timeStr = minutesToTimeStr(slots[0].startMin);
    const isoInIst = `${dateStr}T${timeStr}:00+05:30`;
    const dt = new Date(isoInIst);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  return null;
}

function parsePositiveHours(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const hours = Math.floor(n);
  if (hours <= 0) return null;
  return Math.min(hours, 24 * 14);
}

function parseIsoDate(raw: unknown): Date | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function computeNextOpenIsoForStore(storeIdNum: number): Promise<string | null> {
  const { data } = await supabase
    .from("merchant_store_operating_hours")
    .select("*")
    .eq("store_id", storeIdNum)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const now = new Date();
  const { dayOfWeek, minutesSinceMidnight } = nowInStoreTz();
  return getNextOpenIso(data as any, dayOfWeek, minutesSinceMidnight, now);
}

function resolveUpdate(mode: Mode, hours: unknown, until: unknown): { manual: boolean; until: Date | null } {
  if (mode === "CLEAR") return { manual: false, until: null };
  if (mode === "MANUAL") return { manual: true, until: null };
  if (mode === "HOURS") {
    const h = parsePositiveHours(hours);
    if (!h) throw new Error("invalid_hours");
    return { manual: false, until: new Date(Date.now() + h * 60 * 60 * 1000) };
  }
  if (mode === "CUSTOM") {
    const d = parseIsoDate(until);
    if (!d) throw new Error("invalid_until");
    return { manual: false, until: d };
  }
  return { manual: false, until: null };
}

/**
 * PATCH /api/merchant/menu-out-of-stock
 * Body:
 * - storeId: string (store_id)
 * - targetType: 'item' | 'category'
 * - id: item_id (string) when item, or category id (number) when category
 * - mode: CLEAR|MANUAL|HOURS|NEXT_OPEN|CUSTOM
 * - hours?: number
 * - until?: ISO string
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const storeId = String(body?.storeId ?? body?.restaurant_id ?? "").trim();
    const targetType =
      body?.targetType === "category" ? "category" : body?.targetType === "combo" ? "combo" : "item";
    const mode = body?.mode as Mode;
    if (!storeId || !mode || !["CLEAR", "MANUAL", "HOURS", "NEXT_OPEN", "CUSTOM"].includes(mode)) {
      return NextResponse.json({ error: "storeId and valid mode required" }, { status: 400 });
    }

    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    const storeInternalId = access.storeIdNum;
    await expireTimedMenuOutOfStockForStore(pgClient, storeInternalId);

    let patch = resolveUpdate(mode, body?.hours, body?.until);
    if (mode === "NEXT_OPEN") {
      const nextIso = await computeNextOpenIsoForStore(storeInternalId);
      if (!nextIso) return NextResponse.json({ error: "next_open_not_available" }, { status: 400 });
      patch = { manual: false, until: new Date(nextIso) };
    }

    const updated_at = new Date().toISOString();
    if (targetType === "category") {
      const categoryId = Number(body?.id ?? body?.categoryId);
      if (!Number.isFinite(categoryId) || categoryId <= 0) {
        return NextResponse.json({ error: "category id required" }, { status: 400 });
      }

      // Read previous marker/until so we can restore items safely on CLEAR.
      const { data: prevCat } = await supabase
        .from("merchant_menu_categories")
        .select("out_of_stock_updated_at, out_of_stock_until")
        .eq("store_id", storeInternalId)
        .eq("id", categoryId)
        .maybeSingle();
      const prevMarker = (prevCat as any)?.out_of_stock_updated_at ?? null;
      const prevUntil = (prevCat as any)?.out_of_stock_until ?? null;

      const markerIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("merchant_menu_categories")
        .update({
          out_of_stock_manual: patch.manual,
          out_of_stock_until: patch.until ? patch.until.toISOString() : null,
          out_of_stock_updated_at: markerIso,
          updated_at,
        })
        .eq("store_id", storeInternalId)
        .eq("id", categoryId)
        .select("out_of_stock_manual, out_of_stock_until")
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) return NextResponse.json({ error: "category_not_found" }, { status: 404 });
      try {
        await logStoreActivity({
          storeId: storeInternalId,
          section: "menu_category",
          action: "update",
          entityId: categoryId,
          summary: `Merchant updated out-of-stock for category #${categoryId}`,
          actorType: "merchant",
        });
      } catch {}

      const categoryNowOos =
        Boolean((data as any).out_of_stock_manual) ||
        ((data as any).out_of_stock_until != null && new Date((data as any).out_of_stock_until).getTime() > Date.now());

      if (categoryNowOos) {
        // Cascade: mark items as OOS, but don't override items already OOS.
        await supabase
          .from("merchant_menu_items")
          .update({
            out_of_stock_manual: false,
            out_of_stock_until: (data as any).out_of_stock_until ?? null,
            out_of_stock_updated_at: markerIso,
            in_stock: false,
            updated_at,
          })
          .eq("store_id", storeInternalId)
          .eq("category_id", categoryId)
          .eq("is_deleted", false)
          .or("out_of_stock_manual.is.null,out_of_stock_manual.eq.false")
          .or("out_of_stock_until.is.null,out_of_stock_until.lte." + new Date().toISOString());
      } else if (mode === "CLEAR" && prevMarker) {
        // Restore: clear only items last updated by previous category marker (+ until match).
        const q = supabase
          .from("merchant_menu_items")
          .update({
            out_of_stock_manual: false,
            out_of_stock_until: null,
            out_of_stock_updated_at: markerIso,
            in_stock: true,
            updated_at,
          })
          .eq("store_id", storeInternalId)
          .eq("category_id", categoryId)
          .eq("is_deleted", false)
          .eq("out_of_stock_manual", false)
          .eq("out_of_stock_updated_at", prevMarker);
        if (prevUntil) q.eq("out_of_stock_until", prevUntil);
        else q.is("out_of_stock_until", null);
        await q;
      }

      return NextResponse.json({
        ok: true,
        out_of_stock_manual: Boolean((data as any).out_of_stock_manual),
        out_of_stock_until: (data as any).out_of_stock_until ?? null,
        out_of_stock_updated_at: markerIso,
      });
    }

    if (targetType === "combo") {
      const comboId = Number(body?.id ?? body?.comboId);
      if (!Number.isFinite(comboId) || comboId <= 0) {
        return NextResponse.json({ error: "combo id required" }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("merchant_menu_combos")
        .update({
          out_of_stock_manual: patch.manual,
          out_of_stock_until: patch.until ? patch.until.toISOString() : null,
          out_of_stock_updated_at: updated_at,
          updated_at,
        })
        .eq("store_id", storeInternalId)
        .eq("id", comboId)
        .select("id, out_of_stock_manual, out_of_stock_until")
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) return NextResponse.json({ error: "combo_not_found" }, { status: 404 });
      try {
        await logStoreActivity({
          storeId: storeInternalId,
          section: "combo",
          action: "update",
          entityId: (data as any).id ?? null,
          summary: `Merchant updated out-of-stock for combo #${comboId}`,
          actorType: "merchant",
        });
      } catch {}
      return NextResponse.json({
        ok: true,
        out_of_stock_manual: Boolean((data as any).out_of_stock_manual),
        out_of_stock_until: (data as any).out_of_stock_until ?? null,
        out_of_stock_updated_at: (data as any).out_of_stock_updated_at ?? updated_at,
      });
    }

    const itemId = body?.id ?? body?.item_id ?? body?.itemId;
    if (itemId == null || String(itemId).trim() === "") {
      return NextResponse.json({ error: "item_id required" }, { status: 400 });
    }
    const { data, error } = await updateMerchantMenuItemOutOfStock(
      supabase,
      storeInternalId,
      itemId as string | number,
      patch,
      updated_at
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "item_not_found" }, { status: 404 });
    const itemPatch = buildMenuItemOosModePatch(patch.manual, patch.until, updated_at);
    try {
      await logStoreActivity({
        storeId: storeInternalId,
        section: "menu_item",
        action: "update",
        entityId: data.id ?? null,
        summary: `Merchant updated out-of-stock for item ${String(itemId)}`,
        actorType: "merchant",
      });
    } catch {}
    return NextResponse.json({
      ok: true,
      out_of_stock_manual: Boolean(data.out_of_stock_manual),
      out_of_stock_until: data.out_of_stock_until ?? null,
      out_of_stock_updated_at: data.out_of_stock_updated_at ?? updated_at,
      in_stock: (itemPatch as { in_stock?: boolean }).in_stock,
    });
  } catch (err) {
    console.error("[menu-out-of-stock PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

