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
});

export const db = drizzle(client);
