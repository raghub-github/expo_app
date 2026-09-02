"use client";

import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export function useFileDropHandlers(
  onFile: (file: File) => void,
  opts?: { disabled?: boolean },
) {
  const [dragActive, setDragActive] = useState(false);
  const disabled = Boolean(opts?.disabled);

  const prevent = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return {
    dragActive,
    handlers: {
      onDragEnter: (e: DragEvent) => {
        prevent(e);
        if (disabled) return;
        setDragActive(true);
      },
      onDragOver: (e: DragEvent) => {
        prevent(e);
        if (disabled) return;
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        setDragActive(true);
      },
      onDragLeave: (e: DragEvent) => {
        prevent(e);
        setDragActive(false);
      },
      onDrop: (e: DragEvent) => {
        prevent(e);
        setDragActive(false);
        if (disabled) return;
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      },
    },
  };
}

export function FileDropSurface({
  onChoose,
  onFile,
  disabled,
  uploading,
  className = "",
  children,
}: {
  onChoose?: () => void;
  onFile: (file: File) => void;
  disabled?: boolean;
  uploading?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const isDisabled = Boolean(disabled || uploading);
  const { dragActive, handlers } = useFileDropHandlers(onFile, { disabled: isDisabled });
  const dragClass = dragActive ? "border-indigo-400! bg-indigo-50/60!" : "";
  const disabledClass = isDisabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer";

  return (
    <div
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      onClick={() => {
        if (!isDisabled && onChoose) onChoose();
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (isDisabled || !onChoose) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onChoose();
        }
      }}
      {...handlers}
      className={`${className} ${dragClass} ${disabledClass}`.trim()}
    >
      {children}
    </div>
  );
}

export function PayUDocumentDropzone({
  label,
  onChoose,
  onFile,
  uploading,
  disabled,
  hint = "Upload .png, .pdf, .jpg, .jpeg or .doc file (max size 5MB)",
}: {
  label: string;
  onChoose: () => void;
  onFile: (file: File) => void;
  uploading?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  const isDisabled = Boolean(disabled || uploading);
  const { dragActive, handlers } = useFileDropHandlers(onFile, { disabled: isDisabled });

  return (
    <div>
      <label className="block text-sm font-medium text-slate-800 mb-2">{label}</label>
      <div
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        onClick={() => {
          if (!isDisabled) onChoose();
        }}
        onKeyDown={(e: KeyboardEvent) => {
          if (isDisabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onChoose();
          }
        }}
        {...handlers}
        className={`w-full rounded-md border border-dashed border-slate-300 bg-white px-4 py-10 text-center hover:border-slate-400 hover:bg-slate-50/80 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          dragActive ? "border-indigo-400! bg-indigo-50/60!" : ""
        } ${isDisabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <svg className="mx-auto h-11 w-11 text-slate-400" viewBox="0 0 48 48" fill="none" aria-hidden>
          <rect x="10" y="6" width="28" height="36" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M16 14h16M16 22h16M16 30h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className="mt-3 text-sm text-slate-600">
          Drag and drop file here or{" "}
          <span className="font-semibold text-teal-700">Choose file</span>
        </p>
        <p className="mt-1.5 text-xs text-slate-400">{hint}</p>
        {uploading ? (
          <p className="mt-2 inline-flex items-center gap-2 text-xs text-indigo-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
          </p>
        ) : null}
      </div>
    </div>
  );
}
