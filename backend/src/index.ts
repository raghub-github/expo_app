import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyRawBody from "fastify-raw-body";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { ulid } from "ulid";
import { loadEnv } from "./config/loadEnv.js";
import { isTransientDbError } from "./lib/db/is-transient-db-error.js";
import { getEnv } from "./config/env.js";
import { healthRoutes } from "./routes/health.routes.js";
import { attachmentsRoutes } from "./routes/attachments.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { riderRoutes } from "./modules/rider/rider.routes.js";
import { onboardingRoutes } from "./modules/onboarding/onboarding.routes.js";
import { storageRoutes } from "./modules/storage/storage.routes.js";
import { paymentRoutes } from "./modules/payment/payment.routes.js";
import { meRoutes } from "./modules/me/me.routes.js";
import { meWalletRoutes } from "./modules/me/me.wallet.routes.js";
import { supportRoutes } from "./modules/support/support.routes.js";
import { customerSupportRoutes } from "./modules/customer-support/customer-support.routes.js";
import { merchantRoutes } from "./modules/merchants/merchant.routes.js";
import { merchantReportRoutes } from "./modules/merchants/merchant-report.routes.js";
import { bookmarkRoutes } from "./modules/bookmarks/bookmark.routes.js";
import { orderRoutes } from "./modules/orders/order.routes.js";
import { rideRoutes } from "./modules/rides/ride.routes.js";
import { billingModule } from "./modules/billing/billing.routes.js";
import { addressRoutes } from "./modules/addresses/address.routes.js";
import { locationSearchRoutes } from "./modules/location-search/location-search.routes.js";
import { distanceRoutes, distanceModule } from "./modules/distance/distance.routes.js";
import { geoRoutes } from "./modules/geo/geo.routes.js";
import { deliveryRateCardModule } from "./modules/delivery-rate-card/deliveryRateCard.routes.js";
import { plansRoutes } from "./modules/plans/plans.routes.js";
import { merchantPartnerRoutes } from "./modules/merchant-partner/merchant-partner.routes.js";
import { commissionPartnerRoutes } from "./modules/commission/commission.partner.routes.js";
import { etaRoutes } from "./modules/eta/eta.routes.js";
import { billingDebugRoutes } from "./modules/billing/billing.debug.routes.js";
import { runStoreScheduleTick, runStoreScheduleTickForStore } from "./modules/merchant-partner/store-schedule-engine.js";
import { runOrderAcceptanceTimeoutTick } from "./services/order-acceptance-timeout.js";
import { runRideSearchTimeoutTick } from "./services/ride-search-timeout.js";
import { runOrderDispatchWaveTick } from "./lib/order-dispatch-tick.js";
import { withLock, closeRedis } from "@gatimitra/redis";
import { incrCounter, renderPrometheus } from "@gatimitra/logger";
import { merchantMenuRoutes } from "./modules/merchant-menu/merchant-menu.routes.js";
import { pushRoutes } from "./modules/push/push.routes.js";
import { offersRoutes } from "./modules/offers/offers.routes.js";
import { customerSubscriptionModule } from "./modules/subscription/customer-subscription.routes.js";
import { errorHandler } from "./plugins/errorHandler.js";
import { requestLogger } from "./plugins/requestLogger.js";
import { getDb } from "./db/client.js";
import { reconcilePendingPayments } from "./modules/orders/order.placement.service.js";
import { runCompetitorSnapshotsTick } from "./services/merchant-competitor-snapshots-tick.js";

loadEnv();
const env = getEnv();

const app = Fastify({
  logger:
    env.NODE_ENV === "production"
      ? { level: "info", requestIdLogLabel: "requestId" }
      : {
          level: "debug",
          requestIdLogLabel: "requestId",
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:standard",
              ignore: "pid,hostname",
              singleLine: false,
              sync: true,
            },
          },
        },
  requestIdLogLabel: "requestId",
  genReqId: () => ulid(),
}).withTypeProvider<ZodTypeProvider>();

// Tell Fastify how to compile Zod schemas for validation + serialization.
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// Register plugins
await app.register(errorHandler);
await app.register(requestLogger);
await app.register(helmet, { global: true });
await app.register(cors, {
  origin: true,
  credentials: true,
  maxAge: 86400,
});

