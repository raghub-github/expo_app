/**
 * Withdrawal Invoice: generate and store invoice when payout is COMPLETED.
 * PDF/CSV generation for merchant download. Idempotent: one invoice per payout_request_id.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const PLATFORM_NAME = process.env.NEXT_PUBLIC_PLATFORM_NAME ?? 'Platform';
const PLATFORM_GSTIN = process.env.PLATFORM_GSTIN ?? '';
const PLATFORM_ADDRESS = process.env.PLATFORM_ADDRESS ?? '';
const PLATFORM_CONTACT_EMAIL = process.env.PLATFORM_CONTACT_EMAIL ?? '';

const GST_ON_COMMISSION_PERCENT = 18;

export interface WithdrawalInvoiceRow {
  id: number;
  payout_request_id: number;
  invoice_number: string;
  merchant_store_id: number;
  wallet_id: number;
  settlement_from: string;
  settlement_to: string;
  approval_date: string | null;
  completed_at: string;
  utr_reference: string | null;
  platform_name: string;
  platform_gstin: string | null;
  platform_address: string | null;
  platform_contact_email: string | null;
  merchant_legal_name: string;
  store_name: string;
  merchant_id_display: string | null;
  merchant_gstin: string | null;
  bank_last4: string | null;
  gross_order_value: number;
  packaging: number;
  addons: number;
  merchant_offers: number;
  refunds: number;
  net_order_value: number;
  commission: number;
  gst_on_commission: number;
  tds: number;
  tcs: number;
  penalties: number;
  subscription_fees: number;
  adjustments: number;
  final_net_payable: number;
}

export interface WithdrawalInvoiceItemRow {
  id: number;
  withdrawal_invoice_id: number;
  order_id: number;
  order_date: string;
  gross_order_value: number;
  packaging: number;
  addons: number;
  merchant_offer: number;
  net_order_value: number;
  commission_percentage: number;
  commission_amount: number;
  gst_on_commission: number;
  tds: number;
  tcs: number;
  penalty: number;
  net_settlement_amount: number;
}

/** Generate next invoice number: INV-YYYYMMDD-XXXX (XXXX = sequence for the day). */
async function nextInvoiceNumber(db: SupabaseClient): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `INV-${today}-`;
  const { data: last } = await db
    .from('withdrawal_invoices')
    .select('invoice_number')
    .like('invoice_number', `${prefix}%`)
    .order('id', { ascending: false })
    .limit(1)
    .single();
  const lastNum = last?.invoice_number ? parseInt(last.invoice_number.slice(prefix.length), 10) || 0 : 0;
  const next = String(lastNum + 1).padStart(4, '0');
  return `${prefix}${next}`;
}

/**
 * Ensure invoice exists for a COMPLETED payout. Idempotent.
 * Call when payout status is set to COMPLETED (admin or webhook).
 */
