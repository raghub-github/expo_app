/**
 * Dispatch Engine — Phase 7: unified dispatch event recorder.
 *
 * Appends a row to dispatch_events for each lifecycle event. Best-effort: any failure is
 * swallowed and logged, so audit recording can NEVER block or break a dispatch decision.
 */

import { getSql } from "../db/client.js";
import type { DispatchServiceType } from "./order-assignment-engine.js";

export type DispatchEventType =
  | "session_started"
  | "wave_dispatched"
  | "wave_expanded"
  | "retry_scheduled"
  | "dispatch_exhausted"
  | "dispatch_completed"
  | "offers_sent"
  | "rider_accepted"
  | "rider_rejected"
  | "assignment_cancelled"
  | "3pl_triggered"
  | "refund_triggered";

export type DispatchEventInput = {
  orderCoreId: number;
  eventType: DispatchEventType;
  sessionId?: number | null;
  serviceType?: DispatchServiceType | string | null;
  waveNumber?: number | null;
  riderId?: number | null;
  radiusMeters?: number | null;
  metadata?: Record<string, unknown>;
};

/** Record one dispatch lifecycle event. Never throws. */
export async function recordDispatchEvent(input: DispatchEventInput): Promise<void> {
  if (!Number.isFinite(input.orderCoreId) || input.orderCoreId <= 0) return;
  try {
    const sql = getSql();
    await sql`
      INSERT INTO dispatch_events (
        order_core_id, session_id, service_type, event_type,
        wave_number, rider_id, radius_meters, metadata
      )
      VALUES (
        ${input.orderCoreId},
        ${input.sessionId ?? null},
        ${input.serviceType ?? null},
        ${input.eventType},
        ${input.waveNumber ?? null},
        ${input.riderId ?? null},
        ${input.radiusMeters ?? null},
        ${JSON.stringify(input.metadata ?? {})}::text::jsonb
      )
    `;
  } catch (err) {
    console.warn("[dispatch] event record failed (tolerated)", input.eventType, (err as Error).message);
  }
}
