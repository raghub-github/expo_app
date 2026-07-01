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
export type TargetFilter =
  | { user_ids: string[] }
  | { user_id: string }
  | { role: NotificationRole; city?: string; zone?: string; status?: string }
  | { topic: string }
  | { store_id: number }
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
};

/** Result of one send across all resolved recipients. */
export type SendResult = {
  campaignId?: number;
  queued: number;
  skipped: number;          // due to preferences, opt-out, no token, etc.
  failedSync: number;       // hard fail before enqueue
  notificationIds: string[]; // notification_logs.notification_id UUIDs
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
};
