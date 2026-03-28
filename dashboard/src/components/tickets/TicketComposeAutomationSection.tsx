"use client";

import { useState, useEffect } from "react";
import { Zap } from "lucide-react";
import {
  useTicketComposeAutomationQuery,
  useTicketComposeAutomationSave,
} from "@/hooks/tickets/useTicketComposeAutomationQuery";
import { TICKET_COMPOSE_SUPPORT_CC_FALLBACK } from "@/lib/tickets/ticket-compose-automation";
import { useToast } from "@/context/ToastContext";

export function TicketComposeAutomationSection({ variant = "page" }: { variant?: "page" | "sidebar" | "plain" }) {
  const { toast } = useToast();
  const { data, isLoading, isError, error } = useTicketComposeAutomationQuery();
  const saveMutation = useTicketComposeAutomationSave();

  const [draft, setDraft] = useState({ defaultTo: "", defaultCc: "", defaultBcc: "" });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!data) return;
    setDraft({
      defaultTo: data.defaultTo,
      defaultCc: data.defaultCc,
      defaultBcc: data.defaultBcc,
    });
  }, [data]);

  const save = () => {
    saveMutation.mutate(draft, {
      onSuccess: () => toast("Automation saved to your account"),
      onError: (e: Error) => toast(e.message || "Save failed", "error"),
    });
  };

  const reset = () => {
    const next = { defaultTo: "", defaultCc: "", defaultBcc: "" };
    setDraft(next);
    saveMutation.mutate(next, {
      onSuccess: () => toast("Automation reset (saved)"),
      onError: (e: Error) => toast(e.message || "Save failed", "error"),
    });
  };

  if (!mounted || isLoading) {
    return (
      <div
        className={
          variant === "plain"
            ? "py-2"
            : `rounded-xl border border-gray-200 bg-white shadow-sm ${variant === "sidebar" ? "p-3" : "p-5"}`
        }
      >
        <div className={`animate-pulse rounded-lg bg-gray-200/60 ${variant === "sidebar" ? "h-28" : variant === "plain" ? "h-32" : "h-40"}`} />
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className={
          variant === "plain"
            ? "rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900"
            : "rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        }
      >
        <p className="font-medium">Could not load compose automation</p>
        <p className="mt-1 text-xs opacity-90">{error instanceof Error ? error.message : "Run migration 0156_ticket_compose_automation.sql"}</p>
      </div>
    );
  }

  const isSidebar = variant === "sidebar";
  const isPlain = variant === "plain";

  return (
    <section
      className={
        isPlain
          ? "py-4"
          : `rounded-xl border border-gray-200 bg-white shadow-sm ${isSidebar ? "p-3" : "p-5"}`
      }
    >
      {!isSidebar && !isPlain && (
        <div className="mb-4 flex items-start gap-3 border-b border-gray-100 pb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Automation</h2>
            <p className="mt-0.5 text-sm text-gray-600">
              Default recipients when you open a ticket reply (saved for your account). Whatever you leave in To/Cc/Bcc is sent as-is;
              add <span className="font-medium">{TICKET_COMPOSE_SUPPORT_CC_FALLBACK}</span> under Cc if you want the desk copied.
            </p>
          </div>
        </div>
      )}

      {isPlain && (
        <div className="mb-4 flex items-start gap-2 border-b border-gray-200 pb-3">
          <Zap className="h-5 w-5 shrink-0 text-violet-600" />
          <div>
            <h2 className="text-base font-semibold text-gray-900">Automation</h2>
            <p className="mt-0.5 text-xs text-gray-600">
              Saved for your account. Cleared fields stay empty when sending — include {TICKET_COMPOSE_SUPPORT_CC_FALLBACK} in Cc if you
              want it.
            </p>
          </div>
        </div>
      )}

      {isSidebar && (
        <div className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
          <Zap className="h-4 w-4 shrink-0 text-violet-600" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">Automation</h3>
        </div>
      )}

      <div
        className={`${
          isSidebar
            ? "flex flex-wrap items-end gap-x-3 gap-y-3"
            : "grid grid-cols-1 gap-4 lg:grid-cols-3"
        }`}
      >
        <label
          className={`block space-y-1.5 ${isSidebar ? "min-w-0 flex-1 basis-[10rem]" : ""}`}
        >
          <span className="text-xs font-medium text-gray-700">Default To</span>
          <input
            type="text"
            value={draft.defaultTo}
            onChange={(e) => setDraft((d) => ({ ...d, defaultTo: e.target.value }))}
            placeholder="Optional — comma-separated emails"
            className={`w-full rounded-lg border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 ${isSidebar ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}
          />
          {!isSidebar && !isPlain && (
            <span className="text-[11px] text-gray-500">Prefills To when you open a reply. Leave empty to match “no default”.</span>
          )}
        </label>
        <label
          className={`block space-y-1.5 ${isSidebar ? "min-w-0 flex-1 basis-[10rem]" : ""}`}
        >
          <span className="text-xs font-medium text-gray-700">Default Cc</span>
          <input
            type="text"
            value={draft.defaultCc}
            onChange={(e) => setDraft((d) => ({ ...d, defaultCc: e.target.value }))}
            placeholder={`Optional — e.g. ${TICKET_COMPOSE_SUPPORT_CC_FALLBACK}`}
            className={`w-full rounded-lg border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 ${isSidebar ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}
          />
          {!isSidebar && !isPlain && (
            <span className="text-[11px] text-gray-500">Clear this field to open replies with no Cc prefilled.</span>
          )}
        </label>
        <label
          className={`block space-y-1.5 ${isSidebar ? "min-w-0 flex-1 basis-[10rem]" : ""}`}
        >
          <span className="text-xs font-medium text-gray-700">Default Bcc</span>
          <input
            type="text"
            value={draft.defaultBcc}
            onChange={(e) => setDraft((d) => ({ ...d, defaultBcc: e.target.value }))}
            placeholder="Optional — comma-separated"
            className={`w-full rounded-lg border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 ${isSidebar ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}
          />
          {!isSidebar && !isPlain && (
            <span className="text-[11px] text-gray-500">Hidden recipients; expands Bcc when non-empty.</span>
          )}
        </label>
      </div>

      {isSidebar && (
        <p className="mt-2 text-[10px] leading-snug text-gray-500">
          Saved for your account. Outbound mail uses only what you enter in the reply composer.
        </p>
      )}

      <div className={`flex flex-wrap items-center gap-2 ${isSidebar ? "mt-3" : isPlain ? "mt-4" : "mt-5"}`}>
        <button
          type="button"
          onClick={save}
          disabled={saveMutation.isPending}
          className={`cursor-pointer rounded-lg bg-violet-600 font-medium text-white hover:bg-violet-700 transition-colors disabled:opacity-60 ${isSidebar ? "min-w-0 flex-1 px-2 py-1.5 text-xs" : isPlain ? "px-3 py-2 text-xs sm:text-sm" : "px-4 py-2 text-sm"}`}
        >
          {saveMutation.isPending ? "Saving…" : "Save automation"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={saveMutation.isPending}
          className={`cursor-pointer rounded-lg border font-medium transition-colors disabled:opacity-60 ${
            isSidebar
              ? "min-w-0 flex-1 border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              : isPlain
                ? "border-gray-300 bg-transparent px-3 py-2 text-xs text-gray-800 hover:bg-gray-200/50 sm:text-sm"
                : "border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          }`}
        >
          Reset
        </button>
      </div>
    </section>
  );
}
