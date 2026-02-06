/**
 * Shared helpers for API error handling.
 * Ensures we always return JSON (never HTML) and handle DB timeouts.
 */

const POSTGRES_TIMEOUT_CODE = "57014";

export function isPostgresTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code === POSTGRES_TIMEOUT_CODE || e.cause?.code === POSTGRES_TIMEOUT_CODE;
}

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return "Unknown error";
}

/** Return 503 JSON for timeout, 500 JSON for other errors. Use in API route catch blocks. */
export function apiErrorResponse(error: unknown): { body: object; status: number } {
  if (isPostgresTimeout(error)) {
    return {
      body: { success: false, error: "Request timed out. Please try again.", code: "TIMEOUT" },
      status: 503,
    };
  }
  return {
    body: { success: false, error: getApiErrorMessage(error), code: "ERROR" },
    status: 500,
  };
}
