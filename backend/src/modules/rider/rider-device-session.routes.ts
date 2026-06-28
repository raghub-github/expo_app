import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSql } from "../../db/client.js";
import {
  listRiderDeviceSessions,
  revokeAllRiderDeviceSessions,
  revokeRiderDeviceSessionsByIds,
  type RiderDeviceSessionRow,
} from "../../lib/rider-device-sessions.js";

const RiderDeviceSessionSchema = z.object({
  id: z.number(),
  deviceId: z.string().nullable(),
  deviceType: z.string().nullable(),
  deviceName: z.string().nullable(),
  deviceModel: z.string().nullable(),
  os: z.string().nullable(),
  osVersion: z.string().nullable(),
  appVersion: z.string().nullable(),
  ipAddress: z.string().nullable(),
  location: z.string().nullable(),
  loginState: z.string().nullable(),
  loginDistrict: z.string().nullable(),
  loginTown: z.string().nullable(),
  loginVillage: z.string().nullable(),
  loginMethod: z.string().nullable(),
  loginTime: z.string(),
  lastActive: z.string(),
  isActive: z.boolean(),
  isCurrentDevice: z.boolean(),
});

function toApiSession(row: RiderDeviceSessionRow, currentDeviceId?: string | null) {
  return {
    id: row.id,
    deviceId: row.deviceId,
    deviceType: row.deviceType,
    deviceName: row.deviceName,
    deviceModel: row.deviceModel,
    os: row.os,
    osVersion: row.osVersion,
    appVersion: row.appVersion,
    ipAddress: row.ipAddress,
    location: row.location,
    loginState: row.loginState,
    loginDistrict: row.loginDistrict,
    loginTown: row.loginTown,
    loginVillage: row.loginVillage,
    loginMethod: row.loginMethod,
    loginTime: row.loginTime,
    lastActive: row.lastActive,
    isActive: row.isActive,
    isCurrentDevice: Boolean(currentDeviceId && row.deviceId === currentDeviceId),
  };
}

export function registerRiderDeviceSessionRoutes(
  app: FastifyInstance,
  parseRiderIdFromAuth: (sub: string) => number | null,
): void {
  app.get(
    "/me/device-sessions",
    {
      schema: {
        response: {
          200: z.object({
            activeCount: z.number(),
            sessions: z.array(RiderDeviceSessionSchema),
          }),
        },
      },
    },
    async (req) => {
      const userId = req.auth!.sub;
      const currentDeviceId = req.auth?.device_id ?? null;
      const sql = getSql();
      const sessions = await listRiderDeviceSessions(sql, { userId, activeOnly: true, limit: 20 });
      return {
        activeCount: sessions.length,
        sessions: sessions.map((s) => toApiSession(s, currentDeviceId)),
      };
    },
  );

  const logoutSessionsBody = z.object({
    sessionIds: z.array(z.union([z.number(), z.string()])).min(1),
  });

  app.post(
    "/me/device-sessions/logout",
    {
      schema: {
        body: logoutSessionsBody,
        response: {
          200: z.object({ ok: z.literal(true), revokedCount: z.number() }),
          400: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const userId = req.auth!.sub;
      const body = logoutSessionsBody.parse(req.body);
      const sessionIds = body.sessionIds
        .map((v) => (typeof v === "string" ? Number(v) : v))
        .filter((v): v is number => Number.isFinite(v) && v > 0);
      if (sessionIds.length === 0) {
        return reply.code(400).send({ error: "invalid_session_ids" });
      }

      const sql = getSql();
      const revokedCount = await revokeRiderDeviceSessionsByIds(sql, {
        userId,
        sessionIds,
        revokedBy: "rider_self",
        revokeReason: "remote_logout",
      });
      return { ok: true as const, revokedCount };
    },
  );

  const logoutAllBody = z
    .object({
      includeCurrent: z.boolean().optional(),
    })
    .optional();

  app.post(
    "/me/device-sessions/logout-all",
    {
      schema: {
        body: logoutAllBody,
        response: {
          200: z.object({ ok: z.literal(true), revokedCount: z.number() }),
        },
      },
    },
    async (req) => {
      const userId = req.auth!.sub;
      const currentDeviceId = req.auth?.device_id ?? null;
      const body = logoutAllBody.parse(req.body);
      const includeCurrent = body?.includeCurrent ?? false;
      const sql = getSql();

      const revokedCount = await revokeAllRiderDeviceSessions(sql, {
        userId,
        exceptDeviceId: includeCurrent ? null : currentDeviceId,
        revokedBy: "rider_logout_all",
        revokeReason: includeCurrent ? "logout_all_including_current" : "logout_all_other_devices",
      });

      return { ok: true as const, revokedCount };
    },
  );
}

export async function adminRevokeRiderDeviceSessions(args: {
  riderId: number;
  sessionIds?: number[];
  revokeAll?: boolean;
  adminSystemUserId: number;
  reason?: string | null;
}): Promise<number> {
  const userId = `usr_${args.riderId}`;
  const sql = getSql();
  const revokedBy = `admin:${args.adminSystemUserId}`;
  const revokeReason = args.reason?.trim() || "admin_force_logout";

  if (args.revokeAll) {
    return revokeAllRiderDeviceSessions(sql, {
      userId,
      revokedBy,
      revokeReason,
    });
  }

  const sessionIds = (args.sessionIds ?? []).filter((id) => Number.isFinite(id) && id > 0);
  if (sessionIds.length === 0) return 0;

  return revokeRiderDeviceSessionsByIds(sql, {
    userId,
    sessionIds,
    revokedBy,
    revokeReason,
  });
}
