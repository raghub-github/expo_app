import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";

/**
 * Request Logger Plugin
 * Logs all incoming requests with timing and status
 */
async function requestLoggerPlugin(app: FastifyInstance) {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // Fastify v5 doesn't expose `reply.getResponseTime()` consistently.
    // Track timing ourselves.
    (request as any).__startHrTime = process.hrtime.bigint();

    request.log.info({
      requestId: request.id,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    }, "Incoming request");
  });

  app.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = (request as any).__startHrTime as bigint | undefined;
    const responseTimeMs =
      start != null ? Number((process.hrtime.bigint() - start) / 1_000_000n) : undefined;

    request.log.info({
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: responseTimeMs != null ? `${responseTimeMs}ms` : undefined,
    }, "Request completed");
  });
}

export const requestLogger = fp(requestLoggerPlugin, { name: "requestLogger" });

