/**
 * Optional DB check: run with RUN_DB_TESTS=1 and valid DATABASE_URL (e.g. CI after migrations).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import postgres from "postgres";
import { loadEnv } from "../../config/loadEnv.js";
import { getEnv } from "../../config/env.js";

const run = process.env.RUN_DB_TESTS === "1";

describe("orders_core hybrid OMS columns", { skip: !run }, () => {
  it("has order_id, billing_snapshot, billing_ruleset_version", async () => {
    loadEnv();
    const env = getEnv();
    const sql = postgres(env.DATABASE_URL, { max: 1 });
    try {
      const required = ["order_id", "billing_snapshot", "billing_ruleset_version"] as const;
      const rows = await sql<{ column_name: string }[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'orders_core'
          AND column_name IN ${sql([...required])}
      `;
      const have = new Set(rows.map((r) => r.column_name));
      for (const col of required) {
        assert.ok(have.has(col), `missing column orders_core.${col}`);
      }
    } finally {
      await sql.end();
    }
  });
});
