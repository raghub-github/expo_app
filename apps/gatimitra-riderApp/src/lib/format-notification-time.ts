export function formatNotificationTime(createdAt: number, now = Date.now()): string {
  const diff = Math.max(0, now - createdAt);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}
