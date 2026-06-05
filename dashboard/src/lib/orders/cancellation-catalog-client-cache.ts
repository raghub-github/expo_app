import type {
  CancellationAttributeRow,
  CancellationReasonCatalogGrouped,
  CancellationReasonCatalogRow,
} from "@/lib/db/operations/order-cancellation-reason-catalog";
import { normalizeCatalogReasonId } from "@/lib/orders/orderRejectionOptions";

function normalizeGrouped(
  grouped: CancellationReasonCatalogGrouped
): CancellationReasonCatalogGrouped {
  const out: CancellationReasonCatalogGrouped = {};
  for (const [attr, rows] of Object.entries(grouped)) {
    out[attr] = rows.map((row) => {
      const id = normalizeCatalogReasonId(row.id);
      return id != null ? { ...row, id } : row;
    }) as CancellationReasonCatalogRow[];
  }
  return out;
}

type CatalogCache = {
  attributes: CancellationAttributeRow[];
  grouped: CancellationReasonCatalogGrouped;
  fetchedAt: number;
};

let cache: CatalogCache | null = null;
let inflight: Promise<CatalogCache> | null = null;

const TTL_MS = 10 * 60 * 1000;

export async function fetchCancellationCatalogClient(): Promise<CatalogCache> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return cache;
  }
  if (inflight) return inflight;

  inflight = fetch("/api/order-cancellation-reason-catalog", { cache: "no-store" })
    .then(async (res) => {
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        attributes?: CancellationAttributeRow[];
        grouped?: CancellationReasonCatalogGrouped;
        error?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Failed to load cancellation catalog");
      }
      const next: CatalogCache = {
        attributes: Array.isArray(data.attributes) ? data.attributes : [],
        grouped: normalizeGrouped(data.grouped ?? {}),
        fetchedAt: Date.now(),
      };
      cache = next;
      return next;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function invalidateCancellationCatalogClientCache(): void {
  cache = null;
  inflight = null;
}
