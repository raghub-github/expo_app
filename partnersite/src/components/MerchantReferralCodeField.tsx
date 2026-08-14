"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  clearPendingMerchantReferral,
  normalizeMerchantReferralCode,
} from "@/lib/pendingMerchantReferral";

export const REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE =
  "This referral code is no longer available.";

const CONFIG_POLL_MS = 8_000;

export type MerchantReferralPreview = {
  ok: boolean;
  valid?: boolean;
  code?: string;
  referrerDisplayName?: string | null;
  inviteeRewardLine?: string | null;
  error?: string;
  codeName?: string;
  message?: string;
  userMessage?: string;
};

export type MerchantReferralCodeFieldHandle = {
  /** Empty is OK (optional). Typed codes must preview as valid. */
  verify: () => Promise<{ ok: true; code: string | null } | { ok: false }>;
};

function isServiceDisabled(data: MerchantReferralPreview, status?: number): boolean {
  const err = String(data.error ?? data.codeName ?? "");
  return (
    err === "REFERRAL_SERVICE_DISABLED" ||
    err === "referral_disabled" ||
    status === 409
  );
}

type Props = {
  value: string;
  onChange: (code: string) => void;
  applied: boolean;
  appliedFromName?: string | null;
  inviteeRewardLine?: string | null;
  error?: string | null;
  locked?: boolean;
  onApplied: (preview: MerchantReferralPreview) => void;
  onCleared?: () => void;
  onServiceAvailableChange?: (available: boolean) => void;
  inputClassName?: string;
};

