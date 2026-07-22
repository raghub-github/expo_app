import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import {
  PushRegisterBodySchema,
  PushUnregisterBodySchema,
  isExpoPushTokenString,
} from "@gatimitra/contracts";
import { getDb, getSql } from "../../db/client.js";
import { getEnv } from "../../config/env.js";
import {
  expoPushTokens,
  expoPushNotificationLogs,
  nativeDevicePushTokens,
} from "../../db/schema.js";
import { auth } from "../../plugins/auth.js";
import { countTicketOutcomes, sendExpoPushWithRetry, type ExpoPushMessage } from "./expoPushSend.js";
import { desiredFcmTopics, reconcileFcmTopics } from "./topicReconcile.js";
import { getPartnerParentId } from "../merchant-partner/merchant-subscription.routes.helpers.js";

const registerBodySchema = PushRegisterBodySchema;
const unregisterBodySchema = PushUnregisterBodySchema;

const sendBodySchema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  type: z.enum(["BASIC", "RICH", "ACTIONABLE"]),
  image: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  emoji: z.union([z.string().max(32), z.literal(""), z.null()]).optional(),
  target_role: z.enum(["customer", "merchant", "rider"]),
  target_user_ids: z.array(z.string().min(1)).max(5000).optional().nullable(),
  /** Passed through to clients as gmIcon (e.g. ionicon name or URL). */
  notification_icon: z.union([z.string().max(200), z.literal(""), z.null()]).optional(),
  /** Optional deep link / path for ACTIONABLE (also stored in data). */
  deep_link: z.union([z.string().max(2000), z.literal(""), z.null()]).optional(),
  /** Expo-router style path, e.g. /notifications */
  screen: z.union([z.string().max(500), z.literal(""), z.null()]).optional(),
});

