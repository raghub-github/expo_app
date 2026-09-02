/**
 * Keep Partner alive through JS / promise failures.
 * Render crashes recover via AppErrorBoundary; this is the net for async work.
 */

type GlobalErrorUtils = {
  getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

let installed = false;

export function installProductionErrorHandlers(): void {
  if (installed) return;
  installed = true;

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
      // Release: do not let RN's default fatal handler kill the process.
      if (__DEV__) prev?.(error, isFatal);
    });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rejectionTracking = require("promise/setimmediate/rejection-tracking") as {
      enable: (opts: {
        allRejections: boolean;
        onUnhandled: (id: number, rejection: unknown) => void;
        onHandled: (id: number) => void;
      }) => void;
    };
    rejectionTracking.enable({
      allRejections: true,
      onUnhandled: (_id, rejection) => {
        const msg = rejection instanceof Error ? rejection.message : String(rejection ?? "unknown");
        console.error("[merchant-app] unhandled rejection", msg);
      },
      onHandled: () => undefined,
    });
  } catch {
    const prevRejection = g.onunhandledrejection;
    g.onunhandledrejection = (event) => {
      const reason = event?.reason;
      const msg = reason instanceof Error ? reason.message : String(reason ?? "unknown");
      console.error("[merchant-app] unhandled rejection", msg);
      if (typeof prevRejection === "function") prevRejection(event);
    };
  }
}
