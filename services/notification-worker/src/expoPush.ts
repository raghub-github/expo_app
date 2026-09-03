/**
 * Self-contained Expo Push client. Mirrors the existing
 * `backend/src/modules/push/expoPushSend.ts` so the backend can keep its copy
 * working (graceful migration), and the worker doesn't have a cross-service
 * import.
 *
 * Behavior:
 *   - Batches recipient tokens into chunks of 100 (Expo API limit).
 *   - Exponential backoff on 5xx + 429.
 *   - Returns aggregate counts so the caller (the BullMQ worker) can log
 *     metrics + ack/fail the job.
 */
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100;
const MAX_ATTEMPTS = 3;

export type ExpoPushMessage = {
  to: string[];
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  /** Android channel sound name (no extension) or "default". */
  sound?: "default" | string | null;
  priority?: "default" | "normal" | "high";
  channelId?: string;
  mutableContent?: boolean;
  richContent?: { image?: string };
  _contentAvailable?: boolean;
  collapseId?: string;
};

type Ticket = {
  status: "ok" | "error";
  message?: string;
  id?: string;
  details?: { error?: string };
};

/**
 * Terminal (do-not-retry) Expo error codes. When any of these are returned
 * for a specific token, that token should be purged from the DB — the app
 * was uninstalled, the token was rotated, or the credentials are broken.
 */
const DEAD_TOKEN_ERRORS = new Set([
  "DeviceNotRegistered",
  // InvalidCredentials = Expo project missing FCM creds (ops fault), NOT a dead token.
  "MessageTooBig",     // caller bug; not a device error, but do not retry
  "MessageRateExceeded", // rare — retry once, then treat as dead
]);

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendBatch(
  message: ExpoPushMessage,
  log: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void },
): Promise<{ ok: boolean; tickets: Ticket[]; status: number; error?: string }> {
  let lastErr: string | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(process.env.EXPO_ACCESS_TOKEN?.trim()
            ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN.trim()}` }
            : {}),
        },
        body: JSON.stringify(message),
      });
      const status = res.status;
      const body = (await res.json().catch(() => null)) as { data?: Ticket[] } | null;
      if (status >= 200 && status < 300) {
        return { ok: true, tickets: body?.data ?? [], status };
      }
      lastErr = `expo_push ${status}`;
      if (status === 429 || status >= 500) {
        const backoff = 300 * 2 ** (attempt - 1);
        log.warn(`expo push retry in ${backoff}ms (status=${status})`);
        await sleep(backoff);
        continue;
      }
      return { ok: false, tickets: [], status, error: lastErr };
    } catch (err) {
      lastErr = (err as Error).message;
      const backoff = 300 * 2 ** (attempt - 1);
      log.warn(`expo push network error, retry in ${backoff}ms (${lastErr})`);
      await sleep(backoff);
    }
  }
  return { ok: false, tickets: [], status: 0, error: lastErr };
}

/**
 * Send a push notification to one or more tokens. Splits into chunks of 100
 * (Expo's batch limit), aggregates ticket counts, returns the totals.
 */
export async function sendPush(
  payload: {
    to: string | string[];
    title?: string;
    body?: string;
    data?: Record<string, unknown>;
    sound?: string | null;
    channelId?: string;
    imageUrl?: string;
    contentAvailable?: boolean;
  },
  log: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void },
): Promise<{ accepted: number; failed: number; chunks: number; deadTokens: string[] }> {
  const tokens = Array.isArray(payload.to) ? payload.to : [payload.to];
  const valid = tokens.filter(
    (t) =>
      typeof t === "string" &&
      (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken["))
  );
  if (valid.length === 0) {
    return { accepted: 0, failed: tokens.length, chunks: 0, deadTokens: [] };
  }

  let accepted = 0;
  let failed = 0;
  const deadTokens: string[] = [];
  const batches = chunk(valid, CHUNK_SIZE);
  for (const tokenSlice of batches) {
    const message: ExpoPushMessage = {
      to: tokenSlice,
      ...(payload.title != null && payload.title !== "" ? { title: payload.title } : {}),
      ...(payload.body != null && payload.body !== "" ? { body: payload.body } : {}),
      data: payload.data,
      sound: (payload.sound as string | null | undefined) ?? "default",
      priority: "high",
      channelId: payload.channelId,
      ...(payload.collapseKey ? { collapseId: payload.collapseKey } : {}),
      ...(payload.contentAvailable ? { _contentAvailable: true } : {}),
      ...(payload.imageUrl ? { mutableContent: true, richContent: { image: payload.imageUrl } } : {}),
    };
    const res = await sendBatch(message, log);
    if (!res.ok) {
      failed += tokenSlice.length;
      log.warn(`batch failed: ${res.error ?? res.status}`);
      continue;
    }
    // Expo returns tickets in the same order as the tokens sent → we can zip.
    res.tickets.forEach((ticket, i) => {
      if (ticket.status === "ok") {
        accepted++;
        return;
      }
      failed++;
      const err = ticket.details?.error ?? "";
      if (DEAD_TOKEN_ERRORS.has(err)) {
        const tok = tokenSlice[i];
        if (tok) deadTokens.push(tok);
      }
    });
  }
  return { accepted, failed, chunks: batches.length, deadTokens };
}
