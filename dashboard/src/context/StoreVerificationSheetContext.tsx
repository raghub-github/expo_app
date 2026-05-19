"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { StoreVerificationSideSheet } from "@/components/verification/StoreVerificationSideSheet";
import { useCanStoreVerify } from "@/hooks/useCanStoreVerify";

type SheetState = {
  storeId: string;
  initialStep: number | null;
};

type StoreVerificationSheetContextValue = {
  openVerificationSheet: (storeId: string | number, initialStep?: number | null) => void;
  closeVerificationSheet: () => void;
  isOpen: boolean;
};

const StoreVerificationSheetContext = createContext<StoreVerificationSheetContextValue | null>(
  null
);

export function StoreVerificationSheetProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const { canStoreVerify } = useCanStoreVerify();

  const openVerificationSheet = useCallback(
    (storeId: string | number, initialStep: number | null = null) => {
      const id = String(storeId).trim();
      if (!id) return;
      setSheet({ storeId: id, initialStep: initialStep ?? null });
    },
    []
  );

  const closeVerificationSheet = useCallback(() => {
    setSheet(null);
  }, []);

  const value = useMemo(
    () => ({
      openVerificationSheet,
      closeVerificationSheet,
      isOpen: sheet != null,
    }),
    [openVerificationSheet, closeVerificationSheet, sheet]
  );

  return (
    <StoreVerificationSheetContext.Provider value={value}>
      {children}
      {sheet ? (
        <StoreVerificationSideSheet
          storeId={sheet.storeId}
          initialStep={sheet.initialStep}
          canPerformVerify={canStoreVerify}
          onClose={closeVerificationSheet}
        />
      ) : null}
    </StoreVerificationSheetContext.Provider>
  );
}

export function useStoreVerificationSheet() {
  const ctx = useContext(StoreVerificationSheetContext);
  if (!ctx) {
    throw new Error("useStoreVerificationSheet must be used within StoreVerificationSheetProvider");
  }
  return ctx;
}

/** Safe when provider is absent (e.g. tests). */
export function useStoreVerificationSheetOptional() {
  return useContext(StoreVerificationSheetContext);
}
