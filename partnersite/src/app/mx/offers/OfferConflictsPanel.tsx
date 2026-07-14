'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info, Loader2, ShieldAlert } from 'lucide-react';
import type { OfferConflictRow } from './offer-form-constants';

type Props = {
  merchantStoreId: number | null;
  draftPayload: Record<string, unknown>;
  excludeOfferId?: number | null;
};

export function OfferConflictsPanel({ merchantStoreId, draftPayload, excludeOfferId }: Props) {
  const [loading, setLoading] = useState(false);
  const [conflicts, setConflicts] = useState<OfferConflictRow[]>([]);

  useEffect(() => {
    if (!merchantStoreId) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/merchant/offers/conflicts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            storeId: merchantStoreId,
            validFrom: draftPayload.valid_from,
            validTill: draftPayload.valid_till,
            menuItemIds: draftPayload.menu_item_ids,
            categoryIds: draftPayload.category_ids,
            priority: draftPayload.priority,
            isStackable: draftPayload.is_stackable,
            excludeOfferId: excludeOfferId ?? null,
            applicableOnDays: draftPayload.applicable_on_days,
            applicableTimeStart: draftPayload.applicable_time_start,
            applicableTimeEnd: draftPayload.applicable_time_end,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        setConflicts(Array.isArray(data.conflicts) ? data.conflicts : []);
      } catch {
        if (!cancelled) setConflicts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = window.setTimeout(run, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [merchantStoreId, draftPayload, excludeOfferId]);

  if (!merchantStoreId) return null;

  const errors = conflicts.filter((c) => c.severity === 'error');
  const warnings = conflicts.filter((c) => c.severity === 'warning');

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-100 flex items-center gap-2">
        <ShieldAlert size={16} className="text-amber-700" />
        <h4 className="text-sm font-bold text-amber-900">Conflict detection</h4>
        {loading ? <Loader2 size={14} className="animate-spin text-amber-600 ml-auto" /> : null}
      </div>
      <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
        {conflicts.length === 0 && !loading ? (
          <p className="text-xs text-emerald-700 flex items-center gap-1.5">
            <Info size={14} /> No conflicts detected with active offers.
          </p>
        ) : null}
        {errors.map((c, i) => (
          <ConflictRow key={`e-${i}`} conflict={c} />
        ))}
        {warnings.map((c, i) => (
          <ConflictRow key={`w-${i}`} conflict={c} />
        ))}
      </div>
    </div>
  );
}

function ConflictRow({ conflict }: { conflict: OfferConflictRow }) {
  const Icon = conflict.severity === 'error' ? AlertTriangle : Info;
  const color =
    conflict.severity === 'error'
      ? 'text-red-800 bg-red-50 border-red-200'
      : 'text-amber-800 bg-amber-50 border-amber-200';
  return (
    <div className={`text-xs rounded-lg border px-2.5 py-2 flex gap-2 ${color}`}>
      <Icon size={14} className="shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">{conflict.message}</p>
        {conflict.conflictingOfferTitle ? (
          <p className="opacity-80 mt-0.5">vs {conflict.conflictingOfferTitle}</p>
        ) : null}
      </div>
    </div>
  );
}
