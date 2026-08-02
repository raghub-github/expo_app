/** Deep links that only reopen the notifications inbox — pushing them stacks the same list forever. */
export function isNotificationsInboxUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const raw = url.trim().toLowerCase();
  if (!raw) return false;
  const path = raw.split("?")[0]?.split("#")[0] ?? raw;
  return (
    path === "/notifications" ||
    path === "notifications" ||
    path === "/(tabs)/notifications" ||
    path.endsWith("/notifications") ||
    path === "/notification" ||
    path === "notification"
  );
}
