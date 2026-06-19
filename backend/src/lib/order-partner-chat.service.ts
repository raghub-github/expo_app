import { and, asc, eq, gt, isNull, or, sql as drizzleSql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  customers,
  orderPartnerChatMessages,
  ordersCore,
  ordersFood,
} from "../db/schema.js";
import { customerOrderRefWhere } from "./order-ref-resolve.js";
import { publishOrderEvent, publishRiderEvent } from "../modules/realtime/publish.js";

const CHAT_CLOSED_CORE = new Set(["delivered", "cancelled", "failed"]);
const CHAT_CLOSED_FOOD = new Set(["DELIVERED", "CANCELLED", "RTO"]);

export type OrderPartnerChatMessageDto = {
  id: number;
  senderType: "CUSTOMER" | "RIDER" | "SYSTEM";
  body: string;
  createdAt: string;
  isMine: boolean;
};

function orderRefWhere(orderRef: string) {
  const trimmed = orderRef.trim();
  const isNumeric = /^\d+$/.test(trimmed);
  if (isNumeric) {
    return eq(ordersCore.id, parseInt(trimmed, 10));
  }
  return or(eq(ordersCore.orderId, trimmed), eq(ordersCore.formattedOrderId, trimmed));
}

function resolvePublicOrderId(row: {
  formattedOrderId: string | null;
  orderId: string | null;
}): string {
  return row.formattedOrderId?.trim() || row.orderId?.trim() || "";
}

function isChatClosed(coreStatus: string, foodStatus: string | null): boolean {
  const core = String(coreStatus ?? "").trim().toLowerCase();
  if (CHAT_CLOSED_CORE.has(core)) return true;
  const food = String(foodStatus ?? "")
    .trim()
    .toUpperCase();
  return CHAT_CLOSED_FOOD.has(food);
}

async function loadOrderChatContext(orderRef: string) {
  const db = getDb();
  const [row] = await db
    .select({
      coreId: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      customerId: ordersCore.customerId,
      riderId: ordersCore.riderId,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      foodStatus: ordersFood.orderStatus,
    })
    .from(ordersCore)
    .leftJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(orderRefWhere(orderRef))
    .limit(1);

  if (!row?.coreId) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }

  return {
    ...row,
    publicOrderId: resolvePublicOrderId(row),
    chatClosed: isChatClosed(row.status, row.foodStatus),
  };
}

function mapMessage(
  row: {
    id: number;
    senderType: "CUSTOMER" | "RIDER" | "SYSTEM";
    body: string;
    createdAt: Date;
  },
  viewer: "customer" | "rider"
): OrderPartnerChatMessageDto {
  const senderType = row.senderType;
  const isMine =
    viewer === "customer" ? senderType === "CUSTOMER" : senderType === "RIDER";
  return {
    id: row.id,
    senderType,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    isMine,
  };
}

export async function listOrderPartnerChatForCustomer(
  customerSub: string,
  orderRef: string,
  since?: string | null
): Promise<{ messages: OrderPartnerChatMessageDto[]; chatClosed: boolean }> {
  const db = getDb();
  const [customerRow] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerId, customerSub))
    .limit(1);
  const customerPk = customerRow?.id ?? null;
  if (customerPk == null) {
    throw Object.assign(new Error("Customer not found"), { statusCode: 403 });
  }

  const ctx = await loadOrderChatContext(orderRef);
  const [owned] = await db
    .select({ id: ordersCore.id })
    .from(ordersCore)
    .where(and(customerOrderRefWhere(customerPk, orderRef)))
    .limit(1);
  if (!owned?.id || owned.id !== ctx.coreId) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }
  if (ctx.riderId == null) {
    throw Object.assign(new Error("Delivery partner not assigned yet"), {
      statusCode: 409,
      code: "chat_not_available",
    });
  }

  const sinceDate = since ? new Date(since) : null;
  const sinceFilter =
    sinceDate && Number.isFinite(sinceDate.getTime())
      ? gt(orderPartnerChatMessages.createdAt, sinceDate)
      : null;
  const rows = await db
    .select({
      id: orderPartnerChatMessages.id,
      senderType: orderPartnerChatMessages.senderType,
      body: orderPartnerChatMessages.body,
      createdAt: orderPartnerChatMessages.createdAt,
    })
    .from(orderPartnerChatMessages)
    .where(
      sinceFilter
        ? and(eq(orderPartnerChatMessages.orderCoreId, ctx.coreId), sinceFilter)
        : eq(orderPartnerChatMessages.orderCoreId, ctx.coreId)
    )
    .orderBy(asc(orderPartnerChatMessages.createdAt));

  await db
    .update(orderPartnerChatMessages)
    .set({ readByCustomerAt: new Date() })
    .where(
      and(
        eq(orderPartnerChatMessages.orderCoreId, ctx.coreId),
        eq(orderPartnerChatMessages.senderType, "RIDER"),
        isNull(orderPartnerChatMessages.readByCustomerAt)
      )
    );

  return {
    messages: rows.map((r) => mapMessage(r, "customer")),
    chatClosed: ctx.chatClosed,
  };
}

