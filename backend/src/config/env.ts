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

  // Firebase Admin (backend-only; used to verify Firebase ID tokens in dev flow)
  FIREBASE_PROJECT_ID: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  FIREBASE_CLIENT_EMAIL: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  FIREBASE_PRIVATE_KEY: z.preprocess(emptyToUndefined, z.string().min(30).optional()),

  // Webhook signature secrets (backend-only)
  WEBHOOK_SIGNING_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),

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
   * Dev helper: disable background intervals (store schedule tick + payment reconciler).
   * Use when DATABASE_URL is unreachable so local API debugging isn't spammed by ETIMEDOUT/ECONNRESET.
   */
  DISABLE_BACKGROUND_JOBS: z.preprocess(
    (v) => v === true || v === "true" || v === "1",
    z.boolean()
  ).default(false),

  // Distance / routing (backend-only; shared by Customer, Rider, Merchant apps)
  OSRM_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  MAPBOX_ACCESS_TOKEN: z.preprocess(emptyToUndefined, z.string().min(20).optional()),
  REDIS_URL: z.preprocess(emptyToUndefined, z.string().min(10).optional()),

  /** OpenWeather — backend-only. Mobile apps must use /v1/weather/* endpoints. */
  OPENWEATHER_API_KEY: z.preprocess(emptyToUndefined, z.string().min(10).optional()),

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

  /** Secret for POST /v1/push/send-notification (dashboard / internal). */
  PUSH_NOTIFICATION_ADMIN_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
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


