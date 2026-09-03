import { create } from "zustand";

type ProfileSelfieSheetStore = {
  visible: boolean;
  open: () => void;
  close: () => void;
};

/** Hides the rider tab bar while the profile selfie sheet is open. */
export const useProfileSelfieSheetStore = create<ProfileSelfieSheetStore>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
}));
