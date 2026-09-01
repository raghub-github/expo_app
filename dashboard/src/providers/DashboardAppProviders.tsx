"use client";

import { Suspense } from "react";
import { ReduxProvider } from "@/store/Provider";
import { QueryProvider } from "@/providers/QueryProvider";
import { GlobalErrorHandler } from "@/components/GlobalErrorHandler";
import { ToastProvider } from "@/context/ToastContext";
import { ChunkLoadErrorBoundary } from "@/components/ChunkLoadErrorBoundary";
import ControlAppShell from "@/providers/ControlAppShell";

/** Heavy client providers — only mount under /dashboard and /order, not /login. */
export default function DashboardAppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ChunkLoadErrorBoundary>
      <GlobalErrorHandler />
      <ReduxProvider>
        <QueryProvider>
          <ToastProvider>
            <Suspense
              fallback={
                <div
                  className="min-h-screen w-full"
                  style={{ backgroundColor: "#E6F6F5" }}
                  aria-hidden
                />
              }
            >
              <ControlAppShell>{children}</ControlAppShell>
            </Suspense>
          </ToastProvider>
        </QueryProvider>
      </ReduxProvider>
    </ChunkLoadErrorBoundary>
  );
}
