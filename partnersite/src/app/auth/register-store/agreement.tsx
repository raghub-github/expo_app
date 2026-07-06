"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import {
  getDefaultMxContractTemplate,
  parseMxContractTemplate,
  type MxContractTemplateContent,
} from "@/lib/mx-contract-template";

export interface ContractData {
  storeName: string;
  parentName: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  effectiveDate: string;
  contactPerson: string;
  bank?: {
    account_holder_name: string;
    bank_name: string;
    account_number: string;
    ifsc_code: string;
    account_type: string;
    payout_method?: 'bank' | 'upi';
    upi_id?: string;
  };
}

const ANNEXURE_B_BANK_HEADERS = ["Beneficiary Name", "Bank Name", "Account Number", "IFSC Code", "Account Type"] as const;
const ANNEXURE_B_UPI_HEADERS = ["Beneficiary Name", "UPI ID", "Payment Method"] as const;

/** Decode HTML entities so PDF text renders correctly (fixes & showing as &amp; or garbled). */
function decodeHtmlEntities(text: string): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

/**
 * Fix "& between every character" corruption (e.g. "&L&e&g&a&l& &E&n&t&i&t&y&" -> "Legal Entity").
 * Applies repeatedly to handle "&&" and edge cases; only when pattern is clear so we don't break "AT&T".
 */
function uncorruptAmpersandBetweenChars(text: string): string {
  if (typeof text !== "string") return "";
  const ampThenChar = text.match(/&./g);
  if (!ampThenChar || ampThenChar.length < 4) return text;
  let prev = "";
  let s = text;
  while (prev !== s) {
    prev = s;
    s = s.replace(/&(.)&/g, "$1");
  }
  return s.replace(/^&+|&+$/g, "").replace(/\s*&\s*/g, " ");
}

