import { useEffect, useState } from "react";

/** Tick elapsed seconds from anchor when `enabled` (e.g. rider waiting at store). */
export function useLiveElapsedSeconds(
  anchorIso: string | null | undefined,
  enabled: boolean
): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled || !anchorIso?.trim()) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled, anchorIso]);

  if (!enabled || !anchorIso?.trim()) return 0;
  const anchorMs = new Date(anchorIso).getTime();
  if (!Number.isFinite(anchorMs)) return 0;
  return Math.max(0, Math.floor((nowMs - anchorMs) / 1000));
}
