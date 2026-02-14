"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Option } from "./InlineSearchableSelect";

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

  if (!isOpen) return null;

  const handleApply = () => {
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
    onClose();
  };

  const hasChange = priority || status || groupId || (assigneeId && assigneeId !== "no-change");

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Bulk update</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-600">Apply the following changes to <strong>{count}</strong> selected ticket{count !== 1 ? "s" : ""}.</p>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">— No change —</option>
              {priorityOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">— No change —</option>
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Group</label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">— No change —</option>
              {groupOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Assign to</label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="no-change">— No change —</option>
              <option value="unassigned">Unassigned</option>
              {agentOptions.filter((o) => o.value && o.value !== "").map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!hasChange}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply to {count} ticket{count !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
