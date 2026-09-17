export type SessionRevokedPayload = {
  reason: "revoked" | "invalid_token";
  /** Safe fingerprint of the token that was rejected — must match live session to logout. */
  tokenFingerprint?: string | null;
};

type Listener = (payload: SessionRevokedPayload) => void;

let listeners: Listener[] = [];
/** Dedupe repeated notifies for the same rejected token fingerprint. */
let lastNotifiedFingerprint: string | null = null;

export function onSessionRevoked(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function notifySessionRevoked(payload: SessionRevokedPayload = { reason: "revoked" }) {
  const fp = payload.tokenFingerprint?.trim() || null;
  if (fp && fp === lastNotifiedFingerprint) return;
  if (fp) lastNotifiedFingerprint = fp;

  for (const listener of listeners) {
    try {
      listener(payload);
    } catch {
      // ignore listener errors
    }
  }
}

export function resetSessionRevokedFlag() {
  lastNotifiedFingerprint = null;
}
