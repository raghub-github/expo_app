/**
 * Optional debug logging hook (previously posted to a local ingest server).
 * Disabled by default — avoids ERR_CONNECTION_REFUSED noise in the browser.
 *
 * To enable: set NEXT_PUBLIC_AGENT_LOG_URL to your ingest endpoint (https only recommended).
 */
export function agentLog(
  _location: string,
  _message: string,
  _data?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  const url = process.env.NEXT_PUBLIC_AGENT_LOG_URL?.trim();
  if (!url) return;

  setTimeout(() => {
    try {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: _location,
          message: _message,
          data: _data ?? {},
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }, 0);
}
