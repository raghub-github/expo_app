"use client";

import { useCallback, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  RefreshCw,
  ShoppingCart,
  ShieldAlert,
  Truck,
  X,
} from "lucide-react";
import {
  registerBrowserPushToken,
  requestBrowserPushPermission,
} from "@/lib/browser-push/firebase-web";
import {
  clearPushDismissFlags,
  markPushRegistrationPending,
  markPushRegistered,
  markPushSessionDismissed,
} from "@/lib/browser-push/partner-push-state";
import type { PartnerPushStatus } from "@/lib/browser-push/partner-push-status";
import { invalidatePartnerPushBackendCache } from "@/lib/browser-push/partner-push-status";
import { toast } from "sonner";

const BENEFITS: Array<{ icon: typeof ShoppingCart; label: string; tone: string }> = [
  { icon: ShoppingCart, label: "New orders, cancellations & refunds", tone: "text-emerald-600 dark:text-emerald-400" },
  { icon: Truck, label: "Rider assigned, arrived, pickup & delivered", tone: "text-sky-600 dark:text-sky-400" },
  { icon: CreditCard, label: "Payments, settlements & payouts", tone: "text-indigo-600 dark:text-indigo-400" },
  { icon: ShieldAlert, label: "Campaigns, store status & critical alerts", tone: "text-amber-600 dark:text-amber-400" },
];

const RELOAD_MESSAGE = "Please reload your site and then try again.";

type Props = {
  mode: "permission" | "registration";
  pushStatus?: PartnerPushStatus | null;
  merchantUserId?: string | null;
  onClose: () => void;
  onRegistered?: () => void;
};

/**
 * Permission education modal OR post-permission registration completion modal.
 */
export function PartnerBrowserPushPermissionModal({
  mode,
  pushStatus,
  merchantUserId,
  onClose,
  onRegistered,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(() =>
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission === "denied"
      : false,
  );
  const [success, setSuccess] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [needsReloadHint, setNeedsReloadHint] = useState(false);

  const isRegistrationMode = mode === "registration";

  const dismissForSession = useCallback(() => {
    markPushSessionDismissed(merchantUserId);
    onClose();
  }, [merchantUserId, onClose]);

  const closeSoft = dismissForSession;

  const closePermanent = useCallback(() => {
    dismissForSession();
  }, [dismissForSession]);

  const completeRegistration = useCallback(async () => {
    await navigator.serviceWorker?.ready.catch(() => undefined);
    const token = await registerBrowserPushToken("merchant", { retries: 4 });
    if (!token) return false;

    clearPushDismissFlags();
    markPushRegistered();
    invalidatePartnerPushBackendCache();
    setSuccess(true);
    setBlocked(false);
    setNeedsReloadHint(false);
    toast.success("Notifications enabled successfully.");
    onRegistered?.();
    window.setTimeout(() => onClose(), 2200);
    return true;
  }, [onClose, onRegistered]);

  const onPrimary = useCallback(async () => {
    setBusy(true);
    setNeedsReloadHint(false);

    try {
      if (isRegistrationMode) {
        const ok = await completeRegistration();
        if (!ok) {
          markPushRegistrationPending();
          setNeedsReloadHint(true);
          toast.error(RELOAD_MESSAGE);
        }
        return;
      }

      let perm = Notification.permission;

      if (perm === "denied") {
        setBlocked(true);
        toast.error(
          "Still blocked for this site. Allow notifications in browser settings, refresh this page, then tap I've Enabled It again.",
        );
        return;
      }

      if (perm === "default") {
        perm = await requestBrowserPushPermission();
      }

      if (perm !== "granted") {
        setBlocked(perm === "denied");
        toast.error(
          perm === "denied"
            ? "Permission denied. Follow How to Enable, allow notifications, refresh, then tap I've Enabled It."
            : "Permission was not granted. You can try again anytime.",
        );
        return;
      }

      // Give the browser a moment to propagate permission to the service worker.
      await navigator.serviceWorker?.ready.catch(() => undefined);
      await new Promise((resolve) => window.setTimeout(resolve, 400));

      const ok = await completeRegistration();
      if (!ok) {
        markPushRegistrationPending();
        setNeedsReloadHint(true);
        toast.error(RELOAD_MESSAGE);
      }
    } catch (e) {
      toast.error((e as Error)?.message || "Failed to enable notifications");
    } finally {
      setBusy(false);
    }
  }, [completeRegistration, isRegistrationMode]);

  const isBlocked = blocked || pushStatus === "denied";
  const primaryLabel = busy
    ? isRegistrationMode
      ? "Connecting…"
      : "Enabling…"
    : isRegistrationMode
      ? "Retry"
      : isBlocked
        ? "I've Enabled It"
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
          aria-label="Dismiss for this session"
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
                Notifications Enabled
              </h2>
              <p className="mt-2 text-sm leading-snug text-slate-600 dark:text-slate-300">
                You&apos;re all set for real-time order, rider, payment, and platform alerts.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/15 to-indigo-500/15 text-sky-700 dark:from-sky-400/20 dark:to-indigo-400/20 dark:text-sky-300">
                {isRegistrationMode ? (
                  <RefreshCw className="h-5 w-5" />
                ) : isBlocked ? (
                  <BellOff className="h-5 w-5" />
                ) : (
                  <Bell className="h-5 w-5" />
                )}
              </div>

              <h2
                id="partner-push-title"
                className="pr-7 text-lg font-semibold tracking-tight text-slate-900 dark:text-white"
              >
                {isRegistrationMode ? "Finish Enabling Notifications" : "Stay Updated with Your Store"}
              </h2>
              <p className="mt-1.5 text-sm leading-snug text-slate-600 dark:text-slate-300">
                {isRegistrationMode
                  ? "Browser permission is already on. Tap Retry to connect this device for store alerts."
                  : "Never miss important updates from the GatiMitra Partner Portal. Enable browser notifications for faster store operations."}
              </p>

              {needsReloadHint ? (
                <p className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
                  {RELOAD_MESSAGE}
                </p>
              ) : null}

              {!isRegistrationMode ? (
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
              ) : null}

              {!isRegistrationMode && isBlocked ? (
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
