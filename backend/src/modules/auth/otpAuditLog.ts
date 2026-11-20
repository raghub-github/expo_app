/**
 * Structured OTP SMS audit events — never log OTP codes, auth keys, or full phone numbers.
 */

import { randomUUID } from "crypto";
import { phoneKey } from "./otpSendGuard.js";

export type OtpTriggerSource =
  | "user_initiated"
  | "automatic_app_trigger"
  | "backend_retry"
  | "scheduled_background"
  | "suspected_abuse"
  | "supabase_send_sms_hook"
  | "direct_otp_request"
  | "merchant_action_otp"
  | "unknown";

export type OtpAuditEvent = {
  correlationId: string;
  timestamp: string;
  maskedPhone: string;
  endpoint: string;
  triggerSource: OtpTriggerSource;
  userId?: string;
  deviceOrSessionId?: string;
  /** Privacy-safe: last octet zeroed for IPv4, truncated for IPv6. */
  ipFingerprint?: string;
  result: "sent" | "blocked" | "failed" | "skipped";
  msg91Status?: string;
  rateLimitDecision?: string;
  duplicateDetected?: boolean;
  detail?: string;
};

export function maskPhoneForAudit(phone: string): string {
  const key = phoneKey(phone);
  if (key.length < 4) return "**********";
  return `******${key.slice(-4)}`;
}

export function fingerprintIp(ip: string | null | undefined): string | undefined {
  const raw = String(ip ?? "").trim();
  if (!raw) return undefined;
  if (raw.includes(".")) {
    const parts = raw.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (raw.includes(":")) {
    return raw.split(":").slice(0, 4).join(":") + "::";
  }
  return "unknown";
}

export function newOtpCorrelationId(): string {
  return randomUUID();
}

type LogLike = {
  info?: (o: unknown, m?: string) => void;
  warn?: (o: unknown, m?: string) => void;
};

export function logOtpAudit(log: LogLike | undefined, event: OtpAuditEvent): void {
  const payload = { ...event, audit: "otp_sms" as const };
  if (event.result === "sent") {
    log?.info?.(payload, "[otp-audit] sms");
  } else {
    log?.warn?.(payload, "[otp-audit] sms");
  }
  if (process.env.NODE_ENV !== "production" && !log) {
    // eslint-disable-next-line no-console
    console.log("[otp-audit]", JSON.stringify(payload));
  }
}
