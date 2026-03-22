/**
 * System User ID Generator
 * Auto-generates unique system_user_id based on role patterns
 */

import { getDb } from "../db/client";
import { systemUsers } from "../db/schema";
import { sql, ilike } from "drizzle-orm";

/**
 * Generate next available system_user_id for a given role
 * Pattern: {ROLE}_{NUMBER} (e.g., AGENT_001, SUPER_ADMIN_002)
 */
export async function generateSystemUserId(role: string): Promise<string> {
  const db = getDb();

  // Determine prefix from system_roles.role_id, based on role_type.
  // This keeps prefixes fully data-driven; if roles are added/changed,
  // only the system_roles table needs to be updated.
  let prefix = role;

  try {
    const result = await db.execute<{ role_id: string }>(
      sql`SELECT role_id
          FROM public.system_roles
          WHERE trim(role_name) = ${role}
            AND (is_active IS NULL OR is_active = TRUE)
          ORDER BY role_level ASC
          LIMIT 1`
    );

    const rows = Array.isArray((result as any).rows)
      ? (result as any).rows
      : (result as any);

    if (rows[0]?.role_id) {
      prefix = rows[0].role_id;
    }
  } catch (error) {
    console.error("[generateSystemUserId] Error fetching role prefix from system_roles:", error);
    // If query fails, we continue with the original role as prefix.
  }

  try {
    // Query all existing system_user_ids that start with the role prefix
    // Using ILIKE pattern matching: 'PREFIX%'
    const existingUsers = await db
      .select({
        systemUserId: systemUsers.systemUserId,
      })
      .from(systemUsers)
      .where(ilike(systemUsers.systemUserId, `${prefix}%`));
    
    // Extract numbers from existing IDs
    const numbers: number[] = [];
    existingUsers.forEach((user) => {
      const match = user.systemUserId.match(new RegExp(`^${prefix}(\\d+)$`));
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num)) {
          numbers.push(num);
        }
      }
    });
    
    // Find the next available number
    let nextNumber = 1;
    if (numbers.length > 0) {
      const maxNumber = Math.max(...numbers);
      nextNumber = maxNumber + 1;
    }
    
    // Format with leading zeros (001, 002, etc.)
    const formattedNumber = nextNumber.toString().padStart(3, "0");
    const newSystemUserId = `${prefix}${formattedNumber}`;
    
    // Double-check uniqueness (in case of race condition)
    const existing = await db
      .select()
      .from(systemUsers)
      .where(sql`${systemUsers.systemUserId} = ${newSystemUserId}`)
      .limit(1);
    
    if (existing.length > 0) {
      // If somehow it exists, try next number
      return generateSystemUserId(role);
    }
    
    return newSystemUserId;
  } catch (error) {
    console.error("[generateSystemUserId] Error:", error);
    // Fallback: use timestamp-based ID if database query fails
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}${timestamp}`;
  }
}

/**
 * Validate if a system_user_id is unique
 */
export async function isSystemUserIdUnique(systemUserId: string): Promise<boolean> {
  const db = getDb();
  
  try {
    const existing = await db
      .select()
      .from(systemUsers)
      .where(sql`${systemUsers.systemUserId} = ${systemUserId}`)
      .limit(1);
    
    return existing.length === 0;
  } catch (error) {
    console.error("[isSystemUserIdUnique] Error:", error);
    return false;
  }
}
