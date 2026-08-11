/**
 * Remove all push token associations for a user/role (logout, session revoke, account switch).
 * Also clears merchant_store_push_tokens rows that share the same Expo device token.
 */
import { and, eq } from "drizzle-orm";
import { isExpoPushTokenString } from "@gatimitra/contracts";
import { getDb, getSql } from "../db/client.js";
import { expoPushTokens, nativeDevicePushTokens } from "../db/schema.js";
import { reconcileFcmTopics } from "../modules/push/topicReconcile.js";

export type PushRole = "customer" | "merchant" | "rider";

type PurgeLog = {
  info?: (obj: unknown, msg?: string) => void;
  warn?: (obj: unknown, msg?: string) => void;
};

export async function purgeUserPushTokens(args: {
  userId: string;
  role: PushRole;
  expoToken?: string | null;
  nativeToken?: string | null;
  log?: PurgeLog;
}): Promise<void> {
  const db = getDb();
  const sql = getSql();
  const { userId, role, log } = args;
  const expo = args.expoToken?.trim() || null;
  const native = args.nativeToken?.trim() || null;
  const expoTokensToScrub = new Set<string>();

  if (expo) {
    expoTokensToScrub.add(expo);
    await db
      .delete(expoPushTokens)
      .where(and(eq(expoPushTokens.expoPushToken, expo), eq(expoPushTokens.userId, userId)));
  }

  if (native && !isExpoPushTokenString(native)) {
    const rows = await db
      .select()
      .from(nativeDevicePushTokens)
      .where(
        and(eq(nativeDevicePushTokens.nativeToken, native), eq(nativeDevicePushTokens.userId, userId))
      )
      .limit(1);
    const row = rows[0];
    if (row) {
      const topics = (row.subscribedTopics as string[] | undefined) ?? [];
      if (row.tokenType === "fcm" && topics.length > 0) {
        await reconcileFcmTopics({
          nativeToken: native,
          tokenType: "fcm",
          currentTopics: topics,
          desiredTopics: [],
          log,
        });
      }
      await db
        .delete(nativeDevicePushTokens)
        .where(eq(nativeDevicePushTokens.nativeToken, native));
    }
  }

  if (!expo && !native) {
    const expoRows = await db
      .select({ token: expoPushTokens.expoPushToken })
      .from(expoPushTokens)
      .where(and(eq(expoPushTokens.userId, userId), eq(expoPushTokens.role, role)));
    for (const row of expoRows) {
      if (row.token?.trim()) expoTokensToScrub.add(row.token.trim());
    }

    const nativeRows = await db
      .select()
      .from(nativeDevicePushTokens)
      .where(and(eq(nativeDevicePushTokens.userId, userId), eq(nativeDevicePushTokens.role, role)));
    for (const row of nativeRows) {
      const topics = (row.subscribedTopics as string[] | undefined) ?? [];
      if (
        row.tokenType === "fcm" &&
        topics.length > 0 &&
        !isExpoPushTokenString(row.nativeToken)
      ) {
        await reconcileFcmTopics({
          nativeToken: row.nativeToken,
          tokenType: "fcm",
          currentTopics: topics,
          desiredTopics: [],
          log,
        });
      }
    }

    await db
      .delete(nativeDevicePushTokens)
      .where(and(eq(nativeDevicePushTokens.userId, userId), eq(nativeDevicePushTokens.role, role)));
    await db
      .delete(expoPushTokens)
      .where(and(eq(expoPushTokens.userId, userId), eq(expoPushTokens.role, role)));
  }

  if (expoTokensToScrub.size > 0) {
    const tokens = [...expoTokensToScrub];
    await sql`DELETE FROM merchant_store_push_tokens WHERE token = ANY(${tokens}::text[])`;
  }

  log?.info?.(
    { userId: userId.slice(0, 8), role, scrubbedStoreTokens: expoTokensToScrub.size },
    "push_tokens_purged"
  );
}
