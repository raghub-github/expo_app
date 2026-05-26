import Link from "next/link";

// Server component — explicitly opts out of the client-side providers in the
// root layout. Without this file Next.js generates an internal 404 component
// that React 19 + Turbopack fail to prerender (the QueryProvider/Session
// provider tree is fine at runtime but trips during static export).
export const dynamic = "force-static";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 48, margin: 0, color: "#111" }}>404</h1>
      <p style={{ fontSize: 18, color: "#555", margin: 0 }}>
        This page could not be found.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 8,
          padding: "10px 18px",
          background: "#111",
          color: "#fff",
          borderRadius: 8,
          textDecoration: "none",
          fontSize: 15,
        }}
      >
        Go home
      </Link>
    </main>
  );
}
