/** Build selectable notification sound options from platform upload slots. */
export function buildNotificationSoundOptions(
  slots: [string | null, string | null, string | null]
): { slot: number; label: string; url: string }[] {
  const out: { slot: number; label: string; url: string }[] = [];
  slots.forEach((url, i) => {
    const trimmed = url && String(url).trim();
    if (trimmed) {
      out.push({ slot: i, label: `GatiMitra Notification - ${i + 1}`, url: trimmed });
    }
  });
  return out;
}

export function resolveSelectedSoundSlot(
  options: { slot: number }[],
  preferred: number
): number {
  if (options.some((o) => o.slot === preferred)) return preferred;
  return options[0]?.slot ?? 0;
}
