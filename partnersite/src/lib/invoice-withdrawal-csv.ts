/**
 * Generate withdrawal invoice CSV (one row per order + summary row).
 */

import type { WithdrawalInvoiceRow, WithdrawalInvoiceItemRow } from './invoice-withdrawal';

function fmt(num: number): string {
  return num.toFixed(2);
}

function escapeCsv(val: string | number): string {
  const s = String(val);
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const CSV_HEADERS = [
  'Order ID',
  'Order Date',
  'Gross Order Value',
  'Packaging',
  'Add-ons',
  'Merchant Offer',
  'Net Order Value',
  'Commission %',
  'Commission Amount',
  'GST on Commission',
  'TDS',
  'TCS',
  'Penalty',
  'Net Settlement Amount',
];

export function generateWithdrawalInvoiceCsv(
  invoice: WithdrawalInvoiceRow,
  items: WithdrawalInvoiceItemRow[]
): string {
  const rows: string[][] = [CSV_HEADERS];

  for (const it of items) {
    const orderDate = new Date(it.order_date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    rows.push([
      String(it.order_id),
      orderDate,
      fmt(it.gross_order_value),
      fmt(it.packaging),
      fmt(it.addons),
      fmt(it.merchant_offer),
      fmt(it.net_order_value),
      fmt(it.commission_percentage),
      fmt(it.commission_amount),
      fmt(it.gst_on_commission),
      fmt(it.tds),
      fmt(it.tcs),
      fmt(it.penalty),
      fmt(it.net_settlement_amount),
    ]);
  }

  rows.push([]);
  rows.push(['Summary', '', fmt(invoice.gross_order_value), fmt(invoice.packaging), fmt(invoice.addons), fmt(invoice.merchant_offers), fmt(invoice.net_order_value), '', fmt(invoice.commission), fmt(invoice.gst_on_commission), fmt(invoice.tds), fmt(invoice.tcs), fmt(invoice.penalties), fmt(invoice.final_net_payable)]);

  return rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}
