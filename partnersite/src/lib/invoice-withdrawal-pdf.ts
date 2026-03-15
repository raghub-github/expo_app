/**
 * Generate withdrawal invoice PDF using jsPDF.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { WithdrawalInvoiceRow, WithdrawalInvoiceItemRow } from './invoice-withdrawal';

function fmt(num: number): string {
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function generateWithdrawalInvoicePdf(
  invoice: WithdrawalInvoiceRow,
  items: WithdrawalInvoiceItemRow[]
): Uint8Array {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  const pageW = 210; // A4 width in mm
  let y = 18;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('WITHDRAWAL INVOICE', pageW / 2, y, { align: 'center' });
  y += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  // Platform details
  doc.setFont('helvetica', 'bold');
  doc.text('Platform Details', 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(`${invoice.platform_name}`, 14, y);
  y += 5;
  if (invoice.platform_gstin) {
    doc.text(`GSTIN: ${invoice.platform_gstin}`, 14, y);
    y += 5;
  }
  if (invoice.platform_address) {
    doc.text(invoice.platform_address, 14, y);
    y += 5;
  }
  if (invoice.platform_contact_email) {
    doc.text(invoice.platform_contact_email, 14, y);
    y += 5;
  }
  y += 4;

  // Merchant details
  doc.setFont('helvetica', 'bold');
  doc.text('Merchant Details', 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(`Legal Name: ${invoice.merchant_legal_name}`, 14, y);
  y += 5;
  doc.text(`Store: ${invoice.store_name}`, 14, y);
  y += 5;
  if (invoice.merchant_id_display) {
    doc.text(`Merchant ID: ${invoice.merchant_id_display}`, 14, y);
    y += 5;
  }
  if (invoice.merchant_gstin) {
    doc.text(`GSTIN: ${invoice.merchant_gstin}`, 14, y);
    y += 5;
  }
  if (invoice.bank_last4) {
    doc.text(`Bank (Last 4): ****${invoice.bank_last4}`, 14, y);
    y += 5;
  }
  y += 4;

  // Withdrawal details
  doc.setFont('helvetica', 'bold');
  doc.text('Withdrawal Details', 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(`Invoice Number: ${invoice.invoice_number}`, 14, y);
  y += 5;
  doc.text(`Withdrawal ID: ${invoice.payout_request_id}`, 14, y);
  y += 5;
  doc.text(`Settlement Period: ${fmtDate(invoice.settlement_from)} to ${fmtDate(invoice.settlement_to)}`, 14, y);
  y += 5;
  doc.text(`Approval Date: ${fmtDate(invoice.approval_date)}`, 14, y);
  y += 5;
  doc.text(`UTR Reference: ${invoice.utr_reference ?? '—'}`, 14, y);
  y += 8;

  // Financial summary table
  doc.setFont('helvetica', 'bold');
  doc.text('Financial Summary', 14, y);
  y += 6;

  const summaryRows: [string, string][] = [
    ['Gross Order Value', fmt(invoice.gross_order_value)],
    ['Packaging', fmt(invoice.packaging)],
    ['Add-ons', fmt(invoice.addons)],
    ['Merchant Offers', fmt(-invoice.merchant_offers)],
    ['Refunds', fmt(-invoice.refunds)],
    ['Net Order Value', fmt(invoice.net_order_value)],
    ['Commission', fmt(-invoice.commission)],
    ['GST on Commission (18%)', fmt(-invoice.gst_on_commission)],
    ['TDS', invoice.tds ? fmt(-invoice.tds) : '—'],
    ['TCS', invoice.tcs ? fmt(-invoice.tcs) : '—'],
    ['Penalties', invoice.penalties ? fmt(-invoice.penalties) : '—'],
    ['Subscription Fees', invoice.subscription_fees ? fmt(-invoice.subscription_fees) : '—'],
    ['Adjustments', fmt(invoice.adjustments)],
    ['Final Net Payable', fmt(invoice.final_net_payable)],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Component', 'Amount']],
    body: summaryRows,
    theme: 'plain',
    margin: { left: 14 },
    columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 60, halign: 'right' } },
    styles: { fontSize: 9 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Tax breakdown (simplified)
  doc.setFont('helvetica', 'bold');
  doc.text('Tax Breakdown', 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(`GST on Commission (18%): ${fmt(invoice.gst_on_commission)}`, 14, y);
  y += 6;
  if (invoice.tds > 0) doc.text(`TDS: ${fmt(invoice.tds)}`, 14, y);
  y += 8;

  // Disclaimer
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text(
    'This is a system-generated invoice. For any discrepancy, please contact support with this invoice number.',
    14,
    y,
    { maxWidth: pageW - 28 }
  );
  y += 10;
  doc.text(
    'Generated on ' + new Date().toLocaleString('en-IN') + '. This document is for record and tax purposes.',
    14,
    y
  );

  return new Uint8Array(doc.output('arraybuffer'));
}
