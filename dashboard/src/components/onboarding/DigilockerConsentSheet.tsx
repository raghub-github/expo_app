"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

export type DigilockerConsentSheetProps = {
  open: boolean;
  /** Cashfree DigiLocker consent URL (opened once in the DigiLocker window). */
  url: string | null;
  /** True while create-link API is still running. */
  preparing?: boolean;
  /** Pre-opened DigiLocker window from the Verify click (user gesture). */
  popupRef?: React.MutableRefObject<Window | null>;
  onClose: () => void;
  /** Fired when DigiLocker redirects back or the consent window closes — parent should poll. */
  onConsentActivity?: () => void;
};

const POPUP_NAME = "gatimitra_digilocker";

/** Open a compact DigiLocker window with a loading screen (call on Verify click). */
export function openDigilockerLoadingPopup(): Window | null {
  if (typeof window === "undefined") return null;
  const w = 480;
  const h = Math.min(760, Math.round(window.outerHeight * 0.9));
  const left = Math.max(0, Math.round(window.screenX + window.outerWidth - w - 24));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2));
  const popup = window.open(
    "",
    POPUP_NAME,
    `popup=yes,width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`,
  );
  if (!popup) return null;
  try {
    popup.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>DigiLocker</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#334155}
    .box{text-align:center;padding:24px}
    .spin{width:36px;height:36px;border:3px solid #c7d2fe;border-top-color:#4f46e5;
      border-radius:50%;animation:s .8s linear infinite;margin:0 auto 14px}
    @keyframes s{to{transform:rotate(360deg)}}
    p{margin:0 0 6px;font-size:15px;font-weight:600}
    span{font-size:12px;color:#64748b}
  </style>
</head>
<body>
  <div class="box">
    <div class="spin"></div>
    <p>Starting DigiLocker…</p>
    <span>Keep this window open to complete Aadhaar consent.</span>
  </div>
</body>
</html>`);
    popup.document.close();
  } catch {
    /* ignore */
  }
  return popup;
}

export function navigateDigilockerPopup(
  popup: Window | null | undefined,
  url: string,
): Window | null {
  if (!url || typeof window === "undefined") return null;
  if (popup && !popup.closed) {
    try {
      popup.location.href = url;
      popup.focus();
      return popup;
    } catch {
      /* fall through */
    }
  }
  const w = 480;
  const h = Math.min(760, Math.round(window.outerHeight * 0.9));
  const left = Math.max(0, Math.round(window.screenX + window.outerWidth - w - 24));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2));
  const opened = window.open(
    url,
    POPUP_NAME,
    `popup=yes,width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`,
  );
  if (opened) {
    try {
      opened.focus();
    } catch {
      /* ignore */
    }
  }
  return opened;
}

/**
 * DigiLocker Aadhaar consent sidesheet.
 * DigiLocker (Meri Pehchaan) cannot be embedded in an iframe — Cashfree’s own web SDK
 * opens DigiLocker in a window when the host is framed. We keep this sidesheet as the
 * status panel and open DigiLocker in an aligned secure window so Aadhaar can verify.
 */
export function DigilockerConsentSheet({
  open,
  url,
  preparing = false,
  popupRef,
  onClose,
  onConsentActivity,
}: DigilockerConsentSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [needsManualOpen, setNeedsManualOpen] = useState(false);
  const navigatedUrlRef = useRef<string | null>(null);
  const onConsentActivityRef = useRef(onConsentActivity);
  onConsentActivityRef.current = onConsentActivity;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setNeedsManualOpen(false);
      navigatedUrlRef.current = null;
      return;
    }
    if (!url || navigatedUrlRef.current === url) return;
    const next = navigateDigilockerPopup(popupRef?.current ?? null, url);
    if (popupRef) popupRef.current = next;
    navigatedUrlRef.current = url;
    setNeedsManualOpen(!next);
  }, [open, url, popupRef]);

  useEffect(() => {
    if (!open) return;
    const onMsg = (e: MessageEvent) => {
      const data = e.data;
      if (
        data &&
        typeof data === "object" &&
        (data as { type?: string }).type === "gatimitra-digilocker-return"
      ) {
        onConsentActivityRef.current?.();
      }
    };
    window.addEventListener("message", onMsg);
    let wasOpen = !!(popupRef?.current && !popupRef.current.closed);
    const tick = window.setInterval(() => {
      const popup = popupRef?.current;
      const isOpen = !!(popup && !popup.closed);
      if (wasOpen && !isOpen) {
        onConsentActivityRef.current?.();
      }
      wasOpen = isOpen;
      if (url && (!popup || popup.closed)) {
        setNeedsManualOpen(true);
      }
    }, 1000);
    return () => {
      window.removeEventListener("message", onMsg);
      window.clearInterval(tick);
    };
  }, [open, popupRef, url]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2600] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="DigiLocker verification"
    >
      {/* Backdrop — does not close (only X / Cancel). */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" aria-hidden="true" />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-2xl border-l border-slate-200">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">DigiLocker verification</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {preparing && !url
                ? "Preparing secure DigiLocker link…"
                : "Complete OTP / consent in the DigiLocker window."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 bg-slate-50 px-4 py-6 flex flex-col items-center justify-center text-center gap-3">
          <Loader2 className="h-9 w-9 animate-spin text-indigo-600" />
          <p className="text-sm font-semibold text-slate-800">
            {preparing && !url
              ? "Starting DigiLocker…"
              : "Waiting for DigiLocker confirmation…"}
          </p>
          <p className="text-xs text-slate-500 max-w-sm">
            DigiLocker opens in a secure window beside this panel (government DigiLocker pages
            cannot load inside the sheet). Finish OTP &amp; consent there — Aadhaar will verify
            here automatically.
          </p>
          {needsManualOpen && url ? (
            <button
              type="button"
              onClick={() => {
                const next = navigateDigilockerPopup(null, url);
                if (popupRef) popupRef.current = next;
                setNeedsManualOpen(!next);
                if (next) onConsentActivityRef.current?.();
              }}
              className="mt-2 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Open DigiLocker window
            </button>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">Do not cancel until verification finishes.</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default DigilockerConsentSheet;
