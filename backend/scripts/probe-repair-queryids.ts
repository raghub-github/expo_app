import { loadEnv } from "../src/config/loadEnv.js";
import postgres from "postgres";
import { getEnv } from "../src/config/env.js";

loadEnv();
const sql = postgres(getEnv().DATABASE_URL, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  connection: { statement_timeout: 20_000, application_name: "gatimitra-io-probe2" },
});

const q = await sql`
  SELECT queryid::text AS queryid, calls, round(mean_exec_time::numeric, 2) AS mean_ms,
         shared_blks_read, left(query, 800) AS query
  FROM pg_stat_statements
  WHERE queryid IN (
    6411893584037544591::bigint,
    4488181199254163774::bigint,
    7922184982722071837::bigint
  )
`;

const cron = await sql`
  SELECT jobid, schedule, command, nodename, active
  FROM cron.job
  ORDER BY jobid
`.catch((e: Error) => [{ error: e.message }]);

const loadLatest = await sql`
  SELECT queryid::text AS queryid, calls, round(mean_exec_time::numeric, 2) AS mean_ms,
         left(query, 400) AS query
  FROM pg_stat_statements
  WHERE query ILIKE '%FROM order_refunds%'
    AND query ILIKE '%ORDER BY created_at DESC%'
    AND query NOT ILIKE '%DISTINCT ON%'
  ORDER BY calls DESC
  LIMIT 8
`;

console.log(JSON.stringify({ q, cron, loadLatest }, null, 2));
await sql.end({ timeout: 5 });
