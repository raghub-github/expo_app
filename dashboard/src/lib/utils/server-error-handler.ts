/**
 * Server-side error handler to suppress JSON parsing errors from agent log fetch calls
 * This should be imported early in the application lifecycle
 */

// Only run on server-side
if (typeof window === "undefined") {
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

  // Handle uncaught exceptions
  process.on("uncaughtException", (error: Error) => {
    const errorMessage = error?.message || String(error || "");
    const errorStack = error?.stack || "";
    
    // Suppress JSON parsing errors
    const isJsonParseError = 
      error instanceof SyntaxError ||
      errorMessage.includes("JSON") ||
      errorMessage.includes("Unexpected") ||
      errorMessage.includes("SyntaxError") ||
      errorMessage.includes("position") ||
      errorStack.includes("JSON.parse");
    
    if (isJsonParseError) {
      // Silently suppress
      return;
    }
    
    // For other errors, log them
    console.error("Uncaught exception:", error);
  });
}
