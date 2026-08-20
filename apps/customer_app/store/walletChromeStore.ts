import { create } from "zustand";

/** Where the user opened GatiCash from — drives wallet light/dark chrome. */
export type WalletEntrySource = "default" | "food-home";

type State = {
  source: WalletEntrySource;
  setSource: (source: WalletEntrySource) => void;
};

export const useWalletChromeStore = create<State>((set) => ({
  source: "default",
  setSource: (source) => set({ source }),
}));

export function markWalletEntrySource(source: WalletEntrySource) {
  useWalletChromeStore.getState().setSource(source);
}
