/**
 * Read-only: current backends, wait events, refund-related statement freeze check.
 */
import { loadEnv } from "../src/config/loadEnv.js";
import postgres from "postgres";
import { getEnv } from "../src/config/env.js";

loadEnv();
const sql = postgres(getEnv().DATABASE_URL, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  connection: { statement_timeout: 20_000, application_name: "gatimitra-io-activity" },
});

const activity = await sql`
  SELECT pid, usename, application_name, client_addr::text AS client_addr,
         state, wait_event_type, wait_event,
         EXTRACT(EPOCH FROM (now() - query_start))::int AS query_sec,
         EXTRACT(EPOCH FROM (now() - state_change))::int AS state_sec,
         left(query, 180) AS query
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND pid <> pg_backend_pid()
  ORDER BY query_start NULLS LAST
`;

const waits = await sql`
  SELECT wait_event_type, wait_event, state, COUNT(*)::int AS n
  FROM pg_stat_activity
  WHERE datname = current_database()
  GROUP BY 1, 2, 3
  ORDER BY n DESC
`;

const newRepair = await sql`
  SELECT queryid::text AS queryid, calls, round(mean_exec_time::numeric, 2) AS mean_ms,
         shared_blks_read, left(query, 220) AS query
  FROM pg_stat_statements
  WHERE query ILIKE '%order_refunds%'
    AND query ILIKE '%NOT EXISTS%'
  ORDER BY calls DESC
  LIMIT 10
`;

const latestLookup = await sql`
  SELECT queryid::text AS queryid, calls, round(mean_exec_time::numeric, 2) AS mean_ms,
         shared_blks_read, left(query, 220) AS query
  FROM pg_stat_statements
  WHERE query ILIKE '%FROM order_refunds%'
    AND query ILIKE '%ORDER BY created_at DESC%'
    AND query ILIKE '%LIMIT%'
  ORDER BY calls DESC
  LIMIT 10
`;

console.log(JSON.stringify({ capturedAt: new Date().toISOString(), waits, activity, newRepair, latestLookup }, null, 2));
await sql.end({ timeout: 5 });
