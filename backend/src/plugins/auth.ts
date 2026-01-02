import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { jwtVerify } from "jose";
import { createSecretKey } from "node:crypto";
import { getEnv } from "../config/env.js";

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

    try {
      const token = m[1]!;
      const { payload } = await jwtVerify(token, key);

      req.auth = {
        sub: String(payload.sub ?? ""),
        role: String((payload as any).role ?? ""),
        phone: typeof (payload as any).phone === "string" ? (payload as any).phone : undefined,
        device_id: typeof (payload as any).device_id === "string" ? (payload as any).device_id : undefined,
      };

      if (!req.auth.sub || !req.auth.role) {
        if (!required) return;
        return reply.code(401).send({ error: "invalid_token" });
      }
    } catch {
      if (!required) return;
      return reply.code(401).send({ error: "invalid_token" });
    }
  });
};

export const auth = fp(authPlugin, { name: "auth" });


