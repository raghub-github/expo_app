export function formatRtoOtpDisplay(status: string, rto: string | null): string | null {
  if (!rto) return null;
  return status.toUpperCase() === "RTO" ? rto : "XXXX";
}
