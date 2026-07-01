import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { expoPushTokens } from "../db/schema.js";
import { send as sendNotification } from "../modules/notifications/notificationService.js";

export async function notifyRiderVehicleVerified(riderId: number): Promise<void> {
  const userId = `usr_${riderId}`;
  const db = getDb();

  const rows = await db
    .select({ token: expoPushTokens.expoPushToken })
    .from(expoPushTokens)
    .where(and(eq(expoPushTokens.userId, userId), eq(expoPushTokens.role, "rider")));

  const tokens = rows.map((r) => r.token).filter((t): t is string => Boolean(t));
  if (tokens.length === 0) return;

  await sendNotification({
    templateCode: "RIDER_VEHICLE_VERIFIED",
    variables: { riderId: String(riderId) },
    target: { device_tokens: tokens },
    metadata: { gmType: "VEHICLE_VERIFIED", riderId: String(riderId) },
  });
}
