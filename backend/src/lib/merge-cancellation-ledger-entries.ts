/**
 * Merge paired cancellation ledger rows (info + compensation credit) into one display row.
 * Keep in sync with partnersite/src/lib/merge-cancellation-ledger-entries.ts
 */

export type CancellationLedgerDisplay = {
  originalAmount: number;
  creditAmount: number;
  showCancelledStatus: boolean;
};

export type MergeableLedgerEntry = {
  id: number;
  direction?: string | null;
  category?: string | null;
  amount?: number | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  reference_type?: string | null;
  reference_id?: number | null;
  order_id?: number | null;
  formatted_order_id?: string | null;
};

type OrderBucket = {
  info?: MergeableLedgerEntry;
  credits: MergeableLedgerEntry[];
  debits: MergeableLedgerEntry[];
};

function isCancellationBalanceDebit(entry: MergeableLedgerEntry): boolean {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  return (
    meta.entry_type === "order_cancellation" &&
    String(meta.balance_impact ?? "").toLowerCase() === "debit" &&
    String(entry.direction ?? "").toUpperCase() === "DEBIT" &&
    Number(entry.amount ?? 0) > 0
  );
}

function extractFormattedOrderIdFromDescription(
  description: string | null | undefined
): string | null {
  const m = /Order\s+([A-Z]{2,}\d[\w-]*|GMF\d+)/i.exec(description ?? "");
  return m?.[1]?.trim() ?? null;
}

function buildOrderKeyResolver(
  entries: MergeableLedgerEntry[]
): (entry: MergeableLedgerEntry) => string | null {
  const parent = new Map<string, string>();

  const find = (k: string): string => {
    let root = k;
    while (parent.has(root) && parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    return root;
  };

  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const keysForEntry = (entry: MergeableLedgerEntry): string[] => {
    const keys: string[] = [];
    const fmt = entry.formatted_order_id?.trim();
    if (fmt) keys.push(`fmt:${fmt.toUpperCase()}`);

    const fromDesc = extractFormattedOrderIdFromDescription(entry.description);
    if (fromDesc) keys.push(`fmt:${fromDesc.toUpperCase()}`);

    const coreId = Number(entry.order_id);
    if (Number.isFinite(coreId) && coreId > 0) keys.push(`core:${coreId}`);

    const metaCore = Number((entry.metadata as Record<string, unknown> | undefined)?.orders_core_id);
    if (Number.isFinite(metaCore) && metaCore > 0) keys.push(`core:${metaCore}`);

    if (entry.reference_type === "ORDER" && entry.reference_id != null) {
      const foodId = Number(entry.reference_id);
      if (Number.isFinite(foodId) && foodId > 0) keys.push(`food:${foodId}`);
    }

    return keys;
  };

  for (const entry of entries) {
    const keys = keysForEntry(entry);
    if (keys.length === 0) continue;
    const root = keys[0];
    parent.set(root, root);
    for (let i = 1; i < keys.length; i++) union(root, keys[i]);
  }

  return (entry: MergeableLedgerEntry) => {
    const keys = keysForEntry(entry);
    if (keys.length === 0) return null;
    return find(keys[0]);
  };
}

function isCancellationInfoEntry(entry: MergeableLedgerEntry): boolean {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  if (meta.entry_type === "order_cancellation" && meta.balance_impact === "none") return true;
  const display = meta.cancellation_display as CancellationLedgerDisplay | undefined;
  if (
    display &&
    Number(display.originalAmount ?? 0) > 0 &&
    Number(display.creditAmount ?? 0) <= 0
  ) {
    return true;
  }
  if (/cancelled — no merchant credit/i.test(entry.description ?? "")) return true;
  return false;
}

function isCancellationCompensationCredit(entry: MergeableLedgerEntry): boolean {
  if (isCancellationInfoEntry(entry)) return false;
  if (String(entry.direction ?? "").toUpperCase() !== "CREDIT") return false;
  if (String(entry.category ?? "").toUpperCase() !== "ORDER_ADJUSTMENT") return false;

  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  if (meta.compensation_pct != null) return true;
  if (typeof meta.eligible_message === "string" && meta.eligible_message.trim()) return true;
  if (meta.type === "compensation") return true;
  if (/as per policy|compensation/i.test(entry.description ?? "")) return true;

  return true;
}

function groupCancellationEntries(
  entries: MergeableLedgerEntry[]
): Map<string, OrderBucket> {
  const resolveKey = buildOrderKeyResolver(entries);
  const groups = new Map<string, OrderBucket>();

  for (const entry of entries) {
    const key = resolveKey(entry);
    if (!key) continue;

    const bucket = groups.get(key) ?? { credits: [], debits: [] };
    if (isCancellationInfoEntry(entry)) {
      bucket.info = entry;
    } else if (isCancellationBalanceDebit(entry)) {
      bucket.debits.push(entry);
    } else if (isCancellationCompensationCredit(entry)) {
      bucket.credits.push(entry);
    }
    groups.set(key, bucket);
  }

  return groups;
}

function pickCompensationCredit(credits: MergeableLedgerEntry[]): MergeableLedgerEntry | undefined {
  if (!credits.length) return undefined;
  return [...credits].sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0))[0];
}

