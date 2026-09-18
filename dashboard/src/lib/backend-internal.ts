/**
 * Shared secret for dashboard → backend internal proxies.
 *
 * Production historically mixed INTERNAL_API_TOKEN (most admin routes) and
 * BACKEND_SCHEDULE_TICK_SECRET (cron / some eligibility routes). Prefer INTERNAL
 * first (matches hot-zones, ride-wallet, etc.), then fall back to schedule-tick.
 *
 * `fetchBackendInternal` retries the other secret on auth 403 so a mismatched
 * preference never wedges the control dashboard.
 */

export function backendBaseUrl(): string {
  const raw =
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    "";
  return raw.replace(/\/+$/, "");
}

/** Unique candidate secrets in preference order. */
export function internalApiSecretCandidates(): string[] {
  const list = [
    process.env.INTERNAL_API_TOKEN?.trim(),
    process.env.BACKEND_SCHEDULE_TICK_SECRET?.trim(),
  ].filter((s): s is string => Boolean(s));
  return [...new Set(list)];
}

export function resolveInternalApiSecret(): string {
  return internalApiSecretCandidates()[0] ?? "";
}

function isUpstreamAuthFailure(status: number, body: unknown): boolean {
  if (status !== 403 && status !== 401) return false;
  if (!body || typeof body !== "object") return true;
  const err = String((body as { error?: unknown }).error ?? "").toLowerCase();
  return (
    err === "forbidden" ||
    err === "auth_failed" ||
    err === "unauthorized" ||
    err === ""
  );
}

/**
 * POST/GET to backend with X-Internal-Secret. On auth rejection, retries with the
 * alternate configured secret (if any). Retries once on network / timeout failures
 * (dashboard onboarding was getting intermittent 502s at ~10s under load).
 */
export async function fetchBackendInternal(
  path: string,
  init: RequestInit & { actorRole?: string; timeoutMs?: number } = {}
): Promise<{ response: Response; data: unknown }> {
  const base = backendBaseUrl();
  if (!base) {
    return {
      response: new Response(JSON.stringify({ error: "backend_not_configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
      data: { error: "backend_not_configured" },
    };
  }

  const secrets = internalApiSecretCandidates();
  if (secrets.length === 0) {
    return {
      response: new Response(
        JSON.stringify({
          error: "backend_not_configured",
          message: "Set INTERNAL_API_TOKEN or BACKEND_SCHEDULE_TICK_SECRET.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      ),
      data: {
        error: "backend_not_configured",
        message: "Set INTERNAL_API_TOKEN or BACKEND_SCHEDULE_TICK_SECRET.",
      },
    };
  }

  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  const { actorRole, headers: initHeaders, timeoutMs, signal: userSignal, ...rest } = init;
  const deadlineMs = typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 45_000;
  let lastResponse: Response | null = null;
  let lastData: unknown = {};
  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    for (let i = 0; i < secrets.length; i++) {
      const secret = secrets[i]!;
      const timeoutCtrl = new AbortController();
      const timer = setTimeout(() => timeoutCtrl.abort(), deadlineMs);
      const onUserAbort = () => timeoutCtrl.abort();
      if (userSignal) {
        if (userSignal.aborted) timeoutCtrl.abort();
        else userSignal.addEventListener("abort", onUserAbort, { once: true });
      }
      try {
        const response = await fetch(url, {
          ...rest,
          signal: timeoutCtrl.signal,
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Secret": secret,
            ...(actorRole ? { "X-Actor-Role": actorRole } : {}),
            ...(initHeaders as Record<string, string> | undefined),
          },
        });
        const data = await response.json().catch(() => ({}));
        lastResponse = response;
        lastData = data;
        lastNetworkError = null;

        if (!isUpstreamAuthFailure(response.status, data)) {
          return { response, data };
        }
        // Auth failed — try next secret if available.
      } catch (e) {
        lastNetworkError = e;
        // Network / abort — try next secret, then retry whole round once.
      } finally {
        clearTimeout(timer);
        if (userSignal) userSignal.removeEventListener("abort", onUserAbort);
      }
    }
    if (!lastNetworkError) break;
  }

  if (lastResponse) return { response: lastResponse, data: lastData };

  const message =
    lastNetworkError instanceof Error ? lastNetworkError.message : "backend_unreachable";
  throw new Error(message);
}
