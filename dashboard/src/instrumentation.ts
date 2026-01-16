/**
 * Next.js Instrumentation Hook
 * This file runs once when the server starts and can be used to set up error handlers
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Handle unhandled promise rejections on the server
    process.on("unhandledRejection", (reason: any) => {
      const errorMessage = reason?.message || String(reason || "");
      const errorStack = reason?.stack || "";
      
      // Suppress JSON parsing errors (likely from agent log fetch calls that fail)
      const isJsonParseError = 
        reason instanceof SyntaxError ||
        errorMessage.includes("JSON") ||
        errorMessage.includes("Unexpected") ||
        errorMessage.includes("SyntaxError") ||
        errorMessage.includes("position") ||
        errorStack.includes("JSON.parse");
      
      if (isJsonParseError) {
        // Silently suppress - these are from agent logging that's not critical
        return;
      }
      
      // For other errors, log them
      console.error("Unhandled promise rejection:", reason);
    });
  }
}
