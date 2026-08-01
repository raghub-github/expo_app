'use client';

/**
 * Partner Site — Service Restricted notice.
 * Modal once per signal version; dismissible banner for the session; reappears
 * on refresh while the store's delivery circle still overlaps a block.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const MODAL_TITLE = 'Service Restricted';
const MODAL_BODY =
  'Some delivery areas around your store have been temporarily disabled by GatiMitra Admin. Orders from those blocked areas will not be assigned to your store. Orders from all other active delivery areas will continue normally.';
const BANNER_TEXT =
  '⚠️ Some nearby delivery areas are currently restricted by GatiMitra Admin. Orders from unrestricted areas will continue as normal.';
const ACK_KEY_PREFIX = 'prevent_services_partner_ack_v:';

function ackKeyForStore(storeId: string): string {
  return `${ACK_KEY_PREFIX}${storeId}`;
}

type ImpactResponse = {
  ok?: boolean;
  affected?: boolean;
  signalVersion?: number;
};

function apiBase(): string {
  const raw =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    '';
  return raw.replace(/\/+$/, '');
}

async function fetchStoreImpact(storeId: number | string): Promise<ImpactResponse | null> {
  const base = apiBase();
  if (!base || storeId == null || storeId === '') return null;
  try {
    const res = await fetch(
      `${base}/v1/prevent-services/impact/store?storeId=${encodeURIComponent(String(storeId))}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    return (await res.json()) as ImpactResponse;
  } catch {
    return null;
  }
}

function RestrictedModal({ open, onGotIt }: { open: boolean; onGotIt: () => void }) {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-restricted-title"
    >
      <div className="relative w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
        <div className="px-5 pt-6 pb-4 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <ShieldAlert className="h-6 w-6 text-amber-700" aria-hidden />
          </div>
          <h2 id="service-restricted-title" className="text-base font-semibold text-gray-900">
            {MODAL_TITLE}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">{MODAL_BODY}</p>
        </div>
        <div className="border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={onGotIt}
            className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
          >
            Got It
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function RestrictedBanner({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden border-b border-amber-200 bg-amber-50 py-2 pr-8"
      role="status"
      aria-live="polite"
    >
      <div className="flex w-max animate-store-closed-marquee">
        {[0, 1].map((copy) => (
          <span
            key={copy}
            className="shrink-0 px-6 text-xs font-medium text-amber-900 whitespace-nowrap sm:text-sm"
            aria-hidden={copy === 1}
          >
            {BANNER_TEXT}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-amber-800 hover:bg-amber-100"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ServiceRestrictedNotice({ storeId }: { storeId?: number | string | null }) {
  const id =
    storeId != null && String(storeId).trim() !== '' && String(storeId) !== '---'
      ? String(storeId).trim()
      : null;

  const [affected, setAffected] = useState(false);
  const [signalVersion, setSignalVersion] = useState(0);
  const [ackedVersion, setAckedVersion] = useState<number | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (id == null || typeof window === 'undefined') {
      setAckedVersion(null);
      return;
    }
    try {
      const raw = window.localStorage.getItem(ackKeyForStore(id));
      const n = raw != null ? Number(raw) : null;
      setAckedVersion(Number.isFinite(n as number) ? (n as number) : null);
    } catch {
      setAckedVersion(null);
    }
  }, [id]);

  const refresh = useCallback(async () => {
    if (id == null) {
      setAffected(false);
      return;
    }
    const impact = await fetchStoreImpact(id);
    const next = impact?.affected === true;
    setAffected(next);
    setSignalVersion(Number(impact?.signalVersion ?? 0) || 0);
    if (!next) setBannerDismissed(false);
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!affected) setBannerDismissed(false);
  }, [affected]);
  useEffect(() => {
    // Reuse the shared browser client — a second createClient() from
    // @supabase/supabase-js spawns another GoTrueClient on the same storage key.
    const client = createClient();
    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void refresh();
      }, 150);
    };
    const channel = client
      .channel('prevent-services-partner-notice')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prevent_service_signals' },
        () => schedule()
      )
      .subscribe();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      try {
        client.removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
  }, [refresh]);

  const needsModal =
    affected && signalVersion > 0 && (ackedVersion == null || ackedVersion < signalVersion);
  const showBanner = affected && !needsModal && !bannerDismissed;

  const onGotIt = () => {
    if (id == null) return;
    setAckedVersion(signalVersion);
    setBannerDismissed(false);
    try {
      window.localStorage.setItem(ackKeyForStore(id), String(signalVersion));
    } catch {
      /* ignore */
    }
  };

  if (!affected && !needsModal) return null;

  return (
    <>
      <RestrictedModal open={needsModal} onGotIt={onGotIt} />
      {showBanner ? <RestrictedBanner onClose={() => setBannerDismissed(true)} /> : null}
    </>
  );
}
