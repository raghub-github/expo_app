/**
 * Next.js Instrumentation Hook
 * Runs once when the server starts — silence expected Auth/fetch AbortError spam permanently.
 *
 * Next.js logs client-aborted requests and orphaned Auth probes via console.error
 * before onRequestError / route catch can run (see vercel/next.js#84649). Filtering
 * console.error + unhandledRejection is the only reliable permanent silence.
 */

function isBenignAbortNoise(value: unknown): boolean {
  if (value == null) return false;

  if (typeof value === "object") {
    const r = value as {
      name?: string;
      message?: string;
      code?: string | number;
      cause?: { code?: string; message?: string; name?: string };
    };
    const name = String(r.name ?? "").toLowerCase();
    const msg = String(r.message ?? "").toLowerCase();
    const code = String(r.code ?? r.cause?.code ?? "");
    const causeName = String(r.cause?.name ?? "").toLowerCase();
    const causeMsg = String(r.cause?.message ?? "").toLowerCase();

    if (
      name === "aborterror" ||
      name === "authfetchtimeouterror" ||
      causeName === "aborterror"
    ) {
      return true;
    }
    if (
      msg.includes("aborted") ||
      msg.includes("abort") ||
      causeMsg.includes("aborted") ||
      causeMsg.includes("abort")
    ) {
      return true;
    }
    if (
      code === "ABORT" ||
      code === "ABORT_ERR" ||
      code === "20" ||
      Number(r.code) === 20 ||
      code === "TIMEOUT" ||
      code === "REQUEST_ABORTED"
    ) {
      return true;
    }
    if (
      msg.includes("auth probe") ||
      msg.includes("auth fetch timeout") ||
      msg.includes("request aborted") ||
      msg.includes("session check timeout")
    ) {
      return true;
    }
    if (
      msg.includes("fetch failed") ||
      causeMsg.includes("fetch failed") ||
      code === "UND_ERR_CONNECT_TIMEOUT" ||
      code === "UND_ERR_SOCKET_TIMEOUT" ||
      code.startsWith("UND_ERR_") ||
      msg.includes("connect timeout") ||
      causeMsg.includes("connect timeout")
    ) {
      return true;
    }
  }

  const asString = String(value).toLowerCase();
  return (
    asString.includes("aborterror") ||
    asString.includes("this operation was aborted") ||
    asString.includes("und_err_connect_timeout") ||
    asString.includes("auth fetch timeout") ||
    asString.includes("auth probe")
  );
}

function argsLookLikeAbortNoise(args: unknown[]): boolean {
  return args.some((arg) => isBenignAbortNoise(arg));
}

/** Webpack pack files deleted mid-compile (Windows Temp / AV). Do not crash the server. */
function isStaleWebpackPackError(value: unknown): boolean {
  if (value == null) return false;
  const err = value as { code?: string; message?: string; path?: string };
  const code = String(err.code ?? "");
  const msg = String(err.message ?? value);
  const filePath = String(err.path ?? "");
  if (code !== "ENOENT" && !msg.includes("ENOENT")) return false;
  return (
    msg.includes(".pack") ||
    filePath.endsWith(".pack") ||
    msg.toLowerCase().includes("packfilecachestrategy") ||
    filePath.includes("gatimitra-dashboard-webpack")
  );
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const dns = await import("node:dns");
      dns.setDefaultResultOrder("ipv4first");
    } catch {
      // ignore older Node
    }

    const originalError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      if (argsLookLikeAbortNoise(args)) return;
      if (args.some((arg) => isStaleWebpackPackError(arg))) return;
      originalError(...args);
    };

    const originalWarn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      if (argsLookLikeAbortNoise(args)) return;
      originalWarn(...args);
    };

    process.on("unhandledRejection", (reason: unknown) => {
      if (isBenignAbortNoise(reason)) return;
      if (isStaleWebpackPackError(reason)) {
        originalWarn(
          "[instrumentation] Webpack cache pack missing (ignored; restart with a clean cache if compiles keep failing)."
        );
        return;
      }

      const errorMessage =
        reason && typeof reason === "object" && "message" in reason
          ? String((reason as { message?: unknown }).message ?? "")
          : String(reason ?? "");
      const errorStack = reason instanceof Error ? reason.stack ?? "" : "";

      const isJsonParseError =
        reason instanceof SyntaxError ||
        errorMessage.includes("JSON") ||
        errorMessage.includes("Unexpected") ||
        errorMessage.includes("SyntaxError") ||
        errorMessage.includes("position") ||
        errorStack.includes("JSON.parse");

      if (isJsonParseError) {
        originalWarn(
          "[instrumentation] JSON parse rejection (fix the call site that parses non-JSON):",
          reason instanceof Error ? reason.message : String(reason)
        );
        return;
      }

      originalError("Unhandled promise rejection:", reason);
    });
  }
}

export function onRequestError(error: unknown): void {
  // Swallow expected aborts so observability hooks never treat them as crashes.
  if (isBenignAbortNoise(error)) return;
}

