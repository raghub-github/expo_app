import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { jwtVerify } from "jose";
import { createSecretKey } from "node:crypto";
import { getEnv } from "../config/env.js";
import { getDb } from "../db/client.js";
import { userProfiles, customers } from "../db/schema.js";
import { eq } from "drizzle-orm";

export type AuthContext = {
  sub: string;
  role: string;
  phone?: string;
  device_id?: string;
};

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

type AuthPluginOpts = {
  required?: boolean;
};

const authPlugin: FastifyPluginAsync<AuthPluginOpts> = async (app, opts) => {
  const env = getEnv();
  const key = createSecretKey(Buffer.from(env.SUPABASE_JWT_SECRET, "utf-8"));
  const required = opts.required ?? true;

  app.addHook("preHandler", async (req, reply) => {
    const header = req.headers.authorization;
    if (!header) {
      if (!required) return;
      return reply.code(401).send({ error: "missing_authorization" });
    }
    const m = /^Bearer\s+(.+)$/.exec(header);
    if (!m) {
      if (!required) return;
      return reply.code(401).send({ error: "invalid_authorization" });
    }

    const token = m[1]!;

    try {
      const { payload } = await jwtVerify(token, key);
      const role = String((payload as any).role ?? "");
      const sub = String(payload.sub ?? "");

      req.auth = {
        sub,
        role,
        phone: typeof (payload as any).phone === "string" ? (payload as any).phone : undefined,
        device_id: typeof (payload as any).device_id === "string" ? (payload as any).device_id : undefined,
      };

      if (!req.auth.sub || !req.auth.role) {
        if (!required) return;
        return reply.code(401).send({ error: "invalid_token" });
      }

      if (role === "customer") {
        const iat = typeof (payload as any).iat === "number" ? (payload as any).iat : 0;
        const db = getDb();
        const rows = await db
          .select({ sessionsInvalidBefore: customers.sessionsInvalidBefore })
          .from(customers)
          .where(eq(customers.customerId, sub))
          .limit(1);
        const invalidBefore = rows[0]?.sessionsInvalidBefore;
        if (invalidBefore && iat > 0) {
          const invalidBeforeSec = Math.floor(invalidBefore.getTime() / 1000);
          if (iat < invalidBeforeSec) {
            return reply.code(401).send({ error: "session_revoked", message: "Signed out from all devices." });
          }
        }
      }
    } catch {
      if (!required) return;
      return reply.code(401).send({ error: "invalid_token" });
    }
  });
};

export const auth = fp(authPlugin, { name: "auth" });