function pickCancellationInfoEntry(
  related: MergeableLedgerEntry[]
): MergeableLedgerEntry | undefined {
  const infoCandidates = related.filter(
    (e) =>
      isCancellationInfoEntry(e) ||
      String(e.direction ?? "").toUpperCase() !== "CREDIT"
  );
  if (!infoCandidates.length) return undefined;
  return [...infoCandidates].sort(
    (a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0)
  )[0];
}

function metaNumber(meta: Record<string, unknown>, key: string): number {
  const v = Number(meta[key]);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function resolveOriginalOrderAmount(
  info: MergeableLedgerEntry | undefined,
  credit: MergeableLedgerEntry | undefined,
  related: MergeableLedgerEntry[]
): number {
  const creditAmount = Math.max(0, Number(credit?.amount ?? 0));
  const amounts: number[] = [];

  const push = (value: unknown) => {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) amounts.push(n);
  };

  for (const entry of related) {
    if (String(entry.direction ?? "").toUpperCase() === "CREDIT") continue;
    push(entry.amount);
    const meta = (entry.metadata ?? {}) as Record<string, unknown>;
    push(meta.original_order_amount);
    push(meta.order_gross);
    push(meta.net_order_value);
    push(meta.ctm_total);
    push(meta.total_ctm);
  }

  if (info) push(info.amount);

  if (credit) {
    const meta = (credit.metadata ?? {}) as Record<string, unknown>;
    push(meta.original_order_amount);
    push(meta.order_gross);
    push(meta.net_order_value);
    push(meta.ctm_total);
    push(meta.total_ctm);
  }

  let original = amounts.length ? Math.max(...amounts) : 0;

  if ((original <= creditAmount || original === 0) && creditAmount > 0) {
    const meta = (credit?.metadata ?? info?.metadata ?? {}) as Record<string, unknown>;
    let pct = metaNumber(meta, "compensation_pct");
    if (!(pct > 0 && pct < 100)) {
      const desc = String(credit?.description ?? info?.description ?? "");
      const pctMatch = /(\d+(?:\.\d+)?)\s*%/i.exec(desc);
      pct = pctMatch ? Number(pctMatch[1]) : 0;
    }
    if (pct > 0 && pct < 100) {
      original = Math.round((creditAmount / (pct / 100)) * 100) / 100;
    }
  }

  if (original > creditAmount) return original;
  if (original > 0 && creditAmount <= 0) return original;
  return original;
}

function resolveCancellationAmounts(
  info: MergeableLedgerEntry | undefined,
  credit: MergeableLedgerEntry | undefined,
  related: MergeableLedgerEntry[]
): { originalAmount: number; creditAmount: number } {
  const creditAmount = Math.max(0, Number(credit?.amount ?? 0));
  const originalAmount = resolveOriginalOrderAmount(info, credit, related);
  return { originalAmount, creditAmount };
}

export function buildCancellationLedgerDisplayMap(
  entries: MergeableLedgerEntry[]
): Map<number, CancellationLedgerDisplay> {
  const groups = groupCancellationEntries(entries);
  const displayById = new Map<number, CancellationLedgerDisplay>();

  for (const bucket of groups.values()) {
    const credit = pickCompensationCredit(bucket.credits);
    const related = [bucket.info, ...bucket.credits].filter(Boolean) as MergeableLedgerEntry[];
    const { originalAmount, creditAmount } = resolveCancellationAmounts(
      bucket.info,
      credit,
      related
    );

    if (bucket.info && credit) {
      displayById.set(credit.id, {
        originalAmount,
        creditAmount,
        showCancelledStatus: creditAmount <= 0,
      });
      continue;
    }

    if (bucket.info) {
      displayById.set(bucket.info.id, {
        originalAmount: originalAmount || Math.max(0, Number(bucket.info.amount ?? 0)),
        creditAmount: 0,
        showCancelledStatus: true,
      });
      continue;
    }

    if (credit) {
      displayById.set(credit.id, {
        originalAmount,
        creditAmount,
        showCancelledStatus: creditAmount <= 0,
      });
    }
  }

  return displayById;
}

