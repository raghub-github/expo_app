"use client";

import {
  Suspense,
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";

const DashboardSearchParamsContext = createContext<URLSearchParams>(
  new URLSearchParams()
);

function SearchParamsSync({
  onChange,
}: {
  onChange: (params: URLSearchParams) => void;
}) {
  const searchParams = useAppSearchParams();

  useLayoutEffect(() => {
    onChange(new URLSearchParams(searchParams.toString()));
  }, [searchParams, onChange]);

  return null;
}

/** Keeps search params in context without suspending the whole dashboard shell. */
export function DashboardSearchParamsProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useState<URLSearchParams>(() => new URLSearchParams());

  const value = useMemo(() => params, [params]);

  return (
    <DashboardSearchParamsContext.Provider value={value}>
      <Suspense fallback={null}>
        <SearchParamsSync onChange={setParams} />
      </Suspense>
      {children}
    </DashboardSearchParamsContext.Provider>
  );
}

export function useDashboardSearchParams(): URLSearchParams {
  return useContext(DashboardSearchParamsContext);
}
