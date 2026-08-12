import { loadEnv } from "../src/config/loadEnv.js";
import postgres from "postgres";
import { getEnv } from "../src/config/env.js";

loadEnv();
const sql = postgres(getEnv().DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 });

async function cols(name: string) {
  const rows = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'pg_catalog' AND table_name = ${name}
    ORDER BY ordinal_position
  `;
  console.log(name + ":", rows.map((r) => r.column_name).join(", "));
}

await cols("pg_stat_io");
await cols("pg_stat_bgwriter");
await cols("pg_stat_checkpointer");
await cols("pg_statio_user_tables");
await sql.end();
