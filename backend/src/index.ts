import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyRawBody from "fastify-raw-body";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { ulid } from "ulid";
import dns from "node:dns";
import { loadEnv } from "./config/loadEnv.js";
import { isTransientDbError } from "./lib/db/is-transient-db-error.js";
import { isDbConnectionError } from "./db/client.js";
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
import { meLegalConsentRoutes } from "./modules/me/me.legal-consent.routes.js";
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
import { preventServicesRoutes } from "./modules/prevent-services/index.js";
import { deliveryRateCardModule } from "./modules/delivery-rate-card/deliveryRateCard.routes.js";
import { plansRoutes } from "./modules/plans/plans.routes.js";
import { merchantPartnerRoutes } from "./modules/merchant-partner/merchant-partner.routes.js";
import { commissionPartnerRoutes } from "./modules/commission/commission.partner.routes.js";
import { etaRoutes } from "./modules/eta/eta.routes.js";
import { billingDebugRoutes } from "./modules/billing/billing.debug.routes.js";
import { runStoreScheduleTick, runStoreScheduleTickForStore } from "./modules/merchant-partner/store-schedule-engine.js";
import { runOrderAcceptanceTimeoutTick } from "./services/order-acceptance-timeout.js";
import { runOrderAutoAcceptTick } from "./services/order-auto-accept.js";
import { runRideSearchTimeoutTick } from "./services/ride-search-timeout.js";
import { runRiderTrackingWatchdogTick } from "./lib/rider-tracking-watchdog.service.js";
import { runOrderDispatchWaveTick } from "./lib/order-dispatch-tick.js";
import { withLock, closeRedis } from "@gatimitra/redis";
import { incrCounter, renderPrometheus } from "@gatimitra/logger";
import { merchantMenuRoutes } from "./modules/merchant-menu/merchant-menu.routes.js";
import { pushRoutes } from "./modules/push/push.routes.js";
import { notificationRoutes, notificationInternalRoutes, startScheduledPoller, startNotificationRetryPoller, startReminderPoller, registerDomainEventHandlers } from "./modules/notifications/index.js";
import { verificationAdminRoutes } from "./modules/verification/routes/admin.routes.js";
import { cashfreeHeaderWebhookRoutes, cashfreeBodySignedWebhookRoutes } from "./modules/verification/routes/webhook.routes.js";
import { offersRoutes } from "./modules/offers/offers.routes.js";
import { customerSubscriptionModule } from "./modules/subscription/customer-subscription.routes.js";
import { errorHandler } from "./plugins/errorHandler.js";
import { dbSlotRequest } from "./plugins/db-slot-request.js";
import { requestLogger } from "./plugins/requestLogger.js";
import { getDb } from "./db/client.js";
import { reconcilePendingPayments } from "./modules/orders/order.placement.service.js";
import { runCompetitorSnapshotsTick } from "./services/merchant-competitor-snapshots-tick.js";

loadEnv();
// Prefer IPv4 — corporate/VPN DNS64 (64:ff9b::*) often yields ENOTFOUND/unreachable for Supabase/Redis.
dns.setDefaultResultOrder("ipv4first");
const env = getEnv();