export async function ensureWithdrawalInvoice(
  db: SupabaseClient,
  payoutRequestId: number
): Promise<{ invoiceId: number; invoiceNumber: string } | null> {
  const { data: payout, error: payoutErr } = await db
    .from('merchant_payout_requests')
    .select('id, wallet_id, amount, commission_percentage, commission_amount, net_payout_amount, status, utr_reference, requested_at, approved_at, processed_at, completed_at, bank_account_id')
    .eq('id', payoutRequestId)
    .single();

  if (payoutErr || !payout) return null;
  if (payout.status !== 'COMPLETED') return null;

  const existing = await db
    .from('withdrawal_invoices')
    .select('id, invoice_number')
    .eq('payout_request_id', payoutRequestId)
    .single();
  if (existing.data) {
    return { invoiceId: existing.data.id, invoiceNumber: existing.data.invoice_number };
  }

  const walletId = payout.wallet_id as number;
  const { data: wallet } = await db
    .from('merchant_wallet')
    .select('merchant_store_id')
    .eq('id', walletId)
    .single();
  if (!wallet) return null;

  const merchantStoreId = wallet.merchant_store_id as number;
  const completedAt = (payout.completed_at || payout.requested_at || new Date().toISOString()) as string;
  const completedDate = completedAt.slice(0, 10);
  const settlementTo = completedDate;
  const fromDate = new Date(completedAt);
  fromDate.setDate(fromDate.getDate() - 31);
  const settlementFrom = fromDate.toISOString().slice(0, 10);

  const { data: store } = await db
    .from('merchant_stores')
    .select('store_id, store_name, parent_id')
    .eq('id', merchantStoreId)
    .single();
  const { data: parent } = store?.parent_id
    ? await db.from('merchant_parents').select('parent_name, parent_merchant_id').eq('id', store.parent_id).single()
    : { data: null };

  let merchantLegalName = (parent?.parent_name ?? store?.store_name ?? 'Merchant') as string;
  const storeName = (store?.store_name ?? 'Store') as string;
  const merchantIdDisplay = (store?.store_id ?? parent?.parent_merchant_id ?? '') as string;

  const { data: taxRow } = await db
    .from('merchant_store_tax_details')
    .select('gst_number')
    .eq('store_id', merchantStoreId)
    .single();
  const merchantGstin = (taxRow?.gst_number as string) ?? null;

  let bankLast4: string | null = null;
  if (payout.bank_account_id) {
    const { data: bank } = await db
      .from('merchant_store_bank_accounts')
      .select('account_number')
      .eq('id', payout.bank_account_id)
      .single();
    const acc = bank?.account_number as string | undefined;
    bankLast4 = acc && acc.length >= 4 ? acc.slice(-4) : null;
  }

  const amount = Number(payout.amount ?? 0);
  const commissionAmount = Number(payout.commission_amount ?? 0);
  const netPayout = Number(payout.net_payout_amount ?? 0);
  const gstOnCommission = Math.round((commissionAmount * GST_ON_COMMISSION_PERCENT) / 100 * 100) / 100;

  let grossOrderValue = amount;
  let packaging = 0;
  let addons = 0;
  let merchantOffers = 0;
  let refunds = 0;
  let netOrderValue = amount;
  let commission = commissionAmount;
  let penalties = 0;
  let subscriptionFees = 0;
  let adjustments = 0;
  let tds = 0;
  let tcs = 0;

  const { data: breakdownRows } = await db
    .from('order_settlement_breakdown')
    .select('order_id, item_total, packaging_charge, merchant_funded_discount, merchant_gross, merchant_net, commission_percentage, commission_amount, settled_at')
    .eq('wallet_id', walletId)
    .gte('settled_at', `${settlementFrom}T00:00:00.000Z`)
    .lte('settled_at', `${settlementTo}T23:59:59.999Z`)
    .eq('settled', true);

  const items: Array<{
    order_id: number;
    order_date: string;
    gross_order_value: number;
    packaging: number;
    addons: number;
    merchant_offer: number;
    net_order_value: number;
    commission_percentage: number;
    commission_amount: number;
    gst_on_commission: number;
    tds: number;
    tcs: number;
    penalty: number;
    net_settlement_amount: number;
  }> = [];

  if (breakdownRows && breakdownRows.length > 0) {
    let sumGross = 0;
    let sumPackaging = 0;
    let sumMerchantOffer = 0;
    let sumNet = 0;
    let sumCommission = 0;
    const orderIds = breakdownRows.map((r: { order_id: number }) => r.order_id);
    let orderDates: Record<number, string> = {};
    const ordersTable = await db.from('orders').select('id, created_at').in('id', orderIds);
    if (ordersTable.data?.length) {
      orderDates = Object.fromEntries((ordersTable.data as { id: number; created_at: string }[]).map((o) => [o.id, o.created_at]));
    }
    const coreTable = await db.from('orders_core').select('id, created_at').in('id', orderIds);
    if (coreTable.data?.length && Object.keys(orderDates).length === 0) {
      orderDates = Object.fromEntries((coreTable.data as { id: number; created_at: string }[]).map((o) => [o.id, o.created_at]));
    }
    for (const row of breakdownRows as Array<{
      order_id: number;
      item_total: number;
      packaging_charge: number;
      merchant_funded_discount: number;
      merchant_gross: number;
      merchant_net: number;
      commission_percentage: number;
      commission_amount: number;
    }>) {
      const gross = Number(row.item_total ?? 0);
      const pkg = Number(row.packaging_charge ?? 0);
      const offer = Number(row.merchant_funded_discount ?? 0);
      const net = Number(row.merchant_net ?? 0);
      const comm = Number(row.commission_amount ?? 0);
      const commPct = Number(row.commission_percentage ?? 0);
      const gst = Math.round((comm * GST_ON_COMMISSION_PERCENT) / 100 * 100) / 100;
      sumGross += gross;
      sumPackaging += pkg;
      sumMerchantOffer += offer;
      sumNet += net;
      sumCommission += comm;
      items.push({
        order_id: row.order_id,
        order_date: orderDates[row.order_id] ?? completedAt,
        gross_order_value: gross,
        packaging: pkg,
        addons: 0,
        merchant_offer: offer,
        net_order_value: net,
        commission_percentage: commPct,
        commission_amount: comm,
        gst_on_commission: gst,
        tds: 0,
        tcs: 0,
        penalty: 0,
        net_settlement_amount: net,
      });
    }
    grossOrderValue = sumGross;
    packaging = sumPackaging;
    merchantOffers = sumMerchantOffer;
    netOrderValue = sumNet;
    commission = sumCommission;
  } else {
    netOrderValue = amount;
    commission = commissionAmount;
  }

  const invoiceNumber = await nextInvoiceNumber(db);

  const { data: inserted, error: insertErr } = await db
    .from('withdrawal_invoices')
    .insert({
      payout_request_id: payoutRequestId,
      invoice_number: invoiceNumber,
      merchant_store_id: merchantStoreId,
      wallet_id: walletId,
      settlement_from: settlementFrom,
      settlement_to: settlementTo,
      approval_date: payout.approved_at ?? payout.completed_at,
      completed_at: completedAt,
      utr_reference: payout.utr_reference ?? null,
      platform_name: PLATFORM_NAME,
      platform_gstin: PLATFORM_GSTIN || null,
      platform_address: PLATFORM_ADDRESS || null,
      platform_contact_email: PLATFORM_CONTACT_EMAIL || null,
      merchant_legal_name: merchantLegalName,
      store_name: storeName,
      merchant_id_display: merchantIdDisplay || null,
      merchant_gstin: merchantGstin,
      bank_last4: bankLast4,
      gross_order_value: grossOrderValue,
      packaging,
      addons,
      merchant_offers: merchantOffers,
      refunds,
      net_order_value: netOrderValue,
      commission,
      gst_on_commission: gstOnCommission,
      tds,
      tcs,
      penalties,
      subscription_fees: subscriptionFees,
      adjustments,
      final_net_payable: netPayout,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    console.error('[invoice-withdrawal] insert invoice failed:', insertErr);
    return null;
  }

  const invoiceId = inserted.id as number;
  if (items.length > 0) {
    await db.from('withdrawal_invoice_items').insert(
      items.map((it) => ({
        withdrawal_invoice_id: invoiceId,
        order_id: it.order_id,
        order_date: it.order_date,
        gross_order_value: it.gross_order_value,
        packaging: it.packaging,
        addons: it.addons,
        merchant_offer: it.merchant_offer,
        net_order_value: it.net_order_value,
        commission_percentage: it.commission_percentage,
        commission_amount: it.commission_amount,
        gst_on_commission: it.gst_on_commission,
        tds: it.tds,
        tcs: it.tcs,
        penalty: it.penalty,
        net_settlement_amount: it.net_settlement_amount,
      }))
    );
  }

  return { invoiceId, invoiceNumber };
}

/** Fetch full invoice by id (for PDF/CSV). Ensures merchant can only access own store. */
export async function getWithdrawalInvoiceForMerchant(
  db: SupabaseClient,
  invoiceId: number,
  merchantStoreId: number
): Promise<{ invoice: WithdrawalInvoiceRow; items: WithdrawalInvoiceItemRow[] } | null> {
  const { data: invoice, error } = await db
    .from('withdrawal_invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('merchant_store_id', merchantStoreId)
    .single();

  if (error || !invoice) return null;

  const { data: items } = await db
    .from('withdrawal_invoice_items')
    .select('*')
    .eq('withdrawal_invoice_id', invoiceId)
    .order('order_date', { ascending: true });

  return {
    invoice: invoice as WithdrawalInvoiceRow,
    items: (items ?? []) as WithdrawalInvoiceItemRow[],
  };
}

/** Get invoice by payout_request_id (for merchant download by payout id). */
export async function getWithdrawalInvoiceByPayoutForMerchant(
  db: SupabaseClient,
  payoutRequestId: number,
  merchantStoreId: number
): Promise<{ invoice: WithdrawalInvoiceRow; items: WithdrawalInvoiceItemRow[] } | null> {
  const { data: inv } = await db
    .from('withdrawal_invoices')
    .select('id')
    .eq('payout_request_id', payoutRequestId)
    .eq('merchant_store_id', merchantStoreId)
    .single();
  if (!inv) return null;
  return getWithdrawalInvoiceForMerchant(db, inv.id, merchantStoreId);
}