await app.register(rateLimit, {
  max: env.NODE_ENV === "production" ? 600 : 2000,
  timeWindow: "1 minute",
  errorResponseBuilder: (request, context) => {
    return {
      error: "rate_limit_exceeded",
      message: `Rate limit exceeded. Max ${context.max} requests per configured window.`,
      requestId: request.id,
      retryAfter: Math.ceil(context.ttl / 1000),
    };
  },
});

/** Needed for Supabase Send SMS hook signature verification (`POST /v1/auth/supabase-send-sms`). */
await app.register(fastifyRawBody, {
  field: "rawBody",
  global: false,
  encoding: "utf8",
  runFirst: true,
  routes: [],
});

await app.register(swagger, {
  openapi: {
    info: {
      title: "GatiMitra API",
      version: "v1",
    },
      servers: [{ url: env.API_BASE_URL ?? "http://localhost:3000" }],
  },
});

await app.register(swaggerUi, {
  routePrefix: "/docs",
});

// GET / — browsers and health probes often hit the origin; JSON API is under /v1.
app.get("/", async () => ({
  ok: true,
  service: "gatimitra-api",
  v1: "/v1",
  health: "/v1/health",
  docs: "/docs",
}));

await app.register(healthRoutes, { prefix: "/v1" });
await app.register(attachmentsRoutes, { prefix: "/v1" });

