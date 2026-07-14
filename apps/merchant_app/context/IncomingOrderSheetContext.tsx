import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { OrderRecord } from "@/lib/orderRecord";

type OpenHandler = ((order: OrderRecord) => void) | null;

type IncomingOrderSheetContextValue = {
  /** Opens accept bottom sheet (bypasses auto-popup dedupe). */
  openIncomingOrderSheet: (order: OrderRecord) => void;
  registerOpenHandler: (handler: OpenHandler) => void;
};

const IncomingOrderSheetContext = createContext<IncomingOrderSheetContextValue | null>(null);

export function IncomingOrderSheetProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<OpenHandler>(null);

  const registerOpenHandler = useCallback((handler: OpenHandler) => {
    handlerRef.current = handler;
  }, []);

  const openIncomingOrderSheet = useCallback((order: OrderRecord) => {
    handlerRef.current?.(order);
  }, []);

  const value = useMemo(
    () => ({ openIncomingOrderSheet, registerOpenHandler }),
    [openIncomingOrderSheet, registerOpenHandler]
  );

  return (
    <IncomingOrderSheetContext.Provider value={value}>
      {children}
    </IncomingOrderSheetContext.Provider>
  );
}

export function useIncomingOrderSheet() {
  const ctx = useContext(IncomingOrderSheetContext);
  if (!ctx) {
    throw new Error("useIncomingOrderSheet must be used within IncomingOrderSheetProvider");
  }
  return ctx;
}

/** Optional hook for components outside provider tree edge cases. */
export function useIncomingOrderSheetOptional() {
  return useContext(IncomingOrderSheetContext);
}
