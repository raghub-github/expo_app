"use client";

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

  const handleRetry = () => {
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
            {isChunkLoad ? "Failed to load the app" : "Something went wrong"}
          </h1>
          <p style={{ fontSize: 14, color: "#b45309", marginBottom: 20 }}>
            {isChunkLoad
              ? "The page didn’t load in time. Click Retry, or restart with npm run dev:clean."
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
