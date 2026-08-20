/**
 * Optional DB check: run with RUN_DB_TESTS=1 and valid DATABASE_URL (e.g. CI after migrations).
 * Confirms order_settlement_breakdown has every column upsertSettlementBreakdownFromCtm()
 * (writeMerchantCtmPricingSnapshots.ts) writes, so settlement never silently falls back
 * to the zeroed-out defaults in payment_process_delivered_settlement().
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import postgres from "postgres";
import { loadEnv } from "../../config/loadEnv.js";
import { getEnv } from "../../config/env.js";

const run = process.env.RUN_DB_TESTS === "1";

describe("order_settlement_breakdown CTM-sourced columns", { skip: !run }, () => {
  it("has item_total, merchant_gross, commission_percentage, and all four offer-discount buckets", async () => {
    loadEnv();
    const env = getEnv();
    const sql = postgres(env.DATABASE_URL, { max: 1 });
    try {
      const required = [
        "order_id",
        "item_total",
        "packaging_charge",
        "merchant_gross",
        "commission_percentage",
        "coupon_offer_discount",
        "percentage_flat_offer_discount",
        "combo_offer_discount",
        "free_delivery_offer_discount",
        "settled",
        "calculation_version",
        "company_funded_discount",
        "platform_merchant_share",
        "platform_company_share",
        "platform_discount_total",
      ] as const;
      const rows = await sql<{ column_name: string }[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'order_settlement_breakdown'
          AND column_name IN ${sql([...required])}
      `;
      const have = new Set(rows.map((r) => r.column_name));
      for (const col of required) {
        assert.ok(have.has(col), `missing column order_settlement_breakdown.${col}`);
      }
    } finally {
      await sql.end();
    }
  });

  it("order_id is unique so ON CONFLICT (order_id) upserts are safe under retries", async () => {
    loadEnv();
    const env = getEnv();
    const sql = postgres(env.DATABASE_URL, { max: 1 });
    try {
      const rows = await sql<{ conname: string }[]>`
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.order_settlement_breakdown'::regclass
          AND contype = 'u'
      `;
      assert.ok(
        rows.some((r) => r.conname === "order_settlement_breakdown_order_id_unique"),
        "expected order_settlement_breakdown_order_id_unique constraint"
      );
    } finally {
      await sql.end();
    }
  });
});
