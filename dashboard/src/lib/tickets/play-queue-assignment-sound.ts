const MIN_GAP_MS = 1200;

let lastPlayedAt = 0;

/**
 * Play assignment buzzer (debounced). Browsers may block audio until user gesture — failures are ignored.
 */
export function playQueueAssignmentSound(soundUrl: string): void {
  const url = String(soundUrl ?? "").trim();
  if (!url.startsWith("/")) return;
  const now = Date.now();
  if (now - lastPlayedAt < MIN_GAP_MS) return;
  lastPlayedAt = now;
  try {
    const audio = new Audio(url);
    audio.volume = 0.75;
    void audio.play().catch(() => {
      /* autoplay policy */
    });
  } catch {
    /* ignore */
  }
}
