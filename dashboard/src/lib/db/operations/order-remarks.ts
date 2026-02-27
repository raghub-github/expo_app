import { getDb, getSql } from "../client";
import { orderRemarks, orderRemarkEdits } from "../schema";
import { eq, desc } from "drizzle-orm";

export interface OrderRemarkRecord {
  id: number;
  orderId: number;
  actorType: string;
  actorId: number | null;
  actorName: string | null;
  actionTaken: string | null;
  remark: string;
  remarkCategory: string | null;
  remarkPriority: string | null;
  isInternal: boolean | null;
  visibleTo: string[] | null;
  remarkMetadata: unknown;
  createdAt: Date;
  lastEditedAt: Date | null;
  lastEditedByActorType: string | null;
  lastEditedByActorId: number | null;
  lastEditedByActorName: string | null;
}

export interface CreateOrderRemarkInput {
  orderId: number;
  actorType: string;
  actorId: number | null;
  actorName: string | null;
  remark: string;
  remarkCategory?: string | null;
  remarkPriority?: string | null;
  isInternal?: boolean;
  visibleTo?: string[] | null;
  remarkMetadata?: unknown;
}

export async function createOrderRemark(
  input: CreateOrderRemarkInput
): Promise<OrderRemarkRecord> {
  const sql = getSql();

  const metadataJson = JSON.stringify(input.remarkMetadata ?? {});

  const result = await sql`
    INSERT INTO order_remarks (
      order_id,
      actor_type,
      actor_id,
      actor_name,
      action_taken,
      remark,
      remark_category,
      remark_priority,
      visible_to,
      is_internal,
      remark_metadata
    )
    VALUES (
      ${input.orderId},
      ${input.actorType},
      ${input.actorId},
      ${input.actorName},
      ${null},
      ${input.remark},
      ${input.remarkCategory ?? null},
      ${input.remarkPriority ?? "normal"},
      ${input.visibleTo ?? null},
      ${input.isInternal ?? false},
      CAST(${metadataJson} AS jsonb)
    )
    RETURNING
      id,
      order_id        AS "orderId",
      actor_type      AS "actorType",
      actor_id        AS "actorId",
      actor_name      AS "actorName",
      action_taken    AS "actionTaken",
      remark,
      remark_category AS "remarkCategory",
      remark_priority AS "remarkPriority",
      is_internal     AS "isInternal",
      visible_to      AS "visibleTo",
      remark_metadata AS "remarkMetadata",
      created_at      AS "createdAt"
  `;

  const row = result[0] as {
    id: number;
    orderId: number;
    actorType: string;
    actorId: number | null;
    actorName: string | null;
    actionTaken: string | null;
    remark: string;
    remarkCategory: string | null;
    remarkPriority: string | null;
    isInternal: boolean | null;
    visibleTo: string[] | null;
    remarkMetadata: unknown;
    createdAt: Date;
  };

  return normalizeOrderRemark({
    ...row,
    lastEditedAt: null,
    lastEditedByActorType: null,
    lastEditedByActorId: null,
    lastEditedByActorName: null,
  });
}

export async function listOrderRemarks(orderId: number): Promise<OrderRemarkRecord[]> {
  const sql = getSql();

  const result = await sql`
    SELECT
      id,
      order_id        AS "orderId",
      actor_type      AS "actorType",
      actor_id        AS "actorId",
      actor_name      AS "actorName",
      action_taken    AS "actionTaken",
      remark,
      remark_category AS "remarkCategory",
      remark_priority AS "remarkPriority",
      is_internal     AS "isInternal",
      visible_to      AS "visibleTo",
      remark_metadata AS "remarkMetadata",
      created_at      AS "createdAt",
      last_edited_at              AS "lastEditedAt",
      last_edited_by_actor_type   AS "lastEditedByActorType",
      last_edited_by_actor_id     AS "lastEditedByActorId",
      last_edited_by_actor_name   AS "lastEditedByActorName"
    FROM order_remarks
    WHERE order_id = ${orderId}
    ORDER BY created_at DESC
  `;

  const rows = result as unknown as Array<{
    id: number;
    orderId: number;
    actorType: string;
    actorId: number | null;
    actorName: string | null;
    actionTaken: string | null;
    remark: string;
    remarkCategory: string | null;
    remarkPriority: string | null;
    isInternal: boolean | null;
    visibleTo: string[] | null;
    remarkMetadata: unknown;
    createdAt: Date;
    lastEditedAt: Date | null;
    lastEditedByActorType: string | null;
    lastEditedByActorId: number | null;
    lastEditedByActorName: string | null;
  }>;

  return rows.map((row) => normalizeOrderRemark(row));
}

/** Lightweight count for sidebar (no extra API call when included in order payload). */
export async function getOrderRemarksCount(orderId: number): Promise<number> {
  const sql = getSql();
  const result = await sql`
    SELECT count(*)::int AS cnt FROM order_remarks WHERE order_id = ${orderId}
  `;
  const row = (result as unknown as Array<{ cnt: number }>)[0];
  return row?.cnt ?? 0;
}

export interface UpdateOrderRemarkInput {
  remarkId: number;
  editorActorType: string;
  editorActorId: number | null;
  editorActorName: string | null;
  remark: string;
  remarkCategory?: string | null;
  remarkPriority?: string | null;
  isInternal?: boolean | null;
  visibleTo?: string[] | null;
  remarkMetadata?: unknown;
}

