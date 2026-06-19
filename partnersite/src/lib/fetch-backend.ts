import { resolveBackendApiBaseUrlList } from '@/lib/backend-api-url';

const DEFAULT_TIMEOUT_MS = 6_000;

type FetchBackendOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

function isConnectionRefused(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const cause = (e as { cause?: { code?: string } }).cause;
  return cause?.code === 'ECONNREFUSED';
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
      const isTimeout =
        e instanceof Error &&
        (e.name === 'TimeoutError' || e.name === 'AbortError' || /timeout|aborted/i.test(e.message));
      if (isTimeout) return null;
      if (isConnectionRefused(e)) continue;
      console.warn('[fetch-backend]', normalizedPath, e);
      return null;
    }
  }

  if (lastError) {
    console.warn(
      '[fetch-backend]',
      normalizedPath,
      'all backend URLs refused connection:',
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
