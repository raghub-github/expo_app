export function formatNotificationTime(createdAt: number, now = Date.now()): string {
  if (!Number.isFinite(createdAt) || createdAt <= 0) return "";
  const diff = Math.max(0, now - createdAt);
  const mins = Math.floor(diff / 60_000);
  if (!Number.isFinite(mins)) return "";
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (!Number.isFinite(hrs)) return "";
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (!Number.isFinite(days)) return "";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  const d = new Date(createdAt);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}
