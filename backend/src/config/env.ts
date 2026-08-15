import { z } from "zod";

function emptyToUndefined(v: unknown) {
  if (typeof v !== "string") return v;
  const s = v.trim();
  return s.length === 0 ? undefined : s;
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  // Public
  API_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),

  // Database
  DATABASE_URL: z.string().min(10),
  /** Seconds to establish a new TCP connection (pooler / slow networks may need >10). */
  DATABASE_CONNECT_TIMEOUT_SEC: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().max(120)
  ).optional(),
  /** Postgres.js pool size. Keep moderate in dev — Supabase pooler is easy to exhaust. */
  DATABASE_POOL_MAX: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().max(50)
  ).optional(),
  /** Max ms to wait for a DB concurrency slot before 503 (dev bursts / mobile parallel loads). */
  DATABASE_SLOT_ACQUIRE_TIMEOUT_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().max(120_000)
  ).optional(),
  /**
   * Hold one DB slot for the full lifetime of each HTTP request.
   * Default off — request-lifetime slots cause database_slot_timeout under polling load.
   * Postgres pool max is the connection limit; use withDbSlot() around heavy DB only.
   */
  DATABASE_REQUEST_SLOTS: z.preprocess(
    (v) => v === true || v === "true" || v === "1",
    z.boolean()
  ).default(false),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  SUPABASE_JWT_SECRET: z.string().min(20),

  // MSG91 (backend-only)
  MSG91_AUTH_KEY: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  MSG91_TEMPLATE_ID: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  MSG91_WIDGET_ID: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  MSG91_OTP_EXPIRY_SEC: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(300)),
  MSG91_TOKENAUTH: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  MSG91_SENDER_ID: z.preprocess(emptyToUndefined, z.string().min(2).optional()),
  MSG91_OTP_VAR_NAME: z.preprocess(emptyToUndefined, z.string().min(2).optional()),
  MSG91_FLOW_ID: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  SUPABASE_SEND_SMS_HOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(10).optional()),

  // SMTP (optional — customer email verification OTP)
  SMTP_HOST: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(587)),
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SMTP_PASS: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SMTP_FROM: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  SMTP_SECURE: z.preprocess(
    (v) => v === true || v === "true" || v === "1",
    z.boolean()
  ).default(false),

  // Firebase Admin (backend-only) — used for both Firebase Auth ID-token verification
  // AND FCM v1 messaging. Three credential sources are supported, in priority:
  //   1. GOOGLE_APPLICATION_CREDENTIALS — file path to a serviceAccountKey.json
  //   2. FCM_SERVICE_ACCOUNT_JSON       — full JSON contents as a single line string
  //   3. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY trio (legacy)
  // The singleton in src/config/firebase.ts resolves these in order.
  GOOGLE_APPLICATION_CREDENTIALS: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  FCM_SERVICE_ACCOUNT_JSON: z.preprocess(emptyToUndefined, z.string().min(40).optional()),
  FIREBASE_PROJECT_ID: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  FIREBASE_CLIENT_EMAIL: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  FIREBASE_PRIVATE_KEY: z.preprocess(emptyToUndefined, z.string().min(30).optional()),

  // Webhook signature secrets (backend-only)
  WEBHOOK_SIGNING_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),

  // Internal server-to-server secret — same key already used by partnersite +
  // dashboard for the store-schedule-tick endpoint. Notifications module reuses
  // it so dashboard proxies can call admin routes without JWT forwarding.
  BACKEND_SCHEDULE_TICK_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),

  // Notification system v2 feature flag. When FALSE (default), the new
  // NotificationService.send() code path still runs — but if any part of it
  // fails, callers fall back to the legacy enqueuePush behaviour. When TRUE
  // in prod, treat v2 as authoritative.
  NOTIFICATIONS_V2_ENABLED: z
    .preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.enum(["true", "false"]).optional())
    .transform((v) => v === "true")
    .default(false),

  /**
   * Push delivery mode for Expo tokens.
   * - "1" / "true" / unset (default): enqueue to Redis BullMQ `q.push.send`
   *   (requires notification-worker + REDIS_URL); falls back to inline if enqueue fails
   * - "0" / "false": send inline via Expo Push API only
   */
  PUSH_USE_QUEUE: z
    .preprocess((v) => {
      if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
        return "1";
      }
      return typeof v === "string" ? v.trim() : v;
    }, z.enum(["0", "1", "true", "false"]).optional())
    .transform((v) => v !== "0" && v !== "false")
    .default(true),

  /** Optional Expo Push access token (recommended for production / higher rate limits). */
  EXPO_ACCESS_TOKEN: z.preprocess(emptyToUndefined, z.string().min(10).optional()),

  // Cloudflare R2 (backend-only)
  R2_TOKEN_VALUE: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  R2_BUCKET_NAME: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  R2_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  R2_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  R2_REGION: z.preprocess(emptyToUndefined, z.string().default("auto")),
  R2_ENDPOINT: z.preprocess(emptyToUndefined, z.string().url().optional()),
  R2_ACCOUNT_ID: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  R2_PUBLIC_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),

  // Razorpay (backend-only)
  RAZORPAY_KEY_ID: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  RAZORPAY_KEY_SECRET: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  RAZORPAY_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(10).optional()),

  /**
   * Dummy payment mode — bypasses Razorpay entirely. When true the /create-order
   * endpoint returns synthetic order/key IDs and the customer app shows a
   * "Simulate Success / Simulate Failure" sheet. The existing finalize flow
   * (signature check, order creation, merchant + rider + push notifications,
   * ledger, realtime) is unchanged — only the gateway call is stubbed.
   *
   * Also relaxes the production guard for missing RAZORPAY_* secrets, so
   * preview/production builds can run end-to-end without a real Razorpay account.
   */
  PAYMENT_DUMMY_MODE: z.preprocess(
    (v) => v === true || v === "true" || v === "1",
    z.boolean()
  ).default(false),

  /**
   * Hard TTL (ms) between the user starting a payment and us considering the
   * attempt stale. Past this point the reconciler will auto-refund any captured
   * payment (customer has likely reordered elsewhere) and fail the pending
   * order so the app can unlock the cart. Default 10 minutes.
   */
  PAYMENT_CONFIRM_WINDOW_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().max(60 * 60_000)
  ).default(10 * 60_000),

  /**
   * How many seconds between two reconciler sweeps. The reconciler polls
   * Razorpay for any pending_confirmation row whose paymentConfirmBy has
   * elapsed, so we don't need this to be aggressive — 30s is cheap and
   * bounded. Exposed for load-test tuning.
   */
  PAYMENT_RECONCILER_INTERVAL_SEC: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().max(600)
  ).default(30),

  /**
   * Shared secret the payment-worker presents on /v1/internal/* calls.
   * Required when the worker is running; the backend rejects the call with
   * 503 if missing so misconfig doesn't look like an auth bug.
   */
  INTERNAL_API_TOKEN: z.preprocess(emptyToUndefined, z.string().min(8).optional()),

  /**
   * Optional secondary JWT secret used during a rotation window.
   *
   * Rotation procedure (zero session loss):
   *   1. Generate NEW_SECRET. Deploy with SUPABASE_JWT_SECRET=NEW_SECRET and
   *      SUPABASE_JWT_SECRET_PREVIOUS=<old>. Existing tokens still verify
   *      against the previous; new sign-ins use the current.
   *   2. Wait for token TTL to elapse (usually 1–7 days).
   *   3. Remove SUPABASE_JWT_SECRET_PREVIOUS from env.
   *
   * If unset, only the current secret is consulted (existing behavior).
   */
  SUPABASE_JWT_SECRET_PREVIOUS: z.preprocess(emptyToUndefined, z.string().min(20).optional()),

  /**
   * When true, the backend continues to run its setInterval-based reconciler
   * (with Stage 1's distributed lock) as a belt-and-braces fallback. When
   * false (recommended once payment-worker is deployed), the worker is the
   * sole driver of reconcile ticks.
   */
  RECONCILER_LEGACY_TICK_ENABLED: z.preprocess(
    emptyToUndefined,
    z.coerce.boolean()
  ).default(true),

  /**
   * What to do if we find a late-but-captured payment after the TTL elapsed:
   *   - refund (default): customer very likely reordered elsewhere, return the
   *     money and mark pending as failed/refunded.
   *   - finalize: late-but-still-valid — place the order anyway. Only use this
   *     if your merchant flow can tolerate delayed order ingestion.
   */
  PAYMENT_LATE_CAPTURE_POLICY: z.preprocess(
    emptyToUndefined,
    z.enum(["refund", "finalize"])
  ).default("refund"),

  /**
   * Dev helper: disable all in-process background ticks (store schedule, order timeouts,
   * dispatch waves, payment reconciler, weather, ETA, etc.). Use locally to reduce DB load.
   */
  DISABLE_BACKGROUND_JOBS: z.preprocess(
    (v) => v === true || v === "true" || v === "1",
    z.boolean()
  ).default(false),

  // Distance / routing (backend-only; shared by Customer, Rider, Merchant apps)
  OSRM_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  MAPBOX_ACCESS_TOKEN: z.preprocess(emptyToUndefined, z.string().min(20).optional()),
  /** Public live trip share page base, e.g. https://track.gatimitra.com/trip */
  TRACK_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /** Public address share link base, e.g. https://gatimitra.com */
  ADDRESS_LINK_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /**
   * Android App Links verification: SHA-256 signing-cert fingerprint(s) for the
   * Customer App, comma-separated. Powers /.well-known/assetlinks.json. List
   * both the Play "app signing" and "upload" certs. See lib/assetlinks.ts.
   */
  ANDROID_APP_LINK_SHA256: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Customer App package name for assetlinks.json (defaults to com.gatimitra.customer). */
  ANDROID_APP_PACKAGE: z.preprocess(emptyToUndefined, z.string().optional()),
  /**
   * Rider App App-Links verification (referral invites on /rider-ref). Separate
   * signing keys from the customer app, so it needs its own fingerprint list.
   */
  ANDROID_RIDER_APP_LINK_SHA256: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Rider App package name for assetlinks.json. */
  ANDROID_RIDER_APP_PACKAGE: z.preprocess(emptyToUndefined, z.string().optional()),
  REDIS_URL: z.preprocess(emptyToUndefined, z.string().min(10).optional()),

  /** Open-Meteo — no API key (see weather.constants.ts). */

  /**
   * Legacy flag; billing always runs for checkout. Kept for dashboards/scripts that read env.
   */
  BILLING_RULES_ENABLED: z.preprocess(
    (v) => v === true || v === "true" || v === "1",
    z.boolean()
  ).default(true),

  /**
   * Floor (INR) for delivery when route distance > 0, applied after rules + geo/rate-card + default fallback.
   */
  DELIVERY_MIN_FEE_INR: z.preprocess(emptyToUndefined, z.coerce.number().nonnegative()).optional(),

  /**
   * When no rule/geo/rate-card/legacy per-km yields a fee, use max(base, per_km × distance_km).
   * Defaults in code: 25 and 5 when unset.
   */
  DELIVERY_DEFAULT_BASE_INR: z.preprocess(emptyToUndefined, z.coerce.number().nonnegative()).optional(),
  DELIVERY_DEFAULT_PER_KM_INR: z.preprocess(emptyToUndefined, z.coerce.number().nonnegative()).optional(),

  /**
   * Platform-wide fallback service radius (km) when a store has no delivery_radius_km set.
   * Used by the canonical `/v1/distance/store-quote` engine and billing to decide `serviceable`.
   */
  SERVICE_RADIUS_KM_DEFAULT: z.preprocess(emptyToUndefined, z.coerce.number().positive().max(200)).default(15),

  /**
   * When a customer has an active saved delivery address, keep it if live GPS is still
   * within this radius (meters). Beyond it, reconcile switches to Current Location.
   * Default 500m when unset; set e.g. 300 in .env to override.
   */
  ACTIVE_SAVED_ADDRESS_RETENTION_RADIUS_M: z.preprocess(
    emptyToUndefined,
    z.coerce.number().positive().max(50_000)
  ).default(500),

  /** Enable progressive slab-based delivery pricing (geo-inherited) when a billing rule selects it. */
  DELIVERY_SLABS_V2_ENABLED: z.preprocess(
    (v) => v === true || v === "true" || v === "1",
    z.boolean()
  ).default(true),

  /**
   * Optional tax injection flags (only used when DB tax configs don't already cover the base).
   * Keeps behavior DB-driven by default, but allows safe rollout via env.
   */
  APPLY_GST_ON_DELIVERY_FEE: z.preprocess(
    (v) => v === true || v === "true" || v === "1",
    z.boolean()
  ).default(false),
  /** Percent (e.g. 5 = 5%). Used only when APPLY_GST_ON_DELIVERY_FEE is true. */
  DELIVERY_FEE_GST_PERCENT: z.preprocess(emptyToUndefined, z.coerce.number().nonnegative().max(100)).optional(),

  APPLY_GST_ON_PACKAGING: z.preprocess(
    (v) => v === true || v === "true" || v === "1",
    z.boolean()
  ).default(false),
  /**
   * Packaging GST mode:
   * - same_as_item: use the effective item GST rate (sum of item-group tax config rates) as packaging GST rate.
   */
  PACKAGING_GST_MODE: z.preprocess(emptyToUndefined, z.enum(["same_as_item"]).optional()),

  /** Optional: dashboard billing simulator calls POST /v1/billing/calculate without a customer JWT. */
  BILLING_SIM_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),

  /** Shadow-write OMS v2 snapshot/billing/ledger tables during finalize flow. */
  OMS_LEDGER_SHADOW_WRITE: z.preprocess(
    (v) => v === true || v === "true" || v === "1",
    z.boolean()
  ).default(true),

  /** Enable rider assignment v2 enforcement (active-assignment validation + assignment event API). */
  OMS_RIDER_ASSIGNMENT_V2: z.preprocess(
    (v) => v === true || v === "true" || v === "1",
    z.boolean()
  ).default(true),

  /** Read-path cutover marker for services that need v2 canonical reads. */
  OMS_READ_CANONICAL_V2: z.preprocess(
    (v) => v === true || v === "true" || v === "1",
    z.boolean()
  ).default(false),

  // -------- Cashfree Secure ID (see verification_provider_configs) --------
  // The active provider env (sandbox vs production) lives in the DB — these
  // vars only carry the credential material. Runtime resolves whichever
  // key pair matches verification_provider_configs.environment.
  CASHFREE_SANDBOX_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
  CASHFREE_SANDBOX_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  CASHFREE_PROD_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
  CASHFREE_PROD_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  /**
   * RSA public key from Cashfree dashboard (2FA → Public Key). Used to build
   * `x-cf-signature` so verification works without a static egress IP.
   * Accept PEM or raw base64 (whitespace/newlines stripped at use site).
   */
  CASHFREE_PUBLIC_AUTH_KEY: z.preprocess(emptyToUndefined, z.string().min(32).optional()),

  /** Secret for POST /v1/push/send-notification (dashboard / internal). */
  PUSH_NOTIFICATION_ADMIN_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),

  /** Days to retain sampled rider_location_events audit rows. */
  RIDER_LOCATION_EVENT_RETENTION_DAYS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().max(365)
  ).default(30),

  /** Background prune interval for rider_location_events (hours; default daily). */
  RIDER_LOCATION_MAINTENANCE_INTERVAL_HOURS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().max(168)
  ).default(24),

  /** Speed (m/s) at which rider app should use high-frequency GPS pings (~80 km/h). */
  RIDER_LOCATION_HIGH_SPEED_MPS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().positive().max(100)
  ).default(22),

  /**
   * MERCHANT + RIDER ("partner") app review login OTP bypass (Play Store / App
   * Store reviewers). Both apps sign in through the same backend OTP endpoints
   * with the same review phone, so ONE bypass serves both; verify's appType
   * routes to the correct pipeline (merchant session vs rider profile / KYC).
   *
   * Completely independent of the customer-app bypass below — separate flag,
   * separate phone, separate OTP. Neither falls back to the other.
   *
   * When all three are set AND `REVIEW_LOGIN_BYPASS_ENABLED=true`, the OTP
   * /request path skips the SMS provider for the single phone
   * `REVIEW_LOGIN_PHONE` and seeds the stored OTP as `REVIEW_LOGIN_FIXED_OTP`.
   * Verification continues through the existing pipeline — same expiry, same
   * attempt limits, same JWT / session / profile / onboarding / roles.
   *
   * Any other phone, or the flag set to false, behaves exactly as before
   * (real SMS via MSG91). Disabling is a single env flip — no code change.
   *
   * Security: server-only. Never returned in any API response, never logged in
   * full, never read by the client. The fixed OTP is only ever seeded for
   * `REVIEW_LOGIN_PHONE`, so it cannot authenticate any other number.
   */
  REVIEW_LOGIN_BYPASS_ENABLED: z.preprocess(
    (v) => v === true || v === "true" || v === "1",
    z.boolean()
  ).default(false),
  REVIEW_LOGIN_PHONE: z.preprocess(emptyToUndefined, z.string().min(10).max(20).optional()),
  REVIEW_LOGIN_FIXED_OTP: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^\d{4,8}$/).optional()
  ),

  /**
   * RIDER APP review login OTP bypass. Same mechanics as the merchant one above,
   * for a DIFFERENT review phone (rider reviewers use their own number). Fully
   * independent flag/phone/OTP — enabling or rotating it cannot affect merchant
   * or customer. The rider app signs in through the same backend OTP endpoints,
   * so verify's appType routes to the rider profile / onboarding / KYC pipeline.
   */
  RIDER_REVIEW_LOGIN_BYPASS_ENABLED: z.preprocess(
    (v) => v === true || v === "true" || v === "1",
    z.boolean()
  ).default(false),
  RIDER_REVIEW_LOGIN_PHONE: z.preprocess(emptyToUndefined, z.string().min(10).max(20).optional()),
  RIDER_REVIEW_LOGIN_FIXED_OTP: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^\d{4,8}$/).optional()
  ),

  /**
   * CUSTOMER APP review login OTP bypass. Same mechanics as the merchant one
   * above, for a different app and a different review phone. Independent flag.
   */
  GOOGLE_REVIEW_MODE: z.preprocess(
    (v) => v === true || v === "true" || v === "1",
    z.boolean()
  ).default(false),
  GOOGLE_REVIEW_PHONE: z.preprocess(emptyToUndefined, z.string().min(10).max(20).optional()),
  GOOGLE_REVIEW_OTP: z.preprocess(emptyToUndefined, z.string().regex(/^\d{4,8}$/).optional()),
});

