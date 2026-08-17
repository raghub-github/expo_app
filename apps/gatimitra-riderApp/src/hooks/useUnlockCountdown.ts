import { useEffect, useState } from "react";

/** Format remaining ms as HH:MM:SS. */
export function formatCountdownHms(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Ticks every second until unlockAt. Returns null when unlocked / invalid. */
export function useUnlockCountdown(unlockAt: string | null | undefined): {
  locked: boolean;
  label: string | null;
  remainingMs: number;
} {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!unlockAt) return undefined;
    const end = Date.parse(unlockAt);
    if (!Number.isFinite(end) || end <= Date.now()) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [unlockAt]);

  if (!unlockAt) return { locked: false, label: null, remainingMs: 0 };
  const end = Date.parse(unlockAt);
  if (!Number.isFinite(end)) return { locked: false, label: null, remainingMs: 0 };
  const remainingMs = end - now;
  if (remainingMs <= 0) return { locked: false, label: null, remainingMs: 0 };
  return { locked: true, label: formatCountdownHms(remainingMs), remainingMs };
}
