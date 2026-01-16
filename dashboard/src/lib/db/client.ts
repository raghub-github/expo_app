import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (_db) return _db;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const sql = postgres(databaseUrl, {
    max: process.env.NODE_ENV === "production" ? 20 : 5,
    idle_timeout: 20,
    connect_timeout: 30, // Increased from 10 to 30 seconds
    max_lifetime: 60 * 30, // 30 minutes
  });

  _sql = sql;
  _db = drizzle(sql, { schema });
  return _db;
}

export function getSql() {
  if (!_sql) {
    getDb();
  }
  return _sql!;
}
