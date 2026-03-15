"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { ChevronLeft, Upload, Trash2, Loader2 } from "lucide-react";
import { buildContractText, buildStructuredContract, escapePdfText, sanitizeTextForPdf, type ContractData } from "./agreement";
import { getOnboardingR2Path, getOnboardingDocumentPath, type R2OnboardingDocType } from "@/lib/r2-paths";

interface SignatureStepPageProps {
  step1: any;
  step2: any;
  documents: any;
  storeSetup: any;
  menuData?: any;
  parentInfo: any;
  agreementTemplate: { id?: number; template_key: string; title: string; version: string; content_markdown: string; pdf_url: string | null } | null;
  defaultAgreementText: string;
  contractTextForPdf: string;
  logoUrl?: string | null;
  onBack: () => void;
  onSuccess: (storeId: string) => void;
  actionLoading?: boolean;
}

export default function SignatureStepPage({
  step1,
  step2,
  documents,
  storeSetup,
  menuData,
  parentInfo,
  agreementTemplate,
  defaultAgreementText,
  contractTextForPdf,
  logoUrl: logoUrlProp,
  onBack,
  onSuccess,
  actionLoading = false,
}: SignatureStepPageProps) {
  const [signerName, setSignerName] = useState(step1?.owner_full_name || "");
  const [signerEmail, setSignerEmail] = useState(step1?.store_email || "");
  const [signerPhone, setSignerPhone] = useState(step1?.store_phones?.[0] || "");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToContract, setAgreedToContract] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pdfDownloaded, setPdfDownloaded] = useState(false);

  const contractTextResolved = useMemo(() => {
    if (contractTextForPdf && contractTextForPdf.trim()) return contractTextForPdf;
    const data = {
      storeName: step1?.store_name || "—",
      parentName: parentInfo?.name ?? step1?.parent_merchant_id ?? "—",
      ownerName: step1?.owner_full_name || "—",
      email: step1?.store_email || "—",
      phone: step1?.store_phones?.[0] || "—",
      address: step2?.full_address || "—",
      effectiveDate: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
      contactPerson: step1?.owner_full_name || "—",
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
    return buildContractText(data, defaultAgreementText);
  }, [contractTextForPdf, step1, step2, documents, parentInfo, defaultAgreementText]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const getPoint = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const x = (clientX - rect.left) * dpr;
    const y = (clientY - rect.top) * dpr;
    return { x, y };
  }, []);

  const startDraw = useCallback(
    (clientX: number, clientY: number) => {
      const point = getPoint(clientX, clientY);
      if (!point) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0f172a";
      isDrawingRef.current = true;
      lastPointRef.current = point;
    },
    [getPoint]
  );

  const moveDraw = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDrawingRef.current) return;
      const point = getPoint(clientX, clientY);
      if (!point) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const last = lastPointRef.current;
      if (last) {
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
      lastPointRef.current = point;
    },
    [getPoint]
  );

  const endDraw = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    setSignatureDataUrl(dataUrl);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const resize = () => {
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const w = Math.floor(rect.width * dpr);
      const h = Math.floor(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.strokeStyle = "#0f172a";
        }
      }
    };
    resize();
    const ro = typeof window !== "undefined" ? new ResizeObserver(resize) : null;
    if (ro && container) ro.observe(container);
    return () => { ro?.disconnect(); };
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    startDraw(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    moveDraw(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    endDraw();
  };

  const handleMouseLeave = () => {
    endDraw();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const t = e.touches[0];
    if (t) startDraw(t.clientX, t.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const t = e.touches[0];
    if (t) moveDraw(t.clientX, t.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    endDraw();
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl(null);
  };

  const canSubmit =
    !!signerName.trim() &&
    !!signatureDataUrl &&
    agreedToContract &&
    agreedToTerms;

  const contractDataForPdf: ContractData = useMemo(
    () => ({
      storeName: step1?.store_name || "—",
      parentName: parentInfo?.name ?? step1?.parent_merchant_id ?? "—",
      ownerName: step1?.owner_full_name || "—",
      email: step1?.store_email || "—",
      phone: step1?.store_phones?.[0] || "—",
      address: step2?.full_address || "—",
      effectiveDate: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
      contactPerson: step1?.owner_full_name || "—",
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
    }),
    [step1, step2, documents, parentInfo]
  );

  // Generate PDF as blob for upload (returns blob and filename)
  const generatePdfBlob = useCallback(async (): Promise<{ blob: Blob; filename: string } | null> => {
    if (!signatureDataUrl) return null;
    try {
      const termsBody = agreementTemplate?.content_markdown || defaultAgreementText;
      const structured = buildStructuredContract(contractDataForPdf, termsBody);
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

      const logoUrl = typeof logoUrlProp === "string" && logoUrlProp.trim()
        ? logoUrlProp
        : (typeof process.env.NEXT_PUBLIC_PLATFORM_LOGO_URL === "string" && process.env.NEXT_PUBLIC_PLATFORM_LOGO_URL
            ? process.env.NEXT_PUBLIC_PLATFORM_LOGO_URL
            : "/logo.png");
      let logoSrc = "";
      if (logoUrl) {
        if (logoUrl.startsWith("http") || logoUrl.startsWith("data:")) {
          logoSrc = logoUrl;
        } else if (typeof window !== "undefined") {
          logoSrc = window.location.origin + (logoUrl.startsWith("/") ? logoUrl : "/" + logoUrl);
        }
      }
      if (logoSrc) {
        try {
          doc.addImage(logoSrc, "PNG", margin, y, 35, 12);
          y += 16;
        } catch {
          try {
            doc.addImage(logoSrc, "JPEG", margin, y, 35, 12);
            y += 16;
          } catch {
            y += 2;
          }
        }
      }

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("CONTRACT APPROVAL", margin, y);
      y += 10;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const approvedDate = new Date().toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" });
      doc.text(escapePdfText("Reference: Partner Agreement – " + (step1?.store_name || "Store")), margin, y);
      y += lineH;
      doc.text("Approved / Signed on: " + approvedDate, margin, y);
      y += lineH;
      doc.text("Status: Approved", margin, y);
      y += lineH;
      doc.text(escapePdfText("Signatory: " + (signerName || "—")), margin, y);
      y += lineH + 4;
      doc.setFont("helvetica", "bold");
      doc.text(escapePdfText("RESTAURANT PARTNER ENROLMENT FORM (\"FORM\")"), margin, y);
      y += headH;
      doc.setFont("helvetica", "normal");
      const introLines = [
        `Effective Date: ${sanitizeTextForPdf(structured.intro.effectiveDate)}`,
        `Restaurant Name: ${sanitizeTextForPdf(structured.intro.storeName)}`,
        `Legal Entity Name: ${sanitizeTextForPdf(structured.intro.ownerName)}`,
        `Address: ${sanitizeTextForPdf(structured.intro.address)}`,
        `Contact: ${sanitizeTextForPdf(structured.intro.contactPerson)} | ${sanitizeTextForPdf(structured.intro.phone)} | ${sanitizeTextForPdf(structured.intro.email)}`,
      ];
      introLines.forEach((line) => {
        checkNewPage(lineH);
        doc.text(escapePdfText(line), margin, y);
        y += lineH;
      });
      y += 3;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Definitions", margin, y);
      y += headH;
      doc.setFont("helvetica", "normal");
      structured.definitions.forEach((d) => {
        const defLine = sanitizeTextForPdf(d.term) + ": " + sanitizeTextForPdf(d.meaning);
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
      const aHeaders = structured.annexureA.table.headers;
      const aRows = structured.annexureA.table.rows;
      const aColCount = aHeaders.length;
      const aColW = (pageW - margin * 2) / aColCount;
      const aRowH = 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      let x = margin;
      aHeaders.forEach((h) => {
        doc.rect(x, y - 4, aColW, aRowH);
        doc.text(h, x + 2, y + 0.5);
        x += aColW;
      });
      y += aRowH;
      doc.setFont("helvetica", "normal");
      aRows.forEach((row) => {
        checkNewPage(aRowH);
        x = margin;
        row.forEach((cell) => {
          doc.rect(x, y - 4, aColW, aRowH);
          const safe = sanitizeTextForPdf(cell);
          const text = doc.splitTextToSize(safe, aColW - 4);
          doc.text(escapePdfText(text[0] || "—"), x + 2, y + 0.5);
          x += aColW;
        });
        y += aRowH;
      });
      y += 4;

      checkNewPage(headH + 15);
      doc.setFont("helvetica", "bold");
      doc.text(`Annexure B - ${structured.annexureB.isUPI ? 'UPI Details' : 'Bank Details'}`, margin, y);
      y += headH;
      const bHeaders = structured.annexureB.headers as string[];
      const bRows = structured.annexureB.rows;
      const bColCount = bHeaders.length;
      const bColW = (pageW - margin * 2) / bColCount;
      const bRowH = 7;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      x = margin;
      bHeaders.forEach((h) => {
        doc.rect(x, y - 4, bColW, bRowH);
        doc.text(h, x + 2, y + 0.5);
        x += bColW;
      });
      y += bRowH;
      doc.setFont("helvetica", "normal");
      bRows.forEach((row) => {
        checkNewPage(bRowH);
        x = margin;
        row.forEach((cell) => {
          doc.rect(x, y - 4, bColW, bRowH);
          const safe = sanitizeTextForPdf(cell);
          const text = doc.splitTextToSize(safe, bColW - 4);
          doc.text(escapePdfText(text[0] || "—"), x + 2, y + 0.5);
          x += bColW;
        });
        y += bRowH;
      });
      if (bRows.length === 0) {
        doc.rect(margin, y - 4, pageW - margin * 2, bRowH);
        doc.text("To be provided or as per application.", margin + 2, y + 0.5);
        y += bRowH;
      }
      y += 4;

      checkNewPage(16);
      doc.setFont("helvetica", "italic");
      const certLines = doc.splitTextToSize(sanitizeTextForPdf(structured.certification), pageW - margin * 2);
      certLines.forEach((line: string) => {
        checkNewPage(smallH);
        doc.text(escapePdfText(line), margin, y);
        y += smallH;
      });
      y += 6;

      const imgW = 50;
      const imgH = 22;
      const imgX = margin;
      if (y + imgH + 10 > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.addImage(signatureDataUrl, "PNG", imgX, y, imgW, imgH);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(escapePdfText("Signed by: " + (signerName || "—")), imgX, y + imgH + 4);
      doc.text("Date: " + new Date().toLocaleDateString("en-IN", { dateStyle: "medium" }), imgX, y + imgH + 8);

      const filename = `contract-approval-${(step1?.store_name || "store").replace(/[^a-zA-Z0-9-_]/g, "_")}-${Date.now()}.pdf`;
      const pdfBlob = doc.output("blob");
      return { blob: pdfBlob, filename };
    } catch (err) {
      console.error("PDF generation failed:", err);
      throw new Error("Could not generate PDF. Please try again.");
    }
  }, [signatureDataUrl, signerName, step1, step2, documents, parentInfo, agreementTemplate?.content_markdown, defaultAgreementText, contractDataForPdf, logoUrlProp]);

  const downloadPdf = useCallback(async () => {
    const pdfData = await generatePdfBlob();
    if (!pdfData) return;
    try {
      const url = URL.createObjectURL(pdfData.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfData.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setPdfDownloaded(true);
    } catch (err) {
      console.error("PDF download failed:", err);
      setError("Could not download PDF. Please try again.");
    }
  }, [generatePdfBlob]);

  const handleSubmit = async () => {
    if (!signerName.trim()) {
      setError("Signer name is required.");
      return;
    }
    if (!signatureDataUrl) {
      setError("Please provide your digital signature.");
      return;
    }
    if (!agreedToContract || !agreedToTerms) {
      setError("Please accept the contract and terms.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const parentMerchantId =
        step1?.parent_merchant_id ||
        (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("parent_id") : null);
      if (!parentMerchantId) throw new Error("Parent merchant ID missing");

      const parentId = parentMerchantId;
      const childStoreId = step1?.store_public_id ?? null;

      async function uploadToR2(file: File, parent: string, filename: string): Promise<string | null> {
        if (!file) return null;
        const form = new FormData();
        form.append("file", file);
        form.append("parent", parent || "");
        form.append("filename", filename || file.name);
        const res = await fetch("/api/upload/r2", { method: "POST", body: form });
        const data = await res.json();
        if (!data.url && !data.path && !data.key) throw new Error("Image upload failed");
        return data.key || data.path || data.url;
      }

      const logoUrl = await uploadToR2(storeSetup.logo, getOnboardingR2Path(parentId, childStoreId, "STORE_MEDIA"), "logo");
      const bannerUrl = await uploadToR2(storeSetup.banner, getOnboardingR2Path(parentId, childStoreId, "STORE_MEDIA"), "banner");
      const galleryUrls = await Promise.all(
        (storeSetup.gallery_images || []).map((file: File, idx: number) =>
          uploadToR2(file, getOnboardingR2Path(parentId, childStoreId, "STORE_MEDIA_GALLERY"), `gallery_${idx + 1}`)
        )
      );
      const uploadedMenuImageUrls = await Promise.all(
        (menuData?.menuImageFiles || []).map((file: File, idx: number) =>
          uploadToR2(file, getOnboardingR2Path(parentId, childStoreId, "MENU_IMAGES"), `menu_image_${idx + 1}_${Date.now()}`)
        )
      );
      const uploadedMenuSpreadsheetUrl = menuData?.menuSpreadsheetFile
        ? await uploadToR2(menuData.menuSpreadsheetFile, getOnboardingR2Path(parentId, childStoreId, "MENU_CSV"), `menu_sheet_${Date.now()}.csv`)
        : null;
      const menuImageUrls = [...(menuData?.menuImageUrls || []), ...uploadedMenuImageUrls.filter(Boolean)];
      const menuSpreadsheetUrl = menuData?.menuSpreadsheetUrl || uploadedMenuSpreadsheetUrl;

      const docTypeFromKey = (k: string): R2OnboardingDocType => {
        const u = k.toUpperCase();
        if (u.startsWith("PAN")) return "PAN";
        if (u.startsWith("GST")) return "GST";
        if (u.startsWith("AADHAR") || u.startsWith("AADHAAR")) return "AADHAAR";
        if (u.startsWith("FSSAI")) return "FSSAI";
        if (u.startsWith("BANK")) return "BANK";
        if (["PHARMACIST_CERTIFICATE", "PHARMACY_COUNCIL", "DRUG_LICENSE", "SHOP_ESTABLISHMENT", "TRADE_LICENSE", "UDYAM"].some((x) => u.includes(x))) return "PHARMA";
        return "OTHER";
      };
      const documentUrls: { type: string; url: string; name: string }[] = [];
      for (const [key, value] of Object.entries(documents)) {
        if (value instanceof File) {
          const docPath = getOnboardingDocumentPath(parentId, childStoreId, docTypeFromKey(key));
          const url = await uploadToR2(value, docPath, key);
          if (url) documentUrls.push({ type: key.toUpperCase(), url, name: value.name });
        }
      }

      // Generate PDF and upload to R2; send R2 key so backend stores proxy URL (no expiry for user)
      let signedPdfUrl: string | null = null;
      try {
        const pdfData = await generatePdfBlob();
        if (pdfData) {
          const pdfFile = new File([pdfData.blob], pdfData.filename, { type: "application/pdf" });
          const pdfR2Key = await uploadToR2(pdfFile, getOnboardingR2Path(parentId, childStoreId, "AGREEMENTS"), pdfData.filename);
          if (pdfR2Key) {
            // Store key (or proxy URL) so backend saves /api/attachments/proxy?key=... — always accessible, no expiry
            signedPdfUrl = pdfR2Key;
          }
        }
      } catch (pdfErr) {
        console.error("PDF upload failed:", pdfErr);
        // Don't fail the entire submission if PDF upload fails
      }

      const res = await fetch("/api/register-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step1: {
            ...step1,
            __storePublicId: step1?.store_public_id || (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("store_id") : null),
          },
          step2,
          storeSetup,
          documents: undefined,
          logoUrl,
          bannerUrl,
          galleryUrls,
          menuAssets: {
            uploadMode: menuData?.menuUploadMode || "IMAGE",
            imageUrls: menuImageUrls.filter(Boolean),
            spreadsheetUrl: menuSpreadsheetUrl,
          },
          agreementAcceptance: {
            templateId: agreementTemplate?.id || null,
            templateKey: agreementTemplate?.template_key || "DEFAULT_CHILD_ONBOARDING_AGREEMENT",
            templateVersion: agreementTemplate?.version || "v1",
            templateTitle: agreementTemplate?.title || "Merchant Partner Agreement",
            templateContentSnapshot: agreementTemplate?.content_markdown || defaultAgreementText,
            templatePdfUrl: agreementTemplate?.pdf_url || null,
            signedPdfUrl: signedPdfUrl, // R2 key or proxy URL; backend stores proxy so contract is always accessible
            signerName: signerName.trim(),
            signerEmail: signerEmail || null,
            signerPhone: signerPhone || null,
            signatureDataUrl,
            agreedToContract,
            agreedToTerms,
            commissionFirstMonthPct: 0,
            commissionFromSecondMonthPct: 15,
            agreementEffectiveFrom: new Date().toISOString(),
            agreementEffectiveTo: null,
          },
          documentUrls,
          parentInfo,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Registration failed");
      await downloadPdf();
      onSuccess(result.storeId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 to-white flex flex-col">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-2 py-2 sm:px-4 sm:py-3 shrink-0">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">Digital Signature</h1>
        </div>
      </div>

      <div className="flex-1 min-h-0 max-w-2xl w-full mx-auto px-2 sm:px-4 py-3 sm:py-4 pb-40 sm:pb-44 flex flex-col overflow-y-auto">
        {error && (
          <div className="rounded-lg sm:rounded-xl bg-red-50 border border-red-200 text-red-800 px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm shrink-0">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-6 space-y-3 sm:space-y-4 flex-1 min-h-0">
          <p className="text-xs sm:text-sm text-slate-600">
            Sign in the box below using your mouse (desktop) or finger (mobile). Your signature will be attached to the contract.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Signer full name"
              className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <input
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              placeholder="Signer email"
              className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <input
              type="text"
              value={signerPhone}
              onChange={(e) => setSignerPhone(e.target.value)}
              placeholder="Signer phone"
              className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div ref={containerRef} className="relative w-full rounded-lg sm:rounded-xl border-2 border-dashed border-slate-300 bg-white overflow-hidden touch-none select-none" style={{ minHeight: 120, height: "clamp(120px, 35vmin, 200px)", touchAction: "none" }}>
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              style={{ width: "100%", height: "100%" }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">Draw your signature above</p>
            <button
              type="button"
              onClick={clearSignature}
              className="flex items-center gap-1 text-xs sm:text-sm text-rose-600 hover:text-rose-700 shrink-0"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Checkboxes + Navigation - Fixed bottom so always visible on all screens */}
      <div className="fixed bottom-0 left-14 sm:left-[13rem] md:left-56 lg:left-60 right-0 z-20 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] py-3 sm:py-4 pb-6 sm:pb-4">
        <div className="max-w-2xl mx-auto px-2 sm:px-4 space-y-3">
          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer w-full">
              <input
                type="checkbox"
                checked={agreedToContract}
                onChange={(e) => setAgreedToContract(e.target.checked)}
                className="mt-0.5 h-4 w-4 min-w-[1rem] rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                aria-label="I confirm this digital signature is mine"
              />
              <span className="text-xs sm:text-sm text-slate-700">I have read the contract details and confirm this digital signature is mine.</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer w-full">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 min-w-[1rem] rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                aria-label="I agree to Terms and Conditions"
              />
              <span className="text-xs sm:text-sm text-slate-700">I agree to the Terms and Conditions and platform policies.</span>
            </label>
          </div>
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onBack}
              disabled={actionLoading || submitting}
              className="flex items-center gap-1.5 px-3 py-2 sm:px-5 sm:py-2.5 border border-slate-300 text-slate-700 rounded-lg sm:rounded-xl hover:bg-slate-50 font-medium text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 animate-spin" /> : <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />}
              Previous
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !canSubmit || actionLoading}
              className="flex-1 min-w-0 max-w-xs px-4 py-2.5 sm:px-6 sm:py-3 bg-indigo-600 text-white font-semibold text-sm sm:text-base rounded-lg sm:rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                  <span className="truncate">Submitting...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                  <span className="truncate sm:hidden">Submit</span>
                  <span className="truncate hidden sm:inline">Submit Application & Download PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
