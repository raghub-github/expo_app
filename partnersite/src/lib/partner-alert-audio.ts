/**
 * Autoplay gate for the incoming-order chime.
 *
 * Browsers refuse `audio.play()` until the document has seen a user gesture, and
 * the rejection is silent — a dashboard tab left open on the orders page would
 * sit through a new order without ever ringing. We listen for the first gesture,
 * prime playback, and replay any chime the browser refused. A synthesised beep is
 * the last resort when the configured sound file itself cannot be played.
 */

const PRIME_SOURCE = '/notification.wav';

let unlocked = false;
let listening = false;
let audioContext: AudioContext | null = null;
let blockedRetry: (() => void) | null = null;
const blockedSubscribers = new Set<(blocked: boolean) => void>();

const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

function notifyBlocked(blocked: boolean) {
  for (const cb of blockedSubscribers) cb(blocked);
}

function resolveAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioContext) return audioContext;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioContext = new Ctor();
  } catch {
    audioContext = null;
  }
  return audioContext;
}

async function primePlayback(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const probe = new Audio(PRIME_SOURCE);
    probe.muted = true;
    probe.volume = 0;
    await probe.play();
    probe.pause();
    probe.currentTime = 0;
    unlocked = true;
  } catch {
    /* still blocked — the gesture listener stays attached */
  }
  const ctx = resolveAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }
  if (ctx?.state === 'running') unlocked = true;
}

function handleGesture() {
  void (async () => {
    await primePlayback();
    const retry = blockedRetry;
    blockedRetry = null;
    if (retry) {
      notifyBlocked(false);
      retry();
    }
  })();
}

/** Attach the one-time-per-tab gesture listeners. Safe to call from every mount. */
export function installAlertAudioUnlock(): void {
  if (typeof window === 'undefined' || listening) return;
  listening = true;
  for (const event of GESTURE_EVENTS) {
    window.addEventListener(event, handleGesture, { passive: true, capture: true });
  }
}

export function isAlertAudioBlocked(): boolean {
  return blockedRetry != null;
}

export function subscribeAlertAudioBlocked(cb: (blocked: boolean) => void): () => void {
  blockedSubscribers.add(cb);
  return () => {
    blockedSubscribers.delete(cb);
  };
}

/** Remember a chime the browser refused so the next gesture can ring it. */
export function queueBlockedChime(retry: () => void): void {
  blockedRetry = retry;
  notifyBlocked(true);
}

export function clearBlockedChime(): void {
  if (!blockedRetry) return;
  blockedRetry = null;
  notifyBlocked(false);
}

/** Unlock + ring immediately, for an explicit "enable sound" click. */
export function unlockAlertAudioNow(): void {
  handleGesture();
}

/**
 * Oscillator chirp for when the configured sound file cannot be fetched or
 * decoded — an audible alert always beats silence.
 */
export async function playFallbackBeep(volume01: number, beeps = 2): Promise<boolean> {
  const ctx = resolveAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    if (ctx.state !== 'running') return false;
    const gain = ctx.createGain();
    gain.gain.value = Math.min(1, Math.max(0.05, volume01)) * 0.6;
    gain.connect(ctx.destination);
    const start = ctx.currentTime;
    for (let i = 0; i < Math.max(1, beeps); i += 1) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = i % 2 === 0 ? 880 : 1180;
      osc.connect(gain);
      osc.start(start + i * 0.28);
      osc.stop(start + i * 0.28 + 0.22);
    }
    return true;
  } catch {
    return false;
  }
}
