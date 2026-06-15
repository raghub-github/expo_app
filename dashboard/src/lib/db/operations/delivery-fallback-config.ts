import { getSql } from "../client";

export type DeliveryFallbackConfig = {
  fallbackBaseInr: number;
  fallbackPerKmInr: number;
  minFeeInr: number;
  updatedAt: string | null;
};

const KEYS = {
  base: "delivery.fallback_base_inr",
  perKm: "delivery.fallback_per_km_inr",
  minFee: "delivery.min_fee_inr",
} as const;

function parseNum(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export async function getDeliveryFallbackConfig(): Promise<DeliveryFallbackConfig> {
  const sql = getSql();
  const rows = await sql<
    { config_key: string; config_value: string; updated_at: string | null }[]
  >`
    SELECT config_key, config_value::text AS config_value, updated_at
    FROM system_config
    WHERE config_key IN (${KEYS.base}, ${KEYS.perKm}, ${KEYS.minFee})
  `;

  const map = new Map(rows.map((r) => [r.config_key, r]));
  const latestUpdated = rows.reduce<string | null>((acc, r) => {
    if (!r.updated_at) return acc;
    if (!acc || r.updated_at > acc) return r.updated_at;
    return acc;
  }, null);

  return {
    fallbackBaseInr: parseNum(map.get(KEYS.base)?.config_value, 25),
    fallbackPerKmInr: parseNum(map.get(KEYS.perKm)?.config_value, 5),
    minFeeInr: parseNum(map.get(KEYS.minFee)?.config_value, 0),
    updatedAt: latestUpdated,
  };
}

export async function updateDeliveryFallbackConfig(
  patch: Partial<Pick<DeliveryFallbackConfig, "fallbackBaseInr" | "fallbackPerKmInr" | "minFeeInr">>
): Promise<DeliveryFallbackConfig> {
  const sql = getSql();

  if (patch.fallbackBaseInr != null) {
    await sql`
      UPDATE system_config
      SET config_value = ${String(patch.fallbackBaseInr)}, updated_at = NOW()
      WHERE config_key = ${KEYS.base}
    `;
  }
  if (patch.fallbackPerKmInr != null) {
    await sql`
      UPDATE system_config
      SET config_value = ${String(patch.fallbackPerKmInr)}, updated_at = NOW()
      WHERE config_key = ${KEYS.perKm}
    `;
  }
  if (patch.minFeeInr != null) {
    await sql`
      UPDATE system_config
      SET config_value = ${String(patch.minFeeInr)}, updated_at = NOW()
      WHERE config_key = ${KEYS.minFee}
    `;
  }

  return getDeliveryFallbackConfig();
}
