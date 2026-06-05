#!/usr/bin/env node
/**
 * Validates Financial Rule Engine schema, catalogs, and simulation paths.
 * Usage: node scripts/validate-financial-rule-engine.mjs
 * Requires DATABASE_URL in environment.
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

const checks = [];

async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (e) {
    checks.push({ name, ok: false, error: e instanceof Error ? e.message : String(e) });
    console.error(`✗ ${name}:`, e instanceof Error ? e.message : e);
  }
}

await check("gm_rule_master exists", async () => {
  const [r] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'gm_rule_master'
    ) AS ok
  `;
  if (!r.ok) throw new Error("table missing — run migration 0246");
});

await check("catalog service types", async () => {
  const rows = await sql`SELECT * FROM gm_catalog_service_types()`;
  if (!rows.length) throw new Error("no service types");
});

await check("catalog order stages", async () => {
  const rows = await sql`SELECT * FROM gm_catalog_order_stages()`;
  if (!rows.length) throw new Error("no order stages");
});

await check("catalog triggered_by", async () => {
  const rows = await sql`SELECT * FROM gm_catalog_triggered_by()`;
  if (!rows.length) throw new Error("no triggered_by values");
});

await check("cancellation reason catalog", async () => {
  const [r] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'order_cancellation_reason_catalog'
    ) AS ok
  `;
  if (!r.ok) throw new Error("order_cancellation_reason_catalog missing");
});

await check("fault allocation constraint", async () => {
  await sql`
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gm_rule_fault_allocation_sum_100'
  `.then((r) => {
    if (!r.length) throw new Error("constraint missing");
  });
});

await check("simulation function", async () => {
  const [r] = await sql`
    SELECT gm_simulate_rule(
      'CANCELLATION'::gm_rule_scenario_type,
      'FOOD', 'PRE_PICKUP_CANCELLED', NULL, 'MERCHANT', 500, NULL
    )::jsonb AS result
  `;
  if (!r.result) throw new Error("no simulation result");
});

await check("execution log table", async () => {
  const [r] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'gm_rule_execution_log'
    ) AS ok
  `;
  if (!r.ok) throw new Error("gm_rule_execution_log missing");
});

await check("reporting view (0247)", async () => {
  const [r] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.views WHERE table_name = 'v_gm_rule_execution_report'
    ) AS ok
  `;
  if (!r.ok) console.warn("  (optional) v_gm_rule_execution_report not yet applied — run 0247");
});

const failed = checks.filter((c) => !c.ok);
await sql.end();

console.log("\n--- Summary ---");
console.log(`Passed: ${checks.filter((c) => c.ok).length}/${checks.length}`);
if (failed.length) {
  process.exit(1);
}
console.log("All required validations passed.");
