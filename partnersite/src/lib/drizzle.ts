// src/lib/drizzle.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL!;

export const client = postgres(connectionString, {
  max: process.env.NODE_ENV === 'production' ? 20 : 5,
  idle_timeout: 20,
  connect_timeout: 30,
  max_lifetime: 60 * 30,
  prepare: false, // Required for Supabase/PgBouncer pooler — avoids "prepared statement does not exist"
  // Required for `= ANY(${jsArray})` queries: without type introspection postgres.js
  // serializes a JS array as the bare string "1,2,3" (no braces) → PostgresError 22P02
  // "malformed array literal", 500ing every route that uses ANY() (e.g. food-order
  // customer-stats → GET /api/food-orders). A ::bigint[] cast does NOT fix it. Type
  // introspection is one plain SELECT per NEW connection and is PgBouncer-compatible.
  fetch_types: true,
  // Per-connection settings applied on every checkout. statement_timeout at
  // 25s ensures a slow / stuck query is killed by Postgres before nginx (60s)
  // returns 504 — the route returns a clean 500 quickly, the browser sees a
  // fast error, and the request no longer holds a DB connection.
  connection: {
    // statement_timeout is applied as a literal SET during connection setup.
    // Cast because postgres.js types the connection settings as strings but
    // the .d.ts declares it numeric — the runtime accepts a string here.
    statement_timeout: '25000' as unknown as number,
  },
});

export const db = drizzle(client);
