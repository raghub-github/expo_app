import { create } from "zustand";

type WorkingLocationSuccessStore = {
  visible: boolean;
  addressLine: string | null;
  show: (input?: { addressLine?: string | null }) => void;
  hide: () => void;
};

export const useWorkingLocationSuccessStore = create<WorkingLocationSuccessStore>((set) => ({
  visible: false,
  addressLine: null,
  show: (input) =>
    set({
      visible: true,
      addressLine: input?.addressLine?.trim() || null,
    }),
  hide: () => set({ visible: false, addressLine: null }),
}));

export function showWorkingLocationSuccess(addressLine?: string | null): void {
  useWorkingLocationSuccessStore.getState().show({ addressLine });
}
