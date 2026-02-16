"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { ChevronLeft, Upload, Trash2, Loader2 } from "lucide-react";
import { buildContractText, buildStructuredContract, type ContractData } from "./agreement";

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

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    startDraw(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    moveDraw(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    endDraw();
  };

  const handleMouseLeave = () => {
    endDraw();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const t = e.touches[0];
    if (t) startDraw(t.clientX, t.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const t = e.touches[0];
    if (t) moveDraw(t.clientX, t.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
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
          }
        : undefined,
    }),
    [step1, step2, documents, parentInfo]
  );

  const downloadPdf = useCallback(async () => {
    if (!signatureDataUrl) return;
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

      const logoUrl = typeof process.env.NEXT_PUBLIC_PLATFORM_LOGO_URL === "string" ? process.env.NEXT_PUBLIC_PLATFORM_LOGO_URL : "";
      const logoSrc = logoUrl && (logoUrl.startsWith("http") || logoUrl.startsWith("data:") || logoUrl.startsWith("/"))
        ? logoUrl.startsWith("http") || logoUrl.startsWith("data:")
          ? logoUrl
          : typeof window !== "undefined"
            ? window.location.origin + (logoUrl.startsWith("/") ? logoUrl : "/" + logoUrl)
            : ""
        : "";
      if (logoSrc) {
        try {
          doc.addImage(logoSrc, "PNG", margin, y, 35, 12);
          y += 16;
        } catch {
          y += 2;
        }
      }

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("CONTRACT APPROVAL", margin, y);
      y += 10;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const approvedDate = new Date().toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" });
      doc.text("Reference: Partner Agreement – " + (step1?.store_name || "Store"), margin, y);
      y += lineH;
      doc.text("Approved / Signed on: " + approvedDate, margin, y);
      y += lineH;
      doc.text("Status: Approved", margin, y);
      y += lineH;
      doc.text("Signatory: " + (signerName || "—"), margin, y);
      y += lineH + 4;
      doc.setFont("helvetica", "bold");
      doc.text("RESTAURANT PARTNER ENROLMENT FORM (\"FORM\")", margin, y);
      y += headH;
      doc.setFont("helvetica", "normal");
      const introLines = [
        `Effective Date: ${structured.intro.effectiveDate}`,
        `Restaurant Name: ${structured.intro.storeName}`,
        `Legal Entity Name: ${structured.intro.ownerName}`,
        `Address: ${structured.intro.address}`,
        `Contact: ${structured.intro.contactPerson} | ${structured.intro.phone} | ${structured.intro.email}`,
      ];
      introLines.forEach((line) => {
        checkNewPage(lineH);
        doc.text(line, margin, y);
        y += lineH;
      });
      y += 3;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Definitions", margin, y);
      y += headH;
      doc.setFont("helvetica", "normal");
      structured.definitions.forEach((d) => {
        const defLine = d.term + ": " + d.meaning;
        const wrapped = doc.splitTextToSize(defLine, pageW - margin * 2 - 2);
        wrapped.forEach((line: string) => {
          checkNewPage(smallH);
          doc.text(line, margin + 2, y);
          y += smallH;
        });
        y += 1;
      });
      y += 3;

      structured.sections.forEach((sec) => {
        checkNewPage(headH + 5);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(sec.title, margin, y);
        y += headH;
        doc.setFont("helvetica", "normal");
        if (sec.bullets) {
          sec.bullets.forEach((b) => {
            const wrapped = doc.splitTextToSize("• " + b, pageW - margin * 2 - 4);
            wrapped.forEach((line: string) => {
              checkNewPage(smallH);
              doc.text(line, margin + 4, y);
              y += smallH;
            });
          });
        }
        if (sec.paragraphs) {
          sec.paragraphs.forEach((p) => {
            const wrapped = doc.splitTextToSize(p, pageW - margin * 2);
            wrapped.forEach((line: string) => {
              checkNewPage(smallH);
              doc.text(line, margin, y);
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
      doc.text(structured.annexureA.description, margin, y);
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
          const text = doc.splitTextToSize(cell, aColW - 4);
          doc.text(text[0] || "—", x + 2, y + 0.5);
          x += aColW;
        });
        y += aRowH;
      });
      y += 4;

      checkNewPage(headH + 15);
      doc.setFont("helvetica", "bold");
      doc.text("Annexure B - Bank Details", margin, y);
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
          const text = doc.splitTextToSize(cell, bColW - 4);
          doc.text(text[0] || "—", x + 2, y + 0.5);
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
      const certLines = doc.splitTextToSize(structured.certification, pageW - margin * 2);
      certLines.forEach((line: string) => {
        checkNewPage(smallH);
        doc.text(line, margin, y);
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
      doc.text("Signed by: " + (signerName || "—"), imgX, y + imgH + 4);
      doc.text("Date: " + new Date().toLocaleDateString("en-IN", { dateStyle: "medium" }), imgX, y + imgH + 8);

      const filename = `contract-approval-${(step1?.store_name || "store").replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`;
      doc.save(filename);
      setPdfDownloaded(true);
    } catch (err) {
      console.error("PDF download failed:", err);
      setError("Could not generate PDF. Please try again or use the contract copy from the previous step.");
    }
  }, [signatureDataUrl, signerName, step1, step2, documents, parentInfo, agreementTemplate?.content_markdown, defaultAgreementText, contractDataForPdf]);

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

      async function uploadToR2(file: File, parent: string, filename: string): Promise<string | null> {
        if (!file) return null;
        const form = new FormData();
        form.append("file", file);
        form.append("parent", parent || "");
        form.append("filename", filename || file.name);
        const res = await fetch("/api/upload/r2", { method: "POST", body: form });
        const data = await res.json();
        if (!data.url) throw new Error("Image upload failed");
        return data.url;
      }

      const storeFolder = parentMerchantId || "store";
      const logoUrl = await uploadToR2(storeSetup.logo, storeFolder, "logo");
      const bannerUrl = await uploadToR2(storeSetup.banner, storeFolder, "banner");
      const galleryUrls = await Promise.all(
        (storeSetup.gallery_images || []).map((file: File, idx: number) =>
          uploadToR2(file, storeFolder, `gallery_${idx + 1}`)
        )
      );
      const uploadedMenuImageUrls = await Promise.all(
        (menuData?.menuImageFiles || []).map((file: File, idx: number) =>
          uploadToR2(file, `${storeFolder}/menu/images`, `menu_image_${idx + 1}_${Date.now()}`)
        )
      );
      const uploadedMenuSpreadsheetUrl = menuData?.menuSpreadsheetFile
        ? await uploadToR2(menuData.menuSpreadsheetFile, `${storeFolder}/menu/csv`, `menu_sheet_${Date.now()}`)
        : null;
      const menuImageUrls = [...(menuData?.menuImageUrls || []), ...uploadedMenuImageUrls.filter(Boolean)];
      const menuSpreadsheetUrl = menuData?.menuSpreadsheetUrl || uploadedMenuSpreadsheetUrl;

      const documentUrls: { type: string; url: string; name: string }[] = [];
      for (const [key, value] of Object.entries(documents)) {
        if (value instanceof File) {
          const url = await uploadToR2(value, storeFolder, key);
          documentUrls.push({ type: key.toUpperCase(), url, name: value.name });
        }
      }

      const res = await fetch("/api/register-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step1,
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
            signerName: signerName.trim(),
            signerEmail: signerEmail || null,
            signerPhone: signerPhone || null,
            signatureDataUrl,
            agreedToContract,
            agreedToTerms,
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
    <div className="min-h-full w-full bg-gradient-to-br from-slate-50 to-white flex flex-col">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-3 py-3 sm:px-4 sm:py-4 shrink-0">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">Digital Signature</h1>
        </div>
      </div>

      <div className="flex-1 max-w-2xl w-full mx-auto px-3 py-4 sm:px-4 sm:py-6 space-y-4 sm:space-y-6 pb-28">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4">
          <p className="text-xs sm:text-sm text-slate-600">
            Sign in the box below using your mouse (desktop) or finger (mobile). Your signature will be attached to the contract.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Signer full name"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <input
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              placeholder="Signer email"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <input
              type="text"
              value={signerPhone}
              onChange={(e) => setSignerPhone(e.target.value)}
              placeholder="Signer phone"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div ref={containerRef} className="relative w-full rounded-lg sm:rounded-xl border-2 border-dashed border-slate-300 bg-white overflow-hidden touch-none select-none" style={{ minHeight: 140, height: "clamp(140px, 40vw, 200px)", touchAction: "none" }}>
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
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Draw your signature above</p>
            <button
              type="button"
              onClick={clearSignature}
              className="flex items-center gap-1 text-sm text-rose-600 hover:text-rose-700"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={agreedToContract}
            onChange={(e) => setAgreedToContract(e.target.checked)}
            className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>I have read the contract details and confirm this digital signature is mine.</span>
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>I agree to the Terms and Conditions and platform policies.</span>
        </label>
      </div>

      {/* Navigation - Bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-white border-t border-slate-200 px-4 py-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={actionLoading || submitting}
            className="flex items-center gap-1.5 px-5 py-2.5 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {actionLoading ? <Loader2 className="w-5 h-5 shrink-0 animate-spin" /> : <ChevronLeft className="w-5 h-5 shrink-0" />}
            Back
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !canSubmit || actionLoading}
            className="flex-1 max-w-xs px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Submit Application & Download PDF
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
