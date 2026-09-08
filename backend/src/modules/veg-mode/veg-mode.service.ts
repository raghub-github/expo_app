import { getSupabase } from "../../lib/supabase.js";

const TABLE = "customer_veg_mode_preferences";

export const VEG_MODE_SCOPES = ["all_restaurants", "pure_veg_only"] as const;
export type VegModeStoreScope = (typeof VEG_MODE_SCOPES)[number];

export type VegModePreference = {
  enabled: boolean;
  storeScope: VegModeStoreScope;
  weekdays: number[] | null;
  updatedAt: string;
};

function isTableMissingError(error: { code?: string; message?: string }): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  const code = error?.code ?? "";
  return (
    code === "42P01" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("relation")
  );
}

function normalizeWeekdays(raw: unknown): number[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const days = [...new Set(raw.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  return days.length > 0 ? days.sort((a, b) => a - b) : null;
}

function mapRow(row: {
  enabled?: boolean;
  store_scope?: string;
  weekdays?: number[] | null;
  updated_at?: string;
}): VegModePreference {
  const storeScope: VegModeStoreScope =
    row.store_scope === "pure_veg_only" ? "pure_veg_only" : "all_restaurants";
  return {
    enabled: row.enabled === true,
    storeScope,
    weekdays: normalizeWeekdays(row.weekdays),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

const DEFAULT_PREFS: VegModePreference = {
  enabled: false,
  storeScope: "all_restaurants",
  weekdays: null,
  updatedAt: new Date(0).toISOString(),
};

export async function getVegModePreference(customerId: number): Promise<VegModePreference> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).select("*").eq("customer_id", customerId).maybeSingle();
    if (error) {
      if (isTableMissingError(error)) return { ...DEFAULT_PREFS };
      throw error;
    }
    if (!data) return { ...DEFAULT_PREFS };
    return mapRow(data as Parameters<typeof mapRow>[0]);
  } catch (err) {
    if (err && typeof err === "object" && isTableMissingError(err as { code?: string; message?: string })) {
      return { ...DEFAULT_PREFS };
    }
    throw err;
  }
}

export async function upsertVegModePreference(
  customerId: number,
  input: { enabled: boolean; storeScope: VegModeStoreScope; weekdays: number[] | null }
): Promise<VegModePreference> {
  const weekdays = normalizeWeekdays(input.weekdays);
  const payload = {
    customer_id: customerId,
    enabled: input.enabled === true,
    store_scope: input.storeScope === "pure_veg_only" ? "pure_veg_only" : "all_restaurants",
    weekdays,
    updated_at: new Date().toISOString(),
  };
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(payload, { onConflict: "customer_id" })
      .select("*")
      .maybeSingle();
    if (error) {
      if (isTableMissingError(error)) {
        return {
          enabled: payload.enabled,
          storeScope: payload.store_scope as VegModeStoreScope,
          weekdays,
          updatedAt: payload.updated_at,
        };
      }
      throw error;
    }
    if (!data) {
      return {
        enabled: payload.enabled,
        storeScope: payload.store_scope as VegModeStoreScope,
        weekdays,
        updatedAt: payload.updated_at,
      };
    }
    return mapRow(data as Parameters<typeof mapRow>[0]);
  } catch (err) {
    if (err && typeof err === "object" && isTableMissingError(err as { code?: string; message?: string })) {
      return {
        enabled: payload.enabled,
        storeScope: payload.store_scope as VegModeStoreScope,
        weekdays,
        updatedAt: payload.updated_at,
      };
    }
    throw err;
  }
}