export async function sendOrderPartnerChatFromCustomer(
  customerSub: string,
  orderRef: string,
  body: string
): Promise<OrderPartnerChatMessageDto> {
  const text = body.trim();
  if (!text || text.length > 500) {
    throw Object.assign(new Error("Invalid message"), { statusCode: 400 });
  }

  const db = getDb();
  const [customerRow] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerId, customerSub))
    .limit(1);
  const customerPk = customerRow?.id ?? null;
  if (customerPk == null) {
    throw Object.assign(new Error("Customer not found"), { statusCode: 403 });
  }

  const ctx = await loadOrderChatContext(orderRef);
  const [owned] = await db
    .select({ id: ordersCore.id })
    .from(ordersCore)
    .where(customerOrderRefWhere(customerPk, orderRef))
    .limit(1);
  if (!owned?.id || owned.id !== ctx.coreId) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }
  if (ctx.riderId == null) {
    throw Object.assign(new Error("Delivery partner not assigned yet"), {
      statusCode: 409,
      code: "chat_not_available",
    });
  }
  if (ctx.chatClosed) {
    throw Object.assign(new Error("Chat is closed for this order"), {
      statusCode: 409,
      code: "chat_closed",
    });
  }

  const now = new Date();
  const [inserted] = await db
    .insert(orderPartnerChatMessages)
    .values({
      orderCoreId: ctx.coreId,
      orderPublicId: ctx.publicOrderId,
      senderType: "CUSTOMER",
      senderCustomerId: customerPk,
      senderRiderId: null,
      body: text,
      readByCustomerAt: now,
      createdAt: now,
    })
    .returning({
      id: orderPartnerChatMessages.id,
      senderType: orderPartnerChatMessages.senderType,
      body: orderPartnerChatMessages.body,
      createdAt: orderPartnerChatMessages.createdAt,
    });

  const dto = mapMessage(inserted!, "customer");
  if (ctx.publicOrderId) {
    await publishOrderEvent(ctx.publicOrderId, {
      type: "partner_chat_message",
      messageId: dto.id,
      senderType: dto.senderType,
      body: dto.body,
      createdAt: dto.createdAt,
    });
  }
  if (ctx.riderId != null) {
    await publishRiderEvent(ctx.riderId, {
      type: "partner_chat_message",
      orderId: ctx.publicOrderId,
      messageId: dto.id,
      senderType: dto.senderType,
      body: dto.body,
      createdAt: dto.createdAt,
    });
  }
  return dto;
}

export async function listOrderPartnerChatForRider(
  riderId: number,
  orderRef: string,
  since?: string | null
): Promise<{ messages: OrderPartnerChatMessageDto[]; chatClosed: boolean }> {
  const ctx = await loadOrderChatContext(orderRef);
  if (ctx.riderId !== riderId) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }

  const db = getDb();
  const sinceDate = since ? new Date(since) : null;
  const sinceFilter =
    sinceDate && Number.isFinite(sinceDate.getTime())
      ? gt(orderPartnerChatMessages.createdAt, sinceDate)
      : null;
  const rows = await db
    .select({
      id: orderPartnerChatMessages.id,
      senderType: orderPartnerChatMessages.senderType,
      body: orderPartnerChatMessages.body,
      createdAt: orderPartnerChatMessages.createdAt,
    })
    .from(orderPartnerChatMessages)
    .where(
      sinceFilter
        ? and(eq(orderPartnerChatMessages.orderCoreId, ctx.coreId), sinceFilter)
        : eq(orderPartnerChatMessages.orderCoreId, ctx.coreId)
    )
    .orderBy(asc(orderPartnerChatMessages.createdAt));

  await db
    .update(orderPartnerChatMessages)
    .set({ readByRiderAt: new Date() })
    .where(
      and(
        eq(orderPartnerChatMessages.orderCoreId, ctx.coreId),
        eq(orderPartnerChatMessages.senderType, "CUSTOMER"),
        isNull(orderPartnerChatMessages.readByRiderAt)
      )
    );

  return {
    messages: rows.map((r) => mapMessage(r, "rider")),
    chatClosed: ctx.chatClosed,
  };
}

