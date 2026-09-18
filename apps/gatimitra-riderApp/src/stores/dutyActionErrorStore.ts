import { create } from "zustand";
import {
  dutyConnectivityCopy,
  dutyLocationCopy,
  type DutyConnectivityErrorKind,
  type DutyLocationFixFailureReason,
} from "@/src/lib/dutyToggleFailure";

type DutyActionErrorState = {
  visible: boolean;
  kind: DutyConnectivityErrorKind;
  title: string;
  message: string;
  /** Bumped when Try Again is pressed so hosts can re-run duty ON. */
  retryNonce: number;
};

type DutyActionErrorStore = DutyActionErrorState & {
  open: (input: {
    kind: DutyConnectivityErrorKind;
    locationReason?: DutyLocationFixFailureReason;
    title?: string;
    message?: string;
  }) => void;
  close: () => void;
  requestRetry: () => void;
};

let pendingRetry: (() => void) | null = null;

export const useDutyActionErrorStore = create<DutyActionErrorStore>((set, get) => ({
  visible: false,
  kind: "network",
  title: "",
  message: "",
  retryNonce: 0,
  open: (input) => {
    const prev = get();
    // Deduplicate: do not re-open / re-flash the same kind already on screen.
    if (prev.visible && prev.kind === input.kind) return;

    let title = input.title?.trim() ?? "";
    let message = input.message?.trim() ?? "";
    if (!title || !message) {
      if (input.kind === "location") {
        const copy = dutyLocationCopy(input.locationReason ?? "unavailable");
        title = title || copy.title;
        message = message || copy.message;
      } else {
        const copy = dutyConnectivityCopy(input.kind);
        title = title || copy.title;
        message = message || copy.message;
      }
    }
    set({ visible: true, kind: input.kind, title, message });
  },
  close: () => {
    pendingRetry = null;
    set({ visible: false });
  },
  requestRetry: () => {
    const fn = pendingRetry;
    set((s) => ({ retryNonce: s.retryNonce + 1, visible: false }));
    pendingRetry = null;
    if (fn) {
      // Defer so modal unmounts before duty flow re-enters.
      setTimeout(() => {
        try {
          fn();
        } catch {
          /* ignore */
        }
      }, 0);
    }
  },
}));

export function openDutyActionError(
  input: {
    kind: DutyConnectivityErrorKind;
    locationReason?: DutyLocationFixFailureReason;
    title?: string;
    message?: string;
  },
  onRetry?: () => void
): void {
  pendingRetry = onRetry ?? null;
  useDutyActionErrorStore.getState().open(input);
}

export function closeDutyActionError(): void {
  useDutyActionErrorStore.getState().close();
}
