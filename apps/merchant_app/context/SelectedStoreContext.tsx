import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ChildStore, PartnerData } from "@/context/AuthContext";
import { useAuth } from "@/context/AuthContext";
import {
  clearLastSelectedStore,
  readLastSelectedStore,
  writeLastSelectedStore,
} from "@/lib/selectedStoreStorage";

type SelectedStoreContextValue = {
  selectedStore: ChildStore | null;
  setSelectedStore: (store: ChildStore | null) => void;
  /** False until we've tried restoring the last store from SecureStore. */
  isStoreReady: boolean;
};

const SelectedStoreContext = createContext<SelectedStoreContextValue | null>(null);

function isApprovedStore(store: ChildStore): boolean {
  return String(store.approval_status || "").toUpperCase() === "APPROVED";
}

function findStoreInPartner(
  partner: PartnerData | null,
  storeDbId: number,
  storePublicId: string,
): ChildStore | null {
  if (!partner) return null;
  const byId = partner.childStores.find((s) => s.id === storeDbId);
  if (byId) return byId;
  return partner.childStores.find((s) => s.store_id === storePublicId) ?? null;
}

export function SelectedStoreProvider({ children }: { children: ReactNode }) {
  const { partner, isLoading: authLoading } = useAuth();
  const [selectedStore, setSelectedStoreState] = useState<ChildStore | null>(null);
  const [isStoreReady, setIsStoreReady] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    (async () => {
      try {
        if (!partner) {
          setSelectedStoreState(null);
          return;
        }

        const persisted = await readLastSelectedStore();
        if (cancelled) return;

        if (persisted && persisted.parentId === partner.parent.id) {
          const match = findStoreInPartner(
            partner,
            persisted.storeDbId,
            persisted.storePublicId,
          );
          if (match && isApprovedStore(match)) {
            setSelectedStoreState(match);
          }
        }
      } finally {
        if (!cancelled) setIsStoreReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, partner?.parent?.id, partner?.childStores?.length]);

  useEffect(() => {
    if (!authLoading && !partner) {
      setSelectedStoreState(null);
      setIsStoreReady(true);
    }
  }, [authLoading, partner]);

  const setSelectedStore = useCallback(
    (store: ChildStore | null) => {
      setSelectedStoreState(store);
      if (store && partner) {
        void writeLastSelectedStore({
          parentId: partner.parent.id,
          storeDbId: store.id,
          storePublicId: store.store_id,
        });
      } else {
        void clearLastSelectedStore();
      }
    },
    [partner],
  );

  const value = useMemo(
    () => ({
      selectedStore,
      setSelectedStore,
      isStoreReady,
    }),
    [selectedStore, setSelectedStore, isStoreReady],
  );

  return (
    <SelectedStoreContext.Provider value={value}>
      {children}
    </SelectedStoreContext.Provider>
  );
}

export function useSelectedStore(): SelectedStoreContextValue {
  const ctx = useContext(SelectedStoreContext);
  if (!ctx) {
    throw new Error("useSelectedStore must be used within SelectedStoreProvider");
  }
  return ctx;
}
