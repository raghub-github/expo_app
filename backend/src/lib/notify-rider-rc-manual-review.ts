import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { expoPushTokens } from "../db/schema.js";
import { send as sendNotification } from "../modules/notifications/notificationService.js";

export async function notifyRiderRcManualReview(input: {
  riderId: number;
  approved: boolean;
}): Promise<void> {
  const userId = `usr_${input.riderId}`;
  const db = getDb();

  const rows = await db
    .select({ token: expoPushTokens.expoPushToken })
    .from(expoPushTokens)
    .where(and(eq(expoPushTokens.userId, userId), eq(expoPushTokens.role, "rider")));

  const tokens = rows.map((r) => r.token).filter((t): t is string => Boolean(t));
  if (tokens.length === 0) return;

  if (input.approved) {
    await sendNotification({
      templateCode: "RIDER_RC_MANUAL_VERIFIED",
      variables: { riderId: String(input.riderId) },
      target: { device_tokens: tokens },
      metadata: { gmType: "RC_MANUAL_VERIFIED", riderId: String(input.riderId) },
    });
    return;
  }

  await sendNotification({
    templateCode: "RIDER_RC_MANUAL_REJECTED",
    variables: { riderId: String(input.riderId) },
    target: { device_tokens: tokens },
    metadata: { gmType: "RC_MANUAL_REJECTED", riderId: String(input.riderId) },
  });
}
