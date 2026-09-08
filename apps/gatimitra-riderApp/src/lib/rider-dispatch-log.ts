const PREFIX = "[RiderDispatch]";

const NOISY = [
  "RECOVERY_START",
  "OFFER MERGED",
  "fetch pending",
  "fetch available",
  "location refresh",
  "location ping",
  "WS CONNECTING",
  "ws reconnect scheduled",
];

const NOISY_COOLDOWN_MS = 20_000;
const lastNoisyAt = new Map<string, number>();

function isNoisy(message: string): boolean {
  return NOISY.some((p) => message.startsWith(p) || message.includes(p));
}

function shouldEmitNoisy(message: string): boolean {
  const key = NOISY.find((p) => message.startsWith(p) || message.includes(p)) ?? message;
  const now = Date.now();
  const last = lastNoisyAt.get(key) ?? 0;
  if (now - last < NOISY_COOLDOWN_MS) return false;
  lastNoisyAt.set(key, now);
  return true;
}

/** Lightweight dispatch diagnostics — visible in Metro / device logs. */
export function riderDispatchLog(message: string, detail?: unknown): void {
  if (!__DEV__) return;
  if (isNoisy(message) && !shouldEmitNoisy(message)) return;
  if (detail !== undefined) {
    console.log(`${PREFIX} ${message}`, detail);
  } else {
    console.log(`${PREFIX} ${message}`);
  }
}

export function riderDispatchWarn(message: string, detail?: unknown): void {
  if (!__DEV__) return;
  if (detail !== undefined) {
    console.warn(`${PREFIX} ${message}`, detail);
  } else {
    console.warn(`${PREFIX} ${message}`);
  }
}