export function mergeCancellationLedgerEntries<T extends MergeableLedgerEntry>(
  entries: T[]
): { entries: T[]; displayById: Map<number, CancellationLedgerDisplay> } {
  const repairedOrderCoreIds = new Set<number>();
  for (const entry of entries) {
    const meta = (entry.metadata ?? {}) as Record<string, unknown>;
    if (meta.trigger_source !== "repair_erroneous_cancel_debit") continue;
    const coreId = Number(meta.orders_core_id);
    if (Number.isFinite(coreId) && coreId > 0) repairedOrderCoreIds.add(coreId);
  }

  const visibleEntries = entries.filter((entry) => {
    const meta = (entry.metadata ?? {}) as Record<string, unknown>;
    if (meta.reversed_by_repair === true) return false;
    if (meta.trigger_source === "repair_erroneous_cancel_debit") return false;
    if (
      isCancellationBalanceDebit(entry) &&
      repairedOrderCoreIds.has(Number(meta.orders_core_id))
    ) {
      return false;
    }
    return true;
  });
  const groups = groupCancellationEntries(visibleEntries);
  const displayById = buildCancellationLedgerDisplayMap(visibleEntries);
  const hiddenIds = new Set<number>();

  for (const bucket of groups.values()) {
    const credit = pickCompensationCredit(bucket.credits);

    if (bucket.info && credit) {
      hiddenIds.add(bucket.info.id);
      for (const extra of bucket.credits) {
        if (extra.id !== credit.id) hiddenIds.add(extra.id);
      }
      for (const debit of bucket.debits) {
        hiddenIds.add(debit.id);
      }
      continue;
    }

    if (bucket.info && bucket.debits.length > 0) {
      const related = [bucket.info, ...bucket.debits] as MergeableLedgerEntry[];
      const { originalAmount } = resolveCancellationAmounts(bucket.info, undefined, related);
      displayById.set(bucket.info.id, {
        originalAmount: originalAmount || Math.max(0, Number(bucket.info.amount ?? 0)),
        creditAmount: 0,
        showCancelledStatus: true,
      });
      for (const debit of bucket.debits) {
        hiddenIds.add(debit.id);
      }
      continue;
    }

    if (credit && bucket.credits.length > 1) {
      for (const extra of bucket.credits) {
        if (extra.id !== credit.id) hiddenIds.add(extra.id);
      }
    }
  }

  const byDescOrder = new Map<string, MergeableLedgerEntry[]>();
  for (const entry of visibleEntries) {
    const oid = extractFormattedOrderIdFromDescription(entry.description);
    if (!oid) continue;
    if (String(entry.category ?? "").toUpperCase() !== "ORDER_ADJUSTMENT") continue;
    const key = oid.toUpperCase();
    const list = byDescOrder.get(key) ?? [];
    list.push(entry);
    byDescOrder.set(key, list);
  }

  for (const list of byDescOrder.values()) {
    if (list.length < 2) continue;
    const info = pickCancellationInfoEntry(list);
    const credit = pickCompensationCredit(
      list.filter((e) => String(e.direction ?? "").toUpperCase() === "CREDIT")
    );
    if (!info || !credit || info.id === credit.id) continue;
    if (hiddenIds.has(credit.id)) continue;

    const { originalAmount, creditAmount } = resolveCancellationAmounts(info, credit, list);

    hiddenIds.add(info.id);
    displayById.set(credit.id, {
      originalAmount,
      creditAmount,
      showCancelledStatus: creditAmount <= 0,
    });
  }

  const merged = visibleEntries
    .filter((entry) => !hiddenIds.has(entry.id))
    .map((entry) => {
      const display = displayById.get(entry.id);
      if (!display) return entry;

      const bucket = [...groups.values()].find((b) => {
        const credit = pickCompensationCredit(b.credits);
        return b.info?.id === entry.id || credit?.id === entry.id;
      });

      const preferredDescription =
        bucket?.credits.find((c) => c.id === entry.id)?.description ??
        bucket?.info?.description ??
        entry.description;

      return {
        ...entry,
        description: preferredDescription ?? entry.description,
        metadata: {
          ...(entry.metadata ?? {}),
          cancellation_display: display,
        },
      };
    });

  return { entries: merged, displayById };
}
