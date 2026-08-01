/**
 * Format accumulated work seconds showing only non-zero units.
 * Months use 30 days and years use 365 days (elapsed duration, not calendar).
 * Example: 1d 4h 28m 41s  (never "0y 0mo …")
 */
export function formatAnalyticsDuration(totalSeconds: number): string {
  let remaining = Math.max(0, Math.floor(totalSeconds));
  if (remaining === 0) return "0s";

  const yearSeconds = 365 * 24 * 60 * 60;
  const monthSeconds = 30 * 24 * 60 * 60;
  const daySeconds = 24 * 60 * 60;
  const hourSeconds = 60 * 60;

  const years = Math.floor(remaining / yearSeconds);
  remaining %= yearSeconds;
  const months = Math.floor(remaining / monthSeconds);
  remaining %= monthSeconds;
  const days = Math.floor(remaining / daySeconds);
  remaining %= daySeconds;
  const hours = Math.floor(remaining / hourSeconds);
  remaining %= hourSeconds;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  const parts: string[] = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}mo`);
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}