function stringifyData(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

function buildExpoMessage(
  tokens: string[],
  input: z.infer<typeof sendBodySchema>
): Omit<ExpoPushMessage, "to"> & { to: string[] } {
  const image =
    input.image && typeof input.image === "string" && input.image.trim().length > 0
      ? input.image.trim()
      : undefined;
  const emojiRaw = input.emoji != null && typeof input.emoji === "string" ? input.emoji.trim() : "";
  const title = emojiRaw ? `${emojiRaw} ${input.title}`.trim() : input.title;
  const body = input.message;
  const icon =
    input.notification_icon != null && typeof input.notification_icon === "string"
      ? input.notification_icon.trim()
      : "";
  const deepLink =
    input.deep_link != null && typeof input.deep_link === "string" ? input.deep_link.trim() : "";
  const screen = input.screen != null && typeof input.screen === "string" ? input.screen.trim() : "";

  const data = stringifyData({
    gmType: input.type,
    gmTitle: input.title,
    gmMessage: input.message,
    imageUrl: image ?? "",
    emoji: emojiRaw,
    icon,
    deepLink,
    screen,
  });

  const base: Omit<ExpoPushMessage, "to"> & { to: string[] } = {
    to: tokens,
    title,
    body,
    data,
    sound: "default",
    priority: "high",
    mutableContent: input.type === "RICH" && !!image,
  };

  if (input.type === "RICH" && image) {
    base.richContent = { image };
  }

  return base;
}

const PUSH_TOKEN_CHUNK = 100;

async function assertMerchantOwnsStore(
  userId: string,
  storeId: number
): Promise<boolean> {
  const parentId = await getPartnerParentId(userId);
  if (parentId == null) return false;
  const sql = getSql();
  const rows = await sql`
    SELECT id FROM merchant_stores
    WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function pushRoutes(app: FastifyInstance) {
  /** POST /v1/push/send-notification — admin / dashboard (secret header). */
  app.post(
    "/send-notification",
    {
      schema: {
        body: sendBodySchema,
      },
    },
    async (req, reply) => {
      const env = getEnv();
      if (!env.PUSH_NOTIFICATION_ADMIN_SECRET) {
        return reply.code(503).send({
          error: "push_admin_not_configured",
          message: "Set PUSH_NOTIFICATION_ADMIN_SECRET in backend environment.",
        });
      }
      const hdr = String(req.headers["x-push-admin-secret"] ?? "");
      if (hdr !== env.PUSH_NOTIFICATION_ADMIN_SECRET) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const input = req.body as z.infer<typeof sendBodySchema>;

      const db = getDb();
      const conditions = [eq(expoPushTokens.role, input.target_role)];
      const ids = (input.target_user_ids ?? []).map((s) => String(s).trim()).filter(Boolean);
      if (ids.length > 0) {
        conditions.push(inArray(expoPushTokens.userId, ids));
      }

      const rows = await db
        .select({ token: expoPushTokens.expoPushToken })
        .from(expoPushTokens)
        .where(and(...conditions));

      const tokens = [...new Set(rows.map((r) => r.token).filter(Boolean))];
      let expoOk = 0;
      let expoErr = 0;
      let batches = 0;

      for (let i = 0; i < tokens.length; i += PUSH_TOKEN_CHUNK) {
        const chunk = tokens.slice(i, i + PUSH_TOKEN_CHUNK);
        if (chunk.length === 0) continue;
        batches += 1;
        const message = buildExpoMessage(chunk, input);
        const result = await sendExpoPushWithRetry(message, req.log);
        if (!result.body) {
          expoErr += chunk.length;
          req.log.error({ err: result.error, status: result.status }, "expo_push_batch_failed");
          continue;
        }
        const c = countTicketOutcomes(result.body);
        expoOk += c.ok;
        expoErr += c.err;
        if (!result.ok) {
          req.log.warn({ status: result.status, chunk: chunk.length }, "expo_push_http_non_ok");
        }
      }

      await db.insert(expoPushNotificationLogs).values({
        title: input.title,
        message: input.message,
        notificationType: input.type,
        targetRole: input.target_role,
        targetUserIds: ids.length > 0 ? ids : null,
        tokensTargeted: tokens.length,
        expoTicketsOk: expoOk,
        expoTicketsError: expoErr,
        detail: { batches, deep_link: input.deep_link ?? null, screen: input.screen ?? null },
      });

      return reply.send({
        ok: true,
        tokens_targeted: tokens.length,
        batches,
        expo_tickets_ok: expoOk,
        expo_tickets_error: expoErr,
      });
    }
  );

  await app.register(async function protectedPush(inner) {
    await inner.register(auth, { required: true });

    inner.post(
      "/register",
      {
        schema: {
          body: registerBodySchema,
        },
      },
      async (req, reply) => {
        const role = req.auth!.role;
        if (role !== "customer" && role !== "merchant" && role !== "rider") {
          return reply.code(403).send({ error: "unsupported_role_for_push" });
        }
        const parsed = registerBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "invalid_body" });
        }
        const {
          expo_push_token,
          device_type,
          device_model,
          device_brand,
          os_name,
          os_version,
          app_version,
          locale,
          timezone,
          native_push_token,
          native_token_type,
          store_id,
        } = parsed.data;
        const userId = req.auth!.sub;
        const db = getDb();
        const now = new Date();

        let validatedStoreId: number | null = null;
        if (role === "merchant" && store_id != null) {
          const owns = await assertMerchantOwnsStore(userId, store_id);
          if (!owns) {
            return reply.code(403).send({ error: "store_not_owned" });
          }
          validatedStoreId = store_id;
        }

        await db
          .insert(expoPushTokens)
          .values({
            userId,
            role,
            deviceType: device_type,
            expoPushToken: expo_push_token,
            createdAt: now,
            updatedAt: now,
            lastSeenAt: now,
            deviceModel: device_model ?? null,
            deviceBrand: device_brand ?? null,
            osName: os_name ?? null,
            osVersion: os_version ?? null,
            appVersion: app_version ?? null,
            locale: locale ?? null,
            timezone: timezone ?? null,
          })
          .onConflictDoUpdate({
            target: expoPushTokens.expoPushToken,
            set: {
              userId,
              role,
              deviceType: device_type,
              updatedAt: now,
              lastSeenAt: now,
              ...(device_model ? { deviceModel: device_model } : {}),
              ...(device_brand ? { deviceBrand: device_brand } : {}),
              ...(os_name ? { osName: os_name } : {}),
              ...(os_version ? { osVersion: os_version } : {}),
              ...(app_version ? { appVersion: app_version } : {}),
              ...(locale ? { locale } : {}),
              ...(timezone ? { timezone } : {}),
            },
          });

        let topics: string[] = [];
        const nativeToken =
          typeof native_push_token === "string" && native_push_token.trim().length >= 8
            ? native_push_token.trim()
            : null;
        let tokenType =
          native_token_type === "fcm" || native_token_type === "apns"
            ? native_token_type
            : null;

        if (nativeToken) {
          if (isExpoPushTokenString(nativeToken)) {
            req.log.warn(
              { userId: userId.slice(0, 8) },
              "native_token_looks_like_expo_token_ignored"
            );
          } else {
            if (!tokenType) {
              tokenType = device_type === "ios" ? "apns" : "fcm";
            }

            const existing = await db
              .select()
              .from(nativeDevicePushTokens)
              .where(eq(nativeDevicePushTokens.nativeToken, nativeToken))
              .limit(1);
            const currentTopics = (existing[0]?.subscribedTopics as string[] | undefined) ?? [];

            const desired =
              tokenType === "fcm"
                ? desiredFcmTopics({ role, storeId: validatedStoreId })
                : [];
            topics = await reconcileFcmTopics({
              nativeToken,
              tokenType,
              currentTopics,
              desiredTopics: desired,
              log: req.log,
            });

            await db
              .insert(nativeDevicePushTokens)
              .values({
                userId,
                role,
                platform: device_type,
                tokenType,
                nativeToken,
                storeId: validatedStoreId,
                subscribedTopics: topics,
                source: "app",
                createdAt: now,
                updatedAt: now,
                lastSeenAt: now,
                deviceModel: device_model ?? null,
                deviceBrand: device_brand ?? null,
                osName: os_name ?? null,
                osVersion: os_version ?? null,
                appVersion: app_version ?? null,
                locale: locale ?? null,
                timezone: timezone ?? null,
              })
              .onConflictDoUpdate({
                target: nativeDevicePushTokens.nativeToken,
                set: {
                  userId,
                  role,
                  platform: device_type,
                  tokenType,
                  storeId: validatedStoreId,
                  subscribedTopics: topics,
                  source: "app",
                  updatedAt: now,
                  lastSeenAt: now,
                  ...(device_model ? { deviceModel: device_model } : {}),
                  ...(device_brand ? { deviceBrand: device_brand } : {}),
                  ...(os_name ? { osName: os_name } : {}),
                  ...(os_version ? { osVersion: os_version } : {}),
                  ...(app_version ? { appVersion: app_version } : {}),
                  ...(locale ? { locale } : {}),
                  ...(timezone ? { timezone } : {}),
                },
              });
          }
        }

        req.log.info(
          {
            role,
            device_type,
            userId: userId.slice(0, 8),
            has_native: !!nativeToken,
            native_type: tokenType,
            topics,
            store_id: validatedStoreId,
            device_model: device_model ?? null,
            os: os_name && os_version ? `${os_name} ${os_version}` : null,
            app_version: app_version ?? null,
          },
          "push_tokens_registered"
        );
        return reply.send({ ok: true, topics });
      }
    );

    inner.post(
      "/unregister",
      {
        schema: {
          body: unregisterBodySchema,
        },
      },
      async (req, reply) => {
        const role = req.auth!.role;
        if (role !== "customer" && role !== "merchant" && role !== "rider") {
          return reply.code(403).send({ error: "unsupported_role_for_push" });
        }
        const parsed = unregisterBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({ error: "invalid_body" });
        }
        const userId = req.auth!.sub;
        const db = getDb();
        const expo = parsed.data.expo_push_token?.trim() || null;
        const native = parsed.data.native_push_token?.trim() || null;

        if (expo) {
          await db
            .delete(expoPushTokens)
            .where(
              and(eq(expoPushTokens.expoPushToken, expo), eq(expoPushTokens.userId, userId))
            );
        }

        if (native && !isExpoPushTokenString(native)) {
          const rows = await db
            .select()
            .from(nativeDevicePushTokens)
            .where(
              and(
                eq(nativeDevicePushTokens.nativeToken, native),
                eq(nativeDevicePushTokens.userId, userId)
              )
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
                log: req.log,
              });
            }
            await db
              .delete(nativeDevicePushTokens)
              .where(eq(nativeDevicePushTokens.nativeToken, native));
          }
        }

        // If no specific tokens provided, clear all tokens for this user+role.
        if (!expo && !native) {
          const nativeRows = await db
            .select()
            .from(nativeDevicePushTokens)
            .where(
              and(eq(nativeDevicePushTokens.userId, userId), eq(nativeDevicePushTokens.role, role))
            );
          for (const row of nativeRows) {
            const topics = (row.subscribedTopics as string[] | undefined) ?? [];
            if (row.tokenType === "fcm" && topics.length > 0 && !isExpoPushTokenString(row.nativeToken)) {
              await reconcileFcmTopics({
                nativeToken: row.nativeToken,
                tokenType: "fcm",
                currentTopics: topics,
                desiredTopics: [],
                log: req.log,
              });
            }
          }
          await db
            .delete(nativeDevicePushTokens)
            .where(
              and(eq(nativeDevicePushTokens.userId, userId), eq(nativeDevicePushTokens.role, role))
            );
          await db
            .delete(expoPushTokens)
            .where(and(eq(expoPushTokens.userId, userId), eq(expoPushTokens.role, role)));
        }

        return reply.send({ ok: true });
      }
    );
  });
}