export interface OrderRemarkEditRecord {
  id: number;
  remarkId: number;
  editedAt: Date;
  editedByActorType: string;
  editedByActorId: number | null;
  editedByActorName: string | null;
  oldRemark: string;
  newRemark: string;
  oldRemarkCategory: string | null;
  newRemarkCategory: string | null;
  oldRemarkPriority: string | null;
  newRemarkPriority: string | null;
}

export async function updateOrderRemarkWithHistory(
  input: UpdateOrderRemarkInput
): Promise<OrderRemarkRecord> {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(orderRemarks)
    .where(eq(orderRemarks.id, input.remarkId))
    .limit(1);

  if (!existing) {
    throw new Error("Remark not found");
  }

  // Only creator can edit
  if (
    !existing.actorId ||
    existing.actorId !== input.editorActorId ||
    existing.actorType !== input.editorActorType
  ) {
    throw new Error("You can only edit your own remarks");
  }

  // 15-minute edit window from creation time
  const now = new Date();
  const createdAt = existing.createdAt as Date;
  const diffMs = now.getTime() - createdAt.getTime();
  const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
  if (diffMs > FIFTEEN_MINUTES_MS) {
    throw new Error("Edit window has expired");
  }

  const newRemarkCategory =
    input.remarkCategory !== undefined ? input.remarkCategory : existing.remarkCategory;
  const newRemarkPriority =
    input.remarkPriority !== undefined ? input.remarkPriority : existing.remarkPriority;
  const newIsInternal =
    input.isInternal !== undefined ? input.isInternal : existing.isInternal;
  const newVisibleTo =
    input.visibleTo !== undefined ? input.visibleTo : existing.visibleTo;
  const newMetadata =
    input.remarkMetadata !== undefined ? (input.remarkMetadata as any) : existing.remarkMetadata;

  const [updated] = await db.transaction(async (tx) => {
    // Insert history row capturing old and new values
    await tx.insert(orderRemarkEdits).values({
      remarkId: existing.id,
      editedAt: now,
      editedByActorType: input.editorActorType,
      editedByActorId: input.editorActorId,
      editedByActorName: input.editorActorName,
      oldRemark: existing.remark,
      newRemark: input.remark,
      oldRemarkCategory: existing.remarkCategory,
      newRemarkCategory,
      oldRemarkPriority: existing.remarkPriority,
      newRemarkPriority,
      oldIsInternal: existing.isInternal,
      newIsInternal,
      oldVisibleTo: existing.visibleTo,
      newVisibleTo,
      oldRemarkMetadata: existing.remarkMetadata,
      newRemarkMetadata: newMetadata,
    });

    const [updatedRow] = await tx
      .update(orderRemarks)
      .set({
        remark: input.remark,
        remarkCategory: newRemarkCategory,
        remarkPriority: newRemarkPriority,
        isInternal: newIsInternal,
        visibleTo: newVisibleTo,
        remarkMetadata: newMetadata,
        lastEditedAt: now,
        lastEditedByActorType: input.editorActorType,
        lastEditedByActorId: input.editorActorId,
        lastEditedByActorName: input.editorActorName,
      })
      .where(eq(orderRemarks.id, existing.id))
      .returning();

    return [updatedRow];
  });

  return normalizeOrderRemark(updated);
}

export async function listOrderRemarkEdits(
  remarkId: number
): Promise<OrderRemarkEditRecord[]> {
  const db = getDb();

  const rows = await db
    .select()
    .from(orderRemarkEdits)
    .where(eq(orderRemarkEdits.remarkId, remarkId))
    .orderBy(desc(orderRemarkEdits.editedAt));

  return rows.map((row) => ({
    id: Number(row.id),
    remarkId: Number(row.remarkId),
    editedAt: row.editedAt as Date,
    editedByActorType: row.editedByActorType,
    editedByActorId: (row.editedByActorId as number | null) ?? null,
    editedByActorName: row.editedByActorName ?? null,
    oldRemark: row.oldRemark,
    newRemark: row.newRemark,
    oldRemarkCategory: row.oldRemarkCategory ?? null,
    newRemarkCategory: row.newRemarkCategory ?? null,
    oldRemarkPriority: row.oldRemarkPriority ?? null,
    newRemarkPriority: row.newRemarkPriority ?? null,
  }));
}

function normalizeOrderRemark(row: any): OrderRemarkRecord {
  return {
    id: Number(row.id),
    orderId: Number(row.orderId),
    actorType: row.actorType,
    actorId: row.actorId ?? null,
    actorName: row.actorName ?? null,
    actionTaken: row.actionTaken ?? null,
    remark: row.remark,
    remarkCategory: row.remarkCategory ?? null,
    remarkPriority: row.remarkPriority ?? null,
    isInternal: row.isInternal ?? null,
    visibleTo: (row.visibleTo as string[] | null) ?? null,
    remarkMetadata: row.remarkMetadata ?? {},
    createdAt: row.createdAt as Date,
    lastEditedAt: (row.lastEditedAt as Date | null) ?? null,
    lastEditedByActorType: row.lastEditedByActorType ?? null,
    lastEditedByActorId: row.lastEditedByActorId ?? null,
    lastEditedByActorName: row.lastEditedByActorName ?? null,
  };
}

