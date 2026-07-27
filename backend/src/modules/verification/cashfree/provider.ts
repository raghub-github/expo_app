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
 *   - When `CASHFREE_PUBLIC_AUTH_KEY` is set, each request includes
 *     `x-cf-signature` (public-key 2FA) so calls work without IP whitelist.
 */
import { CashfreeError } from "./errors.js";
import { loadCashfreeConfig, type CashfreeCredentials } from "./config.js";
import { buildCashfreeCfSignature } from "./signature.js";

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

  const cfSignature = buildCashfreeCfSignature(cfg.clientId, cfg.publicAuthKey);
  if (cfSignature) {
    headers["x-cf-signature"] = cfSignature;
  }

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
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 500) };
    }
  }

  if (!res.ok) throw CashfreeError.fromResponse(res.status, parsed);

  const bodyStatus =
    parsed && typeof parsed === "object" && "status" in (parsed as object)
      ? String((parsed as { status?: unknown }).status ?? "")
      : "";
  const bodyRef =
    parsed && typeof parsed === "object" && "reference_id" in (parsed as object)
      ? String((parsed as { reference_id?: unknown }).reference_id ?? "")
      : "";
  console.info(
    `[cashfree] ${method} ${path} → HTTP ${res.status}` +
      (bodyStatus ? ` status=${bodyStatus}` : "") +
      (bodyRef ? ` ref=${bodyRef}` : "") +
      ` env=${cfg.env} (${Date.now() - started}ms)`,
  );

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

async function doMultipartRequest<Res>(
  path: string,
  form: FormData,
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
  // Do NOT set Content-Type — fetch adds multipart boundary.
  if (cfg.apiVersion) headers["x-api-version"] = cfg.apiVersion;

  const cfSignature = buildCashfreeCfSignature(cfg.clientId, cfg.publicAuthKey);
  if (cfSignature) {
    headers["x-cf-signature"] = cfSignature;
  }

  let res: Response;
  try {
    res = await fetch(cfg.baseUrl + path, {
      method: "POST",
      headers,
      body: form,
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
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 500) };
    }
  }

  if (!res.ok) throw CashfreeError.fromResponse(res.status, parsed);

  return {
    path,
    method: "POST",
    requestBody: { multipart: true, path },
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

  /**
   * Cashfree Secure ID — UPI VPA verify.
   *
   * Primary: POST /upi/penny-drop (documented Secure ID product; returns
   * name_at_bank + account status). Fallback: lightweight POST /upi when
   * penny-drop is not enabled on the Cashfree account.
   */
  async verifyUpiPennyDrop(
    body: { verification_id: string; vpa: string; name?: string },
    opts: { signal?: AbortSignal } = {},
  ) {
    const cfg = await loadCashfreeConfig();
    const vpaBody = {
      verification_id: body.verification_id,
      vpa: body.vpa.trim().toLowerCase(),
      ...(body.name ? { name: body.name } : {}),
    };

    // Penny-drop docs require x-api-version; older DB rows may omit it.
    const pennyCfg =
      cfg.apiVersion && cfg.apiVersion.trim()
        ? cfg
        : { ...cfg, apiVersion: "2024-12-01" };
    const pennyBody = {
      ...vpaBody,
      user_consent: {
        obtained: true,
        type: "EXPLICIT",
        timestamp: new Date().toISOString(),
        purpose: "Merchant store payout UPI ID verification",
      },
    };

    try {
      return await doRequest("/upi/penny-drop", "POST", pennyBody, pennyCfg, opts.signal);
    } catch (e) {
      if (!(e instanceof CashfreeError) || e.category !== "not_enabled") throw e;
      console.warn(
        "[cashfree] POST /upi/penny-drop not enabled — falling back to /upi",
      );
    }

    return doRequest("/upi", "POST", vpaBody, cfg, opts.signal);
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

  async getDigilockerDocument(
    documentType: "AADHAAR" | "PAN" | "DRIVING_LICENSE",
    verificationId: string,
    opts: { signal?: AbortSignal } = {},
  ) {
    const cfg = await loadCashfreeConfig();
    const qs = new URLSearchParams({ verification_id: verificationId });
    return doRequest(
      `/digilocker/document/${encodeURIComponent(documentType)}?${qs.toString()}`,
      "GET",
      null,
      cfg,
      opts.signal,
    );
  },

  /**
   * Cashfree Aadhaar Masking — same-page, no DigiLocker redirect.
   * Multipart: image + verification_id → masked image_link when status=VALID.
   */
  async maskAadhaar(
    body: {
      verification_id: string;
      image: Buffer;
      contentType?: string;
      filename?: string;
    },
    opts: { signal?: AbortSignal } = {},
  ) {
    const cfg = await loadCashfreeConfig();
    const form = new FormData();
    form.append("verification_id", body.verification_id);
    const bytes = new Uint8Array(body.image);
    const blob = new Blob([bytes], { type: body.contentType || "image/jpeg" });
    form.append("image", blob, body.filename || "aadhaar.jpg");
    return doMultipartRequest<{
      status?: string;
      reference_id?: number | string;
      verification_id?: string;
      image_link?: string;
      message?: string;
    }>("/aadhaar-masking", form, cfg, opts.signal);
  },
};

export type CashfreeProvider = typeof cashfree;
