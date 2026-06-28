import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getSql } from "../client";

let schemaReady = false;
let schemaEnsurePromise: Promise<void> | null = null;

function migrationPath(filename: string): string {
  return join(process.cwd(), "drizzle", filename);
}

async function runSqlFile(filename: string): Promise<void> {
  const path = migrationPath(filename);
  if (!existsSync(path)) {
    console.warn(`[rider penalty schema] migration file not found: ${path}`);
    return;
  }
  const sql = getSql();
  const content = readFileSync(path, "utf8");
  await sql.unsafe(content);
}

async function penaltyTablesExist(): Promise<boolean> {
  const sql = getSql();
  const [row] = await sql<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'gm_rider_penalty_scenario_config'
    ) AS ok
  `;
  return Boolean(row?.ok);
}

/** Idempotent: runs 0270 when rider penalty engine tables are missing. */
export async function ensureRiderPenaltyEngineSchema(): Promise<void> {
  if (schemaReady) return;
  if (schemaEnsurePromise) {
    await schemaEnsurePromise;
    return;
  }

  schemaEnsurePromise = (async () => {
    if (await penaltyTablesExist()) {
      schemaReady = true;
      return;
    }
    await runSqlFile("0270_rider_cancellation_penalty_engine.sql");
    schemaReady = true;
  })().catch((e) => {
    schemaEnsurePromise = null;
    throw e;
  });

  await schemaEnsurePromise;
}
