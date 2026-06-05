import { getSql } from "../client";

export async function isPaymentEngineMigrated(): Promise<boolean> {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'payment_cancellation_rules'
      ) AS ok
    `;
    return Boolean((rows[0] as { ok?: boolean })?.ok);
  } catch {
    return false;
  }
}

export async function listPaymentCancellationRules() {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM payment_cancellation_rules
    ORDER BY priority ASC, order_milestone, cancelled_by NULLS LAST, id
  `;
  return rows as Record<string, unknown>[];
}

export async function insertPaymentCancellationRule(data: {
  rule_code: string;
  rule_name: string;
  order_milestone: string;
  cancelled_by?: string | null;
  merchant_gets_payment?: boolean;
  merchant_payment_value?: number;
  customer_refund_mode?: string;
  customer_refund_value?: number;
  platform_keeps_commission?: boolean;
  priority?: number;
  is_active?: boolean;
}) {
  const sql = getSql();
  const [row] = await sql`
    INSERT INTO payment_cancellation_rules (
      rule_code, rule_name, order_milestone, cancelled_by,
      merchant_gets_payment, merchant_payment_mode, merchant_payment_value,
      customer_refund_mode, customer_refund_mode_calc, customer_refund_value,
      platform_keeps_commission, priority, is_active
    ) VALUES (
      ${data.rule_code},
      ${data.rule_name},
      ${data.order_milestone}::payment_order_milestone,
      ${data.cancelled_by || null}::payment_cancelled_by,
      ${data.merchant_gets_payment ?? false},
      'PERCENTAGE',
      ${data.merchant_payment_value ?? 0},
      ${data.customer_refund_mode ?? "NONE"},
      'PERCENTAGE',
      ${data.customer_refund_value ?? 0},
      ${data.platform_keeps_commission ?? true},
      ${data.priority ?? 100},
      ${data.is_active ?? true}
    )
    RETURNING *
  `;
  return row as Record<string, unknown>;
}

export async function updatePaymentCancellationRule(
  id: number,
  data: Record<string, unknown>
) {
  const sql = getSql();
  const [existing] = await sql`SELECT * FROM payment_cancellation_rules WHERE id = ${id}`;
  if (!existing) throw new Error("Rule not found");
  const e = existing as Record<string, unknown>;

  const cancelledBy =
    data.cancelled_by !== undefined
      ? data.cancelled_by === "" || data.cancelled_by === null
        ? null
        : String(data.cancelled_by)
      : (e.cancelled_by as string | null);

  const [row] = await sql`
    UPDATE payment_cancellation_rules SET
      rule_name = ${String(data.rule_name ?? e.rule_name)},
      order_milestone = ${String(data.order_milestone ?? e.order_milestone)}::payment_order_milestone,
      cancelled_by = ${cancelledBy}::payment_cancelled_by,
      merchant_gets_payment = ${Boolean(data.merchant_gets_payment ?? e.merchant_gets_payment)},
      merchant_payment_value = ${Number(data.merchant_payment_value ?? e.merchant_payment_value ?? 0)},
      customer_refund_mode = ${String(data.customer_refund_mode ?? e.customer_refund_mode)},
      customer_refund_value = ${Number(data.customer_refund_value ?? e.customer_refund_value ?? 0)},
      platform_keeps_commission = ${Boolean(data.platform_keeps_commission ?? e.platform_keeps_commission)},
      priority = ${Number(data.priority ?? e.priority ?? 100)},
      is_active = ${Boolean(data.is_active ?? e.is_active)},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return row as Record<string, unknown>;
}
