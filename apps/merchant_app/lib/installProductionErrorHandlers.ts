/**
 * Log unhandled JS / promise failures without swallowing the default native handler.
 * Render crashes are recovered by AppErrorBoundary; this is the safety net for
 * async work that never hits a React tree.
 */

type GlobalErrorUtils = {
  getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

export function installProductionErrorHandlers(): void {
  const g = globalThis as typeof globalThis & {
    ErrorUtils?: GlobalErrorUtils;
    onunhandledrejection?: ((event: { reason?: unknown }) => void) | null;
  };

  const errorUtils = g.ErrorUtils;
  if (errorUtils?.setGlobalHandler) {
    const prev = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error, isFatal) => {
      console.error(
        `[merchant-app] ${isFatal ? "fatal" : "error"}`,
        error?.message ?? error
      );
      prev?.(error, isFatal);
    });
  }

  const prevRejection = g.onunhandledrejection;
  g.onunhandledrejection = (event) => {
    const reason = event?.reason;
    const msg = reason instanceof Error ? reason.message : String(reason ?? "unknown");
    console.error("[merchant-app] unhandled rejection", msg);
    if (typeof prevRejection === "function") prevRejection(event);
  };
}
