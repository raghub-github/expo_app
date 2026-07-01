"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { MerchantCompensationPolicyDisplay } from "@/lib/merchantCancellationCompensation";
import { buildCompensationPolicySections } from "@/lib/merchantCancellationCompensation";
import {
  fetchCompensationPolicy,
  getCachedCompensationPolicy,
} from "@/lib/compensationPolicyCache";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
};

export function CompensationPolicyModal({
  open,
  onClose,
  title = "Compensation Policy",
}: Props) {
  const cached = getCachedCompensationPolicy();
  const [loading, setLoading] = useState(cached === undefined);
  const [policy, setPolicy] = useState<MerchantCompensationPolicyDisplay | null>(
    cached === undefined ? null : cached,
  );

  const load = useCallback(async () => {
    const hasCache = getCachedCompensationPolicy() !== undefined;
    if (!hasCache) setLoading(true);
    const next = await fetchCompensationPolicy({ force: hasCache });
    setPolicy(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const modalTitle = policy?.policy_modal_title || title;
  const sections = useMemo(
    () => (policy ? buildCompensationPolicySections(policy) : []),
    [policy],
  );

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[1px]"
        aria-label="Close compensation policy"
        onClick={onClose}
      />

      <aside
        className="relative flex h-dvh w-full max-w-[min(100vw,420px)] flex-col border-l border-gray-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compensation-policy-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2
            id="compensation-policy-title"
            className="text-lg font-bold text-[#1E3A5F]"
          >
            {modalTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close compensation policy"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto hide-scrollbar px-5 py-4">
          {loading && !policy ? (
            <p className="py-12 text-center text-sm text-slate-500">Loading policy…</p>
          ) : !policy || sections.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">
              Compensation policy is not available right now.
            </p>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5">
              {sections.map((section, sectionIdx) => (
                <div key={`${section.heading}-${sectionIdx}`} className={sectionIdx > 0 ? "mt-4" : ""}>
                  <p
                    className={`mb-2 text-sm font-bold leading-snug ${
                      section.variant === "exclusion" ? "text-amber-700" : "text-[#1E3A5F]"
                    }`}
                  >
                    {section.heading}
                  </p>
                  <ul className="space-y-2">
                    {section.bullets.map((bullet, bulletIdx) => (
                      <li key={`${sectionIdx}-${bulletIdx}`} className="flex gap-2.5 pl-0.5">
                        <span
                          className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                            section.variant === "exclusion" ? "bg-amber-500" : "bg-emerald-500"
                          }`}
                        />
                        <span className="text-[13px] leading-5 text-slate-600">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-[#1E3A5F] py-3 text-base font-bold text-white hover:bg-[#2D4A6F]"
          >
            Okay
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
