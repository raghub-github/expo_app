export type SessionRevokedPayload = {
  reason: "revoked" | "invalid_token";
};

type Listener = (payload: SessionRevokedPayload) => void;

let listeners: Listener[] = [];
let hasFired = false;

export function onSessionRevoked(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function notifySessionRevoked(payload: SessionRevokedPayload = { reason: "revoked" }) {
  if (hasFired) return;
  hasFired = true;
  for (const listener of listeners) {
    try {
      listener(payload);
    } catch {
      // ignore listener errors
    }
  }
}

export function resetSessionRevokedFlag() {
  hasFired = false;
}
