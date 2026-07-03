/**
 * Triggers backend schedule engine for one store (same as operating-hours PATCH).
 * Keeps merchant portal / dashboard in sync with Partner Site + mobile app DB state.
 */
function scheduleTickBackendCandidates(): string[] {
  const explicit = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL)?.trim();
  const candidates: string[] = [];
  if (explicit) candidates.push(explicit.replace(/\/+$/, ""));
  if (process.env.NODE_ENV === "development") {
    const local = "http://127.0.0.1:3000";
    if (!candidates.includes(local)) candidates.push(local);
  }
  return candidates;
}

export async function triggerStoreScheduleTick(storeId: number): Promise<void> {
  const scheduleTickSecret = process.env.BACKEND_SCHEDULE_TICK_SECRET?.trim();
  if (!scheduleTickSecret) return;

  const candidates = scheduleTickBackendCandidates();
  if (candidates.length === 0) return;

  for (const base of candidates) {
    try {
      const res = await fetch(`${base}/v1/internal/stores/${storeId}/schedule-tick`, {
        method: "POST",
        headers: { "X-Internal-Secret": scheduleTickSecret },
      });
      if (res.ok) return;
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[triggerStoreScheduleTick] ${base} responded ${res.status}; schedule tick skipped`
        );
      }
      return;
    } catch (err) {
      const cause = err instanceof Error ? err.cause : null;
      const refused =
        cause &&
        typeof cause === "object" &&
        "code" in cause &&
        (cause as { code?: string }).code === "ECONNREFUSED";
      if (refused && candidates.indexOf(base) < candidates.length - 1) {
        continue;
      }
      if (process.env.NODE_ENV === "development") {
        console.warn("[triggerStoreScheduleTick] backend unreachable; schedule tick skipped");
        return;
      }
      console.warn("[triggerStoreScheduleTick] request failed:", err);
      return;
    }
  }
}
