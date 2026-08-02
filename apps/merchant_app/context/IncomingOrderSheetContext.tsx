import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { OrderRecord } from "@/lib/orderRecord";

type OpenHandler = ((order: OrderRecord) => void) | null;
type RescanHandler = (() => void) | null;

type IncomingOrderSheetContextValue = {
  /** True while the accept bottom sheet is on screen. */
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
  /**
   * True after the merchant hits X — auto-popup stays off until the floating
   * pill clears the park (partnersite suppress parity).
   */
  parked: boolean;
  setParked: (parked: boolean) => void;
  /** Opens accept bottom sheet (bypasses auto-popup dedupe). */
  openIncomingOrderSheet: (order: OrderRecord) => void;
  registerOpenHandler: (handler: OpenHandler) => void;
  /** Clear park + reopen the oldest still-CREATED order. */
  reopenParkedIncomingOrders: () => void;
  registerRescanHandler: (handler: RescanHandler) => void;
};

const IncomingOrderSheetContext = createContext<IncomingOrderSheetContextValue | null>(null);

export function IncomingOrderSheetProvider({ children }: { children: ReactNode }) {
  const openHandlerRef = useRef<OpenHandler>(null);
  const rescanHandlerRef = useRef<RescanHandler>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [parked, setParked] = useState(false);

  const registerOpenHandler = useCallback((handler: OpenHandler) => {
    openHandlerRef.current = handler;
  }, []);

  const registerRescanHandler = useCallback((handler: RescanHandler) => {
    rescanHandlerRef.current = handler;
  }, []);

  const openIncomingOrderSheet = useCallback((order: OrderRecord) => {
    setParked(false);
    openHandlerRef.current?.(order);
  }, []);

  const reopenParkedIncomingOrders = useCallback(() => {
    setParked(false);
    rescanHandlerRef.current?.();
  }, []);

  const value = useMemo(
    () => ({
      sheetOpen,
      setSheetOpen,
      parked,
      setParked,
      openIncomingOrderSheet,
      registerOpenHandler,
      reopenParkedIncomingOrders,
      registerRescanHandler,
    }),
    [
      sheetOpen,
      parked,
      openIncomingOrderSheet,
      registerOpenHandler,
      reopenParkedIncomingOrders,
      registerRescanHandler,
    ]
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
