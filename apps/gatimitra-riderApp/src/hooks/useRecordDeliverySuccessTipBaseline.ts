import { useEffect } from "react";
import { riderApi } from "@/src/services/api/riderApi";
import {
  isRiderTipLedgerCredit,
  ledgerEntryMatchesOrder,
} from "@/src/lib/rider-ledger-tip";
import {
  markTipLedgerEntriesCelebrated,
  recordOrderTipBaseline,
} from "@/src/lib/rider-tip-celebration-storage";

/**
 * Pre-delivery tips are shown in the success breakdown only.
 * Mark any existing tip ledger rows for this order as "seen" so the global
 * post-delivery tip sheet does not fire for checkout tips.
 */
export function useRecordDeliverySuccessTipBaseline(
  orderId: string,
  initialTipAmount: number,
  displayOrderId?: string
) {
  useEffect(() => {
    const id = orderId.trim();
    if (!id) return;

    let cancelled = false;

    void (async () => {
      const baseline = Math.max(0, Math.round(Number(initialTipAmount) || 0));
      await recordOrderTipBaseline(id, baseline, [displayOrderId]);

      if (baseline <= 0) return;

      try {
        const ledger = await riderApi.getLedger({
          segment: "all",
          period: "this_month",
          limit: 50,
        });
        if (cancelled) return;

        const orderRefs = normalizeOrderRefs(id, displayOrderId);
        const tipEntryIds = ledger.entries
          .filter(
            (entry) =>
              isRiderTipLedgerCredit(entry) &&
              orderRefs.some((ref) => ledgerEntryMatchesOrder(entry, ref))
          )
          .map((entry) => entry.id);

        if (tipEntryIds.length > 0) {
          await markTipLedgerEntriesCelebrated(tipEntryIds);
        }
      } catch {
        /* best-effort — global watcher will still apply baseline */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId, initialTipAmount, displayOrderId]);
}

function normalizeOrderRefs(...ids: (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw?.trim();
    if (!id) continue;
    if (!out.some((v) => v.toLowerCase() === id.toLowerCase())) out.push(id);
  }
  return out;
}
