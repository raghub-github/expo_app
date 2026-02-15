"use client";

import { useState, useEffect } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryClient, persister } from "@/lib/react-query";

interface QueryProviderProps {
  children: React.ReactNode;
}

/** Lazy-load DevTools so a ChunkLoadError in the devtools chunk does not break the app. */
function DevToolsLazy() {
  const [Devtools, setDevtools] = useState<React.ComponentType<{ initialIsOpen?: boolean }> | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    import("@tanstack/react-query-devtools")
      .then((mod) => setDevtools(() => mod.ReactQueryDevtools))
      .catch(() => {});
  }, []);
  if (!Devtools) return null;
  return <Devtools initialIsOpen={false} />;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        buster: "", // Cache version buster (increment to invalidate all cache)
      }}
    >
      {children}
      <DevToolsLazy />
    </PersistQueryClientProvider>
  );
}
