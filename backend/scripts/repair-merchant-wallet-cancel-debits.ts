/**
 * One-shot repair: reverse wrongful cancellation debits (order never credited).
 *
 * Usage:
 *   npx tsx scripts/repair-merchant-wallet-cancel-debits.ts --store=GMMC1025
 *   npx tsx scripts/repair-merchant-wallet-cancel-debits.ts --store-id=77
 */
import { loadEnv } from "../src/config/loadEnv.js";
import { getSql } from "../src/db/client.js";
import { repairErroneousZeroCompensationCancellationDebits } from "../src/lib/backfill-merchant-wallet-credits.js";
import { reconcileWallet } from "../src/lib/merchant-wallet-engine.js";

function arg(name: string): string | null {
  const k = `--${name}=`;
  const v = process.argv.find((x) => x.startsWith(k));
  return v ? v.slice(k.length).trim() : null;
}

async function main() {
  loadEnv();
  const sql = getSql();

  const publicStoreId = arg("store");
  const internalId = arg("store-id");

  let merchantStoreId: number | null = internalId ? Number(internalId) : null;
  if (publicStoreId) {
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM merchant_stores WHERE store_id = ${publicStoreId} LIMIT 1
    `;
    merchantStoreId = Number(rows[0]?.id);
  }

  if (!Number.isFinite(merchantStoreId) || merchantStoreId! <= 0) {
    console.error("Provide --store=GMMC1025 or --store-id=<internal id>");
    process.exit(1);
  }

  const before = await reconcileWallet(merchantStoreId!);
  console.log("[before]", before);

  const result = await repairErroneousZeroCompensationCancellationDebits(sql, merchantStoreId!, 50);
  console.log("[repair]", result);

  const after = await reconcileWallet(merchantStoreId!);
  console.log("[after]", after);

  const wallet = await sql`
    SELECT available_balance::text FROM merchant_wallet WHERE merchant_store_id = ${merchantStoreId}
  `;
  console.log("[available_balance]", wallet[0]?.available_balance);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
