const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type ExpoPushMessage = {
  to: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | string | null;
  priority?: "default" | "normal" | "high";
  channelId?: string;
  mutableContent?: boolean;
  richContent?: { image?: string };
};

export type ExpoPushTicket = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
  id?: string;
};

export type ExpoPushResponse = {
  data?: ExpoPushTicket[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** POST to Expo Push API with retries (network / 429). Does not retry on 4xx other than 429. */
export async function sendExpoPushWithRetry(
  message: Omit<ExpoPushMessage, "to"> & { to: string[] },
  log: { warn: (o: object, msg?: string) => void; debug: (o: object, msg?: string) => void },
  maxAttempts = 3
): Promise<{ ok: boolean; status: number; body: ExpoPushResponse | null; error?: string }> {
  let lastErr: string | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });
      const status = res.status;
      let body: ExpoPushResponse | null = null;
      try {
        body = (await res.json()) as ExpoPushResponse;
      } catch {
        body = null;
      }
      if (status === 429 || status >= 500) {
        lastErr = `http_${status}`;
        log.warn({ status, attempt }, "expo_push_retry");
        await sleep(300 * 2 ** (attempt - 1));
        continue;
      }
      return { ok: status >= 200 && status < 300, status, body };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "fetch_failed";
      log.warn({ err: e, attempt }, "expo_push_fetch_retry");
      await sleep(300 * 2 ** (attempt - 1));
    }
  }
  return { ok: false, status: 0, body: null, error: lastErr ?? "exhausted_retries" };
}

export function countTicketOutcomes(body: ExpoPushResponse | null): { ok: number; err: number } {
  const tickets = body?.data ?? [];
  let ok = 0;
  let err = 0;
  for (const t of tickets) {
    if (t.status === "ok") ok += 1;
    else err += 1;
  }
  return { ok, err };
}