export async function sendOrderPartnerChatFromRider(
  riderId: number,
  orderRef: string,
  body: string
): Promise<OrderPartnerChatMessageDto> {
  const text = body.trim();
  if (!text || text.length > 500) {
    throw Object.assign(new Error("Invalid message"), { statusCode: 400 });
  }

  const ctx = await loadOrderChatContext(orderRef);
  if (ctx.riderId !== riderId) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }
  if (ctx.chatClosed) {
    throw Object.assign(new Error("Chat is closed for this order"), {
      statusCode: 409,
      code: "chat_closed",
    });
  }

  const db = getDb();
  const now = new Date();
  const [inserted] = await db
    .insert(orderPartnerChatMessages)
    .values({
      orderCoreId: ctx.coreId,
      orderPublicId: ctx.publicOrderId,
      senderType: "RIDER",
      senderCustomerId: null,
      senderRiderId: riderId,
      body: text,
      readByRiderAt: now,
      createdAt: now,
    })
    .returning({
      id: orderPartnerChatMessages.id,
      senderType: orderPartnerChatMessages.senderType,
      body: orderPartnerChatMessages.body,
      createdAt: orderPartnerChatMessages.createdAt,
    });

  const dto = mapMessage(inserted!, "rider");
  if (ctx.publicOrderId) {
    await publishOrderEvent(ctx.publicOrderId, {
      type: "partner_chat_message",
      messageId: dto.id,
      senderType: dto.senderType,
      body: dto.body,
      createdAt: dto.createdAt,
    });
  }
  await publishRiderEvent(riderId, {
    type: "partner_chat_message",
    orderId: ctx.publicOrderId,
    messageId: dto.id,
    senderType: dto.senderType,
    body: dto.body,
    createdAt: dto.createdAt,
  });
  return dto;
}

export type OrderPartnerChatUnreadSummary = {
  unreadCount: number;
  chatClosed: boolean;
};

async function countUnreadForAssignment(
  orderCoreId: number,
  senderType: "CUSTOMER" | "RIDER"
): Promise<number> {
  const db = getDb();
  const readColumn =
    senderType === "RIDER"
      ? orderPartnerChatMessages.readByCustomerAt
      : orderPartnerChatMessages.readByRiderAt;
  const [row] = await db
    .select({
      unread: drizzleSql<number>`count(*)::int`,
    })
    .from(orderPartnerChatMessages)
    .where(
      and(
        eq(orderPartnerChatMessages.orderCoreId, orderCoreId),
        eq(orderPartnerChatMessages.senderType, senderType),
        isNull(readColumn)
      )
    );
  return Number(row?.unread ?? 0);
}

export async function getOrderPartnerChatUnreadForCustomer(
  customerSub: string,
  orderRef: string
): Promise<OrderPartnerChatUnreadSummary> {
  const db = getDb();
  const [customerRow] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerId, customerSub))
    .limit(1);
  const customerPk = customerRow?.id ?? null;
  if (customerPk == null) {
    throw Object.assign(new Error("Customer not found"), { statusCode: 403 });
  }

  const ctx = await loadOrderChatContext(orderRef);
  const [owned] = await db
    .select({ id: ordersCore.id })
    .from(ordersCore)
    .where(and(customerOrderRefWhere(customerPk, orderRef)))
    .limit(1);
  if (!owned?.id || owned.id !== ctx.coreId) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }
  if (ctx.riderId == null) {
    return { unreadCount: 0, chatClosed: ctx.chatClosed };
  }

  const unreadCount = await countUnreadForAssignment(ctx.coreId, "RIDER");
  return { unreadCount, chatClosed: ctx.chatClosed };
}

export async function getOrderPartnerChatUnreadForRider(
  riderId: number,
  orderRef: string
): Promise<OrderPartnerChatUnreadSummary> {
  const ctx = await loadOrderChatContext(orderRef);
  if (ctx.riderId !== riderId) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }

  const unreadCount = await countUnreadForAssignment(ctx.coreId, "CUSTOMER");
  return { unreadCount, chatClosed: ctx.chatClosed };
}
