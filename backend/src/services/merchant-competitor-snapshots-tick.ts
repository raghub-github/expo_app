import type { FastifyBaseLogger } from "fastify";
import { getSql } from "../db/client.js";

/** Nightly refresh of city + pincode (locality) competitor snapshots for all stores. */
export async function runCompetitorSnapshotsTick(log: FastifyBaseLogger): Promise<void> {
  const sql = getSql();
  const started = Date.now();
  await sql`SELECT public.refresh_merchant_store_competitor_snapshots(NULL, ${"city"})`;
  await sql`SELECT public.refresh_merchant_store_competitor_snapshots(NULL, ${"locality"})`;
  log.info(
    { durationMs: Date.now() - started },
    "merchant_competitor_snapshots refreshed (city + locality, all stores)"
  );
}
