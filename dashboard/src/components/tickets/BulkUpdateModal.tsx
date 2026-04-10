"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Layers, Sparkles, UserCog, X } from "lucide-react";
import type { Option } from "./InlineSearchableSelect";

const FALLBACK_STATUS_OPTIONS: Option[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting_for_user", label: "Waiting for user" },
  { value: "waiting_for_merchant", label: "Waiting for merchant" },
  { value: "waiting_for_rider", label: "Waiting for rider" },
  { value: "reopened", label: "Reopened" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "snoozed", label: "Snoozed" },
];

const FALLBACK_PRIORITY_OPTIONS: Option[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
  { value: "critical", label: "Critical" },
];

interface BulkUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  count: number;
  onApply: (updates: { priority?: string; status?: string; groupId?: number | null; assigneeId?: number | null }) => void;
  priorityOptions: Option[];
  statusOptions: Option[];
  groupOptions: Option[];
  agentOptions: Array<{ value: string; label: string }>;
  currentUserId?: number;
}

export function BulkUpdateModal({
  isOpen,
  onClose,
  count,
  onApply,
  priorityOptions,
  statusOptions,
  groupOptions,
  agentOptions,
  currentUserId,
}: BulkUpdateModalProps) {
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [groupId, setGroupId] = useState("");
  const [assigneeId, setAssigneeId] = useState("no-change");
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) setConfirmOpen(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApply = () => {
    if (!confirmOpen) {
      setConfirmOpen(true);
      return;
    }
    const updates: { priority?: string; status?: string; groupId?: number | null; assigneeId?: number | null } = {};
    if (priority) updates.priority = priority;
    if (status) updates.status = status;
    if (groupId) {
      const g = parseInt(groupId, 10);
      updates.groupId = Number.isNaN(g) ? null : g;
    } else {
      updates.groupId = undefined;
    }
    if (assigneeId && assigneeId !== "no-change") {
      if (assigneeId === "me" && currentUserId != null) {
        updates.assigneeId = currentUserId;
      } else if (assigneeId === "unassigned") {
        updates.assigneeId = null;
      } else {
        const a = parseInt(assigneeId, 10);
        updates.assigneeId = Number.isNaN(a) ? null : a;
      }
    }
    onApply(updates);
    setPriority("");
    setStatus("");
    setGroupId("");
    setAssigneeId("no-change");
    setConfirmOpen(false);
    onClose();
  };

  const normalizedStatusOptions = (statusOptions ?? []).filter((o) => o?.value && o?.label);
  const normalizedPriorityOptions = (priorityOptions ?? []).filter((o) => o?.value && o?.label);
  const normalizedGroupOptions = (groupOptions ?? []).filter((o) => o?.value && o?.label);
  const normalizedAgentOptions = (agentOptions ?? []).filter((o) => o?.value && o?.label);

  const finalStatusOptions =
    normalizedStatusOptions.length > 0 ? normalizedStatusOptions : FALLBACK_STATUS_OPTIONS;
  const finalPriorityOptions =
    normalizedPriorityOptions.length > 0 ? normalizedPriorityOptions : FALLBACK_PRIORITY_OPTIONS;

  const hasChange = priority || status || groupId || (assigneeId && assigneeId !== "no-change");
  const selectedStatusLabel = finalStatusOptions.find((o) => o.value === status)?.label ?? null;

  const compactFieldClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-blue-50 to-violet-50 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                <Sparkles className="h-3 w-3" />
                Smart bulk actions
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">Bulk status update</h3>
              <p className="mt-0.5 text-xs text-slate-600">
              {count} selected ticket{count !== 1 ? "s" : ""} will be updated together.
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/70" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="space-y-4 px-5 py-4">
          {confirmOpen ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              This action will update <strong>{count}</strong> selected ticket{count !== 1 ? "s" : ""}. Please confirm to continue.
            </div>
          ) : null}
          <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <label className="inline-flex items-center gap-1 text-xs font-semibold text-blue-800 uppercase tracking-wide">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Status (Primary)
              </label>
              {selectedStatusLabel ? (
                <span className="inline-flex rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white">
                  {selectedStatusLabel}
                </span>
              ) : null}
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={`${compactFieldClass} mt-2`}
            >
              <option value="">— No change —</option>
              {finalStatusOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {finalStatusOptions.slice(0, 6).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStatus(o.value)}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    status === o.value
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <label className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 uppercase tracking-wide">
                <Layers className="h-3.5 w-3.5" />
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={compactFieldClass}
              >
                <option value="">— No change —</option>
                {finalPriorityOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <label className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 uppercase tracking-wide">
                <Layers className="h-3.5 w-3.5" />
                Group
              </label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className={compactFieldClass}
              >
                <option value="">— No change —</option>
                {normalizedGroupOptions.length === 0 ? (
                  <option value="" disabled>
                    No groups available
                  </option>
                ) : normalizedGroupOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <label className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 uppercase tracking-wide">
                <UserCog className="h-3.5 w-3.5" />
                Assign to
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className={compactFieldClass}
              >
                <option value="no-change">— No change —</option>
                <option value="unassigned">Unassigned</option>
                {normalizedAgentOptions.filter((o) => o.value !== "").length === 0 ? (
                  <option value="" disabled>
                    No agents available
                  </option>
                ) : normalizedAgentOptions.filter((o) => o.value !== "").map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-xs text-slate-600">
            {hasChange ? "Ready to apply selected changes." : "Select at least one field to update."}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Cancel
            </button>
            {confirmOpen ? (
              <button
                type="button"
                onClick={handleApply}
                disabled={!hasChange}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirm update
              </button>
            ) : (
              <button
                type="button"
                onClick={handleApply}
                disabled={!hasChange}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply to {count} ticket{count !== 1 ? "s" : ""}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
