"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export const REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE =
  "This referral code is no longer available.";
const AM_SERVICE_OFF_HELPER = "Merchant referrals are currently unavailable.";
const CONFIG_POLL_MS = 8_000;

export type MerchantReferralPreview = {
  ok: boolean;
  valid?: boolean;
  code?: string;
  referrerDisplayName?: string | null;
  inviteeRewardLine?: string | null;
  error?: string;
  message?: string;
  userMessage?: string;
};

export type MerchantReferralCodeFieldHandle = {
  verify: () => Promise<{ ok: true; code: string | null } | { ok: false }>;
};

function normalizeCode(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toUpperCase();
}

function isServiceDisabled(data: MerchantReferralPreview, status?: number): boolean {
  const err = String(data.error ?? "");
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
              ? "userType=merchant"
              : `userType=merchant&sinceVersion=${known}`;
          const res = await fetch(`/api/referral/config?${qs}`, {
            cache: "no-store",
            credentials: "include",
          });
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
      const code = normalizeCode(valueRef.current);
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
          { cache: "no-store", credentials: "include" },
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
        const code = normalizeCode(valueRef.current);
        if (!code) return { ok: true, code: null };
        if (appliedRef.current) return { ok: true, code };
        const ok = await apply();
        if (!ok) return { ok: false };
        return { ok: true, code: normalizeCode(valueRef.current) };
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
              onChange(normalizeCode(e.target.value));
              if (applied) onCleared?.();
            }}
            onBlur={() => {
              const code = normalizeCode(value);
              if (!disabled && !applied && code.length >= 3) void apply();
            }}
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={32}
            readOnly={disabled}
            disabled={disabled}
            placeholder="Enter merchant referral code"
            className={`auth-field w-full rounded-xl border px-3.5 py-2.5 text-[15px] leading-snug text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.05)] placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 ${
              error && !serviceOff ? "border-red-300" : "border-slate-200"
            } ${disabled ? "cursor-not-allowed bg-slate-50 text-slate-400" : "bg-white"}`}
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => void apply()}
              disabled={applying || applied || normalizeCode(value).length < 3}
              className={
                applied
                  ? "inline-flex shrink-0 min-w-[5.75rem] items-center justify-center rounded-xl border border-[#00A88F] bg-[#00A88F] px-4 py-2.5 text-sm font-semibold text-white"
                  : "inline-flex shrink-0 min-w-[5.75rem] items-center justify-center rounded-xl border border-[#00A88F]/30 bg-[#00A88F]/10 px-4 py-2.5 text-sm font-medium text-[#00A88F] hover:bg-[#00A88F]/15 disabled:cursor-not-allowed disabled:opacity-50"
              }
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : applied ? "Applied" : "Apply"}
            </button>
          )}
        </div>
        {serviceOff ? (
          <p className="text-xs text-slate-500">{AM_SERVICE_OFF_HELPER}</p>
        ) : null}
        {applied && !serviceOff && (
          <p className="text-sm font-medium text-[#00A88F]">
            ✓ Valid referral
            {appliedFromName ? ` from ${appliedFromName}` : ""}
          </p>
        )}
        {error && !serviceOff ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    );
  },
);