// Public Razorpay checkout page (no auth) – used by customer app WebView.
// Load checkout.js first, then open payment so the Razorpay modal (UPI/cards/wallets) actually appears.
// Helmet global CSP blocks external scripts by default — override it here to allow Razorpay's CDN.
app.get("/v1/razorpay-checkout", {
  config: {
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com"],
          frameSrc: ["https://checkout.razorpay.com", "https://api.razorpay.com"],
          connectSrc: ["'self'", "https://*.razorpay.com", "https://lumberjack.razorpay.com"],
          imgSrc: ["'self'", "data:", "https://checkout.razorpay.com"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
    },
  },
}, async (req, reply) => {
  const q = req.query as Record<string, string | undefined>;
  const orderId = q.order_id ?? "";
  const keyId = q.key_id ?? "";
  const amount = q.amount ?? "0";
  const successUrl = q.success_url ?? "gatimitra://pay-success";
  const cancelUrl = q.cancel_url ?? "gatimitra://pay-cancel";
  // Prefill is required for UPI Collect to render. Phone must be 10-digit Indian mobile.
  const prefillContact = (q.prefill_contact ?? "").replace(/\D/g, "").slice(-10);
  const prefillEmail = q.prefill_email ?? "";
  const prefillName = q.prefill_name ?? "";
  const themeColor = q.theme_color ?? "#16a34a";
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <title>Complete payment</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; box-sizing: border-box; }
    .msg { color: #64748b; font-size: 15px; margin-top: 12px; }
    .err { color: #dc2626; font-size: 14px; margin-top: 12px; text-align: center; }
  </style>
</head>
<body>
  <p class="msg" id="status">Opening Razorpay…</p>
  <p class="err" id="err" style="display:none;"></p>
  <script>
(function() {
  var order_id = ${JSON.stringify(orderId)};
  var key_id = ${JSON.stringify(keyId)};
  var amount = ${JSON.stringify(amount)};
  var success_url = ${JSON.stringify(successUrl)};
  var cancel_url = ${JSON.stringify(cancelUrl)};
  var prefill_contact = ${JSON.stringify(prefillContact)};
  var prefill_email = ${JSON.stringify(prefillEmail)};
  var prefill_name = ${JSON.stringify(prefillName)};
  var theme_color = ${JSON.stringify(themeColor)};
  var statusEl = document.getElementById("status");
  var errEl = document.getElementById("err");

  function showErr(msg) {
    if (statusEl) statusEl.style.display = "none";
    if (errEl) { errEl.textContent = msg; errEl.style.display = "block"; }
  }

  if (!order_id || !key_id || amount === "0") {
    showErr("Invalid payment parameters. Please try again from the app.");
    return;
  }

  function openCheckout() {
    if (typeof Razorpay === "undefined") {
      showErr("Razorpay failed to load. Check your connection and try again.");
      return;
    }
    try {
      // Pass NO method or config.display.blocks restrictions - let Razorpay show
      // ALL payment methods enabled in the dashboard (UPI / UPI Intent / Cards / EMI /
      // Netbanking / Wallets / Pay Later / QR). Restricting blocks here was hiding
      // UPI / UPI Apps in the customer-app checkout earlier.
      var options = {
        key: key_id,
        amount: Number(amount),
        currency: "INR",
        order_id: order_id,
        name: "GatiMitra",
        description: "Order payment",
        // Prefill is REQUIRED for UPI Collect to render. Phone must be 10-digit Indian mobile.
        // Without prefill.contact, Razorpay hides UPI Collect even on accounts that have UPI enabled.
        prefill: {
          contact: prefill_contact || "",
          email: prefill_email || "",
          name: prefill_name || ""
        },
        notes: { source: "gatimitra-system-browser-checkout" },
        theme: { color: theme_color || "#16a34a" },
        retry: { enabled: true, max_count: 3 },
        send_sms_hash: true,
        remember_customer: true,
        handler: function(r) {
          var u = success_url + (success_url.indexOf("?") >= 0 ? "&" : "?") +
            "razorpay_payment_id=" + encodeURIComponent(r.razorpay_payment_id) +
            "&razorpay_order_id=" + encodeURIComponent(r.razorpay_order_id) +
            "&razorpay_signature=" + encodeURIComponent(r.razorpay_signature);
          window.location.href = u;
        },
        modal: { confirm_close: true, ondismiss: function() { window.location.href = cancel_url; } }
      };
      var rzp = new Razorpay(options);
      rzp.on("payment.failed", function(resp) {
        try {
          var desc = (resp && resp.error && resp.error.description) ? resp.error.description : "";
          if (desc && errEl) { errEl.textContent = desc; errEl.style.display = "block"; }
        } catch (e) { /* noop */ }
        setTimeout(function() { window.location.href = cancel_url; }, 400);
      });
      rzp.open();
      if (statusEl) statusEl.textContent = "Choose payment method below…";
    } catch (e) {
      showErr("Could not open payment: " + (e && e.message ? e.message : "Please try again."));
    }
  }

  if (typeof Razorpay !== "undefined") {
    openCheckout();
    return;
  }
  var s = document.createElement("script");
  s.src = "https://checkout.razorpay.com/v1/checkout.js";
  s.async = true;
  s.onload = function() { openCheckout(); };
  s.onerror = function() { showErr("Could not load Razorpay. Check your internet connection."); };
  document.head.appendChild(s);
})();
  </script>
</body>
</html>`;
  return reply.type("text/html").send(html);
});

// Internal: trigger schedule tick for a store (e.g. after operating hours updated from dashboard).
// Requires X-Internal-Secret header to match BACKEND_SCHEDULE_TICK_SECRET. Used so store open/close
// is re-evaluated immediately when hours are changed outside the backend (e.g. dashboard PATCH).
app.post<{ Params: { storeId: string } }>("/v1/internal/stores/:storeId/schedule-tick", async (req, reply) => {
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!secret || (req.headers["x-internal-secret"] as string) !== secret) {
    return reply.code(401).send({ error: "unauthorized" });
  }
  const storeId = Number((req.params as { storeId: string }).storeId);
  if (!Number.isInteger(storeId) || storeId < 1) {
    return reply.code(400).send({ error: "invalid_store_id" });
  }
  try {
    await runStoreScheduleTickForStore(storeId, req.log);
    return reply.send({ ok: true });
  } catch (e) {
    req.log.error({ err: e, storeId }, "schedule_tick_failed");
    return reply.code(500).send({ error: "schedule_tick_failed" });
  }
});

await app.register(authRoutes, { prefix: "/v1/auth" });
await app.register(riderRoutes, { prefix: "/v1/rider" });
await app.register(onboardingRoutes, { prefix: "/v1/onboarding" });
await app.register(storageRoutes, { prefix: "/v1/storage" });
await app.register(paymentRoutes, { prefix: "/v1/payment" });
await app.register(meRoutes, { prefix: "/v1/me" });
await app.register(meWalletRoutes, { prefix: "/v1/me" });
await app.register(addressRoutes, { prefix: "/v1/me" });
await app.register(locationSearchRoutes, { prefix: "/v1/me" });
await app.register(supportRoutes, { prefix: "/v1/support" });
await app.register(customerSupportRoutes, { prefix: "/v1/customer-support" });
const { riderSupportRoutes } = await import("./modules/rider-support/rider-support.routes.js");
await app.register(riderSupportRoutes, { prefix: "/v1/rider-support" });
await app.register(merchantRoutes, { prefix: "/v1" });
await app.register(plansRoutes, { prefix: "/v1" });
await app.register(merchantPartnerRoutes, { prefix: "/v1" });
await app.register(commissionPartnerRoutes, { prefix: "/v1/merchant-partner" });
await app.register(etaRoutes, { prefix: "/v1/eta" });
await app.register(billingDebugRoutes, { prefix: "/v1/billing-debug" });
await app.register(merchantMenuRoutes, { prefix: "/v1" });
await app.register(merchantReportRoutes, { prefix: "/v1/merchants" });
await app.register(bookmarkRoutes, { prefix: "/v1/bookmarks" });
await app.register(billingModule, { prefix: "/v1/billing" });
await app.register(orderRoutes, { prefix: "/v1/orders" });
const { tripShareRoutes } = await import("./modules/trip-share/trip-share.routes.js");
await app.register(tripShareRoutes, { prefix: "/v1/orders" });
const { publicTrackingRoutes } = await import("./modules/trip-share/public-tracking.routes.js");
await app.register(publicTrackingRoutes, { prefix: "/v1/public" });
const { buildLiveTrackPageHtml } = await import("./modules/trip-share/live-track-page.js");
const { liveTrackPageRouteConfig } = await import("./modules/trip-share/live-track-route-config.js");
const liveTrackRouteOpts = { config: liveTrackPageRouteConfig() };
app.get<{ Params: { token: string } }>("/trip/:token", liveTrackRouteOpts, async (req, reply) => {
  reply.type("text/html; charset=utf-8").send(buildLiveTrackPageHtml(req.params.token));
});
app.get<{ Params: { token: string } }>("/live-trip/:token", liveTrackRouteOpts, async (req, reply) => {
  reply.type("text/html; charset=utf-8").send(buildLiveTrackPageHtml(req.params.token));
});
const { sendLiveTrackMapbike } = await import("./modules/trip-share/live-track-map-assets.js");
app.get("/trip/assets/mapbike.png", liveTrackRouteOpts, async (_req, reply) => sendLiveTrackMapbike(reply));
await app.register(rideRoutes, { prefix: "/v1/rides" });
await app.register(distanceModule, { prefix: "/v1/distance" });
const { weatherRoutes } = await import("./modules/weather/weather.routes.js");
await app.register(weatherRoutes, { prefix: "/v1/weather" });
// distanceRoutes kept exported for other test harnesses; register is via distanceModule above.
void distanceRoutes;
await app.register((await import("./modules/rider-payout/riderPayout.routes.js")).riderPayoutRoutes, { prefix: "/v1/rider-payout" });
await app.register(geoRoutes, { prefix: "/v1" });
await app.register(deliveryRateCardModule, { prefix: "/v1/delivery-fee" });
await app.register(pushRoutes, { prefix: "/v1/push" });
await app.register(offersRoutes, { prefix: "/v1/offers" });
await app.register(customerSubscriptionModule, { prefix: "/v1" });

// Internal routes for in-cluster workers (payment-worker etc). Guarded by
// the shared INTERNAL_API_TOKEN header. Not exposed to the public internet.
const { paymentInternalRoutes } = await import("./modules/payment/payment.internal.routes.js");
await app.register(paymentInternalRoutes, { prefix: "/v1/internal" });
const { financialRulesInternalRoutes } = await import(
  "./modules/financial-rules/financial-rules.internal.routes.js"
);
await app.register(financialRulesInternalRoutes, { prefix: "/v1/internal" });
const { ordersInternalRoutes } = await import("./modules/orders/orders.internal.routes.js");
await app.register(ordersInternalRoutes, { prefix: "/v1/internal" });
const { weatherInternalRoutes } = await import("./modules/weather/weather.routes.js");
await app.register(weatherInternalRoutes, { prefix: "/v1/internal" });

app.post<{ Params: { riderId: string } }>(
  "/v1/internal/riders/:riderId/vehicle-verified-notify",
  async (req, reply) => {
    const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
    if (!secret || (req.headers["x-internal-secret"] as string) !== secret) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const riderId = Number((req.params as { riderId: string }).riderId);
    if (!Number.isInteger(riderId) || riderId < 1) {
      return reply.code(400).send({ error: "invalid_rider_id" });
    }
    try {
      const { notifyRiderVehicleVerified } = await import("./lib/notify-rider-vehicle-verified.js");
      await notifyRiderVehicleVerified(riderId);
      return reply.send({ ok: true });
    } catch (e) {
      req.log.error({ err: e, riderId }, "vehicle_verified_notify_failed");
      return reply.code(500).send({ error: "notify_failed" });
    }
  },
);
const { registerFinancialRulesRoutes } = await import("./modules/financial-rules/financial-rules.routes.js");
await registerFinancialRulesRoutes(app);

// Mints short-lived JWTs the client trades for a websocket connection.
const { wsTicketRoutes } = await import("./modules/auth/ws-ticket.routes.js");
await app.register(wsTicketRoutes, { prefix: "/v1" });

/**
 * Prometheus scrape endpoint. Unprotected by JWT — relies on infra-level
 * allowlist (Stage 5 nginx rule) so only the monitoring stack can reach it.
 * The counters are populated by `incrCounter()` calls throughout the
 * codebase (e.g. tick outcomes below, push enqueue helper).
 */
app.get("/metrics", async (_req, reply) => {
  reply.header("content-type", "text/plain; version=0.0.4");
  return renderPrometheus();
});

// Count every HTTP request by route + status. Lightweight, no histograms.
app.addHook("onResponse", async (req, reply) => {
  const route = req.routeOptions?.url ?? "unknown";
  incrCounter(
    "http_requests_total",
    "Total HTTP requests by route + status",
    1,
    { route, status: String(reply.statusCode) },
  );
});

let storeScheduleInterval: ReturnType<typeof setInterval> | null = null;
let pendingPaymentReconcilerInterval: ReturnType<typeof setInterval> | null = null;
let orderAcceptanceTimeoutInterval: ReturnType<typeof setInterval> | null = null;
let rideSearchTimeoutInterval: ReturnType<typeof setInterval> | null = null;
let orderDispatchWaveInterval: ReturnType<typeof setInterval> | null = null;
let competitorSnapshotsInterval: ReturnType<typeof setInterval> | null = null;
let weatherRefreshInterval: ReturnType<typeof setInterval> | null = null;
let etaLiveTickInterval: ReturnType<typeof setInterval> | null = null;
let subscriptionRenewalInterval: ReturnType<typeof setInterval> | null = null;
let merchantSubscriptionRenewalInterval: ReturnType<typeof setInterval> | null = null;
let shuttingDown = false;
let inFlightRequests = 0;

/**
 * In-flight request tracking. Combined with the SIGTERM handler below this
 * lets a deploying replica wait until the last paid-but-not-finalized
 * checkout completes before exiting, instead of orphaning the call.
 *
 * `?` on app.addHook keeps this safe even if Fastify lifecycle changes.
 */
app.addHook("onRequest", async (_req, reply) => {
  if (shuttingDown) {
    reply.header("connection", "close");
    return reply.code(503).send({ ok: false, error: "shutting_down" });
  }
  inFlightRequests++;
});
app.addHook("onResponse", async () => {
  inFlightRequests = Math.max(0, inFlightRequests - 1);
});

/**
 * Graceful shutdown:
 *   1. Set the "draining" flag → new requests get 503 immediately.
 *   2. Stop scheduling new tick iterations (clearInterval).
 *   3. Wait for in-flight requests to drain (cap 20 s) so checkout finishes.
 *   4. Close Fastify, then Redis. DB pool closes through Fastify hooks.
 *   5. Exit 0.
 */
const SHUTDOWN_DRAIN_TIMEOUT_MS = 20_000;
const gracefulShutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Received shutdown signal, draining…");

  if (storeScheduleInterval) { clearInterval(storeScheduleInterval); storeScheduleInterval = null; }
  if (pendingPaymentReconcilerInterval) { clearInterval(pendingPaymentReconcilerInterval); pendingPaymentReconcilerInterval = null; }
  if (orderAcceptanceTimeoutInterval) { clearInterval(orderAcceptanceTimeoutInterval); orderAcceptanceTimeoutInterval = null; }
  if (rideSearchTimeoutInterval) { clearInterval(rideSearchTimeoutInterval); rideSearchTimeoutInterval = null; }
  if (orderDispatchWaveInterval) { clearInterval(orderDispatchWaveInterval); orderDispatchWaveInterval = null; }
  if (competitorSnapshotsInterval) { clearInterval(competitorSnapshotsInterval); competitorSnapshotsInterval = null; }
  if (weatherRefreshInterval) { clearInterval(weatherRefreshInterval); weatherRefreshInterval = null; }
  if (etaLiveTickInterval) { clearInterval(etaLiveTickInterval); etaLiveTickInterval = null; }
  if (subscriptionRenewalInterval) { clearInterval(subscriptionRenewalInterval); subscriptionRenewalInterval = null; }
  if (merchantSubscriptionRenewalInterval) { clearInterval(merchantSubscriptionRenewalInterval); merchantSubscriptionRenewalInterval = null; }

  const drainStart = Date.now();
  while (inFlightRequests > 0 && Date.now() - drainStart < SHUTDOWN_DRAIN_TIMEOUT_MS) {
    app.log.info({ inFlight: inFlightRequests }, "waiting for in-flight requests");
    await new Promise((r) => setTimeout(r, 250));
  }
  if (inFlightRequests > 0) {
    app.log.warn({ inFlight: inFlightRequests }, "drain timeout — closing anyway");
  }

  try {
    await app.close();
    await closeRedis();
    app.log.info("Server closed successfully");
    process.exit(0);
  } catch (error) {
    app.log.error({ error }, "Error during shutdown");
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  // Use `err` key so pino prints stack/message reliably.
  app.log.error({ err: error as any }, "Uncaught exception");
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  if (isTransientDbError(reason)) {
    app.log.warn({ reason }, "Transient DB rejection (ignored)");
    return;
  }
  app.log.error({ reason, promise }, "Unhandled rejection");
  gracefulShutdown("unhandledRejection");
});

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info({ port: env.PORT, env: env.NODE_ENV }, "Server started successfully");

  if (env.DISABLE_BACKGROUND_JOBS) {
    app.log.warn("Background jobs disabled via DISABLE_BACKGROUND_JOBS");
  } else {
    /**
     * Background ticks now run under Redis-backed distributed locks so >1
     * replica can run safely without double-firing. Each lock TTL is set
     * comfortably > the tick interval to handle short overruns, but short
     * enough that a crashed worker doesn't hold the lock forever.
     *
     * If Redis is unavailable, `withLock` returns null and the tick is
     * SKIPPED for that interval — we never duplicate, we just lose a beat.
     */

    // Store Auto Schedule Engine — every 30 s; lock TTL 40 s.
    const scheduleIntervalMs = 30_000;
    const runScheduleTickLocked = () =>
      withLock("tick:store-schedule", 40_000, () => runStoreScheduleTick(app.log))
        .then((result) => {
          incrCounter(
            "tick_runs_total",
            "Polling tick outcomes by lock state",
            1,
            { tick: "store_schedule", outcome: result === null ? "skipped" : "ran" },
          );
        })
        .catch((err) => app.log.error({ err }, "store_schedule_tick"));
    void runScheduleTickLocked();
    storeScheduleInterval = setInterval(() => { void runScheduleTickLocked(); }, scheduleIntervalMs);

    // Payment reconciler — driven by services/payment-worker via BullMQ
    // when RECONCILER_LEGACY_TICK_ENABLED=false (recommended in production).
    // The legacy in-process tick stays as a fallback so the existing single-
    // node deployment keeps working until the worker is provisioned.
    if (env.RECONCILER_LEGACY_TICK_ENABLED) {
      const paymentReconcilerIntervalMs = env.PAYMENT_RECONCILER_INTERVAL_SEC * 1000;
      const paymentLockTtlMs = Math.max(paymentReconcilerIntervalMs * 2, 60_000);
      const runPaymentReconcilerLocked = () =>
        withLock("tick:payment-reconciler", paymentLockTtlMs, () => reconcilePendingPayments(getDb()))
          .catch((err) => app.log.error({ err }, "pending_payment_reconciler"));
      void runPaymentReconcilerLocked();
      pendingPaymentReconcilerInterval = setInterval(() => { void runPaymentReconcilerLocked(); }, paymentReconcilerIntervalMs);
      app.log.info(
        { intervalMs: paymentReconcilerIntervalMs, ttlMs: env.PAYMENT_CONFIRM_WINDOW_MS, lateCapturePolicy: env.PAYMENT_LATE_CAPTURE_POLICY },
        "payment reconciler started (legacy in-process tick + distributed lock)"
      );
    } else {
      app.log.info("payment reconciler in-process tick DISABLED — payment-worker is the driver");
    }

    // Order acceptance auto-cancel — every 15 s; lock TTL 25 s.
    const orderAcceptanceIntervalMs = 15_000;
    const runAcceptanceTickLocked = () =>
      withLock("tick:acceptance-timeout", 25_000, () => runOrderAcceptanceTimeoutTick(app.log))
        .then((result) => {
          incrCounter(
            "tick_runs_total",
            "Polling tick outcomes by lock state",
            1,
            { tick: "acceptance_timeout", outcome: result === null ? "skipped" : "ran" },
          );
        })
        .catch((err) => app.log.error({ err }, "order_acceptance_timeout_tick"));
    await runAcceptanceTickLocked();
    orderAcceptanceTimeoutInterval = setInterval(() => { void runAcceptanceTickLocked(); }, orderAcceptanceIntervalMs);

    // Ride search auto-cancel — every 15 s; lock TTL 25 s.
    const rideSearchTimeoutIntervalMs = 15_000;
    const runRideSearchTickLocked = () =>
      withLock("tick:ride-search-timeout", 25_000, () => runRideSearchTimeoutTick(app.log))
        .then((result) => {
          incrCounter(
            "tick_runs_total",
            "Polling tick outcomes by lock state",
            1,
            { tick: "ride_search_timeout", outcome: result === null ? "skipped" : "ran" },
          );
        })
        .catch((err) => app.log.error({ err }, "ride_search_timeout_tick"));
    void runRideSearchTickLocked();
    rideSearchTimeoutInterval = setInterval(() => { void runRideSearchTickLocked(); }, rideSearchTimeoutIntervalMs);

    // Dispatch wave expansion — every 10 s; lock TTL 20 s.
    const orderDispatchWaveIntervalMs = 10_000;
    const runDispatchWaveTickLocked = () =>
      withLock("tick:order-dispatch-waves", 20_000, () => runOrderDispatchWaveTick(app.log))
        .then((result) => {
          incrCounter(
            "tick_runs_total",
            "Polling tick outcomes by lock state",
            1,
            { tick: "order_dispatch_waves", outcome: result === null ? "skipped" : "ran" },
          );
        })
        .catch((err) => app.log.error({ err }, "order_dispatch_wave_tick"));
    void runDispatchWaveTickLocked();
    orderDispatchWaveInterval = setInterval(() => {
      void runDispatchWaveTickLocked();
    }, orderDispatchWaveIntervalMs);
    app.log.info({ intervalMs: orderDispatchWaveIntervalMs }, "order dispatch wave tick started");

    // Competitor affinity snapshots (city + pincode) — every 24 h; lock TTL 25 h.
    const competitorSnapshotIntervalMs = 24 * 60 * 60 * 1000;
    const competitorSnapshotLockMs = 25 * 60 * 60 * 1000;
    const runCompetitorSnapshotLocked = () =>
      withLock("tick:competitor-snapshots", competitorSnapshotLockMs, () =>
        runCompetitorSnapshotsTick(app.log)
      )
        .then((result) => {
          incrCounter(
            "tick_runs_total",
            "Polling tick outcomes by lock state",
            1,
            { tick: "competitor_snapshots", outcome: result === null ? "skipped" : "ran" }
          );
        })
        .catch((err) => app.log.error({ err }, "competitor_snapshots_tick"));
    void runCompetitorSnapshotLocked();
    competitorSnapshotsInterval = setInterval(() => {
      void runCompetitorSnapshotLocked();
    }, competitorSnapshotIntervalMs);
    app.log.info(
      { intervalHours: 24 },
      "merchant competitor snapshots tick started (city + locality, all stores)"
    );

    // Weather zone refresh — every 12 min; lock TTL 14 min.
    const weatherRefreshIntervalMs = 12 * 60 * 1000;
    const weatherRefreshLockMs = 14 * 60 * 1000;
    const { runWeatherRefreshTick } = await import("./modules/weather/weather.service.js");
    const runWeatherTickLocked = () =>
      withLock("tick:weather-refresh", weatherRefreshLockMs, () => runWeatherRefreshTick(app.log))
        .then((result) => {
          incrCounter(
            "tick_runs_total",
            "Polling tick outcomes by lock state",
            1,
            { tick: "weather_refresh", outcome: result === null ? "skipped" : "ran" }
          );
        })
        .catch((err) => app.log.error({ err }, "weather_refresh_tick"));
    void runWeatherTickLocked();
    weatherRefreshInterval = setInterval(() => {
      void runWeatherTickLocked();
    }, weatherRefreshIntervalMs);
    app.log.info({ intervalMinutes: 12 }, "weather zone refresh tick started");

    // Live ETA engine — every 60 s; lock TTL 75 s.
    const etaLiveTickIntervalMs = 60_000;
    const runEtaLiveTickLocked = () =>
      withLock("tick:eta-live", 75_000, async () => {
        const { runLiveEtaTick } = await import("./modules/eta/eta.live-tick.js");
        return runLiveEtaTick(250);
      })
        .then((result) => {
          incrCounter(
            "tick_runs_total",
            "Polling tick outcomes by lock state",
            1,
            { tick: "eta_live", outcome: result === null ? "skipped" : "ran" },
          );
        })
        .catch((err) => app.log.error({ err }, "eta_live_tick"));
    void runEtaLiveTickLocked();
    etaLiveTickInterval = setInterval(() => {
      void runEtaLiveTickLocked();
    }, etaLiveTickIntervalMs);
    app.log.info({ intervalSeconds: 60 }, "live ETA tick started");

    // GMitra Max subscription auto-renewal — every 10 min; lock TTL 12 min.
    const subscriptionRenewalIntervalMs = 10 * 60 * 1000;
    const subscriptionRenewalLockMs = 12 * 60 * 1000;
    const runSubscriptionRenewalLocked = () =>
      withLock("tick:rider-subscription-renewal", subscriptionRenewalLockMs, async () => {
        const { processRiderSubscriptionRenewals } = await import(
          "./modules/rider/rider-subscription.service.js"
        );
        return processRiderSubscriptionRenewals();
      })
        .then((result) => {
          incrCounter(
            "tick_runs_total",
            "Polling tick outcomes by lock state",
            1,
            { tick: "rider_subscription_renewal", outcome: result === null ? "skipped" : "ran" },
          );
        })
        .catch((err) => app.log.error({ err }, "rider_subscription_renewal_tick"));
    void runSubscriptionRenewalLocked();
    subscriptionRenewalInterval = setInterval(() => {
      void runSubscriptionRenewalLocked();
    }, subscriptionRenewalIntervalMs);
    app.log.info({ intervalMinutes: 10 }, "rider subscription renewal tick started");

    const merchantSubscriptionRenewalIntervalMs = 10 * 60 * 1000;
    const merchantSubscriptionRenewalLockMs = 12 * 60 * 1000;
    const runMerchantSubscriptionRenewalLocked = () =>
      withLock("tick:merchant-subscription-renewal", merchantSubscriptionRenewalLockMs, async () => {
        const { processMerchantSubscriptionRenewals } = await import(
          "./modules/merchant-partner/merchant-subscription.service.js"
        );
        return processMerchantSubscriptionRenewals();
      })
        .then((result) => {
          incrCounter(
            "tick_runs_total",
            "Polling tick outcomes by lock state",
            1,
            { tick: "merchant_subscription_renewal", outcome: result === null ? "skipped" : "ran" },
          );
        })
        .catch((err) => app.log.error({ err }, "merchant_subscription_renewal_tick"));
    void runMerchantSubscriptionRenewalLocked();
    merchantSubscriptionRenewalInterval = setInterval(() => {
      void runMerchantSubscriptionRenewalLocked();
    }, merchantSubscriptionRenewalIntervalMs);
    app.log.info({ intervalMinutes: 10 }, "merchant subscription renewal tick started");
  }
} catch (error) {
  app.log.error({ error }, "Failed to start server");
  process.exit(1);
}


