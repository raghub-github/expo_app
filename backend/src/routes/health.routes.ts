import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getSql, resetDbPoolAsync } from "../db/client.js";

/**
 * Per-probe budget for `SELECT 1`. Kept under the 3s client timeout used by
 * deploy-service.sh's wait_healthy (and Docker's 4s) so the route always
 * answers before its caller gives up. A busy pool can exceed it without being broken.
 */
const DB_PROBE_TIMEOUT_MS = 2_500;
/**
 * How long the DB must fail continuously before /health reports 503, once the
 * process has reached it at least once. Docker marks the container unhealthy
 * after 3 failed probes and autoheal then restarts it, so a single slow
 * `SELECT 1` under load used to restart a working backend — and the restart
 * (≈55s boot on a loaded VPS) made the load worse. A genuine wedge still
 * fails health after this window and gets restarted.
 */
const DB_SUSTAINED_FAILURE_MS = 90_000;
/** Only rebuild the pool after this much continuous failure, and at most this often. */
const POOL_RESET_AFTER_FAILURE_MS = 30_000;
const POOL_RESET_MIN_INTERVAL_MS = 60_000;

type DbProbeState = {
  everConnected: boolean;
  failingSince: number | null;
  lastPoolResetAt: number;
};

const probeState: DbProbeState = {
  everConnected: false,
  failingSince: null,
  lastPoolResetAt: 0,
};

/**
 * Pure decision for one failed probe. Exported for tests.
 *
 * - Before the first success: report 503 so a deploy never promotes a replica
 *   that cannot reach the DB.
 * - After that: tolerate failures until they have lasted DB_SUSTAINED_FAILURE_MS.
 * - Never reset the pool on a single timeout: that kills every in-flight query
 *   and forces a reconnect storm, which made the next probe time out too.
 */
export function decideOnDbProbeFailure(
  state: DbProbeState,
  now: number,
): { report503: boolean; resetPool: boolean } {
  const failingSince = state.failingSince ?? now;
  const failingFor = now - failingSince;
  const report503 = !state.everConnected || failingFor >= DB_SUSTAINED_FAILURE_MS;
  const resetPool =
    failingFor >= POOL_RESET_AFTER_FAILURE_MS &&
    now - state.lastPoolResetAt >= POOL_RESET_MIN_INTERVAL_MS;
  return { report503, resetPool };
}

export async function healthRoutes(app: FastifyInstance) {
  app.get(
    "/health",
    {
      schema: {
        response: {
          200: z.object({
            ok: z.literal(true),
            ts: z.string(),
            database: z.enum(["connected", "disconnected", "degraded"]),
            uptime: z.number(),
          }),
          503: z.object({
            ok: z.literal(false),
            ts: z.string(),
            database: z.enum(["connected", "disconnected"]),
            error: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      // Check database connectivity — never hang forever if the pool is wedged.
      let timer: ReturnType<typeof setTimeout> | undefined;
      let dbOk = false;
      try {
        const sql = getSql();
        await Promise.race([
          sql`SELECT 1`,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("db_health_timeout")), DB_PROBE_TIMEOUT_MS);
          }),
        ]);
        dbOk = true;
      } catch (error) {
        request.log.error({ error }, "Database health check failed");
      } finally {
        if (timer) clearTimeout(timer);
      }

      const now = Date.now();
      if (dbOk) {
        probeState.everConnected = true;
        probeState.failingSince = null;
        return {
          ok: true as const,
          ts: new Date().toISOString(),
          database: "connected" as const,
          uptime: process.uptime(),
        };
      }

      const decision = decideOnDbProbeFailure(probeState, now);
      probeState.failingSince ??= now;
      if (decision.resetPool) {
        probeState.lastPoolResetAt = now;
        request.log.warn({ failingForMs: now - probeState.failingSince }, "Database failing continuously; rebuilding pool");
        void resetDbPoolAsync().catch(() => undefined);
      }

      if (decision.report503) {
        return reply.status(503).send({
          ok: false as const,
          ts: new Date().toISOString(),
          database: "disconnected" as const,
          error: "Database connection failed",
        });
      }

      // Process is alive and has reached the DB before; this is a blip or a busy
      // pool. Stay healthy so autoheal does not restart a working backend.
      return {
        ok: true as const,
        ts: new Date().toISOString(),
        database: "degraded" as const,
        uptime: process.uptime(),
      };
    },
  );
}
