import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Supabase connection string format: postgresql://postgres:[password]@[host]:[port]/postgres
// Users should set DATABASE_URL in their .env.local file with the full connection string
// Example: DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

let client = null;
let dbInstance = null;

function initializeDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL environment variable is not set. ' +
      'Please set DATABASE_URL in your .env.local file. ' +
      'Format: postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres\n\n' +
      'To get your DATABASE_URL:\n' +
      '1. Go to Supabase Dashboard > Settings > Database\n' +
      '2. Copy the Connection string (URI format)\n' +
      '3. Replace [YOUR-PASSWORD] with your database password\n' +
      '4. Add it to .env.local as: DATABASE_URL=your-connection-string'
    );
  }

  if (!client) {
    // Create a single connection pool
    // Production-ready settings:
    // - SSL required for secure connections
    // - Connection pooling for better performance
    // - Max 1 connection per instance (serverless-friendly)
    client = postgres(process.env.DATABASE_URL, {
      max: 1,
      ssl: 'require',
      idle_timeout: 20,
      connect_timeout: 10,
    });
    dbInstance = drizzle(client);
  }

  return dbInstance;
}

// Lazy initialization - only create connection when db is first accessed
export const db = new Proxy({}, {
  get(target, prop) {
    try {
      const db = initializeDb();
      const value = db[prop];
      if (typeof value === 'function') {
        return value.bind(db);
      }
      return value;
    } catch (error) {
      throw error;
    }
  }
});

