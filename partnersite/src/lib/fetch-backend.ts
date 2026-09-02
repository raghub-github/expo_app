import { resolveBackendApiBaseUrlList } from '@/lib/backend-api-url';

/** Per-request default — keep short so a dead Fastify cannot stall the dashboard. */
const DEFAULT_TIMEOUT_MS = 2_500;

/** How long to skip a base after connect failure / timeout. */
const DEAD_BASE_COOLDOWN_MS = 45_000;

type FetchBackendOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** When true, skip circuit-breaker (e.g. explicit health probe). */
  force?: boolean;
};

/**
 * Connect-phase failures only — the request never reached the backend, so it is safe to
 * retry the next candidate even for POST. A stale LAN IP shows up as UND_ERR_CONNECT_TIMEOUT.
 */
const UNREACHABLE_CAUSE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const deadUntilByBase = new Map<string, number>();
let lastWarnedDeadAt = 0;
let lastForcedRecoveryAt = 0;
let preferredBase: string | null = null;

function isUnreachableBase(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const code = (e as { cause?: { code?: string } }).cause?.code;
  if (code != null && UNREACHABLE_CAUSE_CODES.has(code)) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /econnrefused|enotfound|fetch failed|network/i.test(msg);
}

function isTimeoutError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return (
    e.name === 'TimeoutError' ||
    e.name === 'AbortError' ||
    /timeout|aborted|TimeoutError/i.test(e.message)
  );
}

function markBaseDead(base: string): void {
  deadUntilByBase.set(base, Date.now() + DEAD_BASE_COOLDOWN_MS);
  if (preferredBase === base) preferredBase = null;
}

function isBaseDead(base: string): boolean {
  const until = deadUntilByBase.get(base) ?? 0;
  if (until <= Date.now()) {
    deadUntilByBase.delete(base);
    return false;
  }
  return true;
}

function markBaseAlive(base: string): void {
  deadUntilByBase.delete(base);
  preferredBase = base;
}

/** Ordered bases: prefer last-known-good, skip recently-dead. */
function orderedBases(force: boolean): string[] {
  const all = resolveBackendApiBaseUrlList();
  if (all.length === 0) return [];
  const live = force ? all : all.filter((b) => !isBaseDead(b));
  const pool = live.length > 0 ? live : force ? all : [];
  if (preferredBase && pool.includes(preferredBase)) {
    return [preferredBase, ...pool.filter((b) => b !== preferredBase)];
  }
  return pool;
}

/**
 * Server-side fetch to Fastify — tries configured backend URLs until one connects.
 * Dead bases are cooled down so every dashboard widget does not re-pay 3–12s timeouts.
 */
export async function fetchBackend(
  path: string,
  options: FetchBackendOptions = {}
): Promise<Response | null> {
  const force = options.force === true;
  let bases = orderedBases(force);
  // When every base is in cooldown, probe once every 10s so recovery is not stuck
  // for the full 45s window after Fastify restarts.
  if (bases.length === 0 && !force) {
    const now = Date.now();
    if (now - lastForcedRecoveryAt > 10_000) {
      lastForcedRecoveryAt = now;
      bases = orderedBases(true);
    } else {
      if (now - lastWarnedDeadAt > 30_000) {
        lastWarnedDeadAt = now;
        console.warn(
          '[fetch-backend]',
          path,
          'all backend URLs in cooldown:',
          resolveBackendApiBaseUrlList().join(', ')
        );
      }
      return null;
    }
  }
  if (bases.length === 0) {
    const now = Date.now();
    if (now - lastWarnedDeadAt > 30_000) {
      lastWarnedDeadAt = now;
      console.warn(
        '[fetch-backend]',
        path,
        'all backend URLs in cooldown:',
        resolveBackendApiBaseUrlList().join(', ')
      );
    }
    return null;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastError: unknown = null;
  let tried = 0;

  for (const base of bases) {
    tried += 1;
    const url = `${base}${normalizedPath}`;
    try {
      const res = await fetch(url, {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.body,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      markBaseAlive(base);
      return res;
    } catch (e) {
      lastError = e;
      // Only cool down on true connect failures. Timeouts on a live Fastify
      // (slow partner-status, etc.) must not poison every other caller for 45s.
      if (isUnreachableBase(e)) {
        markBaseDead(base);
        continue;
      }
      if (isTimeoutError(e)) {
        continue;
      }
      console.warn('[fetch-backend]', normalizedPath, e);
      return null;
    }
  }

  if (lastError && tried > 0 && isUnreachableBase(lastError)) {
    const now = Date.now();
    if (now - lastWarnedDeadAt > 30_000) {
      lastWarnedDeadAt = now;
      console.warn(
        '[fetch-backend]',
        normalizedPath,
        'no reachable backend URL:',
        bases.join(', ')
      );
    }
  }
  return null;
}

export async function fetchBackendJson<T>(
  path: string,
  options: FetchBackendOptions = {}
): Promise<T | null> {
  const res = await fetchBackend(path, options);
  if (!res?.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Lightweight probe — marks a working base preferred for subsequent calls. */
export async function probeBackendHealth(timeoutMs = 1_200): Promise<boolean> {
  const alt = await fetchBackend('/v1/health', { timeoutMs, force: true });
  if (alt?.ok) return true;
  const res = await fetchBackend('/health', { timeoutMs, force: true });
  return res?.ok === true;
}

export function getPreferredBackendBase(): string | null {
  return preferredBase;
}

export function clearBackendCircuitBreaker(): void {
  deadUntilByBase.clear();
  preferredBase = null;
}
