/**
 * Cashfree HTTP provider.
 *
 * Only file in the codebase that talks to the Cashfree API. Every product
 * from Phase 2 §C has a dedicated method here, receiving a typed request and
 * returning a raw `ProviderCall` (status + body + headers + timing) that the
 * adapter layer normalises into `NormalizedVerification`.
 *
 * Design:
 *   - Stateless. All config comes from `loadCashfreeConfig()` per call so
 *     ops changes take effect immediately.
 *   - Timeout enforced via AbortController.
 *   - Non-2xx responses throw a categorised `CashfreeError`.
 *   - `x-cf-signature` (public-key 2FA) intentionally NOT sent — merchants
 *     that opt in can add that later.
 */
import { CashfreeError } from "./errors.js";
import { loadCashfreeConfig, type CashfreeCredentials } from "./config.js";

export type ProviderCall<Res> = {
  path: string;
  method: "POST" | "GET";
  requestBody: unknown;
  status: number;
  responseBody: Res;
  responseHeaders: Record<string, string>;
  durationMs: number;
  configUsed: { env: string; configId: number };
};

async function doRequest<Res>(
  path: string,
  method: "POST" | "GET",
  body: unknown | null,
  cfg: CashfreeCredentials,
  signal?: AbortSignal,
): Promise<ProviderCall<Res>> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("cashfree_timeout")), cfg.timeoutMs);
  const merged = signal ? mergeSignals(controller.signal, signal) : controller.signal;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-client-id": cfg.clientId,
    "x-client-secret": cfg.clientSecret,
  };
  if (method === "POST") headers["Content-Type"] = "application/json";
  if (cfg.apiVersion) headers["x-api-version"] = cfg.apiVersion;

  let res: Response;
  try {
    res = await fetch(cfg.baseUrl + path, {
      method,
      headers,
      body: method === "POST" && body != null ? JSON.stringify(body) : undefined,
      signal: merged,
    });
  } catch (e) {
    clearTimeout(timer);
    const isAbort =
      (e as { name?: string })?.name === "AbortError" ||
      (e as Error)?.message?.includes("cashfree_timeout");
    if (isAbort) throw new CashfreeError("timeout", `Cashfree ${path} timed out after ${cfg.timeoutMs}ms`);
    throw new CashfreeError("network", (e as Error).message ?? "network_error");
  }
  clearTimeout(timer);

  // Only keep headers we care about — filter out auth / cookies from the archive.
  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    const key = k.toLowerCase();
    if (
      key === "x-ratelimit-remaining" ||
      key === "x-ratelimit-reset" ||
      key === "x-cf-request-id" ||
      key === "content-type" ||
      key === "date"
    ) {
      responseHeaders[key] = v;
    }
  });

  let parsed: unknown = null;
  const text = await res.text();
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 500) }; }
  }

  if (!res.ok) throw CashfreeError.fromResponse(res.status, parsed);

  return {
    path,
    method,
    requestBody: body,
    status: res.status,
    responseBody: parsed as Res,
    responseHeaders,
    durationMs: Date.now() - started,
    configUsed: { env: cfg.env, configId: cfg.configId },
  };
}

function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const anySignal = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anySignal === "function") return anySignal([a, b]);
  const c = new AbortController();
  const onAbort = () => c.abort();
  if (a.aborted) return a;
  if (b.aborted) return b;
  a.addEventListener("abort", onAbort);
  b.addEventListener("abort", onAbort);
  return c.signal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public typed methods — one per Cashfree product from Phase 2 §C.
// ─────────────────────────────────────────────────────────────────────────────

export const cashfree = {
  async verifyPan(
    body: { verification_id: string; pan: string; name?: string },
    opts: { signal?: AbortSignal } = {},
  ) {
    const cfg = await loadCashfreeConfig();
    return doRequest("/pan", "POST", body, cfg, opts.signal);
  },

  async verifyBankAccountSync(
    body: {
      verification_id: string;
      bank_account: string;
      ifsc: string;
      name?: string;
      phone?: string;
    },
    opts: { signal?: AbortSignal } = {},
  ) {
    const cfg = await loadCashfreeConfig();
    return doRequest("/bank-account/sync", "POST", body, cfg, opts.signal);
  },

  async verifyIfsc(
    body: { verification_id: string; ifsc: string },
    opts: { signal?: AbortSignal } = {},
  ) {
    const cfg = await loadCashfreeConfig();
    return doRequest("/ifsc", "POST", body, cfg, opts.signal);
  },

  async verifyDrivingLicence(
    body: { verification_id: string; dl_number: string; dob: string },
    opts: { signal?: AbortSignal } = {},
  ) {
    const cfg = await loadCashfreeConfig();
    return doRequest("/driving-license", "POST", body, cfg, opts.signal);
  },

  async verifyVehicleRc(
    body: { verification_id: string; vehicle_number: string },
    opts: { signal?: AbortSignal } = {},
  ) {
    const cfg = await loadCashfreeConfig();
    return doRequest("/vehicle-rc", "POST", body, cfg, opts.signal);
  },

  async verifyPassport(
    body: { verification_id: string; file_number: string; dob: string; name?: string },
    opts: { signal?: AbortSignal } = {},
  ) {
    const cfg = await loadCashfreeConfig();
    return doRequest("/passport", "POST", body, cfg, opts.signal);
  },

  async verifyGstin(
    body: { GSTIN: string; business_name?: string },
    opts: { signal?: AbortSignal } = {},
  ) {
    const cfg = await loadCashfreeConfig();
    return doRequest("/gstin", "POST", body, cfg, opts.signal);
  },

  async verifyCin(
    body: { verification_id: string; cin: string },
    opts: { signal?: AbortSignal } = {},
  ) {
    const cfg = await loadCashfreeConfig();
    return doRequest("/cin", "POST", body, cfg, opts.signal);
  },

  async createReversePennyDrop(
    body: { verification_id: string; name?: string; redirect_url?: string },
    opts: { signal?: AbortSignal } = {},
  ) {
    const cfg = await loadCashfreeConfig();
    return doRequest("/reverse-penny-drop", "POST", body, cfg, opts.signal);
  },

  async getReversePennyDropStatus(
    params: { ref_id?: number; verification_id?: string },
    opts: { signal?: AbortSignal } = {},
  ) {
    const cfg = await loadCashfreeConfig();
    const qs = new URLSearchParams();
    if (params.ref_id != null) qs.set("ref_id", String(params.ref_id));
    if (params.verification_id) qs.set("verification_id", params.verification_id);
    return doRequest(`/reverse-penny-drop?${qs.toString()}`, "GET", null, cfg, opts.signal);
  },

  async createDigilocker(
    body: {
      verification_id: string;
      document_requested: Array<"AADHAAR" | "PAN" | "DRIVING_LICENSE">;
      redirect_url?: string;
      user_flow?: "signin" | "signup";
    },
    opts: { signal?: AbortSignal } = {},
  ) {
    const cfg = await loadCashfreeConfig();
    return doRequest("/digilocker", "POST", body, cfg, opts.signal);
  },

  async getDigilockerStatus(
    verificationId: string,
    opts: { signal?: AbortSignal } = {},
  ) {
    const cfg = await loadCashfreeConfig();
    const qs = new URLSearchParams({ verification_id: verificationId });
    return doRequest(`/digilocker?${qs.toString()}`, "GET", null, cfg, opts.signal);
  },
};

export type CashfreeProvider = typeof cashfree;
