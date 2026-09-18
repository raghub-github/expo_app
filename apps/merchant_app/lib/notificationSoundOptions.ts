/** Build selectable notification sound options from Super Admin upload slots. */
export function buildNotificationSoundOptions(
  slots: [string | null, string | null, string | null],
  storeType?: string | null
): { slot: number; label: string; url: string }[] {
  const typeLabel = formatStoreTypeLabel(storeType);
  const out: { slot: number; label: string; url: string }[] = [];
  slots.forEach((url, i) => {
    const trimmed = url && String(url).trim();
    if (trimmed) {
      out.push({
        slot: i,
        label: typeLabel
          ? `${typeLabel} alert sound ${i + 1}`
          : `GatiMitra Notification - ${i + 1}`,
        url: trimmed,
      });
    }
  });
  return out;
}

function formatStoreTypeLabel(storeType?: string | null): string | null {
  const raw = String(storeType ?? "").trim();
  if (!raw) return null;
  return raw
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function resolveSelectedSoundSlot(
  options: { slot: number }[],
  preferred: number
): number {
  if (options.some((o) => o.slot === preferred)) return preferred;
  return options[0]?.slot ?? 0;
}
