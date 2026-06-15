const CHANNEL_NAME = 'gatimitra-partner-incoming-order-v1';
const LS_PING_KEY = 'gatimitra-partner-incoming-order-ping';

export type IncomingOrderBroadcast = {
  storeId: string;
  orderId: number;
  ts: number;
};

/** Broadcast new incoming order to other browser tabs (same origin). */
export function broadcastIncomingOrderAlert(payload: IncomingOrderBroadcast): void {
  if (typeof window === 'undefined') return;
  try {
    const bc = new BroadcastChannel(CHANNEL_NAME);
    bc.postMessage(payload);
    bc.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
  try {
    localStorage.setItem(
      LS_PING_KEY,
      JSON.stringify({ ...payload, nonce: Math.random() })
    );
  } catch {
    /* ignore */
  }
}

export function subscribeIncomingOrderAlert(
  cb: (payload: IncomingOrderBroadcast) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL_NAME);
    bc.onmessage = (ev: MessageEvent<IncomingOrderBroadcast>) => {
      const p = ev.data;
      if (p?.storeId && Number.isFinite(Number(p.orderId))) cb(p);
    };
  } catch {
    /* ignore */
  }

  const onStorage = (ev: StorageEvent) => {
    if (ev.key !== LS_PING_KEY || !ev.newValue) return;
    try {
      const p = JSON.parse(ev.newValue) as IncomingOrderBroadcast;
      if (p?.storeId && Number.isFinite(Number(p.orderId))) cb(p);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('storage', onStorage);

  return () => {
    bc?.close();
    window.removeEventListener('storage', onStorage);
  };
}
