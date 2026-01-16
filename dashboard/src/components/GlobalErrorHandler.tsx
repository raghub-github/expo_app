"use client";

import { useEffect } from "react";

/**
 * Global error handler to suppress JSON parsing errors from agent log fetch calls
 * This component should be included in the root layout to catch errors across all pages
 */
export function GlobalErrorHandler() {
  useEffect(() => {
    // Handle unhandled promise rejections (like JSON parsing errors)
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      const errorMessage = error?.message || String(error || "");
      const errorStack = error?.stack || "";
      
      // Suppress JSON parsing errors (likely from agent log fetch calls that fail)
      // Check for common JSON parsing error patterns
      const isJsonParseError = 
        error instanceof SyntaxError ||
        errorMessage.includes("JSON") ||
        errorMessage.includes("Unexpected") ||
        errorMessage.includes("SyntaxError") ||
        errorMessage.includes("position") ||
        errorStack.includes("JSON.parse");
      
      if (isJsonParseError) {
        event.preventDefault();
        // Silently suppress - these are from agent logging or failed fetch responses
        return;
      }
      
      // For other errors, log them but don't prevent default behavior
      console.error("Unhandled promise rejection:", error);
    };

    // Handle general errors
    const handleError = (event: ErrorEvent) => {
      const errorMessage = event.message || String(event.error || "");
      const errorStack = event.error?.stack || "";
      
      // Suppress JSON parsing errors
      const isJsonParseError = 
        errorMessage.includes("JSON") ||
        errorMessage.includes("Unexpected") ||
        errorMessage.includes("SyntaxError") ||
        errorMessage.includes("position") ||
        errorStack.includes("JSON.parse");
      
      if (isJsonParseError) {
        event.preventDefault();
        return;
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleError);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  return null; // This component doesn't render anything
}