const app = Fastify({
  logger:
    env.NODE_ENV === "production"
      ? { level: "info" }
      : {
          level: "debug",
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
await app.register(dbSlotRequest);
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

// Public DigiLocker return lives on onboarding routes:
//   GET /v1/onboarding/digilocker-return  (config.skipAuth)
// Do not re-register it here — duplicates break Fastify boot.

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

// Internal: execute an order refund that the dashboard already recorded.
// Called by the dashboard's /api/orders/[orderId]/refunds proxy right after
// it inserts the `order_refunds` row. Routes the refund to Razorpay / customer
// wallet / COD-noop / mixed depending on the original payment_gateway.
//
// Auth: X-Internal-Secret == INTERNAL_API_TOKEN (dashboard already vouches
// for the acting agent via Supabase; this shared secret is the network gate).
// Also accepts BACKEND_SCHEDULE_TICK_SECRET for backward-compat with ops
// scripts that already have that value handy.
app.post<{
  Params: { orderId: string };
  Body: {
    refundId: number;
    refundAmount: number;
    refundReason: string;
    actor?: {
      actorSystemUserId?: number | null;
      actorEmail?: string | null;
      actorName?: string | null;
      actorRole?: string | null;
      actorIp?: string | null;
      actorUserAgent?: string | null;
    };
  };
}>("/v1/internal/orders/:orderId/refund/execute", async (req, reply) => {
  const internalSecret = process.env.INTERNAL_API_TOKEN;
  const tickSecret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  const header = String(req.headers["x-internal-secret"] ?? "");
  if (!header || (header !== internalSecret && header !== tickSecret)) {
    return reply.code(401).send({ error: "unauthorized" });
  }
  const orderId = Number((req.params as { orderId: string }).orderId);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return reply.code(400).send({ error: "invalid_order_id" });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const refundId = Number(body.refundId);
  const refundAmount = Number(body.refundAmount);
  const refundReason = String(body.refundReason ?? "").trim();
  if (!Number.isInteger(refundId) || refundId < 1) {
    return reply.code(400).send({ error: "invalid_refund_id" });
  }
  if (!Number.isFinite(refundAmount) || refundAmount < 0) {
    return reply.code(400).send({ error: "invalid_refund_amount" });
  }
  const actor = ((body.actor as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  try {
    const { executeOrderRefund } = await import(
      "./modules/orders/order-refund-executor.js"
    );
    const result = await executeOrderRefund({
      refundId,
      orderCoreId: orderId,
      refundAmount,
      refundReason: refundReason || "order refund",
      actor: {
        actorSystemUserId: actor.actorSystemUserId != null ? Number(actor.actorSystemUserId) : null,
        actorEmail: actor.actorEmail != null ? String(actor.actorEmail) : null,
        actorName: actor.actorName != null ? String(actor.actorName) : null,
        actorRole: actor.actorRole != null ? String(actor.actorRole) : null,
        actorIp: actor.actorIp != null ? String(actor.actorIp) : null,
        actorUserAgent: actor.actorUserAgent != null ? String(actor.actorUserAgent) : null,
      },
    });
    return reply.send({ ok: true, result });
  } catch (e) {
    req.log.error({ err: e, orderId, refundId }, "order_refund_execute_failed");
    return reply.code(500).send({ error: "execute_failed" });
  }
});

// Internal: auto-refund a cancelled order — CREATES the order_refunds row and
// executes it (Razorpay / wallet / COD-noop) in one call.
//
// Why this exists: the Partner Site records merchant cancellations by writing
// orders_food/orders_core DIRECTLY in its own Next.js routes, so it never reaches
// merchant-food-orders.service (the one place a merchant/system cancel normally
// auto-refunds). Without this hop the portal only stamped refund INTENT
// (order_cancellation refund_status=pending) and the customer never got paid back.
//
// Policy (who gets money back automatically):
//   • system / auto-cancel            → full refund
//   • merchant (store) cancel/reject  → full refund
//   • rider-caused cancel             → full refund (fault only decides who is debited)
//   • customer cancel                 → full refund only pre-accept (food.order-cancel.service);
//                                       this internal hop still rejects actorRole=customer
//   • agent/admin                     → dashboard engine flow, not this route
//
// Idempotent: autoRefundOnCancellation reclaims hollow Completed/NOOP rows
// (no wallet/gateway movement) then re-executes; otherwise no-ops when a real
// non-failed refund already exists — retries / double webhooks can't double-pay.
//
// Auth: X-Internal-Secret == INTERNAL_API_TOKEN (or BACKEND_SCHEDULE_TICK_SECRET).
app.post<{
  Params: { orderId: string };
  Body: {
    reason?: string;
    actorEmail?: string | null;
    actorRole?: string | null;
    /** Optional override. Omit for a full refund of what the customer paid. */
    amount?: number | null;
  };
}>("/v1/internal/orders/:orderId/auto-refund", async (req, reply) => {
  const internalSecret = process.env.INTERNAL_API_TOKEN;
  const tickSecret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  const header = String(req.headers["x-internal-secret"] ?? "");
  if (!header || (header !== internalSecret && header !== tickSecret)) {
    return reply.code(401).send({ error: "unauthorized" });
  }
  const orderId = Number((req.params as { orderId: string }).orderId);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return reply.code(400).send({ error: "invalid_order_id" });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const actorRole = String(body.actorRole ?? "system").trim().toLowerCase();

  // Customer-initiated cancellations must never auto-refund.
  if (actorRole === "customer" || actorRole === "cx") {
    return reply.send({ ok: true, skipped: "customer_cancellation_no_auto_refund" });
  }

  const rawAmount = body.amount != null ? Number(body.amount) : NaN;
  try {
    const { autoRefundOnCancellation } = await import(
      "./lib/auto-refund-on-cancellation.js"
    );
    const outcome = await autoRefundOnCancellation({
      orderCoreId: orderId,
      reason: String(body.reason ?? "").trim() || "Order cancelled",
      actorEmail: body.actorEmail != null ? String(body.actorEmail) : null,
      actorRole,
      amount: Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : null,
    });
    req.log.info({ orderId, actorRole, outcome }, "order_auto_refund_result");
    return reply.send({ ok: true, outcome });
  } catch (e) {
    req.log.error({ err: e, orderId }, "order_auto_refund_failed");
    return reply.code(500).send({ error: "auto_refund_failed" });
  }
});

// Internal: manually trigger the merchant subscription lifecycle tick.
// Runs the same reminders + renewals + expired notices the 10-min interval
// runs — useful for on-demand testing (from a script, from ops) and for
// external cron systems that prefer to control the schedule themselves.
// Auth: X-Internal-Secret header == BACKEND_SCHEDULE_TICK_SECRET.
app.post("/v1/internal/merchant-subscription/lifecycle-tick", async (req, reply) => {
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!secret || (req.headers["x-internal-secret"] as string) !== secret) {
    return reply.code(401).send({ error: "unauthorized" });
  }
  try {
    const { runMerchantSubscriptionLifecycleTick } = await import(
      "./modules/merchant-partner/merchant-subscription-lifecycle.js"
    );
    const result = await runMerchantSubscriptionLifecycleTick();
    return reply.send({ ok: true, result });
  } catch (e) {
    req.log.error({ err: e }, "merchant_subscription_lifecycle_tick_failed");
    return reply.code(500).send({ error: "lifecycle_tick_failed" });
  }
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

// Internal: flush expired unaccepted orders for one store (partner portal open).
app.post<{ Params: { storeId: string } }>(
  "/v1/internal/stores/:storeId/sync-acceptance-timeout",
  async (req, reply) => {
    const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
    if (!secret || (req.headers["x-internal-secret"] as string) !== secret) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const storeId = Number((req.params as { storeId: string }).storeId);
    if (!Number.isInteger(storeId) || storeId < 1) {
      return reply.code(400).send({ error: "invalid_store_id" });
    }
    try {
      const { syncOrderAcceptanceTimeoutForStore } = await import(
        "./services/order-acceptance-timeout.js"
      );
      const { cancelled, auto_accepted } = await syncOrderAcceptanceTimeoutForStore(storeId, req.log);
      return reply.send({ cancelled, auto_accepted, store_id: storeId });
    } catch (e) {
      req.log.error({ err: e, storeId }, "sync_acceptance_timeout_failed");
      return reply.code(500).send({ error: "sync_failed", cancelled: 0 });
    }
  }
);

// Internal: authoritative partner/merchant surface status (schedule tick + postgres read).
app.get<{ Params: { storeId: string } }>("/v1/internal/stores/:storeId/partner-status", async (req, reply) => {
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!secret || (req.headers["x-internal-secret"] as string) !== secret) {
    return reply.code(401).send({ error: "unauthorized" });
  }
  const storeId = Number((req.params as { storeId: string }).storeId);
  if (!Number.isInteger(storeId) || storeId < 1) {
    return reply.code(400).send({ error: "invalid_store_id" });
  }
  try {
    const { withDbSlot } = await import("./db/client.js");
    const { buildPartnerStoreStatusSnapshot } = await import(
      "./modules/merchant-partner/partner-store-status-snapshot.js"
    );
    // Request-level slot is skipped for this poll path — acquire only around DB work.
    const snapshot = await withDbSlot(() => buildPartnerStoreStatusSnapshot(storeId, req.log));
    if (!snapshot) return reply.code(404).send({ error: "store_not_found" });
    return reply.send(snapshot);
  } catch (e) {
    req.log.error({ err: e, storeId }, "partner_status_snapshot_failed");
    return reply.code(500).send({ error: "partner_status_snapshot_failed" });
  }
});

await app.register(authRoutes, { prefix: "/v1/auth" });
await app.register(riderRoutes, { prefix: "/v1/rider" });
await app.register(onboardingRoutes, { prefix: "/v1/onboarding" });
await app.register(storageRoutes, { prefix: "/v1/storage" });
await app.register(paymentRoutes, { prefix: "/v1/payment" });
await app.register(meRoutes, { prefix: "/v1/me" });
await app.register(meLegalConsentRoutes, { prefix: "/v1/me" });
await app.register(meWalletRoutes, { prefix: "/v1/me" });
await app.register(addressRoutes, { prefix: "/v1/me" });
const { addressShareMeRoutes, addressSharePublicRoutes } = await import(
  "./modules/addresses/address-share.routes.js"
);
await app.register(addressShareMeRoutes, { prefix: "/v1/me" });
await app.register(addressSharePublicRoutes, { prefix: "/v1/public" });
const { referralRoutes, referralPublicLandingRoutes } = await import(
  "./modules/referral/referral.routes.js"
);
await app.register(referralRoutes, { prefix: "/v1/referral" });
await app.register(referralPublicLandingRoutes, { prefix: "" });
const { renderAddressShareLandingPage } = await import("./modules/addresses/address-share-page.js");
const { sendAddressShareOgLogo } = await import("./modules/addresses/address-share-og-asset.js");

// Android App Links verification. Served on gatimitra.com (nginx proxies
// the exact path /.well-known/assetlinks.json and the /addr/* prefix to this
// backend). Android fetches this to auto-verify the domain so /addr/... links
// open the app directly instead of a browser/chooser.
const { buildAssetLinksJson } = await import("./lib/assetlinks.js");
app.get("/.well-known/assetlinks.json", async (_req, reply) => {
  const payload = buildAssetLinksJson();
  if (!payload) {
    // No fingerprints configured — 503 rather than publish an empty file that
    // Android would cache as a verification failure.
    return reply
      .status(503)
      .type("text/plain")
      .send("assetlinks not configured (set ANDROID_APP_LINK_SHA256)");
  }
  return reply
    .type("application/json")
    .header("Cache-Control", "public, max-age=300")
    .send(payload);
});

app.get("/addr/og-logo.png", async (_req, reply) => sendAddressShareOgLogo(reply));
app.get<{ Params: { shortCode: string }; Querystring: { id?: string } }>(
  "/addr/:shortCode",
  async (req, reply) => {
    const token = String(req.query.id ?? "").trim();
    const shortCode = String(req.params.shortCode ?? "").trim();
    if (!token || !shortCode) return reply.status(400).send("Invalid link");
    const html = await renderAddressShareLandingPage(shortCode, token);
    if (!html) return reply.status(410).send("This link has expired or was already used.");
    return reply.type("text/html; charset=utf-8").send(html);
  }
);
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const liveTrackRouteOpts = { config: liveTrackPageRouteConfig() } as any;
app.get<{ Params: { token: string } }>("/trip/:token", liveTrackRouteOpts, async (req, reply) => {
  reply.type("text/html; charset=utf-8").send(buildLiveTrackPageHtml(req.params.token));
});
app.get<{ Params: { token: string } }>("/live-trip/:token", liveTrackRouteOpts, async (req, reply) => {
  reply.type("text/html; charset=utf-8").send(buildLiveTrackPageHtml(req.params.token));
});
const { sendLiveTrackMapbike } = await import("./modules/trip-share/live-track-map-assets.js");
app.get("/trip/assets/mapbike.png", liveTrackRouteOpts, async (_req, reply) => sendLiveTrackMapbike(reply));
await app.register(rideRoutes, { prefix: "/v1/rides" });
await app.register((await import("./modules/parcel/parcel.routes.js")).parcelRoutes, {
  prefix: "/v1/parcel",
});
await app.register(distanceModule, { prefix: "/v1/distance" });
const { weatherRoutes } = await import("./modules/weather/weather.routes.js");
await app.register(weatherRoutes, { prefix: "/v1/weather" });
const { appAssetsRoutes } = await import("./modules/app-assets/app-assets.routes.js");
await app.register(appAssetsRoutes, { prefix: "/v1/app-assets" });
const { learningCentreRoutes } = await import("./modules/learning-centre/learning-centre.routes.js");
await app.register(learningCentreRoutes, { prefix: "/v1/learning-centre" });
// distanceRoutes kept exported for other test harnesses; register is via distanceModule above.
void distanceRoutes;
await app.register((await import("./modules/rider-payout/riderPayout.routes.js")).riderPayoutRoutes, { prefix: "/v1/rider-payout" });
await app.register(geoRoutes, { prefix: "/v1" });
await app.register(preventServicesRoutes, { prefix: "/v1" });
await app.register(deliveryRateCardModule, { prefix: "/v1/delivery-fee" });
await app.register(pushRoutes, { prefix: "/v1/push" });
await app.register(notificationRoutes);
await app.register(notificationInternalRoutes, { prefix: "/v1/internal" });

// Verification — Cashfree Secure ID auto/manual/hybrid.
//   - verificationAdminRoutes → /v1/verification/*  (admin submit + history)
//   - Two webhook receivers on /api/webhooks/cashfree/{header,body}-signed
//     to match Cashfree's two coexisting signature schemes (see Phase 2 spec).
await app.register(verificationAdminRoutes);
await app.register(cashfreeHeaderWebhookRoutes, { prefix: "/api" });
await app.register(cashfreeBodySignedWebhookRoutes, { prefix: "/api" });

// Admin-only refund + revoke for merchant subscription payments.
// Handles wallet-paid (instant credit + revoke) and Razorpay-paid (initiate
// refund via API + eager revoke; refund.processed webhook confirms).
const { merchantSubscriptionAdminRoutes } = await import(
  "./modules/merchant-partner/merchant-subscription.admin.routes.js"
);
await app.register(merchantSubscriptionAdminRoutes, {
  prefix: "/v1/admin/merchant-subscriptions",
});

// Ride Wallet & Settlement config — Super Admin controls the per-service
// negative threshold, global block threshold, cash settlement toggle, and
// auto-unblock behaviour without needing a deploy.
const { rideWalletConfigAdminRoutes } = await import(
  "./modules/rides/settlement/rideWalletConfig.admin.routes.js"
);
await app.register(rideWalletConfigAdminRoutes, {
  prefix: "/v1/admin/ride-wallet-config",
});

// Ride Settlement Reports — Super Admin read-only aggregates over
// ride_settlements (revenue, cash vs online, wallet recovery, negative wallet
// watchlist). Phase 4 hardening of the Ride Billing Architecture.
const { rideSettlementReportsRoutes } = await import(
  "./modules/rides/settlement/rideSettlement.reports.routes.js"
);
await app.register(rideSettlementReportsRoutes, {
  prefix: "/v1/admin/ride-settlement-reports",
});

// Real-time tracking + geo-scoping engine config — Super Admin tunables
// (interval, geofence radii, geo-engine thresholds, rule toggles). Read live by
// the ingestion/enforcement path so changes apply without a deploy.
const { trackingConfigAdminRoutes } = await import(
  "./modules/tracking/tracking-config.admin.routes.js"
);
await app.register(trackingConfigAdminRoutes, {
  prefix: "/v1/admin/tracking-config",
});

// Control Dashboard — tracking timeline (per order) + geo-engine violations
// review queue (open → reviewed / penalized / dismissed).
const { trackingAdminRoutes } = await import(
  "./modules/tracking/tracking.admin.routes.js"
);
await app.register(trackingAdminRoutes, { prefix: "/v1/admin/tracking" });

await app.register(offersRoutes, { prefix: "/v1/offers" });
const { pricingRoutes } = await import("./modules/pricing/pricing.routes.js");
await app.register(pricingRoutes, { prefix: "/v1/pricing" });
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
const { orderCxNotificationAdminRoutes } = await import(
  "./modules/orders/order-cx-notification.admin.routes.js"
);
await app.register(orderCxNotificationAdminRoutes, { prefix: "/v1/admin/orders" });
const { offersInternalRoutes } = await import("./modules/pricing/offers.internal.routes.js");
await app.register(offersInternalRoutes, { prefix: "/v1/internal" });
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
let orderAutoAcceptInterval: ReturnType<typeof setInterval> | null = null;
let rideSearchTimeoutInterval: ReturnType<typeof setInterval> | null = null;
let orderDispatchWaveInterval: ReturnType<typeof setInterval> | null = null;
let competitorSnapshotsInterval: ReturnType<typeof setInterval> | null = null;
let etaLiveTickInterval: ReturnType<typeof setInterval> | null = null;
let subscriptionRenewalInterval: ReturnType<typeof setInterval> | null = null;
let merchantSubscriptionRenewalInterval: ReturnType<typeof setInterval> | null = null;
let riderLocationMaintenanceInterval: ReturnType<typeof setInterval> | null = null;
let riderTrackingWatchdogInterval: ReturnType<typeof setInterval> | null = null;
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
  if (orderAutoAcceptInterval) { clearInterval(orderAutoAcceptInterval); orderAutoAcceptInterval = null; }
  if (rideSearchTimeoutInterval) { clearInterval(rideSearchTimeoutInterval); rideSearchTimeoutInterval = null; }
  if (orderDispatchWaveInterval) { clearInterval(orderDispatchWaveInterval); orderDispatchWaveInterval = null; }
  if (competitorSnapshotsInterval) { clearInterval(competitorSnapshotsInterval); competitorSnapshotsInterval = null; }
  if (etaLiveTickInterval) { clearInterval(etaLiveTickInterval); etaLiveTickInterval = null; }
  if (subscriptionRenewalInterval) { clearInterval(subscriptionRenewalInterval); subscriptionRenewalInterval = null; }
  if (merchantSubscriptionRenewalInterval) { clearInterval(merchantSubscriptionRenewalInterval); merchantSubscriptionRenewalInterval = null; }
  if (riderLocationMaintenanceInterval) { clearInterval(riderLocationMaintenanceInterval); riderLocationMaintenanceInterval = null; }
  if (riderTrackingWatchdogInterval) { clearInterval(riderTrackingWatchdogInterval); riderTrackingWatchdogInterval = null; }

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
  if (isTransientDbError(reason) || isDbConnectionError(reason)) {
    app.log.warn({ reason }, "Transient DB rejection (ignored)");
    // Do not resetDbPool() here — postgres.js idle cleanup rejects must not
    // tear down sockets still used by in-flight API requests.
    return;
  }
  app.log.error({ reason, promise }, "Unhandled rejection");
  gracefulShutdown("unhandledRejection");
});

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info({ port: env.PORT, env: env.NODE_ENV }, "Server started successfully");

  /**
   * Background ticks — disabled entirely when DISABLE_BACKGROUND_JOBS=true (local dev).
   * In production, store schedule + order timeouts + dispatch must run without apps open.
   * Redis locks prevent duplicate runs across replicas.
   */
  if (env.DISABLE_BACKGROUND_JOBS) {
    app.log.warn(
      "All background ticks disabled via DISABLE_BACKGROUND_JOBS (reduces local DB pool load)"
    );
  } else {
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
    // Prefer slightly staggered first runs so a cold pooler isn't hit by every tick at t=0.
    void runScheduleTickLocked();
    storeScheduleInterval = setInterval(() => { void runScheduleTickLocked(); }, scheduleIntervalMs);
    app.log.info({ intervalSeconds: 30 }, "store schedule tick started (auto open/close from operating hours)");

  // Notification scheduled-campaign poller — picks up due scheduled campaigns
  // (status='scheduled' AND scheduled_at <= now()) and dispatches them via
  // NotificationService. Redis lock ensures only one backend replica polls.
  void startScheduledPoller().catch((err) => app.log.error({ err }, "notification_scheduled_poller_start_failed"));
  app.log.info("notification scheduled poller started");

  void startNotificationRetryPoller().catch((err) =>
    app.log.error({ err }, "notification_retry_poller_start_failed"),
  );
  app.log.info("notification retry poller started");

  void startReminderPoller().catch((err) =>
    app.log.error({ err }, "notification_reminder_poller_start_failed"),
  );
  app.log.info("notification reminder poller started");

  // Wire domain events → notification templates.
  registerDomainEventHandlers();

  // Verification background workers — R2 mirror + retry queue.
  // Skip locked; running multiple backend replicas is safe.
  const verificationTickMs = 60_000; // 1 min — small enough for the 24h S3 URL expiry pressure
  setInterval(async () => {
    try {
      const { runR2MirrorTick } = await import("./modules/verification/workers/r2-mirror.js");
      const r = await runR2MirrorTick(app.log, 20);
      if (r.scanned > 0) app.log.info(r, "verification_r2_mirror_tick");
    } catch (e) {
      app.log.warn({ err: (e as Error).message }, "verification_r2_mirror_tick_error");
    }
    try {
      const { runRetryQueueTick } = await import("./modules/verification/workers/retry-queue.js");
      const r = await runRetryQueueTick(app.log, 10);
      if (r.scanned > 0) app.log.info(r, "verification_retry_tick");
    } catch (e) {
      app.log.warn({ err: (e as Error).message }, "verification_retry_tick_error");
    }
  }, verificationTickMs);
  app.log.info({ intervalMs: verificationTickMs }, "verification workers started");

  const orderAcceptanceIntervalMs = 10_000;
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
  app.log.info({ intervalSeconds: 10 }, "order acceptance timeout tick started (auto-cancel + server auto-accept)");

  // Order auto-accept tick — every 10 s; lock TTL 20 s.
  // Added in MRC merge: server-side auto-accept of new orders when the
  // merchant has enabled auto-accept on store_operations.
  const orderAutoAcceptIntervalMs = 10_000;
  const runAutoAcceptTickLocked = () =>
    withLock("tick:order-auto-accept", 20_000, () => runOrderAutoAcceptTick(app.log))
      .then((result) => {
        incrCounter(
          "tick_runs_total",
          "Polling tick outcomes by lock state",
          1,
          { tick: "order_auto_accept", outcome: result === null ? "skipped" : "ran" },
        );
      })
      .catch((err) => app.log.error({ err }, "order_auto_accept_tick"));
  // Stagger first fire so cold-start ticks don't stampede the pooler together.
  setTimeout(() => { void runAutoAcceptTickLocked(); }, 1_500);
  orderAutoAcceptInterval = setInterval(() => { void runAutoAcceptTickLocked(); }, orderAutoAcceptIntervalMs);
  app.log.info({ intervalMs: orderAutoAcceptIntervalMs }, "order auto-accept tick started");

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
  setTimeout(() => { void runRideSearchTickLocked(); }, 3_000);
  rideSearchTimeoutInterval = setInterval(() => { void runRideSearchTickLocked(); }, rideSearchTimeoutIntervalMs);

  // Rider tracking watchdog — sweeps active pre-pickup sessions for location-off /
  // no-movement / opposite-direction and warns the rider every N min per the
  // per-service auto-cancel config. Detection + warnings only (Phase B); the
  // auto-cancel + penalty step ships in Phase C. Inert until a service is enabled.
  const riderTrackingWatchdogIntervalMs = 60_000;
  const runRiderTrackingWatchdogLocked = () =>
    withLock("tick:rider-tracking-watchdog", 55_000, () => runRiderTrackingWatchdogTick(app.log))
      .then((result) => {
        incrCounter(
          "tick_runs_total",
          "Polling tick outcomes by lock state",
          1,
          { tick: "rider_tracking_watchdog", outcome: result === null ? "skipped" : "ran" },
        );
      })
      .catch((err) => app.log.error({ err }, "rider_tracking_watchdog_tick"));
  setTimeout(() => { void runRiderTrackingWatchdogLocked(); }, 8_000);
  riderTrackingWatchdogInterval = setInterval(() => { void runRiderTrackingWatchdogLocked(); }, riderTrackingWatchdogIntervalMs);

  // Referral reward queue poller (every 30s) + daily reconciliation (every 6h)
  const runReferralQueueTickLocked = () =>
    withLock("tick:referral-reward-queue", 25_000, async () => {
      const { processReferralRewardJobs } = await import("./modules/referral/referral.queue.js");
      return processReferralRewardJobs({ limit: 25 });
    })
      .then((result) => {
        incrCounter(
          "tick_runs_total",
          "Polling tick outcomes by lock state",
          1,
          { tick: "referral_reward_queue", outcome: result === null ? "skipped" : "ran" },
        );
      })
      .catch((err) => app.log.error({ err }, "referral_reward_queue_tick"));
  setTimeout(() => { void runReferralQueueTickLocked(); }, 8_000);
  setInterval(() => { void runReferralQueueTickLocked(); }, 30_000);

  const runReferralReconcileTickLocked = () =>
    withLock("tick:referral-reconcile", 120_000, async () => {
      const { runReferralReconciliation } = await import("./modules/referral/referral.queue.js");
      return runReferralReconciliation();
    })
      .then((result) => {
        incrCounter(
          "tick_runs_total",
          "Polling tick outcomes by lock state",
          1,
          { tick: "referral_reconcile", outcome: result === null ? "skipped" : "ran" },
        );
      })
      .catch((err) => app.log.error({ err }, "referral_reconcile_tick"));
  setTimeout(() => { void runReferralReconcileTickLocked(); }, 60_000);
  setInterval(() => { void runReferralReconcileTickLocked(); }, 6 * 60 * 60 * 1000);

  // Prevent Services expiry — flips a rule whose `ends_at` has passed to
  // 'expired'. The runtime check is already time-correct without this, but the
  // status write bumps prevent_service_signals, which is what pushes the apps
  // to refetch instantly instead of waiting for their polling interval.
  const preventServicesExpiryIntervalMs = 20_000;
  const runPreventServicesExpiryTickLocked = () =>
    withLock("tick:prevent-services-expiry", 30_000, async () => {
      const { expireDuePreventServiceRules } = await import(
        "./modules/prevent-services/index.js"
      );
      return expireDuePreventServiceRules();
    })
      .then((result) => {
        incrCounter(
          "tick_runs_total",
          "Polling tick outcomes by lock state",
          1,
          { tick: "prevent_services_expiry", outcome: result === null ? "skipped" : "ran" },
        );
        if (result != null && result > 0) {
          app.log.info({ expired: result }, "prevent_services_expiry_tick");
        }
      })
      .catch((err) => app.log.error({ err }, "prevent_services_expiry_tick"));
  setTimeout(() => { void runPreventServicesExpiryTickLocked(); }, 6_000);
  setInterval(() => {
    void runPreventServicesExpiryTickLocked();
  }, preventServicesExpiryIntervalMs);

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
  setTimeout(() => { void runDispatchWaveTickLocked(); }, 4_500);
  orderDispatchWaveInterval = setInterval(() => {
    void runDispatchWaveTickLocked();
  }, orderDispatchWaveIntervalMs);
  app.log.info({ intervalMs: orderDispatchWaveIntervalMs }, "order dispatch wave tick started");

  {
    // Payment reconciler — driven by services/payment-worker via BullMQ
    // when RECONCILER_LEGACY_TICK_ENABLED=false (recommended in production).
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
        // The lifecycle tick supersedes processMerchantSubscriptionRenewals —
        // it does the same renewal work PLUS logs every attempt to
        // merchant_subscription_renewal_attempts, sends 3-day reminders,
        // sends renewal success/failure emails, and sends expired notices.
        // All passes are idempotent (dedupe_key + UNIQUE constraints).
        const { runMerchantSubscriptionLifecycleTick } = await import(
          "./modules/merchant-partner/merchant-subscription-lifecycle.js"
        );
        return runMerchantSubscriptionLifecycleTick();
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

    const riderLocationMaintenanceHours = env.RIDER_LOCATION_MAINTENANCE_INTERVAL_HOURS;
    const riderLocationMaintenanceIntervalMs = riderLocationMaintenanceHours * 60 * 60 * 1000;
    const riderLocationMaintenanceLockMs = riderLocationMaintenanceIntervalMs + 15 * 60 * 1000;
    const runRiderLocationMaintenanceLocked = () =>
      withLock("tick:rider-location-maintenance", riderLocationMaintenanceLockMs, async () => {
        const { runRiderLocationMaintenanceTick } = await import(
          "./lib/rider-location-maintenance.js"
        );
        return runRiderLocationMaintenanceTick();
      })
        .then((result) => {
          if (result) {
            app.log.info(result, "rider_location_maintenance_tick");
          }
        })
        .catch((err) => app.log.error({ err }, "rider_location_maintenance_tick"));
    void runRiderLocationMaintenanceLocked();
    riderLocationMaintenanceInterval = setInterval(() => {
      void runRiderLocationMaintenanceLocked();
    }, riderLocationMaintenanceIntervalMs);
    app.log.info(
      { intervalHours: riderLocationMaintenanceHours },
      "rider location maintenance tick started"
    );
  }
  }
} catch (error) {
  app.log.error({ error }, "Failed to start server");
  process.exit(1);
}


