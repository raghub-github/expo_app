import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { ulid } from "ulid";
import { loadEnv } from "./config/loadEnv.js";
import { getEnv } from "./config/env.js";
import { healthRoutes } from "./routes/health.routes.js";
import { attachmentsRoutes } from "./routes/attachments.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { riderRoutes } from "./modules/rider/rider.routes.js";
import { onboardingRoutes } from "./modules/onboarding/onboarding.routes.js";
import { storageRoutes } from "./modules/storage/storage.routes.js";
import { paymentRoutes } from "./modules/payment/payment.routes.js";
import { meRoutes } from "./modules/me/me.routes.js";
import { supportRoutes } from "./modules/support/support.routes.js";
import { merchantRoutes } from "./modules/merchants/merchant.routes.js";
import { merchantReportRoutes } from "./modules/merchants/merchant-report.routes.js";
import { bookmarkRoutes } from "./modules/bookmarks/bookmark.routes.js";
import { orderRoutes } from "./modules/orders/order.routes.js";
import { billingModule } from "./modules/billing/billing.routes.js";
import { addressRoutes } from "./modules/addresses/address.routes.js";
import { locationSearchRoutes } from "./modules/location-search/location-search.routes.js";
import { distanceRoutes, distanceModule } from "./modules/distance/distance.routes.js";
import { geoRoutes } from "./modules/geo/geo.routes.js";
import { deliveryRateCardModule } from "./modules/delivery-rate-card/deliveryRateCard.routes.js";
import { plansRoutes } from "./modules/plans/plans.routes.js";
import { merchantPartnerRoutes } from "./modules/merchant-partner/merchant-partner.routes.js";
import { runStoreScheduleTick, runStoreScheduleTickForStore } from "./modules/merchant-partner/store-schedule-engine.js";
import { merchantMenuRoutes } from "./modules/merchant-menu/merchant-menu.routes.js";
import { errorHandler } from "./plugins/errorHandler.js";
import { requestLogger } from "./plugins/requestLogger.js";
import { getDb } from "./db/client.js";
import { reconcilePendingPayments } from "./modules/orders/order.placement.service.js";

loadEnv();
const env = getEnv();

// Configure logger - use pino-pretty only in development if available
let loggerConfig: any = {
  level: env.NODE_ENV === "production" ? "info" : "debug",
  requestIdLogLabel: "requestId",
};

// Only use pino-pretty in development if available
if (env.NODE_ENV !== "production") {
  try {
    // Try to import pino-pretty - if it fails, use default logger
    await import("pino-pretty");
    loggerConfig.transport = {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    };
  } catch {
    // pino-pretty not available, use default logger
    loggerConfig.prettyPrint = false;
  }
}

const app = Fastify({
  logger: loggerConfig,
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
app.get("/v1/razorpay-checkout", async (req, reply) => {
  const q = req.query as Record<string, string | undefined>;
  const orderId = q.order_id ?? "";
  const keyId = q.key_id ?? "";
  const amount = q.amount ?? "0";
  const successUrl = q.success_url ?? "gatimitra://pay-success";
  const cancelUrl = q.cancel_url ?? "gatimitra://pay-cancel";
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
      var options = {
        key: key_id,
        amount: Number(amount),
        order_id: order_id,
        name: "GatiMitra",
        description: "Order payment",
        handler: function(r) {
          var u = success_url + (success_url.indexOf("?") >= 0 ? "&" : "?") +
            "razorpay_payment_id=" + encodeURIComponent(r.razorpay_payment_id) +
            "&razorpay_order_id=" + encodeURIComponent(r.razorpay_order_id) +
            "&razorpay_signature=" + encodeURIComponent(r.razorpay_signature);
          window.location.href = u;
        },
        modal: { ondismiss: function() { window.location.href = cancel_url; } }
      };
      var rzp = new Razorpay(options);
      rzp.on("payment.failed", function() { window.location.href = cancel_url; });
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
await app.register(addressRoutes, { prefix: "/v1/me" });
await app.register(locationSearchRoutes, { prefix: "/v1/me" });
await app.register(supportRoutes, { prefix: "/v1/support" });
await app.register(merchantRoutes, { prefix: "/v1" });
await app.register(plansRoutes, { prefix: "/v1" });
await app.register(merchantPartnerRoutes, { prefix: "/v1" });
await app.register(merchantMenuRoutes, { prefix: "/v1" });
await app.register(merchantReportRoutes, { prefix: "/v1/merchants" });
await app.register(bookmarkRoutes, { prefix: "/v1/bookmarks" });
await app.register(billingModule, { prefix: "/v1/billing" });
await app.register(orderRoutes, { prefix: "/v1/orders" });
await app.register(distanceModule, { prefix: "/v1/distance" });
// distanceRoutes kept exported for other test harnesses; register is via distanceModule above.
void distanceRoutes;
await app.register((await import("./modules/rider-payout/riderPayout.routes.js")).riderPayoutRoutes, { prefix: "/v1/rider-payout" });
await app.register(geoRoutes, { prefix: "/v1" });
await app.register(deliveryRateCardModule, { prefix: "/v1/delivery-fee" });

let storeScheduleInterval: ReturnType<typeof setInterval> | null = null;
let pendingPaymentReconcilerInterval: ReturnType<typeof setInterval> | null = null;

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  app.log.info({ signal }, "Received shutdown signal, closing server");
  if (storeScheduleInterval) {
    clearInterval(storeScheduleInterval);
    storeScheduleInterval = null;
  }
  if (pendingPaymentReconcilerInterval) {
    clearInterval(pendingPaymentReconcilerInterval);
    pendingPaymentReconcilerInterval = null;
  }
  try {
    await app.close();
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
  app.log.error({ reason, promise }, "Unhandled rejection");
  gracefulShutdown("unhandledRejection");
});

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info({ port: env.PORT, env: env.NODE_ENV }, "Server started successfully");

  if (env.DISABLE_BACKGROUND_JOBS) {
    app.log.warn("Background jobs disabled via DISABLE_BACKGROUND_JOBS");
  } else {
    // Store Auto Schedule Engine: cold start + every 30s
    const scheduleIntervalMs = 30_000;
    runStoreScheduleTick(app.log).catch((err) => app.log.error({ err }, "store_schedule_tick"));
    storeScheduleInterval = setInterval(() => {
      runStoreScheduleTick(app.log).catch((err) => app.log.error({ err }, "store_schedule_tick"));
    }, scheduleIntervalMs);

    const paymentReconcilerIntervalMs = env.PAYMENT_RECONCILER_INTERVAL_SEC * 1000;
    reconcilePendingPayments(getDb()).catch((err) => app.log.error({ err }, "pending_payment_reconciler"));
    pendingPaymentReconcilerInterval = setInterval(() => {
      reconcilePendingPayments(getDb()).catch((err) => app.log.error({ err }, "pending_payment_reconciler"));
    }, paymentReconcilerIntervalMs);
    app.log.info(
      { intervalMs: paymentReconcilerIntervalMs, ttlMs: env.PAYMENT_CONFIRM_WINDOW_MS, lateCapturePolicy: env.PAYMENT_LATE_CAPTURE_POLICY },
      "payment reconciler started"
    );
  }
} catch (error) {
  app.log.error({ error }, "Failed to start server");
  process.exit(1);
}


