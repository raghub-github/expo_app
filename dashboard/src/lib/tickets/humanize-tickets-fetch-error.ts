/** Map raw API / network errors to agent-friendly copy for the tickets list. */
export function humanizeTicketsFetchError(raw: string | undefined | null): string {
  const msg = (raw ?? "").trim();
  if (!msg) return "Something went wrong while loading tickets.";

  const lower = msg.toLowerCase();

  if (lower === "not_found" || (lower.includes("route") && lower.includes("not found"))) {
    return "The tickets service could not be reached. Refresh the page. If this keeps happening, confirm the dashboard API is running.";
  }
  if (lower === "user not found") {
    return "Your login is not linked to a dashboard system user. Ask a super admin to add your account.";
  }
  if (lower.includes("not authenticated") || lower.includes("session invalid")) {
    return "Your session expired. Sign in again to continue.";
  }
  if (lower.includes("insufficient permissions") || lower.includes("forbidden")) {
    return "You do not have permission to view tickets.";
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return "The server took too long to respond. Try again in a moment.";
  }
  if (lower.includes("database") || lower.includes("503")) {
    return "The database is busy. Please wait a few seconds and retry.";
  }

  return msg;
}
