import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { orderPartnerChatMessages, ordersCore } from "@/lib/db/schema";
import { getFoodOrderStatus } from "@/lib/db/operations/orders-core";

export type DashboardPartnerChatMessage = {
  id: number;
  senderType: "CUSTOMER" | "RIDER" | "SYSTEM";
  body: string;
  createdAt: string;
};

const CHAT_CLOSED_CORE = new Set(["delivered", "cancelled", "failed"]);
const CHAT_CLOSED_FOOD = new Set(["DELIVERED", "CANCELLED", "RTO"]);

function isChatClosed(coreStatus: string, foodStatus: string | null): boolean {
  const core = String(coreStatus ?? "").trim().toLowerCase();
  if (CHAT_CLOSED_CORE.has(core)) return true;
  const food = String(foodStatus ?? "")
    .trim()
    .toUpperCase();
  return CHAT_CLOSED_FOOD.has(food);
}

export async function listOrderPartnerChatForDashboard(orderCoreId: number): Promise<{
  messages: DashboardPartnerChatMessage[];
  chatClosed: boolean;
}> {
  const db = getDb();

  const [ctx] = await db
    .select({
      id: ordersCore.id,
      status: ordersCore.status,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderCoreId))
    .limit(1);

  if (!ctx?.id) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }

  const foodStatus = await getFoodOrderStatus(orderCoreId);

  let rows: {
    id: number;
    senderType: "CUSTOMER" | "RIDER" | "SYSTEM";
    body: string;
    createdAt: Date;
  }[] = [];

  try {
    rows = await db
      .select({
        id: orderPartnerChatMessages.id,
        senderType: orderPartnerChatMessages.senderType,
        body: orderPartnerChatMessages.body,
        createdAt: orderPartnerChatMessages.createdAt,
      })
      .from(orderPartnerChatMessages)
      .where(eq(orderPartnerChatMessages.orderCoreId, orderCoreId))
      .orderBy(asc(orderPartnerChatMessages.createdAt));
  } catch (err) {
    console.warn("[listOrderPartnerChatForDashboard] messages query failed", err);
    rows = [];
  }

  return {
    messages: rows.map((row) => ({
      id: row.id,
      senderType: row.senderType,
      body: row.body,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt ?? ""),
    })),
    chatClosed: isChatClosed(ctx.status, foodStatus),
  };
}
