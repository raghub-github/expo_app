type RiderManagementBackendResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

function backendBaseUrl(): string | null {
  // Prefer Docker-internal URL: nginx blocks /v1/internal on the public API host.
  // Do not fall back to NEXT_PUBLIC_* (often the dashboard origin).
  const url =
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    "";
  if (url) return url.replace(/\/$/, "");
  if (process.env.NODE_ENV === "development") return "http://127.0.0.1:3000";
  return null;
}

function internalToken(): string | null {
  return process.env.INTERNAL_API_TOKEN?.trim() ?? null;
}

async function readBackendJson(res: Response): Promise<{ ok?: boolean; error?: string }> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }
  try {
    return (await res.json()) as { ok?: boolean; error?: string };
  } catch {
    return {};
  }
}

function mapBackendFailure(res: Response, json: { error?: string }): string {
  if (typeof json.error === "string" && json.error.trim()) return json.error;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    // Typical when BACKEND_URL is https://api.gatimitra.com — nginx 403s /v1/internal as HTML.
    return "Could not reach rider backend. Set BACKEND_URL (or BACKEND_INTERNAL_URL) to the Fastify service (Docker: http://backend:3000), not the public api.gatimitra.com host.";
  }
  return `Request failed (${res.status})`;
}

async function postInternal(
  path: string,
  body: Record<string, unknown>
): Promise<RiderManagementBackendResult> {
  const base = backendBaseUrl();
  if (!base) {
    return { ok: false, error: "Rider management service is not configured", status: 503 };
  }

  const token = internalToken();
  if (!token) {
    return { ok: false, error: "Rider management service is not configured", status: 503 };
  }

  let res: Response;
  try {
    res = await fetch(`${base}/v1/internal${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": token,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      error: "Could not reach rider backend. Is Fastify running on port 3000?",
      status: 502,
    };
  }

  const json = await readBackendJson(res);
  if (!res.ok || !json.ok) {
    return {
      ok: false,
      error: mapBackendFailure(res, json),
      status: res.status >= 400 ? res.status : 502,
    };
  }
  return { ok: true };
}

export async function cancelRiderOnlyOnBackend(args: {
  ordersCoreId: number;
  riderId: number;
  reasonCode: string;
  reasonText?: string | null;
  actorEmail?: string | null;
  actorId?: string | null;
}): Promise<RiderManagementBackendResult> {
  return postInternal("/orders/rider-cancel-only", {
    orders_core_id: args.ordersCoreId,
    rider_id: args.riderId,
    reason_code: args.reasonCode,
    reason_text: args.reasonText ?? undefined,
    actor_email: args.actorEmail ?? undefined,
    actor_id: args.actorId ?? undefined,
  });
}

export async function cancelAndReassignRiderOnBackend(args: {
  ordersCoreId: number;
  riderId: number;
  reasonCode: string;
  reasonText?: string | null;
  actorEmail?: string | null;
  actorId?: string | null;
}): Promise<RiderManagementBackendResult> {
  return postInternal("/orders/rider-cancel-reassign", {
    orders_core_id: args.ordersCoreId,
    rider_id: args.riderId,
    reason_code: args.reasonCode,
    reason_text: args.reasonText ?? undefined,
    actor_email: args.actorEmail ?? undefined,
    actor_id: args.actorId ?? undefined,
  });
}

export async function manualAssignRiderOnBackend(args: {
  ordersCoreId: number;
  actorEmail?: string | null;
}): Promise<RiderManagementBackendResult> {
  return postInternal("/orders/rider-manual-assign", {
    orders_core_id: args.ordersCoreId,
    actor_email: args.actorEmail ?? undefined,
  });
}

export async function clearRiderPaymentHoldOnBackend(args: {
  ordersCoreId: number;
  actorEmail?: string | null;
}): Promise<RiderManagementBackendResult & { credited?: boolean }> {
  const base = backendBaseUrl();
  if (!base) {
    return { ok: false, error: "Rider management service is not configured", status: 503 };
  }
  const token = internalToken();
  if (!token) {
    return { ok: false, error: "Rider management service is not configured", status: 503 };
  }
  let res: Response;
  try {
    res = await fetch(`${base}/v1/internal/orders/clear-rider-payment-hold`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": token,
      },
      body: JSON.stringify({
        orders_core_id: args.ordersCoreId,
        actor_email: args.actorEmail ?? undefined,
      }),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      error: "Could not reach rider backend. Is Fastify running on port 3000?",
      status: 502,
    };
  }
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    credited?: boolean;
  };
  if (!res.ok || !json.ok) {
    return {
      ok: false,
      error: mapBackendFailure(res, json),
      status: res.status >= 400 ? res.status : 502,
    };
  }
  return { ok: true, credited: json.credited };
}
