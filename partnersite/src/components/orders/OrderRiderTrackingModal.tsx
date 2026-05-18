'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bike, Loader2, MapPin, X } from 'lucide-react';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';

type TrackingPayload = {
  rider: {
    name: string | null;
    mobile: string | null;
    selfie_url: string | null;
    assignment_status: string | null;
  };
  location: {
    latitude: number;
    longitude: number;
    heading_degrees?: number | null;
    updated_at: string;
  } | null;
};

export type OrderRiderTrackingModalProps = {
  open: boolean;
  onClose: () => void;
  order: OrdersFoodRow | null;
  trackingUrl?: string | null;
};

export function OrderRiderTrackingModal({
  open,
  onClose,
  order,
  trackingUrl,
}: OrderRiderTrackingModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TrackingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orderFoodId = order?.id ?? 0;
  const resolvedTrackingUrl =
    trackingUrl ??
    (orderFoodId > 0 ? `/api/food-orders/${orderFoodId}/rider-tracking` : '');

  useEffect(() => {
    if (!open || orderFoodId <= 0) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(resolvedTrackingUrl)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) {
          setError(json.error);
          setData(null);
        } else {
          setData(json as TrackingPayload);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load rider location');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orderFoodId, resolvedTrackingUrl]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !order || typeof document === 'undefined') return null;

  const label = order.formatted_order_id || `#${order.order_id}`;
  const loc = data?.location;
  const mapsUrl =
    loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)
      ? `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`
      : null;

  return createPortal(
    <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Rider tracking</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-500">Order {label}</p>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <>
              <div className="flex items-start gap-3">
                {data?.rider.selfie_url ? (
                  <img
                    src={data.rider.selfie_url}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover border border-gray-200"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                    <Bike className="h-6 w-6 text-purple-600" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900">{data?.rider.name || 'Delivery partner'}</p>
                  {data?.rider.mobile ? (
                    <a href={`tel:${data.rider.mobile}`} className="text-sm text-blue-600">
                      {data.rider.mobile}
                    </a>
                  ) : null}
                  {data?.rider.assignment_status ? (
                    <p className="text-xs text-gray-500 mt-1 capitalize">
                      {data.rider.assignment_status.replace(/_/g, ' ')}
                    </p>
                  ) : null}
                </div>
              </div>

              {loc ? (
                <div className="rounded-xl border border-gray-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Last known location</p>
                  <p className="font-mono text-sm text-gray-900">
                    {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Updated{' '}
                    {new Date(loc.updated_at).toLocaleString('en-IN', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                  {mapsUrl ? (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline"
                    >
                      <MapPin size={14} />
                      Open in Google Maps
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-gray-500 py-4 text-center">
                  Live location is not available yet. The rider may not have started navigation.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
