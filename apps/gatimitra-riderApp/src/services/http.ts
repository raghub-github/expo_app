/**
 * Create a timeout promise that rejects after specified milliseconds
 */
function createTimeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Request timeout after ${ms}ms`)), ms);
  });
}

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 30000, // 30 seconds default
): Promise<Response> {
  return Promise.race([
    fetch(url, options),
    createTimeoutPromise(timeoutMs),
  ]) as Promise<Response>;
}

export async function postJson<TResponse>(
  url: string,
  body: unknown,
  init?: { headers?: Record<string, string>; timeout?: number },
): Promise<TResponse> {
  const timeout = init?.timeout ?? 30000; // 30 seconds default
  
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
      body: JSON.stringify(body),
    },
    timeout,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
  }

  return (await res.json()) as TResponse;
}


