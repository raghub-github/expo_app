/**
 * Dry-run / apply 0610 eligibility ownership sync (I/O-safe).
 * Usage:
 *   npx tsx scripts/run-0610-eligibility-ownership.ts          # dry-run
 *   npx tsx scripts/run-0610-eligibility-ownership.ts --apply  # commit UPDATE
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../src/config/loadEnv.js";
import { getEnv } from "../src/config/env.js";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const apply = process.argv.includes("--apply");

loadEnv();
const env = getEnv();
const sql = postgres(env.DATABASE_URL, {
  max: 1,
  idle_timeout: 10,
  connect_timeout: 20,
});

async function main() {
  const counts = await sql<{
    commercial_true_active: number;
    would_update: number;
    commercial_false_untouched: number;
    already_ok: number;
  }[]>`
    SELECT
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND commercial_required = TRUE)::int AS commercial_true_active,
      COUNT(*) FILTER (
        WHERE deleted_at IS NULL
          AND commercial_required = TRUE
          AND (
            allowed_ownership IS NULL
            OR cardinality(allowed_ownership) = 0
            OR allowed_ownership @> ARRAY['non_commercial']::text[]
            OR allowed_ownership IS DISTINCT FROM ARRAY['commercial']::text[]
          )
      )::int AS would_update,
      COUNT(*) FILTER (
        WHERE deleted_at IS NULL
          AND commercial_required = TRUE
          AND allowed_ownership = ARRAY['commercial']::text[]
      )::int AS already_ok,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND commercial_required = FALSE)::int AS commercial_false_untouched
    FROM rider_service_eligibility_rules
  `;

  const c = counts[0]!;
  console.log("[0610 dry-run counts]", c);

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to UPDATE.");
    return;
  }

  if (c.would_update === 0) {
    console.log("Nothing to update — already consistent / idempotent.");
    return;
  }

  const migrationPath = path.resolve(
    backendRoot,
    "drizzle/0610_eligibility_ownership_commercial_sync.sql"
  );
  const content = fs.readFileSync(migrationPath, "utf8");
  await sql.unsafe(content);

  const after = await sql<{ remaining: number }[]>`
    SELECT COUNT(*)::int AS remaining
    FROM rider_service_eligibility_rules
    WHERE deleted_at IS NULL
      AND commercial_required = TRUE
      AND (
        allowed_ownership IS NULL
        OR cardinality(allowed_ownership) = 0
        OR allowed_ownership @> ARRAY['non_commercial']::text[]
        OR allowed_ownership IS DISTINCT FROM ARRAY['commercial']::text[]
      )
  `;
  console.log("[0610 applied] remaining inconsistent rows:", after[0]?.remaining ?? "?");
  console.log("Migration ran successfully: 0610_eligibility_ownership_commercial_sync.sql");
}

main()
  .catch((err) => {
    console.error("0610 failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
