import { useEffect, useState } from "react";
import {
  formatVerifyCountdown,
  resolveRetryAfterSec,
  type ElectronicVerifyRateLimitInfo,
} from "@/src/lib/electronic-verify-rate-limit";

/**
 * Tick countdown for Verify Instantly rate-limit UI.
 * Safe no-op when not limited.
 */
export function useElectronicVerifyCooldown(info: ElectronicVerifyRateLimitInfo | null): {
  active: boolean;
  remainingSec: number;
  label: string | null;
} {
  const [remainingSec, setRemainingSec] = useState(0);

  useEffect(() => {
    if (!info?.limited) {
      setRemainingSec(0);
      return;
    }
    const tick = () => setRemainingSec(resolveRetryAfterSec(info));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [info]);

  const active = Boolean(info?.limited) && remainingSec > 0;
  return {
    active,
    remainingSec,
    label: active ? `Try again in ${formatVerifyCountdown(remainingSec)}` : null,
  };
}
