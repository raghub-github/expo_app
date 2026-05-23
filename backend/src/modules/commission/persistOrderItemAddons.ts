import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ordersCoreItemAddons } from "../../db/schema.js";
import type { NormalizedOrderAddon } from "../orders/orderNormalizer.js";
import {
  writeOrderAddonCommissionSnapshots,
  type AddonForCommissionSnapshot,
} from "./writeOrderAddonCommissionSnapshots.js";

function sanitizeNumeric(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

export async function persistOrderItemAddonsWithSnapshots(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  args: {
    storeId: number;
    orderIdNum: number;
    orderItemId: number;
    addons: NormalizedOrderAddon[];
  },
): Promise<void> {
  const { storeId, orderIdNum, orderItemId, addons } = args;
  if (addons.length === 0) return;

  const inserted = await tx
    .insert(ordersCoreItemAddons)
    .values(
      addons.map((ad) => ({
        orderItemId,
        addonId:
          ad.menuAddonPk != null && ad.menuAddonPk > 0 ? ad.menuAddonPk : undefined,
        menuAddonId: ad.menuAddonId,
        customizationId: ad.customizationId ?? undefined,
        menuAddonPk: ad.menuAddonPk ?? undefined,
        addonName: ad.addonName || undefined,
        addonPrice: sanitizeNumeric(ad.addonPrice),
        quantity: Math.max(1, ad.quantity),
      })),
    )
    .returning({ id: ordersCoreItemAddons.id });

  const snapshotInputs: AddonForCommissionSnapshot[] = [];
  for (let i = 0; i < inserted.length; i++) {
    const row = inserted[i];
    const ad = addons[i];
    if (row?.id == null || !ad) continue;
    snapshotInputs.push({
      orderItemAddonId: Number(row.id),
      menuAddonId: ad.menuAddonId,
      customizationId: ad.customizationId,
      menuAddonPk: ad.menuAddonPk,
      addonName: ad.addonName,
      quantity: ad.quantity,
      customerVisiblePerUnitRupees: ad.addonPrice,
    });
  }

  await writeOrderAddonCommissionSnapshots(
    tx,
    storeId,
    orderIdNum,
    orderItemId,
    snapshotInputs,
  );
}
