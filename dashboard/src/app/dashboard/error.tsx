"use client";

import { useEffect } from "react";

/**
 * Segment error boundary for `/dashboard/*`.
 * Keeps ControlAppShell (sidebar/header/auth) mounted while isolating page crashes.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkLoad =
    error?.name === "ChunkLoadError" ||
    (typeof error?.message === "string" && error.message.includes("Loading chunk"));

  useEffect(() => {
    console.error("[DashboardError]", {
      name: error?.name,
      message: error?.message,
      digest: error?.digest,
    });
  }, [error]);

  const handleRetry = () => {
    if (isChunkLoad) {
      window.location.reload();
      return;
    }
    reset();
  };

  return (
    <div className="flex min-h-[280px] flex-1 flex-col items-center justify-center rounded-lg border border-amber-200 bg-amber-50/80 p-6 m-4">
      <p className="text-center text-sm font-medium text-amber-900">
        {isChunkLoad
          ? "This page failed to load. Reload to try again."
          : "Something went wrong on this page. The rest of the dashboard is still available."}
      </p>
      {error?.message && !isChunkLoad ? (
        <p className="mt-2 max-w-md text-center text-xs text-amber-800/80 break-words">
          {error.message}
        </p>
      ) : null}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleRetry}
          className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
        >
          Retry
        </button>
        <a
          href="/dashboard"
          className="rounded border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}
