/**
 * Area Manager activity logging.
 * Writes to activity_logs for who onboarded/verified/rejected and key actions.
 */

import { getDb } from "@/lib/db/client";
import { activityLogs } from "@/lib/db/schema";

export interface LogActivityParams {
  actorId: number | null;
  action: string;
  entityType: string;
  entityId: number;
}

/**
 * Log one activity entry (store/rider create, verify, reject, update, etc.)
 */
export async function logAreaManagerActivity(params: LogActivityParams): Promise<void> {
  const db = getDb();
  await db.insert(activityLogs).values({
    actorId: params.actorId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
  });
}
