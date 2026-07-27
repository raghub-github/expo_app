/**
 * Next.js Instrumentation Hook
 * This file runs once when the server starts and can be used to set up error handlers
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Prefer IPv4 when resolving Supabase (Cloudflare). Dual-stack lookups on
    // Windows often hit UND_ERR_CONNECT_TIMEOUT on one address family first.
    try {
      const dns = await import("node:dns");
      dns.setDefaultResultOrder("ipv4first");
    } catch {
      // ignore older Node
    }

    // Handle unhandled promise rejections on the server
    process.on("unhandledRejection", (reason: any) => {
      const errorMessage = reason?.message || String(reason || "");
      const errorStack = reason?.stack || "";
      const causeCode =
        reason?.cause?.code ||
        reason?.code ||
        "";

      // Supabase Auth connect timeouts are handled via cookie-session fallback;
      // a floating rejection from undici/Next still shows up here occasionally.
      const isSupabaseConnectNoise =
        errorMessage.includes("fetch failed") ||
        causeCode === "UND_ERR_CONNECT_TIMEOUT" ||
        causeCode === "UND_ERR_SOCKET_TIMEOUT" ||
        String(causeCode).startsWith("UND_ERR_");

      if (isSupabaseConnectNoise) {
        console.warn(
          "[instrumentation] Supabase Auth network blip (using session fallback when possible):",
          causeCode || errorMessage
        );
        return;
      }
      
      // Suppress JSON parsing errors (likely from agent log fetch calls that fail)
      const isJsonParseError = 
        reason instanceof SyntaxError ||
        errorMessage.includes("JSON") ||
        errorMessage.includes("Unexpected") ||
        errorMessage.includes("SyntaxError") ||
        errorMessage.includes("position") ||
        errorStack.includes("JSON.parse");
      
      if (isJsonParseError) {
        // Log source once so we can fix the call site (then remove or reduce logging)
        console.warn(
          "[instrumentation] JSON parse rejection (fix the call site that parses non-JSON):",
          reason instanceof Error ? reason.stack : String(reason)
        );
        return;
      }
      
      // For other errors, log them
      console.error("Unhandled promise rejection:", reason);
    });
  }
}
