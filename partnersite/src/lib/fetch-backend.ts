import { resolveBackendApiBaseUrlList } from '@/lib/backend-api-url';

const DEFAULT_TIMEOUT_MS = 6_000;

type FetchBackendOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
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

function isUnreachableBase(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const code = (e as { cause?: { code?: string } }).cause?.code;
  return code != null && UNREACHABLE_CAUSE_CODES.has(code);
}

/** Server-side fetch to Fastify — tries configured backend URLs until one connects. */
export async function fetchBackend(
  path: string,
  options: FetchBackendOptions = {}
): Promise<Response | null> {
  const bases = resolveBackendApiBaseUrlList();
  if (bases.length === 0) return null;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastError: unknown = null;

  for (const base of bases) {
    const url = `${base}${normalizedPath}`;
    try {
      return await fetch(url, {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.body,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      lastError = e;
      if (isUnreachableBase(e)) continue;
      const isTimeout =
        e instanceof Error &&
        (e.name === 'TimeoutError' || e.name === 'AbortError' || /timeout|aborted/i.test(e.message));
      if (isTimeout) return null;
      console.warn('[fetch-backend]', normalizedPath, e);
      return null;
    }
  }

  if (lastError) {
    console.warn(
      '[fetch-backend]',
      normalizedPath,
      'no reachable backend URL:',
      bases.join(', ')
    );
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
