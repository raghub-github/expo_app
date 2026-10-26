/** Token from this install that the server should delete after the new one is stored. */
export function previousTokenToRetire(
  stored: string | null | undefined,
  next: string | null | undefined,
): string | null {
  const prev = String(stored ?? "").trim();
  const cur = String(next ?? "").trim();
  if (!prev || !cur || prev === cur) return null;
  return prev;
}

/**
 * Foreground announcement: the FCM alert and a local tray copy would both show.
 * Background and terminated stay on the system notification (no second local copy).
 */
export function customerAnnouncementForegroundDecision(input: {
  isAnnouncement: boolean;
  alreadyTrayCopy: boolean;
  appIsActive: boolean;
}): { suppressRemoteAlert: boolean; postLocalTray: boolean } {
  const post =
    input.isAnnouncement && !input.alreadyTrayCopy && input.appIsActive;
  return { suppressRemoteAlert: post, postLocalTray: post };
}
