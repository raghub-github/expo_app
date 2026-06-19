/**
 * Browser fetch helper for partnersite `/api/*` routes.
 * Adds credentials and converts network failures to readable errors.
 */
export async function fetchPartnerApi<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<{ ok: true; data: T; status: number } | { ok: false; error: string; status: number }> {
  try {
    const res = await fetch(input, {
      credentials: 'include',
      ...init,
      headers: {
        ...(init?.headers ?? {}),
      },
    });
    let data: T;
    try {
      data = (await res.json()) as T;
    } catch {
      data = {} as T;
    }
    if (!res.ok) {
      const errMsg =
        typeof data === 'object' &&
        data !== null &&
        'error' in data &&
        typeof (data as { error?: unknown }).error === 'string'
          ? (data as { error: string }).error
          : `Request failed (${res.status})`;
      return { ok: false, error: errMsg, status: res.status };
    }
    return { ok: true, data, status: res.status };
  } catch (e) {
    const message =
      e instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(e.message)
        ? 'Network error — please check your connection and that the server is running.'
        : e instanceof Error
          ? e.message
          : 'Network error';
    return { ok: false, error: message, status: 0 };
  }
}
