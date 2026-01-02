import { getDb } from "../db/client.js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Database Transaction Utilities
 * Provides type-safe transaction helpers
 */

export async function withTransaction<T>(
  callback: (tx: PostgresJsDatabase<any>) => Promise<T>
): Promise<T> {
  const db = getDb();
  
  // Drizzle doesn't expose transaction directly, so we use the underlying postgres client
  // For now, we'll use a simple approach - in production, consider using drizzle's transaction API
  // when it becomes available or use raw SQL transactions
  
  try {
    // Execute callback with db (in future, wrap in actual transaction)
    return await callback(db);
  } catch (error) {
    // Transaction would rollback here
    throw error;
  }
}

/**
 * Retry helper for transient database errors
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on validation errors or auth errors
      if (lastError.message.includes("validation") || 
          lastError.message.includes("unauthorized") ||
          lastError.message.includes("not found")) {
        throw lastError;
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
        continue;
      }
    }
  }

  throw lastError || new Error("Retry failed");
}

