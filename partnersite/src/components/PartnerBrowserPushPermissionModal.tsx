"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  ShoppingCart,
  ShieldAlert,
  Truck,
  X,
} from "lucide-react";
import {
  registerBrowserPushToken,
  requestBrowserPushPermission,
} from "@/lib/browser-push/firebase-web";
import { toast } from "sonner";

const DISMISS_KEY = "partner_browser_push_modal_dismissed_permanently";
const SOFT_DISMISS_KEY = "partner_browser_push_modal_dismissed_at";
const SOFT_DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days after "Not Now"

const BENEFITS: Array<{ icon: typeof ShoppingCart; label: string; tone: string }> = [
  { icon: ShoppingCart, label: "New orders, cancellations & refunds", tone: "text-emerald-600 dark:text-emerald-400" },
  { icon: Truck, label: "Rider assigned, arrived, pickup & delivered", tone: "text-sky-600 dark:text-sky-400" },
  { icon: CreditCard, label: "Payments, settlements & payouts", tone: "text-indigo-600 dark:text-indigo-400" },
  { icon: ShieldAlert, label: "Campaigns, store status & critical alerts", tone: "text-amber-600 dark:text-amber-400" },
];

function isPermanentlyDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function softDismissedRecently(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(SOFT_DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < SOFT_DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markSoftDismissed() {
  try {
    localStorage.setItem(SOFT_DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function markPermanentlyDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

function clearDismissFlags() {
  try {
    localStorage.removeItem(DISMISS_KEY);
    localStorage.removeItem(SOFT_DISMISS_KEY);
  } catch {
    /* ignore */
  }
}

type Props = {
  /** Called after a successful FCM token register. */
  onRegistered?: () => void;
};

/**
 * Educates merchants on browser notification value and prompts for permission.
 * Only opens when Notification permission is not granted and the user has not dismissed recently.
 */
export function PartnerBrowserPushPermissionModal({ onRegistered }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [needsRetry, setNeedsRetry] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted") return;
    if (isPermanentlyDismissed() || softDismissedRecently()) return;

    const t = window.setTimeout(() => {
      if (Notification.permission === "granted") return;
      if (isPermanentlyDismissed() || softDismissedRecently()) return;
      setBlocked(Notification.permission === "denied");
      setShowHowTo(false);
      setOpen(true);
    }, 1200);
    return () => window.clearTimeout(t);
  }, []);

  const closeSoft = useCallback(() => {
    markSoftDismissed();
    setOpen(false);
  }, []);

  const closePermanent = useCallback(() => {
    markPermanentlyDismissed();
    setOpen(false);
  }, []);

  const onPrimary = useCallback(async () => {
    setBusy(true);
    setNeedsRetry(false);
    try {
      let perm = Notification.permission;

      // Browser-level block: user must change site settings, then return here.
      if (perm === "denied") {
        setBlocked(true);
        setNeedsRetry(true);
        toast.error(
          "Still blocked for this site. Allow notifications in browser settings, then refresh this page and tap I've Enabled It again."
        );
        return;
      }

      if (perm === "default") {
        perm = await requestBrowserPushPermission();
      }

      if (perm !== "granted") {
        setBlocked(perm === "denied");
        setNeedsRetry(true);
        toast.error(
          perm === "denied"
            ? "Permission denied. Follow How to Enable, allow notifications, refresh, then tap I've Enabled It."
            : "Permission was not granted. You can try again anytime."
        );
        return;
      }

      const token = await registerBrowserPushToken("merchant");
      if (!token) {
        setBlocked(false);
        setNeedsRetry(true);
        toast.error(
          "Permission is on, but this browser could not register for push. Check that the backend is running, then tap Retry."
        );
        return;
      }

      clearDismissFlags();
      setSuccess(true);
      setBlocked(false);
      setNeedsRetry(false);
      toast.success("Notifications enabled");
      onRegistered?.();
      window.setTimeout(() => setOpen(false), 2200);
    } catch (e) {
      setNeedsRetry(true);
      toast.error((e as Error)?.message || "Failed to enable notifications");
    } finally {
      setBusy(false);
    }
  }, [onRegistered]);

  if (!open) return null;

  const primaryLabel = busy
    ? "Enabling…"
    : Notification.permission === "denied" || blocked
      ? "I've Enabled It"
      : needsRetry
        ? "Retry"
        : "Enable Notifications";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-[3px] dark:bg-black/60 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="partner-push-title"
        className="relative w-full max-w-md rounded-2xl border border-slate-200/80 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <button
          type="button"
          onClick={closePermanent}
          className="absolute right-2.5 top-2.5 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Dismiss permanently"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-5 pb-1 pt-5 sm:px-5">
          {success ? (
            <div className="pb-3 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 id="partner-push-title" className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                ✅ Notifications Enabled
              </h2>
              <p className="mt-2 text-sm leading-snug text-slate-600 dark:text-slate-300">
                You&apos;re all set for real-time order, rider, payment, and platform alerts.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/15 to-indigo-500/15 text-sky-700 dark:from-sky-400/20 dark:to-indigo-400/20 dark:text-sky-300">
                {blocked ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
              </div>

              <h2
                id="partner-push-title"
                className="pr-7 text-lg font-semibold tracking-tight text-slate-900 dark:text-white"
              >
                🔔 Stay Updated with Your Store
              </h2>
              <p className="mt-1.5 text-sm leading-snug text-slate-600 dark:text-slate-300">
                Never miss important updates from the GatiMitra Partner Portal. Enable browser
                notifications for faster store operations.
              </p>

              <ul className="mt-3 grid gap-1.5 rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 dark:border-slate-700/80 dark:bg-slate-800/50">
                {BENEFITS.map(({ icon: Icon, label, tone }) => (
                  <li key={label} className="flex items-center gap-2 text-[13px] text-slate-700 dark:text-slate-200">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white shadow-sm dark:bg-slate-900 ${tone}`}
                    >
                      <Icon className="h-3 w-3" aria-hidden />
                    </span>
                    <span className="leading-tight">{label}</span>
                  </li>
                ))}
              </ul>

              {blocked ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowHowTo((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline dark:text-sky-400"
                  >
                    How to Enable
                    {showHowTo ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  {showHowTo ? (
                    <ol className="mt-1.5 list-decimal space-y-0.5 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 pl-6 text-[11px] leading-snug text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
                      <li>Click the lock icon in the address bar.</li>
                      <li>Site settings → Notifications → Allow.</li>
                      <li>Refresh, then tap I&apos;ve Enabled It.</li>
                    </ol>
                  ) : null}
                </div>
              ) : null}

              <p className="mt-2.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                You can change this anytime in browser settings.
              </p>
            </>
          )}
        </div>

        {!success ? (
          <div className="flex flex-col-reverse gap-2 px-5 pb-4 pt-3 sm:flex-row sm:justify-end sm:px-5">
            <button
              type="button"
              onClick={closeSoft}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              disabled={busy}
            >
              Not Now
            </button>
            <button
              type="button"
              onClick={() => void onPrimary()}
              disabled={busy}
              className="rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-sky-500/25 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-60"
            >
              {primaryLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