export const MerchantReferralCodeField = forwardRef<MerchantReferralCodeFieldHandle, Props>(
  function MerchantReferralCodeField(
    {
      value,
      onChange,
      applied,
      appliedFromName,
      error,
      locked,
      onApplied,
      onCleared,
      onServiceAvailableChange,
      inputClassName,
    },
    ref,
  ) {
    const [applying, setApplying] = useState(false);
    const [serviceOff, setServiceOff] = useState(false);
    const onAvailRef = useRef(onServiceAvailableChange);
    onAvailRef.current = onServiceAvailableChange;
    const onAppliedRef = useRef(onApplied);
    onAppliedRef.current = onApplied;
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onClearedRef = useRef(onCleared);
    onClearedRef.current = onCleared;
    const valueRef = useRef(value);
    valueRef.current = value;
    const appliedRef = useRef(applied);
    appliedRef.current = applied;
    const serviceOffRef = useRef(serviceOff);
    serviceOffRef.current = serviceOff;
    const lockedRef = useRef(locked);
    lockedRef.current = locked;

    const blankForDisabledService = useCallback(() => {
      clearPendingMerchantReferral();
      if (valueRef.current) onChangeRef.current("");
      onClearedRef.current?.();
    }, []);

    const applyAvailability = useCallback(
      (available: boolean) => {
        if (!available) {
          const alreadyOff = serviceOffRef.current;
          setServiceOff(true);
          serviceOffRef.current = true;
          onAvailRef.current?.(false);
          if (!alreadyOff || valueRef.current) blankForDisabledService();
          return;
        }
        const wasOff = serviceOffRef.current;
        setServiceOff(false);
        serviceOffRef.current = false;
        onAvailRef.current?.(true);
        if (wasOff) onClearedRef.current?.();
      },
      [blankForDisabledService],
    );

    const configVersionRef = useRef<number | null>(null);

    useEffect(() => {
      let cancelled = false;
      const sync = async () => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        try {
          const known = configVersionRef.current;
          const qs =
            known == null
              ? "userType=merchant&fresh=1"
              : `userType=merchant&sinceVersion=${known}`;
          const res = await fetch(`/api/referral/config?${qs}`, { cache: "no-store" });
          if (res.status === 304 || cancelled) return;
          if (!res.ok) return;
          const data = (await res.json().catch(() => ({}))) as {
            referralEnabled?: boolean;
            configVersion?: number;
          };
          if (typeof data.configVersion === "number") configVersionRef.current = data.configVersion;
          if (typeof data.referralEnabled !== "boolean") return;
          if (cancelled) return;
          applyAvailability(data.referralEnabled === true);
        } catch {
          /* keep previous; backend apply is still authoritative */
        }
      };
      void sync();
      const id = window.setInterval(() => void sync(), CONFIG_POLL_MS);
      const onFocus = () => void sync();
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onFocus);
      return () => {
        cancelled = true;
        window.clearInterval(id);
        window.removeEventListener("focus", onFocus);
        document.removeEventListener("visibilitychange", onFocus);
      };
    }, [applyAvailability]);

    const apply = useCallback(async (): Promise<boolean> => {
      if (serviceOffRef.current || lockedRef.current) return false;
      const code = normalizeMerchantReferralCode(valueRef.current);
      if (code.length < 3) {
        onAppliedRef.current({
          ok: false,
          valid: false,
          error: "invalid_code",
          message: "Invalid referral code. Please check the code and try again.",
        });
        return false;
      }
      setApplying(true);
      try {
        const res = await fetch(
          `/api/referral/preview?referralCode=${encodeURIComponent(code)}&userType=merchant`,
          { cache: "no-store" },
        );
        const data = (await res.json().catch(() => ({}))) as MerchantReferralPreview;
        if (isServiceDisabled(data, res.status)) {
          applyAvailability(false);
          return false;
        }
        if (res.status >= 500) {
          return false;
        }
        if (!res.ok || !data.ok || data.valid === false) {
          onAppliedRef.current({
            ok: false,
            valid: false,
            error: data.error,
            message:
              typeof data.userMessage === "string" && data.userMessage.trim()
                ? data.userMessage
                : typeof data.message === "string" && data.message.trim()
                  ? data.message
                  : "Invalid referral code. Please check the code and try again.",
          });
          return false;
        }
        onAppliedRef.current({
          ok: true,
          valid: true,
          code: data.code || code,
          referrerDisplayName: data.referrerDisplayName ?? null,
          inviteeRewardLine: data.inviteeRewardLine ?? null,
        });
        return true;
      } catch {
        return false;
      } finally {
        setApplying(false);
      }
    }, [applyAvailability]);

    useImperativeHandle(ref, () => ({
      verify: async () => {
        if (lockedRef.current || serviceOffRef.current) {
          return { ok: true, code: null };
        }
        const code = normalizeMerchantReferralCode(valueRef.current);
        if (!code) return { ok: true, code: null };
        if (appliedRef.current) return { ok: true, code };
        const ok = await apply();
        if (!ok) return { ok: false };
        return { ok: true, code: normalizeMerchantReferralCode(valueRef.current) };
      },
    }));

    const disabled = locked || serviceOff;

    return (
      <div className="space-y-1.5">
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
          Referral Code <span className="normal-case tracking-normal text-slate-400">(Optional)</span>
        </label>
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(e) => {
              onChange(normalizeMerchantReferralCode(e.target.value));
              if (applied) onCleared?.();
            }}
            onBlur={() => {
              const code = normalizeMerchantReferralCode(value);
              if (!disabled && !applied && code.length >= 3) void apply();
            }}
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={32}
            readOnly={disabled}
            disabled={disabled}
            placeholder="Enter referral code"
            className={
              inputClassName ||
              `w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-[15px] text-slate-800 placeholder:text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-400 ${
                disabled ? "cursor-not-allowed bg-slate-50 text-slate-400" : ""
              } ${error && !serviceOff ? "border-red-300" : ""}`
            }
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => void apply()}
              disabled={applying || applied || normalizeMerchantReferralCode(value).length < 3}
              className={
                applied
                  ? "shrink-0 min-w-[5.75rem] rounded-xl border border-emerald-600 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"
                  : "shrink-0 min-w-[5.75rem] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              }
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : applied ? "Applied" : "Apply"}
            </button>
          )}
        </div>
        {serviceOff ? (
          <p className="text-xs text-slate-500">{REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE}</p>
        ) : null}
        {applied && !serviceOff && (
          <p className="text-sm font-medium text-emerald-700">
            ✓ Valid referral
            {appliedFromName ? ` from ${appliedFromName}` : ""}
          </p>
        )}
        {error && !serviceOff ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    );
  },
);
