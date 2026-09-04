import { useEffect, useState } from "react";
import { AppText } from "@/components/AppText";
import { formatRemainingHms } from "@/lib/announcementCampaign";

/**
 * Isolated remaining-time ticker. Parent does not rerender every second —
 * only this component's label state updates.
 */
export function AnnouncementCountdownLabel({
  remainingAtSyncMs,
  syncedAtPerf,
  expiredLabel = "00:00:00",
  style,
}: {
  remainingAtSyncMs: number;
  syncedAtPerf: number;
  expiredLabel?: string;
  style?: object;
}) {
  const [label, setLabel] = useState(() =>
    formatRemainingHms(Math.max(0, remainingAtSyncMs)),
  );

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      const now = globalThis.performance?.now?.() ?? Date.now();
      const remaining = Math.max(0, remainingAtSyncMs - (now - syncedAtPerf));
      if (!cancelled) setLabel(remaining <= 0 ? expiredLabel : formatRemainingHms(remaining));
      return remaining;
    };
    const first = tick();
    if (first <= 0) {
      return () => {
        cancelled = true;
      };
    }
    const id = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [expiredLabel, remainingAtSyncMs, syncedAtPerf]);

  return <AppText style={style}>{label}</AppText>;
}
