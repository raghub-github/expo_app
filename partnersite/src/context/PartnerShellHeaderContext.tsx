'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type PartnerShellHeaderState = {
  title?: string;
  subtitle?: string;
};

type PartnerShellHeaderContextValue = {
  header: PartnerShellHeaderState;
  setPartnerShellHeader: (next: PartnerShellHeaderState) => void;
  clearPartnerShellHeader: () => void;
};

const PartnerShellHeaderContext = createContext<PartnerShellHeaderContextValue | null>(null);

export function PartnerShellHeaderProvider({ children }: { children: React.ReactNode }) {
  const [header, setHeaderState] = useState<PartnerShellHeaderState>({});

  const setPartnerShellHeader = useCallback((next: PartnerShellHeaderState) => {
    setHeaderState((prev) => ({ ...prev, ...next }));
  }, []);

  const clearPartnerShellHeader = useCallback(() => {
    setHeaderState({});
  }, []);

  const value = useMemo(
    () => ({ header, setPartnerShellHeader, clearPartnerShellHeader }),
    [header, setPartnerShellHeader, clearPartnerShellHeader]
  );

  return (
    <PartnerShellHeaderContext.Provider value={value}>{children}</PartnerShellHeaderContext.Provider>
  );
}

export function usePartnerShellHeader(): PartnerShellHeaderContextValue | null {
  return useContext(PartnerShellHeaderContext);
}

/** Register page title/subtitle in the partner top bar; cleared on unmount. */
export function PartnerPageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const ctx = usePartnerShellHeader();
  const setHeader = ctx?.setPartnerShellHeader;
  const clearHeader = ctx?.clearPartnerShellHeader;
  useEffect(() => {
    if (!setHeader || !clearHeader) return;
    setHeader({ title, subtitle });
    return () => {
      clearHeader();
    };
  }, [title, subtitle, setHeader, clearHeader]);
  return null;
}

/** Updates shell title when values change; clears on unmount (for multi-step pages). */
export function usePartnerShellHeaderSync(title: string, subtitle?: string) {
  const ctx = usePartnerShellHeader();
  const setHeader = ctx?.setPartnerShellHeader;
  const clearHeader = ctx?.clearPartnerShellHeader;
  useEffect(() => {
    if (!setHeader) return;
    setHeader({ title, subtitle });
  }, [title, subtitle, setHeader]);
  useEffect(() => {
    if (!clearHeader) return;
    return () => {
      clearHeader();
    };
  }, [clearHeader]);
}

/** Render inside MXLayoutWhite children so the hook runs under PartnerShellHeaderProvider. */
export function PartnerShellHeaderSync({ title, subtitle }: { title: string; subtitle?: string }) {
  usePartnerShellHeaderSync(title, subtitle);
  return null;
}
