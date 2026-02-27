"use client";

/**
 * Catches errors in the root layout (including ChunkLoadError when app/layout chunk fails to load).
 * Replaces the entire root layout with this UI. Must define own <html> and <body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkLoad =
    error?.name === "ChunkLoadError" ||
    error?.message?.includes("Loading chunk") === true;

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fef3c7", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, color: "#92400e", marginBottom: 8 }}>
            {isChunkLoad ? "Failed to load the app" : "Something went wrong"}
          </h1>
          <p style={{ fontSize: 14, color: "#b45309", marginBottom: 20 }}>
            {isChunkLoad
              ? "The page didn’t load in time. Check your connection and try again."
              : error?.message ?? "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={() => {
              reset();
              window.location.reload();
            }}
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
