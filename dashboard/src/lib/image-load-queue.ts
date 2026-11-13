/**
 * Limits concurrent browser image loads so /api/attachments/proxy (and other
 * assets) do not open dozens of HTTP/2 streams at once — which was causing
 * ERR_HTTP2_PROTOCOL_ERROR and starving navigation/API requests in dev.
 */
const MAX_CONCURRENT = 3;

let active = 0;
const waiters: Array<() => void> = [];

function pump() {
  while (active < MAX_CONCURRENT && waiters.length > 0) {
    const next = waiters.shift();
    if (next) next();
  }
}

/** Resolves with a release() callback that must be called when the load ends. */
export function acquireImageSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    const grant = () => {
      active += 1;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
        pump();
      });
    };
    if (active < MAX_CONCURRENT) {
      grant();
    } else {
      waiters.push(grant);
    }
  });
}
