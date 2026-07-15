import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { getEnv } from "../../config/env.js";
import { expoPushTokens, expoPushNotificationLogs } from "../../db/schema.js";
import { auth } from "../../plugins/auth.js";
import { countTicketOutcomes, sendExpoPushWithRetry, type ExpoPushMessage } from "./expoPushSend.js";

const registerBodySchema = z.object({
  expo_push_token: z.string().min(10),
  device_type: z.enum(["ios", "android", "web", "unknown"]),
  // Optional device / app / locale fingerprint (migration 0419). Older
  // client builds don't send these — schema stays permissive so no client
  // regresses. Server stores what it gets, leaves the rest NULL.
  device_model: z.string().max(120).optional().nullable(),
  device_brand: z.string().max(60).optional().nullable(),
  os_name: z.string().max(30).optional().nullable(),
  os_version: z.string().max(40).optional().nullable(),
  app_version: z.string().max(20).optional().nullable(),
  locale: z.string().max(20).optional().nullable(),
  timezone: z.string().max(60).optional().nullable(),
});

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
    input.image && typeof input.image === "string" && input.image.trim().length > 0 ? input.image.trim() : undefined;
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
          device_model, device_brand,
          os_name, os_version,
          app_version, locale, timezone,
        } = parsed.data;
        const userId = req.auth!.sub;
        const db = getDb();
        const now = new Date();

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
              // Only overwrite metadata when the client actually sent it —
              // otherwise preserve the last known values so a downgrade to
              // an older APK doesn't clobber richer data we already had.
              ...(device_model ? { deviceModel: device_model } : {}),
              ...(device_brand ? { deviceBrand: device_brand } : {}),
              ...(os_name ? { osName: os_name } : {}),
              ...(os_version ? { osVersion: os_version } : {}),
              ...(app_version ? { appVersion: app_version } : {}),
              ...(locale ? { locale } : {}),
              ...(timezone ? { timezone } : {}),
            },
          });

        req.log.info(
          {
            role,
            device_type,
            userId: userId.slice(0, 8),
            device_model: device_model ?? null,
            os: os_name && os_version ? `${os_name} ${os_version}` : null,
            app_version: app_version ?? null,
          },
          "expo_push_token_registered",
        );
        return reply.send({ ok: true });
      }
    );
  });
}
