'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bike, ExternalLink, Loader2, MapPin, Phone, X } from 'lucide-react';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import { useMerchantRiderTracking } from '@/hooks/useMerchantRiderTracking';
import type { MerchantMapPin, MerchantRiderTrackingPayload } from '@/lib/merchant-rider-tracking';
import { resolveStoreMapLngLat, toLatLngPin } from '@/lib/parse-order-map-coords';
import { MerchantRiderLiveMap } from '@/components/orders/MerchantRiderLiveMap';
import { isPartnerOrderClosedForContact } from '@/lib/partner-orders-unify';

export type OrderRiderTrackingModalProps = {
  open: boolean;
  onClose: () => void;
  order: OrdersFoodRow | null;
  /** Preload API + map while order is selected (before modal opens). */
  preload?: boolean;
  trackingUrl?: string | null;
  merchantStoreLat?: number | null;
  merchantStoreLon?: number | null;
  merchantStoreName?: string | null;
};

function resolveEffectiveStore(
  data: MerchantRiderTrackingPayload | null,
  merchantStoreLat?: number | null,
  merchantStoreLon?: number | null
): MerchantMapPin | null {
  if (data?.store) return data.store;
  const lngLat = resolveStoreMapLngLat({
    merchantLat: merchantStoreLat,
    merchantLon: merchantStoreLon,
    pickupLat: data?.pickup?.latitude,
    pickupLon: data?.pickup?.longitude,
  });
  return lngLat ? toLatLngPin(lngLat) : null;
}

export function OrderRiderTrackingModal({
  open,
  onClose,
  order,
  preload = false,
  trackingUrl,
  merchantStoreLat,
  merchantStoreLon,
  merchantStoreName,
}: OrderRiderTrackingModalProps) {
  const orderFoodId = order?.id ?? 0;
  const active = preload || open;

  const { data, loading, error } = useMerchantRiderTracking(orderFoodId, {
    enabled: active && orderFoodId > 0,
    poll: active && orderFoodId > 0,
    trackingUrl,
    merchantStoreLat,
    merchantStoreLon,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!active) return;
    void import('mapbox-gl');
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = '/mapbike.png';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, [active]);

  if (!order || !active || typeof document === 'undefined') return null;

  const label = order.formatted_order_id || `#${order.order_id}`;
  const loc = data?.location ?? null;
  const effectiveStore = resolveEffectiveStore(data, merchantStoreLat, merchantStoreLon);
  const effectiveStoreName = data?.store_name ?? merchantStoreName ?? null;

  const mapsUrl =
    loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)
      ? `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`
      : null;

  const mapReady = Boolean(effectiveStore || loc);
  const showBlockingLoader = loading && !mapReady;

  const shellClass = open
    ? 'fixed inset-0 z-[2500] flex items-center justify-center p-3 sm:p-4'
    : 'pointer-events-none fixed -left-[9999px] top-0 -z-[1] h-[520px] w-[720px] overflow-hidden';

  const cardClass = open
    ? 'relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl'
    : 'relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white';

  return createPortal(
    <div className={shellClass} role={open ? 'presentation' : undefined} aria-hidden={!open}>
      {open ? (
        <button
          type="button"
          className="absolute inset-0 bg-black/55 backdrop-blur-sm"
          aria-label="Close"
          onClick={onClose}
        />
      ) : null}
      <div
        className={cardClass}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-labelledby={open ? 'rider-tracking-title' : undefined}
        onClick={open ? (e) => e.stopPropagation() : undefined}
      >
        {open ? (
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-5">
            <div>
              <h2 id="rider-tracking-title" className="text-base font-bold text-gray-900 sm:text-lg">
                Live rider tracking
              </h2>
              <p className="text-xs text-gray-500">Order {label}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 hover:bg-gray-100"
              aria-label="Close"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        ) : null}

        <div className="relative min-h-[240px] flex-1 bg-slate-100 sm:min-h-[320px]">
          {showBlockingLoader ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : null}
          {error && !mapReady ? (
            <div className="flex h-full min-h-[240px] items-center justify-center p-6 text-sm text-red-600">
              {error}
            </div>
          ) : mapReady ? (
            <MerchantRiderLiveMap
              className="h-[42vh] min-h-[240px] sm:h-[48vh] w-full"
              visible={open}
              location={loc}
              store={effectiveStore}
              storeName={effectiveStoreName}
              trail={data?.trail ?? []}
            />
          ) : null}
        </div>

        {open ? (
          <div className="shrink-0 space-y-3 border-t border-gray-100 p-4 sm:p-5">
            {data ? (
              <div className="flex items-center gap-3">
                {data.rider.selfie_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.rider.selfie_url}
                    alt=""
                    className="h-11 w-11 rounded-full border border-gray-200 object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-purple-100">
                    <Bike className="h-5 w-5 text-purple-600" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-900">
                    {data.rider.name || 'Delivery partner'}
                  </p>
                  {data.rider.mobile && !isPartnerOrderClosedForContact(order.order_status) ? (
                    <a
                      href={`tel:${data.rider.mobile}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                      aria-label="Call rider"
                    >
                      <Phone size={14} aria-hidden />
                    </a>
                  ) : null}
                </div>
                {mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    <ExternalLink size={14} />
                    Maps
                  </a>
                ) : null}
              </div>
            ) : null}

            {loc ? (
              <p className="text-[11px] text-gray-500">
                <MapPin size={12} className="mr-1 inline text-gray-400" />
                Updated{' '}
                {new Date(loc.updated_at).toLocaleString('en-IN', {
                  dateStyle: 'short',
                  timeStyle: 'medium',
                })}
                {loc.source === 'live_location' ? ' · live GPS' : ' · route ping'}
              </p>
            ) : mapReady ? (
              <p className="text-center text-sm text-gray-500">
                Store is on the map. Rider GPS will appear when they start navigation.
              </p>
            ) : !showBlockingLoader && !error ? (
              <p className="text-center text-sm text-gray-500">
                Live location is not available yet. Set store coordinates in store settings.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
