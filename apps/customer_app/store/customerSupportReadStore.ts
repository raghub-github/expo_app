import { create } from "zustand";
import {
  loadCustomerSupportReadMap,
  mergeReadAtMaps,
  saveCustomerSupportReadMap,
  type CustomerSupportReadMap,
} from "@/lib/customerSupportReadStorage";

type CustomerSupportReadState = {
  customerSub: string | null;
  readAtByTicketId: CustomerSupportReadMap;
  hydrated: boolean;
  setCustomerSub: (sub: string | null) => void;
  hydrate: () => Promise<void>;
  markTicketRead: (ticketId: number, readAtIso: string) => void;
  getLastReadAt: (ticketId: number) => string | null;
};

export const useCustomerSupportReadStore = create<CustomerSupportReadState>((set, get) => ({
  customerSub: null,
  readAtByTicketId: {},
  hydrated: false,
  setCustomerSub: (sub) => {
    const prev = get().customerSub;
    if (prev === sub) return;
    set({ customerSub: sub, readAtByTicketId: {}, hydrated: false });
    void get().hydrate();
  },
  hydrate: async () => {
    const sub = get().customerSub;
    const loaded = await loadCustomerSupportReadMap(sub);
    set((state) => ({
      readAtByTicketId: mergeReadAtMaps(state.readAtByTicketId, loaded),
      hydrated: true,
    }));
  },
  markTicketRead: (ticketId, readAtIso) => {
    const key = String(ticketId);
    const prev = get().readAtByTicketId[key];
    if (prev && new Date(prev).getTime() >= new Date(readAtIso).getTime()) {
      return;
    }

    set((state) => ({
      readAtByTicketId: { ...state.readAtByTicketId, [key]: readAtIso },
      hydrated: true,
    }));

    const sub = get().customerSub;
    void (async () => {
      const merged = get().readAtByTicketId;
      await saveCustomerSupportReadMap(sub, merged);
    })();
  },
  getLastReadAt: (ticketId) => get().readAtByTicketId[String(ticketId)] ?? null,
}));
