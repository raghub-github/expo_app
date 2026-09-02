/**
 * Crash surface for the customer app.
 *
 * Release builds run Hermes with no red box: an exception that escapes React —
 * a render throw, a WebSocket `onmessage` handler, an unawaited promise — kills
 * the process instantly with no dialog. That reads to the user as "the app
 * closed by itself". `installGlobalErrorHandlers()` intercepts both channels so
 * a non-fatal error is logged and swallowed instead of terminating the app, and
 * a genuinely fatal one is recorded before the process goes down.
 *
 * `reportHandledError` is the single funnel — point it at Sentry/Crashlytics
 * when one is wired up; today it keeps a bounded in-memory ring buffer that
 * `getRecentCrashBreadcrumbs()` can surface from a debug screen.
 */

const MAX_BREADCRUMBS = 25;

export type CrashBreadcrumb = {
  at: number;
  source: string;
  message: string;
  stack?: string;
  fatal: boolean;
};

const breadcrumbs: CrashBreadcrumb[] = [];

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function toStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack ?? undefined : undefined;
}

/** Records an error we caught and handled. Never throws. */
export function reportHandledError(
  source: string,
  error: unknown,
  { fatal = false }: { fatal?: boolean } = {}
): void {
  try {
    const entry: CrashBreadcrumb = {
      at: Date.now(),
      source,
      message: toMessage(error),
      stack: toStack(error),
      fatal,
    };
    breadcrumbs.push(entry);
    if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();

    if (__DEV__) {
      console.error(`[crash:${source}]${fatal ? " FATAL" : ""}`, entry.message, entry.stack ?? "");
    }
  } catch {
    // Reporting must never be the thing that crashes us.
  }
}

export function getRecentCrashBreadcrumbs(): readonly CrashBreadcrumb[] {
  return breadcrumbs;
}

let installed = false;

/**
 * Must run before the React tree mounts (imported for side effect from the root
 * layout) so an exception thrown during the very first render is still caught.
 */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  // 1. Uncaught JS exceptions (native `ErrorUtils` bridge).
  const globalWithErrorUtils = global as typeof global & {
    ErrorUtils?: {
      getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
    };
  };
  const errorUtils = globalWithErrorUtils.ErrorUtils;
  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      reportHandledError("uncaught", error, { fatal: Boolean(isFatal) });
      // Dev: keep the red box. Release: never hand back to RN — its default
      // fatal path exits the process ("app closed by itself").
      if (__DEV__) previous?.(error, isFatal);
    });
  }

  // 2. Unhandled promise rejections. Hermes exposes the RN polyfill's tracker;
  //    without this an awaited service call that rejects with nothing catching
  //    it can escalate to a fatal on some Android builds.
  const rejectionTracking = safeRequireRejectionTracking();
  rejectionTracking?.enable({
    allRejections: true,
    onUnhandled: (id: number, rejection: unknown) => {
      reportHandledError(`unhandled-rejection:${id}`, rejection);
    },
    onHandled: () => {
      // Late-handled rejection — nothing to do, but the hook must exist or the
      // tracker logs its own noisy warning.
    },
  });
}

type RejectionTracking = {
  enable: (options: {
    allRejections: boolean;
    onUnhandled: (id: number, rejection: unknown) => void;
    onHandled: (id: number) => void;
  }) => void;
};

function safeRequireRejectionTracking(): RejectionTracking | null {
  try {
    // Deep import — not part of RN's public surface, so it is guarded.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("promise/setimmediate/rejection-tracking") as RejectionTracking;
  } catch {
    return null;
  }
}
