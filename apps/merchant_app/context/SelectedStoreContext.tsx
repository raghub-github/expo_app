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
import { canEnterMerchantApp, enterableStoresOf } from "@/lib/merchantStoreEntry";

type SelectedStoreContextValue = {
  selectedStore: ChildStore | null;
  /** Switch active outlet and collapse to single-store order board. */
  setSelectedStore: (store: ChildStore | null) => void;
  /**
   * Switch the active outlet for this device without collapsing a multi-store
   * (Manage All Stores) board. Dashboard / menu / settings follow the new outlet.
   */
  switchActiveOutlet: (store: ChildStore) => void;
  /** Stores included on the unified incoming-orders board. */
  managedStores: ChildStore[];
  setManagedStores: (stores: ChildStore[]) => void;
  /** True when this device consolidates every approved linked outlet. */
  manageAllStores: boolean;
  setManageAllStores: (enabled: boolean) => void;
  /** False until we've tried restoring the last store from SecureStore. */
  isStoreReady: boolean;
};

const SelectedStoreContext = createContext<SelectedStoreContextValue | null>(null);

function isApprovedStore(store: ChildStore): boolean {
  return String(store.approval_status || "").toUpperCase() === "APPROVED";
}

function isEnterableStore(store: ChildStore): boolean {
  return canEnterMerchantApp(store);
}

function approvedStoresOf(partner: PartnerData | null): ChildStore[] {
  if (!partner) return [];
  return (Array.isArray(partner.childStores) ? partner.childStores : []).filter(isApprovedStore);
}

function findStoreInPartner(
  partner: PartnerData | null,
  storeDbId: number,
  storePublicId?: string,
): ChildStore | null {
  if (!partner) return null;
  const stores = Array.isArray(partner.childStores) ? partner.childStores : [];
  const byId = stores.find((s) => s.id === storeDbId);
  if (byId) return byId;
  if (storePublicId) {
    return stores.find((s) => s.store_id === storePublicId) ?? null;
  }
  return null;
}

function persistSelection(
  partner: PartnerData,
  primary: ChildStore,
  managed: ChildStore[],
) {
  const parentId = partner.parent?.id;
  if (parentId == null) return;
  void writeLastSelectedStore({
    parentId,
    storeDbId: primary.id,
    storePublicId: primary.store_id,
  });
  void writeManagedStores({
    parentId,
    primaryStoreDbId: primary.id,
    storeDbIds: managed.map((s) => s.id),
  });
}

export function SelectedStoreProvider({ children }: { children: ReactNode }) {
  const { partner, isLoading: authLoading } = useAuth();
  const [selectedStore, setSelectedStoreState] = useState<ChildStore | null>(null);
  const [managedStores, setManagedStoresState] = useState<ChildStore[]>([]);
  const [isStoreReady, setIsStoreReady] = useState(false);

  const approvedStores = useMemo(() => approvedStoresOf(partner), [partner]);
  const enterableStores = useMemo(() => enterableStoresOf(partner?.childStores), [partner?.childStores]);

  const manageAllStores = useMemo(() => {
    if (approvedStores.length <= 1) return false;
    if (managedStores.length < approvedStores.length) return false;
    const managedIds = new Set(managedStores.map((s) => s.id));
    return approvedStores.every((s) => managedIds.has(s.id));
  }, [approvedStores, managedStores]);

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
          if (match && isEnterableStore(match)) {
            setSelectedStoreState(match);
            setManagedStoresState([match]);
            return;
          }
        }

        // No saved outlet — auto-pick when there is exactly one enterable store.
        if (enterableStores.length === 1) {
          const only = enterableStores[0]!;
          setSelectedStoreState(only);
          setManagedStoresState([only]);
          persistSelection(partner, only, [only]);
        }
      } finally {
        if (!cancelled) setIsStoreReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, partner?.parent?.id, partner?.childStores?.length, enterableStores]);

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

  const switchActiveOutlet = useCallback(
    (store: ChildStore) => {
      if (!isApprovedStore(store)) return;
      setSelectedStoreState(store);

      setManagedStoresState((prev) => {
        // Keep the current multi-outlet board; only change the active outlet.
        // If the new outlet wasn't on the board yet, add it so its orders still arrive.
        let nextManaged: ChildStore[];
        if (prev.length === 0) {
          nextManaged = [store];
        } else if (prev.some((s) => s.id === store.id)) {
          nextManaged = prev;
        } else {
          nextManaged = [...prev, store];
        }

        if (partner) persistSelection(partner, store, nextManaged);
        return nextManaged;
      });
    },
    [partner],
  );

  const setManageAllStores = useCallback(
    (enabled: boolean) => {
      const all = approvedStoresOf(partner);
      if (all.length === 0) return;

      if (enabled) {
        const primary =
          selectedStore && all.some((s) => s.id === selectedStore.id)
            ? selectedStore
            : all[0]!;
        setSelectedStoreState(primary);
        setManagedStoresState(all);
        if (partner) persistSelection(partner, primary, all);
        return;
      }

      const primary = selectedStore && isApprovedStore(selectedStore) ? selectedStore : all[0]!;
      setSelectedStoreState(primary);
      setManagedStoresState([primary]);
      if (partner) persistSelection(partner, primary, [primary]);
    },
    [partner, selectedStore],
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
      switchActiveOutlet,
      managedStores,
      setManagedStores,
      manageAllStores,
      setManageAllStores,
      isStoreReady,
    }),
    [
      selectedStore,
      setSelectedStore,
      switchActiveOutlet,
      managedStores,
      setManagedStores,
      manageAllStores,
      setManageAllStores,
      isStoreReady,
    ],
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
