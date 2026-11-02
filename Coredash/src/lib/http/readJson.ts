/**
 * Read a JSON response without assuming the body is JSON.
 *
 * `await res.json()` on an error page throws `SyntaxError: Unexpected token
 * '<'`, because nginx answers a gateway timeout with an HTML document. When
 * that happened inside the sign-in flow the rejection was never caught, so the
 * callback page sat on "Completing sign-in..." indefinitely with nothing shown
 * to the user and only a console error to go on.
 *
 * Returning null instead lets the caller treat "no usable body" as the failure
 * it is, and report it.
 */
export async function readJsonSafe<T>(res: Response): Promise<T | null> {
  const type = res.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("json")) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** True when the failure is the server being unreachable rather than a refusal. */
export function isServerUnavailable(res: Response): boolean {
  return res.status === 502 || res.status === 503 || res.status === 504 || res.status === 0;
}

/** A message worth showing the user for a failed fetch of `res`. */
export function httpFailureMessage(res: Response, body: unknown): string {
  const fromBody =
    body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error.trim()
      : "";
  if (fromBody) return fromBody;
  if (isServerUnavailable(res)) {
    return "The server is not responding right now. Please try again in a moment.";
  }
  return `Request failed (${res.status}).`;
}
