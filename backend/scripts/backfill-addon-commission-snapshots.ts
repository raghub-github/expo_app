/**
 * Backfill menu_addon_id on legacy addon rows and write missing
 * order_item_addon_commission_snapshots.
 *
 * Run: npx tsx scripts/backfill-addon-commission-snapshots.ts
 */
import { loadEnv } from "../src/config/loadEnv.js";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getEnv } from "../src/config/env.js";
import { writeOrderAddonCommissionSnapshots } from "../src/modules/commission/writeOrderAddonCommissionSnapshots.js";

loadEnv();
const env = getEnv();
const client = postgres(env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

async function main() {
  const patchedFromPk = await client`
    UPDATE orders_core_item_addons oia
    SET
      menu_addon_id = m.addon_id,
      menu_addon_pk = COALESCE(oia.menu_addon_pk, m.id),
      customization_id = COALESCE(
        oia.customization_id,
        c.customization_id
      )
    FROM merchant_menu_item_addons m
    LEFT JOIN merchant_menu_item_customizations c ON c.id = m.customization_id
    WHERE oia.menu_addon_id IS NULL
      AND oia.addon_id IS NOT NULL
      AND oia.addon_id = m.id
    RETURNING oia.id
  `;
  console.log(
    `Patched menu_addon_id on ${patchedFromPk.length} row(s) via addon_id → merchant_menu_item_addons.`,
  );

  const patchedFromName = await client`
    UPDATE orders_core_item_addons oia
    SET
      menu_addon_id = sub.addon_id,
      menu_addon_pk = sub.id,
      customization_id = COALESCE(oia.customization_id, sub.customization_id)
    FROM (
      SELECT DISTINCT ON (oia2.id)
        oia2.id AS oia_id,
        a.id,
        a.addon_id,
        c.customization_id
      FROM orders_core_item_addons oia2
      INNER JOIN orders_core_items oci ON oci.id = oia2.order_item_id
      INNER JOIN orders_core oc ON oc.order_id = oci.order_id
      INNER JOIN merchant_menu_items m ON m.id = oci.menu_item_id AND m.store_id = oc.merchant_store_id
      INNER JOIN merchant_menu_item_customizations c ON c.menu_item_id = m.id
      INNER JOIN merchant_menu_item_addons a ON a.customization_id = c.id
      WHERE oia2.menu_addon_id IS NULL
        AND oia2.addon_name IS NOT NULL
        AND (
          a.addon_name = oia2.addon_name
          OR a.addon_name ILIKE '%' || oia2.addon_name || '%'
          OR oia2.addon_name ILIKE '%' || regexp_replace(a.addon_name, '\\s*\\(\\+.*', '', 'g') || '%'
        )
      ORDER BY oia2.id,
        CASE WHEN a.addon_name = oia2.addon_name THEN 0 ELSE 1 END,
        a.id
    ) sub
    WHERE oia.id = sub.oia_id
    RETURNING oia.id
  `;
  console.log(
    `Patched menu_addon_id on ${patchedFromName.length} row(s) via addon_name lookup.`,
  );

  const missing = await client<
    Array<{
      id: number;
      order_item_id: number;
      order_id: number;
      store_id: number;
      menu_addon_id: string | null;
      customization_id: string | null;
      menu_addon_pk: number | null;
      addon_name: string | null;
      quantity: number;
      addon_price: string;
    }>
  >`
    SELECT
      oia.id,
      oia.order_item_id,
      oc.id AS order_id,
      oc.merchant_store_id AS store_id,
      oia.menu_addon_id,
      oia.customization_id,
      oia.menu_addon_pk,
      oia.addon_name,
      oia.quantity,
      oia.addon_price::text
    FROM orders_core_item_addons oia
    INNER JOIN orders_core_items oci ON oci.id = oia.order_item_id
    INNER JOIN orders_core oc ON oc.order_id = oci.order_id
    LEFT JOIN order_item_addon_commission_snapshots s ON s.order_item_addon_id = oia.id
    WHERE s.id IS NULL
    ORDER BY oia.id ASC
    LIMIT 5000
  `;

  if (missing.length === 0) {
    console.log("No addon rows missing commission snapshots.");
    await client.end();
    return;
  }

  console.log(`Backfilling ${missing.length} addon commission snapshot(s)...`);

  const byItem = new Map<
    number,
    {
      orderIdNum: number;
      orderItemId: number;
      storeId: number;
      addons: Parameters<typeof writeOrderAddonCommissionSnapshots>[4];
    }
  >();

  for (const row of missing) {
    const menuAddonId = String(row.menu_addon_id ?? "").trim();
    if (!menuAddonId) {
      console.warn(`[skip] addon row ${row.id}: missing menu_addon_id (restart backend after 0236 deploy)`);
      continue;
    }
    const price = Number(row.addon_price);
    if (!Number.isFinite(price) || price <= 0) {
      console.warn(`[skip] addon row ${row.id}: invalid addon_price ${row.addon_price}`);
      continue;
    }
    const key = row.order_item_id;
    const bucket =
      byItem.get(key) ??
      {
        orderIdNum: Number(row.order_id),
        orderItemId: row.order_item_id,
        storeId: Number(row.store_id),
        addons: [],
      };
    bucket.addons.push({
      orderItemAddonId: row.id,
      menuAddonId,
      customizationId: row.customization_id,
      menuAddonPk: row.menu_addon_pk,
      addonName: row.addon_name ?? "",
      quantity: Math.max(1, Number(row.quantity) || 1),
      customerVisiblePerUnitRupees: price,
    });
    byItem.set(key, bucket);
  }

  let written = 0;
  await db.transaction(async (tx) => {
    for (const bucket of byItem.values()) {
      await writeOrderAddonCommissionSnapshots(
        tx as never,
        bucket.storeId,
        bucket.orderIdNum,
        bucket.orderItemId,
        bucket.addons,
      );
      written += bucket.addons.length;
    }
  });

  console.log(`Done. Wrote ${written} addon commission snapshot(s).`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
