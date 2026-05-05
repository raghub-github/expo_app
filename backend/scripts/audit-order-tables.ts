/**
 * Audit public tables/views/triggers with "order" in the name.
 * Usage (from repo root): cd backend && npx tsx scripts/audit-order-tables.ts
 * Requires DATABASE_URL.
 */
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  try {
    console.log("=== Tables (estimated rows, size) ===");
    console.table(
      await sql`
        SELECT c.relname AS table_name,
               c.reltuples::bigint AS estimated_rows,
               pg_total_relation_size(c.oid) AS total_bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND n.nspname = 'public'
          AND c.relname ILIKE '%order%'
        ORDER BY c.relname
      `
    );

    console.log("\n=== FKs touching order-named tables ===");
    console.table(
      await sql`
        SELECT tc.table_name AS from_table,
               kcu.column_name AS from_column,
               ccu.table_name AS to_table,
               ccu.column_name AS to_column,
               tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND (tc.table_name ILIKE '%order%' OR ccu.table_name ILIKE '%order%')
        ORDER BY tc.table_name, kcu.column_name
      `
    );

    console.log("\n=== Views (name) ===");
    console.table(
      await sql`
        SELECT table_name AS view_name
        FROM information_schema.views
        WHERE table_schema = 'public' AND table_name ILIKE '%order%'
        ORDER BY table_name
      `
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
