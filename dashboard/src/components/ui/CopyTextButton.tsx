"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  className?: string;
  label?: string;
  copiedLabel?: string;
  /** How long to show "Copied" (ms). */
  feedbackMs?: number;
};

/**
 * Copy-to-clipboard control with short "Copied" confirmation feedback.
 */
export function CopyTextButton({
  value,
  className,
  label = "Copy",
  copiedLabel = "Copied",
  feedbackMs = 2000,
}: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onCopy = async () => {
    const text = String(value ?? "").trim();
    if (!text) return;
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), feedbackMs);
  };

  return (
    <button
      type="button"
      className={
        className ??
        "shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
      }
      onClick={() => void onCopy()}
      aria-label={copied ? copiedLabel : label}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
