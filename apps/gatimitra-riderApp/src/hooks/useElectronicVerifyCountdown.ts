/**
 * Tick countdown for Verify Instantly rate-limit UI (max 2 / 24h).
 * Always derives remaining from absolute `resetsAt` via resolveRetryAfterSec —
 * never freezes on a stale high remainingSec (that caused stuck "23h 59m").
 */

import { useEffect, useState } from "react";
import {
  formatVerifyCountdown,
  resolveRetryAfterSec,
  type ElectronicVerifyRateLimitInfo,
} from "@/src/lib/electronic-verify-rate-limit";

export function useElectronicVerifyCountdown(
  info: ElectronicVerifyRateLimitInfo | null,
): {
  locked: boolean;
  remainingSec: number;
  label: string | null;
} {
  const resetsAt = info?.limited ? info.resetsAt || "" : "";
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (!info?.limited || !resetsAt) {
      return;
    }
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [info?.limited, resetsAt]);

  const remainingSec =
    info?.limited ? resolveRetryAfterSec(info) : 0;
  // nowTick forces a re-render every second so remainingSec recalculates.
  void nowTick;
  const locked = Boolean(info?.limited) && remainingSec > 0;
  return {
    locked,
    remainingSec,
    label: locked ? formatVerifyCountdown(remainingSec) : null,
  };
}
