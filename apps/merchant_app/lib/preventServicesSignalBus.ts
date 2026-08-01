/** In-app bus so one Supabase channel fans out to order refresh + notice UX. */

type Listener = () => void;
const listeners = new Set<Listener>();

export function onPreventServicesSignal(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitPreventServicesSignal(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore listener errors */
    }
  }
}
