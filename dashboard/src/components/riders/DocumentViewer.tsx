"use client";

import { useMemo, useState } from "react";
import { X, ZoomIn, ZoomOut, Download, Maximize2, Minimize2, FileText, ExternalLink } from "lucide-react";
import { ModalPortal } from "@/components/ui/ModalPortal";

interface DocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  documentName?: string;
  documentNumber?: string | null;
}

function isPdfUrl(url: string): boolean {
  const u = String(url || "").trim().toLowerCase();
  if (!u) return false;
  if (u.includes(".pdf")) return true;
  if (u.includes("application%2fpdf") || u.includes("application/pdf")) return true;
  if (u.includes("mime=pdf") || u.includes("content-type=pdf")) return true;
  return false;
}

export function DocumentViewer({
  isOpen,
  onClose,
  imageUrl,
  documentName = "Document",
  documentNumber,
}: DocumentViewerProps) {
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);

  const safeImageUrl = typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : "";
  const isPdf = useMemo(() => isPdfUrl(safeImageUrl), [safeImageUrl]);
  const hasDocNumber = documentNumber != null && String(documentNumber).trim() !== "";

  if (!isOpen) return null;

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 25, 300));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 25, 50));
  };

  const handleResetZoom = () => {
    setZoom(100);
  };

  const handleDownload = () => {
    if (!safeImageUrl) return;
    const link = document.createElement("a");
    link.href = safeImageUrl;
    link.download = `${documentName || "document"}${isPdf ? ".pdf" : ""}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenExternal = () => {
    if (!safeImageUrl) return;
    window.open(safeImageUrl, "_blank", "noopener,noreferrer");
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
    setIsFullscreen(!isFullscreen);
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/70 backdrop-blur-md">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors"
          aria-label="Close viewer"
        >
          <X className="h-6 w-6" />
        </button>

        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 min-w-0 max-w-[calc(100%-8rem)]">
          <span className="text-white font-medium text-sm truncate max-w-full">
            {documentName ?? "Document"}
            {isPdf ? " · PDF" : ""}
          </span>
          {hasDocNumber ? (
            <div className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg bg-gray-800/95 border border-gray-600">
              <span className="text-xs text-gray-400 uppercase tracking-wider">Document number</span>
              <span className="text-white font-mono font-semibold text-base tabular-nums tracking-wide select-all">
                {String(documentNumber).trim()}
              </span>
            </div>
          ) : (
            <span className="text-gray-400 text-xs">No document number entered</span>
          )}
        </div>

        <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
          {!isPdf ? (
            <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 50}
                className="p-2 text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-5 w-5" />
              </button>
              <button
                onClick={handleResetZoom}
                className="px-3 py-2 text-white hover:bg-gray-700 rounded text-sm font-medium transition-colors"
                aria-label="Reset zoom"
              >
                {zoom}%
              </button>
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 300}
                className="p-2 text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-5 w-5" />
              </button>
            </div>
          ) : null}

          <button
            onClick={toggleFullscreen}
            className="p-2 bg-gray-800 text-white hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Toggle fullscreen"
          >
            {isFullscreen ? (
              <Minimize2 className="h-5 w-5" />
            ) : (
              <Maximize2 className="h-5 w-5" />
            )}
          </button>

          {isPdf ? (
            <button
              onClick={handleOpenExternal}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-800 text-white hover:bg-gray-700 rounded-lg transition-colors text-sm font-medium"
              aria-label="Open PDF in new tab"
            >
              <ExternalLink className="h-4 w-4" />
              Open
            </button>
          ) : null}

          <button
            onClick={handleDownload}
            className="p-2 bg-gray-800 text-white hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Download document"
          >
            <Download className="h-5 w-5" />
          </button>
        </div>

        <div className="w-full h-full flex items-center justify-center p-4 pt-24 overflow-auto">
          {isPdf ? (
            <div className="relative flex h-[min(88vh,920px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-white shadow-2xl">
              {safeImageUrl && !pdfFailed ? (
                <iframe
                  title={documentName || "PDF document"}
                  src={safeImageUrl}
                  className="h-full w-full flex-1 bg-white"
                  onError={() => setPdfFailed(true)}
                />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
                  <FileText className="h-14 w-14 text-rose-500" />
                  <p className="text-sm font-semibold text-slate-800">
                    {pdfFailed ? "Could not embed this PDF in the browser" : "No PDF URL"}
                  </p>
                  {safeImageUrl ? (
                    <button
                      type="button"
                      onClick={handleOpenExternal}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#0A2342] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0A2342]/90"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open PDF in new tab
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <div
              className="relative max-w-full max-h-full"
              style={{
                transform: `scale(${zoom / 100})`,
                transformOrigin: "center",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  safeImageUrl ||
                  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%231f2937' width='400' height='300'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%239ca3af'%3ENo image%3C/text%3E%3C/svg%3E"
                }
                alt={documentName ?? "Document"}
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src =
                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23f3f4f6' width='400' height='300'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='16' fill='%236b7280'%3EFailed to load image%3C/text%3E%3C/svg%3E";
                }}
              />
            </div>
          )}
        </div>

        <div
          className="absolute inset-0 -z-10 cursor-pointer"
          onClick={onClose}
          aria-hidden="true"
        />
      </div>
    </ModalPortal>
  );
}
