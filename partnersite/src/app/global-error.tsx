"use client";

import { useEffect } from "react";

/**
 * Catches root layout failures (including ChunkLoadError when app/layout times out).
 * Next.js may omit `reset` in dev — hard reload recovers stale webpack chunks.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
}) {
  const isChunkLoad =
    error?.name === "ChunkLoadError" ||
    error?.message?.includes("Loading chunk") === true;

  // OneDrive + cold webpack compile can take minutes; the browser times out the
  // layout chunk once. Auto-reload once so a ready .next serves the chunk.
  useEffect(() => {
    if (!isChunkLoad || typeof window === "undefined") return;
    const key = "partnersite:chunk-reload";
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore quota */
    }
    const t = window.setTimeout(() => window.location.reload(), 400);
    return () => window.clearTimeout(t);
  }, [isChunkLoad]);

  useEffect(() => {
    if (!isChunkLoad || typeof window === "undefined") return;
    const clear = () => {
      try {
        sessionStorage.removeItem("partnersite:chunk-reload");
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("load", clear);
    // Clear after a successful paint window so a later stale chunk can retry once.
    const t = window.setTimeout(clear, 15_000);
    return () => {
      window.removeEventListener("load", clear);
      window.clearTimeout(t);
    };
  }, [isChunkLoad]);

  const handleRetry = () => {
    try {
      sessionStorage.removeItem("partnersite:chunk-reload");
    } catch {
      /* ignore */
    }
    if (!isChunkLoad && typeof reset === "function") {
      try {
        reset();
      } catch {
        /* fall through */
      }
    }
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "#fef3c7",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, color: "#92400e", marginBottom: 8 }}>
            {isChunkLoad ? "Loading the app…" : "Something went wrong"}
          </h1>
          <p style={{ fontSize: 14, color: "#b45309", marginBottom: 20 }}>
            {isChunkLoad
              ? "Dev compile is slow — reloading automatically. If this sticks, run npm run dev:clean."
              : error?.message ?? "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              color: "#78350f",
              background: "#fcd34d",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </body>
    </html>
  );
}
