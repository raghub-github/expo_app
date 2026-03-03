"use client";

import { useEffect } from "react";

/**
 * Catches runtime errors (e.g. ChunkLoadError) when loading the store dashboard.
 * ChunkLoadError often fixes itself on full reload, so Retry does window.location.reload().
 */
export default function StoreDashboardError({
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
    console.error("[StoreDashboardError]", error);
  }, [error]);

  const handleRetry = () => {
    if (isChunkLoad) {
      window.location.reload();
      return;
    }
    reset();
  };

  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-amber-200 bg-amber-50/80 p-6">
      <p className="text-center text-sm font-medium text-amber-900">
        {isChunkLoad
          ? "Page failed to load (chunk error). Reload the page to try again."
          : "Failed to load the app. Check your connection and try again."}
      </p>
      <button
        type="button"
        onClick={handleRetry}
        className="mt-4 rounded bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
      >
        Retry
      </button>
    </div>
  );
}
