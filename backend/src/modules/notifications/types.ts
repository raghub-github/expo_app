/**
 * Types shared across the notification module.
 *
 * All consumer modules import from here; this is the contract layer between
 * controllers, NotificationService, providers, and the DB.
 */

export type NotificationRole =
  | "customer"
  | "merchant"
  | "rider"
  | "admin"
  | "manager"
  | "support"
  | "all";

export type NotificationChannel = "push" | "in_app" | "browser" | "socket" | "all";

export type NotificationPriority = "low" | "normal" | "high" | "critical";

export type NotificationPlatform = "android" | "ios" | "web";

export type NotificationStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "clicked"
  | "failed"
  | "expired";

export type NotificationCategory =
  | "order"
  | "payment"
  | "kyc"
  | "wallet"
  | "marketing"
  | "system"
  | "account"
  | "operational"
  | "announcement"
  | "emergency";

/** Row shape mirroring notification_templates table. */
export type NotificationTemplate = {
  id: number;
  code: string;
  category: NotificationCategory | string;
  role: NotificationRole;
  channel: NotificationChannel;
  title_template: string;
  body_template: string;
  image_url: string | null;
  icon_url: string | null;
  deep_link: string | null;
  click_action: string | null;
  priority: NotificationPriority;
  sound: string | null;
  vibration: boolean;
  buttons: Array<{ label: string; action: string; deepLink?: string }> | null;
  variables_schema: Record<string, string>;
  locale: string;
  version: number;
  enabled: boolean;
  retry_count: number;
  expiry_seconds: number;
  silent: boolean;
  collapse_key: string | null;
};

/** Variables to substitute into a template. Values stringified at render. */
export type TemplateVariables = Record<string, string | number | boolean | null | undefined>;

/**
 * Target filter shape — JSONB column in notification_campaigns. The
 * targetResolver walks this and produces a list of (userId, role) pairs.
 */
/**
 * Optional geo overlay. Any of city / lat+lng may be set:
 *  - city only → match by city name
 *  - lat+lng only → match within radius_km of the point
 *  - both → must match city AND (when coords exist) fall inside the radius
 */
export type TargetGeoFilter = {
  city?: string;
  lat?: number;
  lng?: number;
  /** Defaults to 25 km when lat/lng are set. */
  radius_km?: number;
};

export type TargetFilter =
  | { user_ids: string[] }
  | { user_id: string }
  | {
      role: NotificationRole;
      city?: string;
      zone?: string;
      status?: string;
      lat?: number;
      lng?: number;
      radius_km?: number;
    }
  | { topic: string }
  | { store_id: number }
  /** Multiple merchant outlets (comma-separated store picker). */
  | { store_ids: number[] }
  /**
   * City / coordinate audience. Optional `role` narrows to one app;
   * omit → customers + merchants + riders in that area.
   */
  | ({ geo: true; role?: NotificationRole } & TargetGeoFilter)
  | { order_id: string }
  | { device_token: string }
  | { device_tokens: string[] }
  | { all_customers: true }
  | { all_merchants: true }
  | { all_riders: true }
  | { all_active: true }
  | { all_inactive: true }
  | { subscription_status: "active" | "expiring" | "expired" }
  | { blacklisted: true };

/**
 * The high-level "send this notification" intent. Controllers build this
 * and hand it to NotificationService; everything else flows from here.
 */
export type SendIntent = {
  /** Which template (by code) to render. */
  templateCode: string;
  /** Variables to substitute into title/body/deepLink. */
  variables?: TemplateVariables;
  /** Who receives it. */
  target: TargetFilter;
  /** Override locale (defaults to user's locale or 'en'). */
  locale?: string;
  /** Override priority. */
  priority?: NotificationPriority;
  /** Optional campaign id this send belongs to (for analytics rollup). */
  campaignId?: number;
  /** Idempotency key — if set, NotificationService de-dups against logs. */
  idempotencyKey?: string;
  /** Extra metadata persisted on the log row for analytics. */
  metadata?: Record<string, unknown>;
  /**
   * Limit delivery channels for this send. When omitted, the template channel is used.
   * Use "push" when the in-app inbox row is written separately (avoids twin Partner/App cards).
   */
  channel?: NotificationChannel;
  /** Campaign-level title/body/image/deep-link overrides (applied after template render). */
  overrides?: {
    title?: string | null;
    body?: string | null;
    imageUrl?: string | null;
    deepLink?: string | null;
  };
  /**
   * When true, skip quiet-hours gating (admin “Send now” / Resend).
   * Scheduled poller leaves this unset so automated marketing still respects the window.
   */
  bypassQuietHours?: boolean;
  /**
   * When true, deliver Expo pushes inline (wait for Expo/FCM ticket acceptance)
   * instead of only enqueueing to Redis. Required for Super Admin "Send now"
   * so success means the provider accepted the message.
   */
  deliverNow?: boolean;
};

/** Result of one send across all resolved recipients. */
export type SendResult = {
  campaignId?: number;
  /** Recipients accepted by Expo/FCM (or successfully enqueued when deliverNow=false). */
  queued: number;
  skipped: number;          // due to preferences, opt-out, no token, etc.
  failedSync: number;       // hard fail before / during provider send
  /** Provider-accepted count (Expo ticket ok / FCM send ok). */
  accepted?: number;
  /** Provider-rejected count. */
  failedProvider?: number;
  notificationIds: string[]; // notification_logs.notification_id UUIDs
  /** Why a campaign produced zero deliveries (quiet hours, empty audience, etc.). */
  skipReason?: "no_recipients" | "quiet_hours" | "template_missing" | string;
  /** Soft advisory (e.g. in-app only because no push tokens). */
  warning?: string;
};

/** Resolved per-recipient delivery descriptor (one row in notification_logs). */
export type Recipient = {
  userId: string;
  role: NotificationRole;
  deviceToken: string;
  deviceId: string | null;
  platform: NotificationPlatform;
};

/** Provider response shape — used by NotificationService to update logs. */
export type ProviderSendResult = {
  notificationId: string;
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
  /** FCM message id when accepted (not logged to clients). */
  messageId?: string;
};
