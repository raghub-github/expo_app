/** In-app bus so one Supabase channel fans out to the Learning Centre screen. */

type Listener = () => void;
const listeners = new Set<Listener>();

export function onLearningCentreSignal(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitLearningCentreSignal(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore listener errors */
    }
  }
}
