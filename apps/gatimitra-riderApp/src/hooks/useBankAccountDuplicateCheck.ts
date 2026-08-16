import { useEffect, useState } from "react";
import { riderApi } from "@/src/services/api/riderApi";

const ACCOUNT_RE = /^\d{9,18}$/;

export type BankAccountDuplicateState = {
  checking: boolean;
  duplicate: boolean;
  rejected: boolean;
  message: string | null;
};

const IDLE: BankAccountDuplicateState = {
  checking: false,
  duplicate: false,
  rejected: false,
  message: null,
};

/**
 * Debounced server check — disables Verify Instantly before Cashfree runs.
 */
export function useBankAccountDuplicateCheck(
  accountNumber: string,
  enabled = true,
): BankAccountDuplicateState {
  const digits = accountNumber.replace(/\D/g, "");
  const [state, setState] = useState<BankAccountDuplicateState>(IDLE);

  useEffect(() => {
    if (!enabled || !ACCOUNT_RE.test(digits)) {
      setState(IDLE);
      return undefined;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, checking: true }));

    const timer = setTimeout(() => {
      void riderApi
        .checkBankAccountDuplicate(digits)
        .then((res) => {
          if (cancelled) return;
          setState({
            checking: false,
            duplicate: Boolean(res.duplicate),
            rejected: Boolean(res.rejected),
            message: res.message ?? null,
          });
        })
        .catch(() => {
          if (cancelled) return;
          // Fail open for network blips — create still enforces uniqueness.
          setState(IDLE);
        });
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [digits, enabled]);

  return state;
}
