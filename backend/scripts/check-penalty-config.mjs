import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const reason = await sql`
  SELECT id, label, reason_code, channel
  FROM order_cancellation_reason_catalog
  WHERE reason_code = 'app_rider_vehicle_issue'
     OR label ILIKE '%Vehicle breakdown%'
  ORDER BY channel
`;

const rules = await sql`
  SELECT r.scenario_code, r.applies_penalty, c.reason_code, c.label, c.channel
  FROM gm_rider_penalty_reason_rules r
  JOIN order_cancellation_reason_catalog c ON c.id = r.catalog_reason_id
  WHERE c.reason_code = 'app_rider_vehicle_issue'
     OR c.label ILIKE '%Vehicle breakdown%'
  ORDER BY r.scenario_code, c.channel
`;

const scenarios = await sql`
  SELECT scenario_code, is_enabled, flat_penalty_amount, amount_base
  FROM gm_rider_penalty_scenario_config
`;

const panel = await sql`
  SELECT party_code, is_enabled
  FROM gm_party_penalty_panel
  WHERE party_code = 'RIDER'
`;

console.log(JSON.stringify({ reason, rules, scenarios, panel }, null, 2));
await sql.end();
