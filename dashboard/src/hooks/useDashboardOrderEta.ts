"use client";

/**
 * Admin live ETA — same server stageAware stream as apps.
 * Polls GET /api/orders/:id/eta; upgrades to eta.updated.v1 when WS env + token exist.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type DashboardStageAwareEta = {
  currentStage: string;
  merchantPrepEta: number | null;
  riderToMerchantEta: number | null;
  pickupEta: number | null;
  customerDeliveryEta: number | null;
  displayEta: number | null;
  totalEta: number;
  etaVersion: number;
  etaSource: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  promisedAt: string | null;
  lastUpdatedAt: string;
  freezeCountdown: boolean;
};

type EtaPayload = {
  orderIdText?: string;
  stageAware?: DashboardStageAwareEta;
  customer?: {
    etaMinutes: number | null;
    contextLabel: string;
    merchantDelayed: boolean;
  };
  live?: { reason?: string; createdAt?: string } | null;
};

function shouldAccept(incoming: number, prev: number | null): boolean {
  if (!Number.isFinite(incoming) || incoming <= 0) return false;
  if (prev == null || prev <= 0) return true;
  return incoming > prev;
}

export function useDashboardOrderEta(orderIdText: string | null | undefined) {
  const [eta, setEta] = useState<EtaPayload | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const versionRef = useRef<number | null>(null);

  const apply = useCallback((payload: EtaPayload) => {
    const v = Number(payload.stageAware?.etaVersion ?? 0);
    if (payload.stageAware && !shouldAccept(v, versionRef.current)) return;
    if (Number.isFinite(v) && v > 0) versionRef.current = v;
    setEta(payload);
  }, []);

  const load = useCallback(async () => {
    const id = String(orderIdText ?? "").trim();
    if (!id) return;
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}/eta`, {
        cache: "no-store",
      });
      const json = (await res.json()) as EtaPayload & { success?: boolean; ok?: boolean };
      if (!res.ok) return;
      apply(json);
    } catch {
      /* ignore */
    }
  }, [orderIdText, apply]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), wsConnected ? 45_000 : 12_000);
    return () => clearInterval(id);
  }, [load, wsConnected]);

  useEffect(() => {
    const id = String(orderIdText ?? "").trim().toUpperCase();
    const wsBase = (process.env.NEXT_PUBLIC_WS_BASE_URL ?? "").replace(/\/+$/, "");
    const apiBase = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(/\/+$/, "");
    if (!id || !wsBase || !apiBase || !/^[A-Z0-9-]{4,32}$/.test(id)) {
      setWsConnected(false);
      return;
    }

    let cancelled = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      if (cancelled) return;
      try {
        // Prefer cookie session via same-origin proxy if present; else skip WS.
        const ticketRes = await fetch(`${apiBase}/v1/auth/ws-ticket`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderIds: [id] }),
        });
        if (!ticketRes.ok || cancelled) {
          setWsConnected(false);
          return;
        }
        const { ticket } = (await ticketRes.json()) as { ticket?: string };
        if (!ticket || cancelled) return;

        ws = new WebSocket(`${wsBase}/v1/ws?ticket=${encodeURIComponent(ticket)}`);
        ws.onopen = () => {
          if (!cancelled) setWsConnected(true);
        };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as {
              type?: string;
              etaVersion?: number;
              stageAware?: DashboardStageAwareEta;
              customer?: EtaPayload["customer"];
              reason?: string;
              at?: string;
            };
            if (msg.type !== "eta.updated.v1" && msg.type !== "eta.updated") return;
            if (!msg.stageAware) return;
            apply({
              orderIdText: id,
              stageAware: msg.stageAware,
              customer: msg.customer,
              live: { reason: msg.reason, createdAt: msg.at },
            });
          } catch {
            /* ignore */
          }
        };
        ws.onclose = () => {
          setWsConnected(false);
          if (!cancelled) timer = setTimeout(() => void connect(), 8_000);
        };
      } catch {
        setWsConnected(false);
      }
    };

    void connect();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [orderIdText, apply]);

  return { eta, wsConnected, reload: load };
}
