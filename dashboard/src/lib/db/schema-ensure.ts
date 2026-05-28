import { getSql } from "./client";

export async function publicTableExists(tableName: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
    LIMIT 1
  `;
  return (rows as unknown[]).length > 0;
}

export async function publicColumnExists(
  tableName: string,
  columnName: string
): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND column_name = ${columnName}
    LIMIT 1
  `;
  return (rows as unknown[]).length > 0;
}
