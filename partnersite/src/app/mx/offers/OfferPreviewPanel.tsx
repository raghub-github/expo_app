'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, TrendingDown } from 'lucide-react';
import type { OfferPreviewPricing } from './offer-form-constants';

type Props = {
  merchantStoreId: number | null;
  menuItemId?: number | null;
  draftPayload: Record<string, unknown>;
  excludeOfferId?: number | null;
};

export function OfferPreviewPanel({
  merchantStoreId,
  menuItemId,
  draftPayload,
  excludeOfferId,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [pricing, setPricing] = useState<OfferPreviewPricing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!merchantStoreId) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/merchant/offers/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            storeId: merchantStoreId,
            menuItemId: menuItemId ?? undefined,
            draftOffer: draftPayload,
            excludeOfferId: excludeOfferId ?? null,
            sampleQuantity: 1,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.sample) {
          setPricing(null);
          setError(data.error ?? 'Preview unavailable — select a product or save basic details');
          return;
        }
        const s = data.sample;
        setPricing({
          mrp: s.mrp,
          sellingPrice: s.sellingPrice,
          merchantDiscount: s.merchantDiscount,
          platformDiscount: s.platformDiscount ?? 0,
          couponDiscount: s.couponDiscount ?? 0,
          finalPrice: s.finalPrice,
          merchantSettlement: s.merchantSettlement,
          appliedOfferTitles: s.appliedOfferTitles ?? [],
        });
      } catch {
        if (!cancelled) setError('Could not load live preview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = window.setTimeout(run, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [merchantStoreId, menuItemId, draftPayload, excludeOfferId]);

  if (!merchantStoreId) {
    return (
      <p className="text-xs text-gray-500 rounded-xl border border-dashed border-gray-200 p-4">
        Store context loading…
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white overflow-hidden">
      <div className="px-4 py-3 border-b border-violet-100 flex items-center gap-2">
        <TrendingDown size={16} className="text-violet-600" />
        <h4 className="text-sm font-bold text-violet-900">Live price preview</h4>
        {loading ? <Loader2 size={14} className="animate-spin text-violet-500 ml-auto" /> : null}
      </div>
      <div className="p-4 space-y-2 text-sm">
        {error && !pricing ? (
          <p className="text-xs text-amber-700">{error}</p>
        ) : pricing ? (
          <>
            <Row label="MRP" value={pricing.mrp} strike />
            <Row label="Selling price" value={pricing.sellingPrice} strike />
            <Row label="Merchant discount" value={-pricing.merchantDiscount} accent="text-emerald-600" />
            {pricing.platformDiscount > 0 ? (
              <Row label="Platform discount" value={-pricing.platformDiscount} accent="text-blue-600" />
            ) : null}
            {pricing.couponDiscount > 0 ? (
              <Row label="Coupon" value={-pricing.couponDiscount} accent="text-rose-600" />
            ) : null}
            <div className="pt-2 border-t border-violet-100 flex justify-between items-center">
              <span className="font-semibold text-gray-800">Customer pays</span>
              <span className="text-lg font-bold text-violet-700">₹{pricing.finalPrice}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-600">
              <span>Merchant settlement (est.)</span>
              <span className="font-semibold">₹{pricing.merchantSettlement}</span>
            </div>
            {pricing.appliedOfferTitles.length > 0 ? (
              <p className="text-[10px] text-gray-500 pt-1">
                Applied: {pricing.appliedOfferTitles.join(', ')}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-gray-500">Enter offer details to see preview.</p>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strike,
  accent,
}: {
  label: string;
  value: number;
  strike?: boolean;
  accent?: string;
}) {
  const display = value < 0 ? `-₹${Math.abs(value).toFixed(0)}` : `₹${value.toFixed(0)}`;
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={`font-medium ${accent ?? ''} ${strike ? 'line-through text-gray-400' : ''}`}>
        {display}
      </span>
    </div>
  );
}
