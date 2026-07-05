/**
 * Typed errors surfaced by the Cashfree provider.
 *
 * Every error carries a category we can act on: the service layer decides
 * "retry this?", "queue for manual review?", "kill switch?" based purely on
 * category. Route handlers translate categories into HTTP status codes.
 *
 * Live-observed error codes captured this session are documented at the
 * bottom of this file.
 */

export type CashfreeErrorCategory =
  | "auth"            // 401/403 — our credentials are wrong / IP not whitelisted
  | "invalid_input"   // 400 — request body malformed
  | "not_found"       // 404 — reference / IFSC / RC number does not exist
  | "rate_limit"      // 429
  | "insufficient_balance" // 422 with insufficient_balance code
  | "duplicate"       // 409 verification_id_already_exists (some products only)
  | "upstream_failed" // 422 failed_at_bank / provider says the doc is invalid at source
  | "provider_down"   // 5xx from Cashfree
  | "timeout"         // client-side abort
  | "network"         // fetch threw (DNS, TLS, connection reset)
  | "signature"       // bad HMAC on webhook
  | "not_enabled"     // "service not enabled for this account"
  | "unknown";

export class CashfreeError extends Error {
  constructor(
    public readonly category: CashfreeErrorCategory,
    message: string,
    public readonly status?: number,
    public readonly cfCode?: string,
    public readonly cfType?: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "CashfreeError";
  }

  /** Build a categorised error from a non-OK Cashfree response. */
  static fromResponse(status: number, body: unknown): CashfreeError {
    const b = (body as { message?: string; code?: string; type?: string; error?: string } | null) ?? null;
    const message = b?.message ?? b?.error ?? `Cashfree responded ${status}`;
    const code = b?.code ?? undefined;
    const type = b?.type ?? undefined;

    // Categorise on `code` first (most specific), fall back to HTTP status.
    if (code === "verification_id_already_exists") return new CashfreeError("duplicate", message, status, code, type, body);
    if (code === "insufficient_balance") return new CashfreeError("insufficient_balance", message, status, code, type, body);
    if (code === "failed_at_bank") return new CashfreeError("upstream_failed", message, status, code, type, body);
    if (code === "ip_validation_failed") return new CashfreeError("auth", message, status, code, type, body);
    if (code === "authentication_failed") return new CashfreeError("auth", message, status, code, type, body);
    if (code === "invalid_request" && /not enabled/i.test(message)) return new CashfreeError("not_enabled", message, status, code, type, body);

    if (status === 401 || status === 403) return new CashfreeError("auth", message, status, code, type, body);
    if (status === 404) return new CashfreeError("not_found", message, status, code, type, body);
    if (status === 409) return new CashfreeError("duplicate", message, status, code, type, body);
    if (status === 429) return new CashfreeError("rate_limit", message, status, code, type, body);
    if (status >= 500) return new CashfreeError("provider_down", message, status, code, type, body);
    if (status >= 400) return new CashfreeError("invalid_input", message, status, code, type, body);
    return new CashfreeError("unknown", message, status, code, type, body);
  }
}

/** Whether a category is worth retrying with a new verification_id. */
export function isRetryableCategory(cat: CashfreeErrorCategory): boolean {
  switch (cat) {
    case "provider_down":
    case "timeout":
    case "network":
    case "rate_limit":
    case "duplicate": // retry with a fresh verification_id
      return true;
    default:
      return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Live-observed error codes (sandbox, 2026-07-05) — for reference:
//
//   pan_length_short             validation_error   400
//   pan_missing                  validation_error   400
//   verification_id_missing      validation_error   400
//   udyam_missing                validation_error   400
//   verification_id_already_exists validation_error 409  (DL enforces; PAN silent)
//   failed_at_bank               validation_error   422  (BAV sandbox currently broken)
//   ifsc_not_found               not_found_error    404
//   invalid_request              validation_error   400  ("service not enabled")
//   ip_validation_failed         authentication     403
//   authentication_failed        authentication     401
//   api_error                    internal_error     500
//   verification_failed          internal_error     502
// ─────────────────────────────────────────────────────────────────────────────
