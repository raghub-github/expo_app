import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveMerchantCancellationFields } from '@/lib/merchant-cancellation-fields';

type CatalogRow = {
  order_id: number;
  reason_text: string | null;
  metadata: Record<string, unknown> | null;
  display_reason?: string | null;
  cancelled_by_label?: string | null;
  cancelled_by_type?: string | null;
  attribute?: string | null;
  rejection_label?: string | null;
};

export async function enrichOrdersWithCancellationDisplay<
  T extends {
    order_id: number;
    order_status?: string | null;
    rejected_reason?: string | null;
    cancelled_by_label?: string | null;
    cancelled_by_type?: string | null;
    cancellation_details?: unknown;
  },
>(db: SupabaseClient, orders: T[]): Promise<T[]> {
  const cancelledIds = orders
    .filter((o) => String(o.order_status ?? '').toUpperCase() === 'CANCELLED')
    .map((o) => Number(o.order_id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (cancelledIds.length === 0) return orders;

  const catalogByOrder = new Map<number, CatalogRow>();
  const refundReasonByOrder = new Map<number, string>();

  try {
    const { data: reasons } = await db
      .from('order_cancellation_reasons')
      .select('order_id, reason_text, metadata')
      .in('order_id', cancelledIds)
      .order('created_at', { ascending: false });

    for (const row of (reasons ?? []) as CatalogRow[]) {
      const oid = Number(row.order_id);
      if (!catalogByOrder.has(oid)) {
        catalogByOrder.set(oid, {
          order_id: oid,
          reason_text: row.reason_text,
          metadata:
            row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
              ? (row.metadata as Record<string, unknown>)
              : null,
        });
      }
    }
  } catch (e) {
    console.error('[enrichOrdersWithCancellationDisplay] catalog', e);
  }

  try {
    const { data: refunds } = await db
      .from('order_refunds')
      .select('order_id, refund_reason')
      .in('order_id', cancelledIds)
      .order('created_at', { ascending: false });

    for (const row of refunds ?? []) {
      const oid = Number((row as { order_id: number }).order_id);
      const reason = String((row as { refund_reason?: string }).refund_reason ?? '').trim();
      if (!refundReasonByOrder.has(oid) && reason) refundReasonByOrder.set(oid, reason);
    }
  } catch (e) {
    console.error('[enrichOrdersWithCancellationDisplay] refunds', e);
  }

  return orders.map((order) => {
    if (String(order.order_status ?? '').toUpperCase() !== 'CANCELLED') return order;
    const oid = Number(order.order_id);
    const catalog = catalogByOrder.get(oid);
    const meta = catalog?.metadata;
    const resolved = resolveMerchantCancellationFields({
      rejected_reason: order.rejected_reason,
      cancelled_by_label: order.cancelled_by_label,
      cancelled_by_type: order.cancelled_by_type,
      cancellation_details: order.cancellation_details,
      catalog_attribute:
        catalog?.attribute ??
        (meta && typeof meta.attribute === 'string' ? meta.attribute : null),
      catalog_rejection:
        catalog?.rejection_label ??
        (meta && typeof meta.rejection === 'string' ? meta.rejection : null),
      reason_text: catalog?.reason_text ?? null,
      refund_reason: refundReasonByOrder.get(oid) ?? null,
      ocr_display_reason: catalog?.display_reason ?? null,
      ocr_cancelled_by_label: catalog?.cancelled_by_label ?? null,
      ocr_cancelled_by_type: catalog?.cancelled_by_type ?? null,
    });
    return {
      ...order,
      rejected_reason: resolved.rejected_reason,
      cancelled_by_label: resolved.cancelled_by_label,
      cancelled_by_type: resolved.cancelled_by_type,
    };
  });
}
