import { create } from "zustand";

export type DutyWorkLocationPlace = {
  state?: string | null;
  district?: string | null;
  region?: string | null;
  stateId?: string | null;
  regionId?: string | null;
  districtId?: string | null;
  lat?: number | null;
  lon?: number | null;
};

export type DutyWorkLocationSheetMode = "mismatch" | "not_hiring";

type DutyWorkLocationSheetStore = {
  visible: boolean;
  mode: DutyWorkLocationSheetMode;
  message: string | null;
  /** Saved working location (not permanent registered address). */
  working: DutyWorkLocationPlace | null;
  /** @deprecated alias of working for older sheet callers */
  registered: DutyWorkLocationPlace | null;
  detected: DutyWorkLocationPlace | null;
  open: (payload: {
    mode?: DutyWorkLocationSheetMode;
    message?: string | null;
    working?: DutyWorkLocationPlace | null;
    registered?: DutyWorkLocationPlace | null;
    detected?: DutyWorkLocationPlace | null;
  }) => void;
  setNotHiring: (message?: string | null) => void;
  close: () => void;
};

export const useDutyWorkLocationSheetStore = create<DutyWorkLocationSheetStore>((set) => ({
  visible: false,
  mode: "mismatch",
  message: null,
  working: null,
  registered: null,
  detected: null,
  open: (payload) => {
    const working = payload.working ?? payload.registered ?? null;
    set({
      visible: true,
      mode: payload.mode ?? "mismatch",
      message: payload.message ?? null,
      working,
      registered: working,
      detected: payload.detected ?? null,
    });
  },
  setNotHiring: (message) =>
    set({
      mode: "not_hiring",
      message:
        message?.trim() ||
        "Service not available at this location",
    }),
  close: () =>
    set({
      visible: false,
      mode: "mismatch",
      message: null,
      working: null,
      registered: null,
      detected: null,
    }),
}));

export function openDutyWorkLocationSheet(payload: {
  mode?: DutyWorkLocationSheetMode;
  message?: string | null;
  working?: DutyWorkLocationPlace | null;
  registered?: DutyWorkLocationPlace | null;
  detected?: DutyWorkLocationPlace | null;
}): void {
  useDutyWorkLocationSheetStore.getState().open(payload);
}
