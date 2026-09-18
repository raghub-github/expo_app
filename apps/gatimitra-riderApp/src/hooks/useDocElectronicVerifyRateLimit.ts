/**
 * Permanent no-op: Verify Instantly rate-limit UI/locking is disabled.
 * Call sites may still invoke apply/clear safely; nothing is persisted or locked.
 */

import type { ElectronicVerifyRateLimitInfo } from "@/src/lib/electronic-verify-rate-limit";

const noopApply = (_info: ElectronicVerifyRateLimitInfo): void => {};
const noopClear = (): void => {};

export function useDocElectronicVerifyRateLimit(
  _riderId: string | undefined,
  _docKind: string,
): {
  info: ElectronicVerifyRateLimitInfo | null;
  locked: boolean;
  label: string | null;
  remainingSec: number;
  apply: (info: ElectronicVerifyRateLimitInfo) => void;
  clear: () => void;
} {
  return {
    info: null,
    locked: false,
    label: null,
    remainingSec: 0,
    apply: noopApply,
    clear: noopClear,
  };
}
