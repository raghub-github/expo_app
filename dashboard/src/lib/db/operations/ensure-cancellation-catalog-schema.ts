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
    console.warn(`[cancellation schema] migration file not found: ${path}`);
    return;
  }
  const sql = getSql();
  const content = readFileSync(path, "utf8");
  await sql.unsafe(content);
}

async function tablesExist(): Promise<{ attrs: boolean; catalog: boolean }> {
  const sql = getSql();
  const [row] = await sql<{ attrs: boolean; catalog: boolean }[]>`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'order_cancellation_attributes'
      ) AS attrs,
      EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'order_cancellation_reason_catalog'
      ) AS catalog
  `;
  return { attrs: Boolean(row?.attrs), catalog: Boolean(row?.catalog) };
}

/**
 * Idempotent: only runs migration SQL when tables are missing (fast path after first run).
 */
export async function ensureCancellationCatalogSchema(): Promise<void> {
  if (schemaReady) return;
  if (schemaEnsurePromise) {
    await schemaEnsurePromise;
    return;
  }

  schemaEnsurePromise = (async () => {
    const existing = await tablesExist();
    if (existing.attrs && existing.catalog) {
      schemaReady = true;
      return;
    }

    if (!existing.attrs) {
      try {
        await runSqlFile("0236_order_cancellation_attributes.sql");
      } catch (e) {
        console.error("[ensureCancellationCatalogSchema] 0236 failed:", e);
      }
    }

    if (!existing.catalog) {
      try {
        await runSqlFile("0235_order_cancellation_reason_catalog.sql");
      } catch (e) {
        console.error("[ensureCancellationCatalogSchema] 0235 failed:", e);
        throw e;
      }
    } else if (!existing.attrs) {
      const after = await tablesExist();
      if (!after.attrs) {
        await runSqlFile("0236_order_cancellation_attributes.sql");
      }
    }

    schemaReady = true;
  })().catch((e) => {
    schemaEnsurePromise = null;
    throw e;
  });

  await schemaEnsurePromise;
}
