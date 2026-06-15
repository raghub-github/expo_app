import { resolveBackendApiBaseUrl } from '@/lib/backend-api-url';

const DEFAULT_TIMEOUT_MS = 6_000;

type FetchBackendOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

/** Server-side fetch to Fastify — always timeout-bounded; never loops through partnersite. */
export async function fetchBackend(
  path: string,
  options: FetchBackendOptions = {}
): Promise<Response | null> {
  const base = resolveBackendApiBaseUrl();
  if (!base) return null;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${normalizedPath}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    return await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const isTimeout =
      e instanceof Error &&
      (e.name === 'TimeoutError' || e.name === 'AbortError' || /timeout|aborted/i.test(e.message));
    if (!isTimeout) {
      console.warn('[fetch-backend]', normalizedPath, e);
    }
    return null;
  }
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
