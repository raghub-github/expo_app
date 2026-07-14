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
  /** Stores included in "manage orders from" (multi-select). */
  managedStores: ChildStore[];
  setManagedStores: (stores: ChildStore[]) => void;
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
  const [managedStores, setManagedStoresState] = useState<ChildStore[]>([]);
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
            setManagedStoresState([match]);
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
      setManagedStoresState([]);
      setIsStoreReady(true);
    }
  }, [authLoading, partner]);

  const setSelectedStore = useCallback(
    (store: ChildStore | null) => {
      setSelectedStoreState(store);
      if (store) {
        setManagedStoresState([store]);
      } else {
        setManagedStoresState([]);
      }
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

  const setManagedStores = useCallback(
    (stores: ChildStore[]) => {
      const approved = stores.filter(isApprovedStore);
      setManagedStoresState(approved);
      if (approved.length === 1) {
        const only = approved[0];
        setSelectedStoreState(only);
        if (partner) {
          void writeLastSelectedStore({
            parentId: partner.parent.id,
            storeDbId: only.id,
            storePublicId: only.store_id,
          });
        }
      }
    },
    [partner],
  );

  useEffect(() => {
    if (selectedStore && managedStores.length === 0) {
      setManagedStoresState([selectedStore]);
    }
  }, [selectedStore, managedStores.length]);

  const value = useMemo(
    () => ({
      selectedStore,
      setSelectedStore,
      managedStores,
      setManagedStores,
      isStoreReady,
    }),
    [selectedStore, setSelectedStore, managedStores, setManagedStores, isStoreReady],
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
