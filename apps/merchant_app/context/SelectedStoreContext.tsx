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
  clearManagedStores,
  readLastSelectedStore,
  readManagedStores,
  writeLastSelectedStore,
  writeManagedStores,
} from "@/lib/selectedStoreStorage";

type SelectedStoreContextValue = {
  selectedStore: ChildStore | null;
  setSelectedStore: (store: ChildStore | null) => void;
  /** Stores included in "manage orders from" (multi-select). Orders from all of these land on one board. */
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
  storePublicId?: string,
): ChildStore | null {
  if (!partner) return null;
  const byId = partner.childStores.find((s) => s.id === storeDbId);
  if (byId) return byId;
  if (storePublicId) {
    return partner.childStores.find((s) => s.store_id === storePublicId) ?? null;
  }
  return null;
}

function persistSelection(
  partner: PartnerData,
  primary: ChildStore,
  managed: ChildStore[],
) {
  void writeLastSelectedStore({
    parentId: partner.parent.id,
    storeDbId: primary.id,
    storePublicId: primary.store_id,
  });
  void writeManagedStores({
    parentId: partner.parent.id,
    primaryStoreDbId: primary.id,
    storeDbIds: managed.map((s) => s.id),
  });
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
          setManagedStoresState([]);
          return;
        }

        const [persistedPrimary, persistedManaged] = await Promise.all([
          readLastSelectedStore(),
          readManagedStores(),
        ]);
        if (cancelled) return;

        if (persistedManaged && persistedManaged.parentId === partner.parent.id) {
          const managed = persistedManaged.storeDbIds
            .map((id) => findStoreInPartner(partner, id))
            .filter((s): s is ChildStore => s != null && isApprovedStore(s));
          if (managed.length > 0) {
            const primary =
              findStoreInPartner(partner, persistedManaged.primaryStoreDbId) ??
              managed[0]!;
            const primaryApproved = isApprovedStore(primary) ? primary : managed[0]!;
            setSelectedStoreState(primaryApproved);
            setManagedStoresState(
              managed.some((s) => s.id === primaryApproved.id)
                ? managed
                : [primaryApproved, ...managed]
            );
            return;
          }
        }

        if (persistedPrimary && persistedPrimary.parentId === partner.parent.id) {
          const match = findStoreInPartner(
            partner,
            persistedPrimary.storeDbId,
            persistedPrimary.storePublicId,
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
        persistSelection(partner, store, [store]);
      } else {
        void clearLastSelectedStore();
        void clearManagedStores();
      }
    },
    [partner],
  );

  const setManagedStores = useCallback(
    (stores: ChildStore[]) => {
      const approved = stores.filter(isApprovedStore);
      if (approved.length === 0) {
        setManagedStoresState([]);
        setSelectedStoreState(null);
        void clearLastSelectedStore();
        void clearManagedStores();
        return;
      }

      setManagedStoresState(approved);
      setSelectedStoreState((prev) => {
        const keep =
          prev && approved.some((s) => s.id === prev.id) ? prev : approved[0]!;
        if (partner) persistSelection(partner, keep, approved);
        return keep;
      });
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
