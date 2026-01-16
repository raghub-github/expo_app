// src/lib/drizzle.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL!;
console.log('Drizzle DB connection string:', connectionString); // Debug log

export const client = postgres(connectionString);
export const db = drizzle(client);