/** Escape PDF special characters so jsPDF doesn't corrupt text. Also strips any & so PDF never shows ampersands. */
function escapePdfText(text: string): string {
  if (typeof text !== "string") return "";
  const noAmp = text.replace(/&/g, "");
  return noAmp
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/** Remove every ampersand so the PDF never shows & (fixes persistent address/corruption display). */
function stripAmpersandsForPdf(text: string): string {
  if (typeof text !== "string") return "";
  return text.replace(/&/g, "");
}

/** Single sanitizer for PDF: decode entities, uncorrupt, strip &, then escape for jsPDF. */
function sanitizeTextForPdf(text: string): string {
  const decoded = decodeHtmlEntities(text);
  const uncorrupted = uncorruptAmpersandBetweenChars(decoded);
  return stripAmpersandsForPdf(uncorrupted);
}

/** Sanitize and escape for use in jsPDF doc.text(); guarantees no & appears in PDF. */
function pdfSafeText(text: string): string {
  return escapePdfText(sanitizeTextForPdf(text));
}

type PdfDocLike = {
  splitTextToSize: (text: string, maxWidth: number) => string[];
  setFont: (family: string, style?: string) => void;
  rect: (x: number, y: number, w: number, h: number) => void;
  text: (text: string, x: number, y: number) => void;
};

function getPdfTableColWidths(colCount: number, tableW: number): number[] {
  if (colCount === 3) {
    return [tableW * 0.26, tableW * 0.24, tableW * 0.5];
  }
  return Array.from({ length: colCount }, () => tableW / colCount);
}

/** Draw a PDF table with wrapped cell text and dynamic row heights (full remarks visible). */
function drawPdfWrappedTable(
  doc: PdfDocLike,
  params: {
    x: number;
    y: number;
    tableW: number;
    pageH: number;
    margin: number;
    headers: string[];
    rows: string[][];
    onNewPage: () => void;
    cellLineH?: number;
    minRowH?: number;
    padX?: number;
  }
): number {
  const cellLineH = params.cellLineH ?? 4.2;
  const minRowH = params.minRowH ?? 8;
  const padX = params.padX ?? 2;
  const padTop = 4;
  const colCount = params.headers.length;
  const colWidths = getPdfTableColWidths(colCount, params.tableW);
  let y = params.y;

  const ensureSpace = (need: number) => {
    if (y + need > params.pageH - params.margin) {
      params.onNewPage();
      y = params.margin;
    }
  };

  const wrapCell = (value: string, colIdx: number): string[] => {
    const maxW = colWidths[colIdx]! - padX * 2;
    const safe = sanitizeTextForPdf(value || "—");
    return doc.splitTextToSize(safe, Math.max(maxW, 8));
  };

  const drawRow = (cells: string[], isHeader: boolean): void => {
    doc.setFont("helvetica", isHeader ? "bold" : "normal");
    const normalized = Array.from({ length: colCount }, (_, i) => cells[i] ?? "—");
    const wrapped = normalized.map((cell, i) => wrapCell(cell, i));
    const maxLines = Math.max(1, ...wrapped.map((lines) => lines.length));
    const rowH = Math.max(minRowH, padTop + maxLines * cellLineH);

    ensureSpace(rowH);
    const rowTopY = y;

    let x = params.x;
    for (let i = 0; i < colCount; i++) {
      doc.rect(x, rowTopY - padTop, colWidths[i]!, rowH);
      let textY = rowTopY + 0.5;
      for (const line of wrapped[i]!) {
        doc.text(escapePdfText(line), x + padX, textY);
        textY += cellLineH;
      }
      x += colWidths[i]!;
    }
    y = rowTopY + rowH;
  };

  drawRow(params.headers, true);
  params.rows.forEach((row) => drawRow(row, false));
  return y;
}

/** Commission: first month 0%; thereafter 15% + GST (as per commercial terms). */
export const COMMISSION_FIRST_MONTH_PERCENT = 0;
export const COMMISSION_FROM_SECOND_MONTH_PERCENT = 15;

export interface StructuredContract {
  formTitle: string;
  intro: { effectiveDate: string; storeName: string; ownerName: string; address: string; contactPerson: string; phone: string; email: string };
  definitions: { term: string; meaning: string }[];
  sections: { title: string; bullets?: string[]; paragraphs?: string[] }[];
  annexureA: { description: string; table: { headers: string[]; rows: string[][] } };
  annexureB: { headers: readonly string[]; rows: string[][]; isUPI?: boolean };
  certification: string;
  termsBody: string;
}

function buildStructuredContract(
  data: ContractData,
  template: MxContractTemplateContent = getDefaultMxContractTemplate()
): StructuredContract {
  const {
    storeName,
    ownerName,
    email,
    phone,
    address,
    effectiveDate,
    contactPerson,
    bank,
  } = data;

  const intro = {
    effectiveDate: sanitizeTextForPdf(effectiveDate || ""),
    storeName: sanitizeTextForPdf(storeName || "—"),
    ownerName: sanitizeTextForPdf(ownerName || "—"),
    address: sanitizeTextForPdf(address || "—"),
    contactPerson: sanitizeTextForPdf(contactPerson || ownerName || "—"),
    phone: sanitizeTextForPdf(phone || "—"),
    email: sanitizeTextForPdf(email || "—"),
  };

  const definitions = template.definitions;
  const sections = template.sections;
  const annexureA = template.annexureA;

  // Determine if UPI or Bank details - only show if actually filled
  const hasUPI = bank?.upi_id && bank.upi_id.trim() !== '';
  const hasBankAccount = bank?.account_number && bank.account_number.trim() !== '' && bank?.bank_name && bank.bank_name.trim() !== '';

  // Check payout method preference
  const prefersUPI = bank?.payout_method === 'upi';
  const prefersBank = bank?.payout_method === 'bank' || !bank?.payout_method;

  // Determine which to show: UPI takes priority if both exist and UPI is preferred, or if only UPI exists
  const isUPI = (prefersUPI && hasUPI) || (hasUPI && !hasBankAccount);
  const isBank = (prefersBank && hasBankAccount) || (hasBankAccount && !hasUPI);

  const annexureB = isUPI && hasUPI
    ? {
      headers: ANNEXURE_B_UPI_HEADERS,
      rows: [
        [
          bank.account_holder_name?.trim() || "—",
          bank.upi_id?.trim() ?? "—",
          "UPI",
        ],
      ],
      isUPI: true,
    }
    : isBank && hasBankAccount
      ? {
        headers: ANNEXURE_B_BANK_HEADERS,
        rows: [
          [
            bank.account_holder_name?.trim() || "—",
            bank.bank_name.trim(),
            bank.account_number.trim(),
            bank.ifsc_code?.trim() || "—",
            bank.account_type?.trim() ? bank.account_type.toUpperCase() : "—",
          ],
        ],
        isUPI: false,
      }
      : { headers: ANNEXURE_B_BANK_HEADERS, rows: [], isUPI: false };

  const certification = template.certification;
  const termsBody = template.partnershipPlanTerms;

  return {
    formTitle: template.formTitle,
    intro,
    definitions,
    sections,
    annexureA,
    annexureB,
    certification,
    termsBody,
  };
}

function buildContractText(
  data: ContractData,
  template: MxContractTemplateContent = getDefaultMxContractTemplate()
): string {
  const structured = buildStructuredContract(data, template);
  const { formTitle, intro, definitions, sections, annexureA, annexureB, certification, termsBody } = structured;
  const lines: string[] = [
    formTitle,
    "",
    `Effective Date: ${intro.effectiveDate}`,
    `Restaurant Name: ${intro.storeName}`,
    `Legal Entity Name ("Restaurant Partner"): ${intro.ownerName}`,
    `Legal Entity Address: ${intro.address}`,
    `Contact Person: ${intro.contactPerson}`,
    `Phone: ${intro.phone}`,
    `Email ID: ${intro.email}`,
    "",
    "Definitions",
    ...definitions.map((d) => `${d.term} - ${d.meaning}`),
    "",
  ];
  sections.forEach((sec) => {
    lines.push(sec.title + ":");
    if (sec.bullets) sec.bullets.forEach((b) => lines.push("• " + b));
    if (sec.paragraphs) sec.paragraphs.forEach((p) => lines.push(p));
    lines.push("");
  });
  lines.push("Annexure A - " + annexureA.description);
  lines.push(annexureA.table.headers.join(" | "));
  annexureA.table.rows.forEach((row) => lines.push(row.join(" | ")));
  lines.push("");
  lines.push("Annexure B - Bank Details");
  lines.push(annexureB.headers.join(" | "));
  annexureB.rows.forEach((row) => lines.push(row.join(" | ")));
  if (annexureB.rows.length === 0) lines.push("To be provided or as per application.");
  lines.push("");
  lines.push(certification);
  lines.push("");
  lines.push("---");
  lines.push(termsBody);
  return lines.join("\n");
}

interface AgreementContractPageProps {
  step1: any;
  step2: any;
  documents: any;
  parentInfo: any;
  /** Raw DB content (JSON or legacy partnership-plan text). */
  termsContent: string;
  templateTitle?: string;
  templateVersion?: string;
  /** Optional URL for platform/company logo to embed in the PDF (e.g. from public folder or CDN). */
  logoUrl?: string | null;
  onBack: () => void;
  onContinue: (args: { contractText: string; agreedToRead: boolean }) => void;
  actionLoading?: boolean;
  /** Registers PDF download handler for the parent shell header. */
  onDownloadReady?: (download: () => void) => void;
}

export default function AgreementContractPage({
  step1,
  step2,
  documents,
  parentInfo,
  termsContent,
  logoUrl,
  onBack,
  onContinue,
  actionLoading = false,
  onDownloadReady,
}: AgreementContractPageProps) {
  const [agreedToRead, setAgreedToRead] = useState(false);
  const [contractText, setContractText] = useState("");
  const [structured, setStructured] = useState<StructuredContract | null>(null);

  const resolvedOwnerName =
    (typeof step1?.owner_full_name === "string" && step1.owner_full_name.trim()) ? step1.owner_full_name.trim()
    : (typeof step1?.store_name === "string" && step1.store_name.trim()) ? step1.store_name.trim()
    : "—";

  const resolvedContactPerson =
    (typeof step1?.owner_full_name === "string" && step1.owner_full_name.trim()) ? step1.owner_full_name.trim()
    : (typeof (step1 as any)?.store_contact_person === "string" && (step1 as any).store_contact_person.trim()) ? (step1 as any).store_contact_person.trim()
    : resolvedOwnerName;

  const contractData: ContractData = {
    storeName: step1?.store_name || "—",
    parentName: parentInfo?.name ?? step1?.parent_merchant_id ?? "—",
    ownerName: resolvedOwnerName,
    email: step1?.store_email || "—",
    phone: step1?.store_phones?.[0] || "—",
    address: step2?.full_address || "—",
    effectiveDate: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
    contactPerson: resolvedContactPerson,
    bank: documents?.bank
      ? {
        account_holder_name: documents.bank.account_holder_name || "",
        bank_name: documents.bank.bank_name || "",
        account_number: documents.bank.account_number || "",
        ifsc_code: documents.bank.ifsc_code || "",
        account_type: documents.bank.account_type || "savings",
        payout_method: documents.bank.payout_method || "bank",
        upi_id: documents.bank.upi_id || "",
      }
      : undefined,
  };

  const contractTemplate = useMemo(() => parseMxContractTemplate(termsContent), [termsContent]);

  useEffect(() => {
    const s = buildStructuredContract(contractData, contractTemplate);
    setStructured(s);
    setContractText(buildContractText(contractData, contractTemplate));
  }, [step1, step2, documents, parentInfo, contractTemplate]);

  const handleDownloadPdf = useCallback(async () => {
    if (!structured) return;
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 18;
      let y = margin;
      const lineH = 5.5;
      const smallH = 5;
      const headH = 7;

      const checkNewPage = (need: number) => {
        if (y + need > pageH - margin) {
          doc.addPage();
          y = margin;
        }
      };

      const resolvedLogoUrl = (typeof logoUrl === "string" && logoUrl.trim()) ? logoUrl : "/logo.png";
      let logoSrc = "";
      if (resolvedLogoUrl.startsWith("http") || resolvedLogoUrl.startsWith("data:")) {
        logoSrc = resolvedLogoUrl;
      } else if (typeof window !== "undefined") {
        logoSrc = window.location.origin + (resolvedLogoUrl.startsWith("/") ? resolvedLogoUrl : "/" + resolvedLogoUrl);
      }
      if (logoSrc) {
        try {
          doc.addImage(logoSrc, "PNG", margin, y, 40, 14);
          y += 18;
        } catch {
          try {
            doc.addImage(logoSrc, "JPEG", margin, y, 40, 14);
            y += 18;
          } catch {
            y += 2;
          }
        }
      }

      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y);
      y += 5;

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      const titleLines = doc.splitTextToSize(pdfSafeText(structured.formTitle), pageW - margin * 2);
      titleLines.forEach((line: string) => {
        doc.text(escapePdfText(line), margin, y);
        y += 6;
      });
      y += 2;
      doc.line(margin, y, pageW - margin, y);
      y += 6;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const colGap = 8;
      const halfW = (pageW - margin * 2 - colGap) / 2;
      const leftColX = margin;
      const rightColX = margin + halfW + colGap;
      const leftPairs: [string, string][] = [
        ["Effective Date", pdfSafeText(structured.intro.effectiveDate)],
        ["Legal Entity Name (\"Restaurant Partner\")", pdfSafeText(structured.intro.ownerName)],
        ["Contact Person", pdfSafeText(structured.intro.contactPerson)],
        ["Email ID", pdfSafeText(structured.intro.email)],
      ];
      const rightPairs: [string, string][] = [
        ["Restaurant Name", pdfSafeText(structured.intro.storeName)],
        ["Address", pdfSafeText(structured.intro.address)],
        ["Phone", pdfSafeText(structured.intro.phone)],
      ];
      const maxRows = Math.max(leftPairs.length, rightPairs.length);
      for (let i = 0; i < maxRows; i++) {
        checkNewPage(lineH * 3);
        const left = leftPairs[i];
        const right = rightPairs[i];
        const rowY = y;
        let nextY = y;
        if (left) {
          const leftLine = left[0] + ": " + left[1];
          const leftWrapped = doc.splitTextToSize(leftLine, halfW - 2);
          leftWrapped.forEach((line: string) => {
            doc.text(escapePdfText(line), leftColX, nextY);
            nextY += lineH;
          });
        }
        if (right) {
          let ry = rowY;
          const rightLine = right[0] + ": " + right[1];
          const rightWrapped = doc.splitTextToSize(rightLine, halfW - 2);
          rightWrapped.forEach((line: string) => {
            doc.text(escapePdfText(line), rightColX, ry);
            ry += lineH;
          });
          nextY = Math.max(nextY, ry);
        }
        y = nextY + lineH * 0.5;
      }
      y += 4;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Definitions", margin, y);
      y += headH;
      doc.setFont("helvetica", "normal");
      structured.definitions.forEach((d) => {
        const defLine = sanitizeTextForPdf(d.term) + " - " + sanitizeTextForPdf(d.meaning);
        const wrapped = doc.splitTextToSize(defLine, pageW - margin * 2 - 2);
        wrapped.forEach((line: string) => {
          checkNewPage(smallH);
          doc.text(escapePdfText(line), margin + 2, y);
          y += smallH;
        });
        y += 1;
      });
      y += 3;

      structured.sections.forEach((sec) => {
        checkNewPage(headH + 5);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(escapePdfText(sanitizeTextForPdf(sec.title)), margin, y);
        y += headH;
        doc.setFont("helvetica", "normal");
        if (sec.bullets) {
          sec.bullets.forEach((b) => {
            const wrapped = doc.splitTextToSize("• " + sanitizeTextForPdf(b), pageW - margin * 2 - 4);
            wrapped.forEach((line: string) => {
              checkNewPage(smallH);
              doc.text(escapePdfText(line), margin + 4, y);
              y += smallH;
            });
          });
        }
        if (sec.paragraphs) {
          sec.paragraphs.forEach((p) => {
            const wrapped = doc.splitTextToSize(sanitizeTextForPdf(p), pageW - margin * 2);
            wrapped.forEach((line: string) => {
              checkNewPage(smallH);
              doc.text(escapePdfText(line), margin, y);
              y += smallH;
            });
          });
        }
        y += 2;
      });

      checkNewPage(headH + 20);
      doc.setFont("helvetica", "bold");
      doc.text("Annexure A - Commission and Charges", margin, y);
      y += headH;
      doc.setFont("helvetica", "normal");
      doc.text(escapePdfText(sanitizeTextForPdf(structured.annexureA.description)), margin, y);
      y += lineH + 2;
      doc.setFontSize(9);
      y = drawPdfWrappedTable(doc, {
        x: margin,
        y,
        tableW: pageW - margin * 2,
        pageH,
        margin,
        headers: structured.annexureA.table.headers,
        rows: structured.annexureA.table.rows,
        onNewPage: () => doc.addPage(),
      });
      y += 4;

      checkNewPage(headH + 15);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`Annexure B - ${structured.annexureB.isUPI ? 'UPI Details' : 'Bank Details'}`, margin, y);
      y += headH;

      const tableHeaders = structured.annexureB.headers as string[];
      const tableRows = structured.annexureB.rows;
      doc.setFontSize(9);
      if (tableRows.length > 0) {
        y = drawPdfWrappedTable(doc, {
          x: margin,
          y,
          tableW: pageW - margin * 2,
          pageH,
          margin,
          headers: [...tableHeaders],
          rows: tableRows,
          onNewPage: () => doc.addPage(),
          minRowH: 7,
        });
      } else {
        const emptyRowH = 7;
        checkNewPage(emptyRowH);
        doc.setFont("helvetica", "normal");
        doc.rect(margin, y - 4, pageW - margin * 2, emptyRowH);
        doc.text("To be provided or as per application.", margin + 2, y + 0.5);
        y += emptyRowH;
      }
      y += 4;

      checkNewPage(12);
      doc.setFont("helvetica", "italic");
      const certLines = doc.splitTextToSize(sanitizeTextForPdf(structured.certification), pageW - margin * 2);
      certLines.forEach((line: string) => {
        checkNewPage(smallH);
        doc.text(escapePdfText(line), margin, y);
        y += smallH;
      });
      y += 4;

      doc.setFont("helvetica", "normal");
      const termsLines = doc.splitTextToSize(sanitizeTextForPdf(structured.termsBody), pageW - margin * 2);
      termsLines.slice(0, 80).forEach((line: string) => {
        checkNewPage(smallH);
        doc.text(escapePdfText(line), margin, y);
        y += smallH;
      });

      const filename = `partner-agreement-${(step1?.store_name || "store").replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error("PDF download failed:", err);
      const blob = new Blob([contractText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `partner-agreement-${step1?.store_name || "store"}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [structured, contractText, step1?.store_name, logoUrl]);

  useEffect(() => {
    onDownloadReady?.(() => {
      void handleDownloadPdf();
    });
  }, [handleDownloadPdf, onDownloadReady]);

  const canContinue = agreedToRead;
  const displayLogoUrl = (typeof logoUrl === "string" && logoUrl.trim()) ? logoUrl : "/logo.png";

  return (
    <div className="h-full min-h-0 w-full flex flex-col bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      <div className="flex-1 min-h-0 flex flex-col max-w-6xl w-full mx-auto px-2 sm:px-3 md:px-4 pt-3 sm:pt-4 pb-2 sm:pb-3">
        <article className="bg-white rounded-lg sm:rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto p-2.5 sm:p-3 md:p-4 hide-scrollbar">
            {structured ? (
              <div className="space-y-2.5 sm:space-y-3 text-slate-800 text-xs sm:text-sm font-[family-name:var(--font-geist-sans)] pb-4">
                <header className="border-b border-slate-200 pb-4 mb-2 bg-slate-50/80 -mx-2.5 sm:-mx-3 md:-mx-4 px-2.5 sm:px-3 md:px-4 pt-3 rounded-t-lg sm:rounded-t-xl">
                  <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide mb-2">
                    {structured.formTitle}
                  </h2>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-[10px] sm:text-xs">
                    <div><dt className="text-slate-500 font-medium">Effective Date</dt><dd className="font-medium text-slate-900">{sanitizeTextForPdf(structured.intro.effectiveDate)}</dd></div>
                    <div><dt className="text-slate-500 font-medium">Restaurant Name</dt><dd className="font-medium text-slate-900">{sanitizeTextForPdf(structured.intro.storeName)}</dd></div>
                    <div><dt className="text-slate-500 font-medium">Legal Entity Name</dt><dd className="font-medium text-slate-900">{sanitizeTextForPdf(structured.intro.ownerName)}</dd></div>
                    <div><dt className="text-slate-500 font-medium">Address</dt><dd className="font-medium text-slate-900">{sanitizeTextForPdf(structured.intro.address)}</dd></div>
                    <div><dt className="text-slate-500 font-medium">Contact Person</dt><dd className="font-medium text-slate-900">{sanitizeTextForPdf(structured.intro.contactPerson)}</dd></div>
                    <div><dt className="text-slate-500 font-medium">Phone</dt><dd className="font-medium text-slate-900">{sanitizeTextForPdf(structured.intro.phone)}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-slate-500 font-medium">Email ID</dt><dd className="font-medium text-slate-900">{sanitizeTextForPdf(structured.intro.email)}</dd></div>
                  </dl>
                </header>

                <section>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 mb-1">Definitions</h3>
                  <div className="space-y-1 text-[10px] sm:text-xs">
                    {structured.definitions.map((d, i) => (
                      <p key={i} className="leading-relaxed text-slate-600 mb-1">
                        <span className="font-semibold text-slate-800 whitespace-nowrap">{d.term}</span>
                        {" - "}
                        <span>{d.meaning}</span>
                      </p>
                    ))}
                  </div>
                </section>

                {structured.sections.map((sec, idx) => (
                  <section key={idx}>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 mb-1">{sec.title}</h3>
                    {sec.bullets && (
                      <ul className="list-disc pl-4 space-y-0.5 text-[10px] sm:text-xs leading-relaxed">
                        {sec.bullets.map((b, i) => (
                          <li key={i} className="mb-0.5">{b}</li>
                        ))}
                      </ul>
                    )}
                    {sec.paragraphs && (
                      <div className="space-y-0.5 text-[10px] sm:text-xs leading-relaxed">
                        {sec.paragraphs.map((p, i) => (
                          <p key={i} className="mb-0.5">{p}</p>
                        ))}
                      </div>
                    )}
                  </section>
                ))}

                <section>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 mb-1.5">Annexure A — Commission and Charges</h3>
                  <p className="text-[10px] sm:text-xs leading-relaxed text-slate-700 mb-2">{structured.annexureA.description}</p>
                  <div className="overflow-x-auto -mx-1 rounded-lg border border-slate-200">
                    <table className="w-full min-w-[240px] sm:min-w-[400px] text-[10px] sm:text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          {structured.annexureA.table.headers.map((h, i) => (
                            <th key={i} className="text-left font-semibold text-slate-700 px-2 sm:px-3 py-1 sm:py-1.5 border-r border-slate-200 last:border-r-0 break-words">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {structured.annexureA.table.rows.map((row, ri) => (
                          <tr key={ri} className="border-b border-slate-100">
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-2 sm:px-3 py-1 sm:py-1.5 border-r border-slate-100 last:border-r-0 text-slate-800 break-words">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 mb-1.5">
                    Annexure B — {structured.annexureB.isUPI ? 'UPI Details' : 'Bank Details'}
                  </h3>
                  <div className="overflow-x-auto -mx-1 rounded-lg border border-slate-200">
                    <table className="w-full min-w-[200px] sm:min-w-[400px] text-[10px] sm:text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          {structured.annexureB.headers.map((h, i) => (
                            <th key={i} className="text-left font-semibold text-slate-700 px-2 sm:px-3 py-1 sm:py-1.5 border-r border-slate-200 last:border-r-0 break-words">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {structured.annexureB.rows.length > 0 ? (
                          structured.annexureB.rows.map((row, ri) => (
                            <tr key={ri} className="border-b border-slate-100 hover:bg-slate-50/50">
                              {row.map((cell, ci) => (
                                <td key={ci} className="px-2 sm:px-3 py-1 sm:py-1.5 border-r border-slate-100 last:border-r-0 text-slate-800 break-words font-medium">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={structured.annexureB.headers.length} className="px-2 sm:px-3 py-1 sm:py-1.5 text-slate-500 italic">
                              To be provided or as per application.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs leading-relaxed text-slate-600 italic border-l-3 border-indigo-200 pl-2 sm:pl-3 py-0.5">
                    {structured.certification}
                  </p>
                </section>

                <section className="pt-1 border-t border-slate-100">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 mb-1">Terms and Conditions</h3>
                  <div className="text-[10px] sm:text-xs leading-relaxed text-slate-600 whitespace-pre-line">
                    {structured.termsBody}
                  </div>
                </section>
              </div>
            ) : (
              <p className="text-slate-500">Loading contract...</p>
            )}
          </div>
        </article>
      </div>

      {/* Checkbox + navigation — in-flow footer (no viewport overlap) */}
      <div
        className="flex-none shrink-0 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.08)] py-2 sm:py-2.5 px-2 sm:px-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 10px)' }}
      >
        <div className="max-w-6xl mx-auto space-y-1.5 sm:space-y-2">
          <label className="flex items-start gap-2 cursor-pointer group w-full">
            <input
              type="checkbox"
              checked={agreedToRead}
              onChange={(e) => setAgreedToRead(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 sm:h-4 sm:w-4 min-w-[0.875rem] sm:min-w-[1rem] rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
              aria-label="I agree to the contract and terms"
            />
            <span className="text-[10px] sm:text-xs text-slate-700 group-hover:text-slate-900 leading-relaxed">
              I have read the entire contract and agreement details above. I understand the terms, charges, payment settlement process, and {structured?.annexureB.isUPI ? 'UPI' : 'bank'} details. I am ready to proceed to digital signature.
            </span>
          </label>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onBack}
              disabled={actionLoading}
              className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 font-medium text-xs sm:text-sm px-3 py-1.5 sm:px-4 sm:py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {actionLoading ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 rotate-180" />}
              Previous
            </button>
            <button
              type="button"
              onClick={() => onContinue({ contractText, agreedToRead })}
              disabled={!canContinue || actionLoading}
              className="px-4 py-2 sm:px-6 sm:py-2.5 bg-indigo-600 text-white font-semibold text-xs sm:text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 sm:gap-2 shadow-md shadow-indigo-200 transition"
            >
              {actionLoading ? <Loader2 className="w-3.5 h-3.5 sm:w-4 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5 sm:w-4" />}
              {actionLoading ? 'Loading...' : 'Continue to Digital Signature'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { buildContractText, buildStructuredContract, decodeHtmlEntities, escapePdfText, sanitizeTextForPdf, drawPdfWrappedTable };