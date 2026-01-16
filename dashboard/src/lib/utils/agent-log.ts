/**
 * Silent agent logging utility
 * All calls are fire-and-forget and will never throw errors or cause unhandled rejections
 */

/**
 * Send a log to the agent logging service
 * This function is completely silent and will never throw errors
 */
export function agentLog(
  location: string,
  message: string,
  data?: Record<string, any>
): void {
  // Only run in browser
  if (typeof window === "undefined") {
    return;
  }

  // Use setTimeout to make it completely async and non-blocking
  setTimeout(() => {
    try {
      // Create a promise but don't await it - completely fire-and-forget
      const logPromise = fetch(
        "http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location,
            message,
            data: data || {},
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "run1",
            hypothesisId: "A",
          }),
        }
      );

      // Add catch handler that does nothing - completely silent
      logPromise.catch(() => {
        // Silently ignore all errors
      });
    } catch {
      // Silently ignore all errors
    }
  }, 0);
}
