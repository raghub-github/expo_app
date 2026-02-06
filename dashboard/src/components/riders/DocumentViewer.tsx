"use client";

import { useState } from "react";
import { X, ZoomIn, ZoomOut, Download, Maximize2, Minimize2 } from "lucide-react";

interface DocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  documentName?: string;
  documentNumber?: string | null;
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

  if (!isOpen) return null;

  const safeImageUrl = typeof imageUrl === "string" && imageUrl.trim() ? imageUrl : "";
  const hasDocNumber = documentNumber != null && String(documentNumber).trim() !== "";

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
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = documentName || "document";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors"
        aria-label="Close viewer"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Document name + number bar (for agent to compare number with image) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 min-w-0 max-w-[calc(100%-8rem)]">
        <span className="text-white font-medium text-sm truncate max-w-full">{documentName ?? "Document"}</span>
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

      {/* Controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
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

        <button
          onClick={handleDownload}
          className="p-2 bg-gray-800 text-white hover:bg-gray-700 rounded-lg transition-colors"
          aria-label="Download document"
        >
          <Download className="h-5 w-5" />
        </button>
      </div>

      {/* Image container */}
      <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
        <div
          className="relative max-w-full max-h-full"
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: "center",
          }}
        >
          <img
            src={safeImageUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%231f2937' width='400' height='300'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%239ca3af'%3ENo image%3C/text%3E%3C/svg%3E"}
            alt={documentName ?? "Document"}
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onError={(e) => {
              // Handle image load errors
              const target = e.target as HTMLImageElement;
              target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23f3f4f6' width='400' height='300'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='16' fill='%236b7280'%3EFailed to load image%3C/text%3E%3C/svg%3E";
            }}
          />
        </div>
      </div>

      {/* Click outside to close */}
      <div
        className="absolute inset-0 -z-10"
        onClick={onClose}
        aria-hidden="true"
      />
    </div>
  );
}
