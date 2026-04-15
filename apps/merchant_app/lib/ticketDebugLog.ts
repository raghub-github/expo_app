/**
 * Dev-only logs for merchant support ticket flows (create / messages).
 * Enable in release with EXPO_PUBLIC_DEBUG_TICKETS=1 if needed.
 */
const enabled =
  (typeof process !== "undefined" &&
    String(process.env?.EXPO_PUBLIC_DEBUG_TICKETS ?? "").trim() === "1") ||
  (typeof __DEV__ !== "undefined" && __DEV__);

export function ticketDebugLog(phase: string, payload?: Record<string, unknown>): void {
  if (!enabled) return;
  const line = payload ? `[ticket] ${phase} ${JSON.stringify(payload)}` : `[ticket] ${phase}`;
  console.warn(line);
}
