import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { expoPushTokens } from "../db/schema.js";
import { enqueuePush } from "../modules/push/enqueuePush.js";

export async function notifyRiderVehicleVerified(riderId: number): Promise<void> {
  const userId = `usr_${riderId}`;
  const db = getDb();

  const rows = await db
    .select({ token: expoPushTokens.expoPushToken })
    .from(expoPushTokens)
    .where(and(eq(expoPushTokens.userId, userId), eq(expoPushTokens.role, "rider")));

  const tokens = rows.map((r) => r.token).filter(Boolean);
  if (tokens.length === 0) return;

  await enqueuePush({
    to: tokens,
    title: "Vehicle verified",
    body: "Your vehicle is verified. You can go online and start receiving orders.",
    sound: "default",
    channelId: "default",
    screen: "/(tabs)/orders",
    data: {
      gmType: "VEHICLE_VERIFIED",
      riderId: String(riderId),
      gmMessage: "Your vehicle is verified. You can go online now.",
    },
  });
}