export type Env = z.infer<typeof EnvSchema>;

export function getEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Keep the output readable and actionable in production logs.
    // Never print secrets; zod error output is safe.
    // eslint-disable-next-line no-console
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }

  // Production hard-requirements that we want to allow as optional for local dev
  // but MUST be present once NODE_ENV=production. These are checked here (not in
  // the schema) so dev startup is forgiving but production refuses to boot
  // without the security-critical secrets.
  if (parsed.data.NODE_ENV === "production" && !parsed.data.PAYMENT_DUMMY_MODE) {
    const missingProdSecrets: string[] = [];
    if (!parsed.data.RAZORPAY_KEY_ID) missingProdSecrets.push("RAZORPAY_KEY_ID");
    if (!parsed.data.RAZORPAY_KEY_SECRET) missingProdSecrets.push("RAZORPAY_KEY_SECRET");
    if (!parsed.data.RAZORPAY_WEBHOOK_SECRET) missingProdSecrets.push("RAZORPAY_WEBHOOK_SECRET");
    if (missingProdSecrets.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `Missing required production env vars: ${missingProdSecrets.join(", ")}. ` +
          `Without these, payments cannot run. Configure them in your secrets store and redeploy.`
      );
      throw new Error("Missing required production environment variables");
    }
  }

  return parsed.data;
}


