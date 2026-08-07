/**
 * Per-service customer blocks — dashboard admin actions + audit history.
 */

import { getSql } from "../client";

export type CustomerServiceType =
  | "food"
  | "parcel"
  | "person_ride"
  | "ecommerce"
  | "vouchers"
  | "near_me";

export type CustomerServiceBlockRow = {
  id: number;
  customerId: number;
  serviceType: CustomerServiceType;
  reason: string;
  blockedBy: number | null;
  blockedByEmail: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  unblockedAt: string | null;
  unblockedByEmail: string | null;
  unblockReason: string | null;
};

export type CustomerServiceBlockHistoryRow = {
  id: number;
  customerId: number;
  serviceType: CustomerServiceType;
  action: "block" | "unblock";
  reason: string;
  actorId: number | null;
  actorEmail: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const VALID_SERVICES: CustomerServiceType[] = [
  "food",
  "parcel",
  "person_ride",
  "ecommerce",
  "vouchers",
  "near_me",
];

export function normalizeCustomerServiceTypes(input: unknown): CustomerServiceType[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (s): s is CustomerServiceType =>
      typeof s === "string" && (VALID_SERVICES as readonly string[]).includes(s)
  );
}

export async function listActiveCustomerServiceBlocks(
  customerId: number
): Promise<CustomerServiceBlockRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      id,
      customer_id,
      service_type::text AS service_type,
      reason,
      blocked_by,
      blocked_by_email,
      is_active,
      created_at::text AS created_at,
      updated_at::text AS updated_at,
      unblocked_at::text AS unblocked_at,
      unblocked_by_email,
      unblock_reason
    FROM customer_service_blocks
    WHERE customer_id = ${customerId}
      AND is_active = TRUE
    ORDER BY created_at DESC
  `;
  return (rows as Record<string, unknown>[]).map(mapBlockRow);
}

export async function listCustomerServiceBlockHistory(
  customerId: number,
  limit = 50
): Promise<CustomerServiceBlockHistoryRow[]> {
  const sql = getSql();
  const safeLimit = Math.min(100, Math.max(1, limit));
  const rows = await sql`
    SELECT
      id,
      customer_id,
      service_type::text AS service_type,
      action,
      reason,
      actor_id,
      actor_email,
      metadata,
      created_at::text AS created_at
    FROM customer_service_block_history
    WHERE customer_id = ${customerId}
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;
  return (rows as Record<string, unknown>[]).map(mapHistoryRow);
}

export async function blockCustomerServices(input: {
  customerId: number;
  services: CustomerServiceType[];
  reason: string;
  actorId: number | null;
  actorEmail: string | null;
}): Promise<CustomerServiceBlockRow[]> {
  const sql = getSql();
  const reason = input.reason.trim();
  if (!reason || reason.length < 5) {
    throw new Error("Block reason must be at least 5 characters");
  }
  if (input.services.length === 0) throw new Error("Select at least one service to block");

  const results: CustomerServiceBlockRow[] = [];

  for (const serviceType of input.services) {
    const existing = await sql`
      SELECT id FROM customer_service_blocks
      WHERE customer_id = ${input.customerId}
        AND service_type = ${serviceType}::customer_service_type
        AND is_active = TRUE
      LIMIT 1
    `;
    if ((existing as unknown[]).length > 0) {
      await sql`
        UPDATE customer_service_blocks
        SET reason = ${reason},
            blocked_by = ${input.actorId},
            blocked_by_email = ${input.actorEmail},
            updated_at = NOW()
        WHERE customer_id = ${input.customerId}
          AND service_type = ${serviceType}::customer_service_type
          AND is_active = TRUE
      `;
    } else {
      await sql`
        INSERT INTO customer_service_blocks (
          customer_id, service_type, reason, blocked_by, blocked_by_email, is_active
        ) VALUES (
          ${input.customerId},
          ${serviceType}::customer_service_type,
          ${reason},
          ${input.actorId},
          ${input.actorEmail},
          TRUE
        )
      `;
    }

    await sql`
      INSERT INTO customer_service_block_history (
        customer_id, service_type, action, reason, actor_id, actor_email, metadata
      ) VALUES (
        ${input.customerId},
        ${serviceType}::customer_service_type,
        'block',
        ${reason},
        ${input.actorId},
        ${input.actorEmail},
        ${JSON.stringify({ source: "dashboard" })}::jsonb
      )
    `;
  }

  const active = await listActiveCustomerServiceBlocks(input.customerId);
  for (const row of active) {
    if (input.services.includes(row.serviceType)) results.push(row);
  }
  return results;
}

export async function unblockCustomerServices(input: {
  customerId: number;
  services: CustomerServiceType[];
  reason: string;
  actorId: number | null;
  actorEmail: string | null;
}): Promise<void> {
  const sql = getSql();
  const reason = input.reason.trim() || "Unblocked by admin";
  if (input.services.length === 0) throw new Error("Select at least one service to unblock");

  for (const serviceType of input.services) {
    const updated = await sql`
      UPDATE customer_service_blocks
      SET is_active = FALSE,
          unblocked_at = NOW(),
          unblocked_by = ${input.actorId},
          unblocked_by_email = ${input.actorEmail},
          unblock_reason = ${reason},
          updated_at = NOW()
      WHERE customer_id = ${input.customerId}
        AND service_type = ${serviceType}::customer_service_type
        AND is_active = TRUE
      RETURNING id
    `;
    if ((updated as unknown[]).length === 0) continue;

    await sql`
      INSERT INTO customer_service_block_history (
        customer_id, service_type, action, reason, actor_id, actor_email, metadata
      ) VALUES (
        ${input.customerId},
        ${serviceType}::customer_service_type,
        'unblock',
        ${reason},
        ${input.actorId},
        ${input.actorEmail},
        ${JSON.stringify({ source: "dashboard" })}::jsonb
      )
    `;
  }
}

function mapBlockRow(r: Record<string, unknown>): CustomerServiceBlockRow {
  return {
    id: Number(r.id),
    customerId: Number(r.customer_id),
    serviceType: String(r.service_type) as CustomerServiceType,
    reason: String(r.reason ?? ""),
    blockedBy: r.blocked_by != null ? Number(r.blocked_by) : null,
    blockedByEmail: r.blocked_by_email != null ? String(r.blocked_by_email) : null,
    isActive: Boolean(r.is_active),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    unblockedAt: r.unblocked_at != null ? String(r.unblocked_at) : null,
    unblockedByEmail: r.unblocked_by_email != null ? String(r.unblocked_by_email) : null,
    unblockReason: r.unblock_reason != null ? String(r.unblock_reason) : null,
  };
}

function mapHistoryRow(r: Record<string, unknown>): CustomerServiceBlockHistoryRow {
  return {
    id: Number(r.id),
    customerId: Number(r.customer_id),
    serviceType: String(r.service_type) as CustomerServiceType,
    action: String(r.action) as "block" | "unblock",
    reason: String(r.reason ?? ""),
    actorId: r.actor_id != null ? Number(r.actor_id) : null,
    actorEmail: r.actor_email != null ? String(r.actor_email) : null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: String(r.created_at ?? ""),
  };
}
