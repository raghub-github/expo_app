"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, FolderGit2, Search, X } from "lucide-react";
import { Ticket } from "@/hooks/tickets/useTickets";
import { InlineSearchableSelect, type Option } from "./InlineSearchableSelect";

const priorityDotColors: Record<string, string> = {
  low: "bg-gray-400",
  medium: "bg-blue-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
  critical: "bg-red-700",
};

export interface TicketCardActionControlsProps {
  ticket: Ticket;
  onUpdatePriority: (ticketId: number, priority: string) => void;
  onUpdateGroup: (ticketId: number, groupId: number | null, groupLabel?: string) => void;
  onUpdateAssignee: (ticketId: number, userId: number | null, assigneeLabel?: string) => void;
  onUpdateStatus: (ticketId: number, status: string) => void;
  priorityOptions: Option[];
  groupOptions: Option[];
  agentOptions: Array<{ value: string; label: string }>;
  statusOptions: Option[];
  currentUserId?: number;
  groupLabel: string;
  landedLabel: string | null;
  showLandedRow: boolean;
  agentLabel: string;
  hasAssignedGroup: boolean;
  snoozeCountdown?: { label: string; tone: "violet" | "amber" | "red" } | null;
}

export function TicketCardActionControls({
  ticket,
  onUpdatePriority,
  onUpdateGroup,
  onUpdateAssignee,
  onUpdateStatus,
  priorityOptions,
  groupOptions,
  agentOptions,
  statusOptions,
  currentUserId,
  groupLabel,
  landedLabel,
  showLandedRow,
  agentLabel,
  hasAssignedGroup,
  snoozeCountdown,
}: TicketCardActionControlsProps) {
  const [groupAgentOpen, setGroupAgentOpen] = useState(false);
  const [groupAgentTab, setGroupAgentTab] = useState<"group" | "agent">("group");
  const [searchGroup, setSearchGroup] = useState("");
  const [searchAgent, setSearchAgent] = useState("");
  const [groupAgentMenuPlacement, setGroupAgentMenuPlacement] = useState<{ top: number; left: number } | null>(null);
  const groupAgentRef = useRef<HTMLDivElement>(null);
  const groupAgentMenuPortalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setGroupAgentOpen(false);
    setGroupAgentTab("group");
    setSearchGroup("");
    setSearchAgent("");
    setGroupAgentMenuPlacement(null);
  }, [ticket.id]);

  useLayoutEffect(() => {
    if (!groupAgentOpen) {
      setGroupAgentMenuPlacement(null);
      return;
    }
    const panelWidth = 240;
    const updatePlacement = () => {
      const el = groupAgentRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      let left = r.left;
      if (left + panelWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - panelWidth - 8);
      }
      const panelMaxHeight = Math.min(420, window.innerHeight - 16);
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const spaceAbove = r.top - 8;
      const preferBelow = spaceBelow >= 180 || spaceBelow >= spaceAbove;
      let top: number;
      if (preferBelow) {
        top = r.bottom + 4;
        const maxBottom = window.innerHeight - 8;
        if (top + panelMaxHeight > maxBottom) {
          top = Math.max(8, maxBottom - panelMaxHeight);
        }
      } else {
        top = Math.max(8, r.top - panelMaxHeight - 4);
      }
      setGroupAgentMenuPlacement({ top, left });
    };
    updatePlacement();
    window.addEventListener("scroll", updatePlacement, true);
    window.addEventListener("resize", updatePlacement);
    return () => {
      window.removeEventListener("scroll", updatePlacement, true);
      window.removeEventListener("resize", updatePlacement);
    };
  }, [groupAgentOpen]);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (groupAgentRef.current?.contains(t) || groupAgentMenuPortalRef.current?.contains(t)) return;
      setGroupAgentOpen(false);
    };
    if (groupAgentOpen) document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [groupAgentOpen]);

  const filteredGroupOptions = searchGroup.trim()
    ? groupOptions.filter((o) => o.label.toLowerCase().includes(searchGroup.toLowerCase()))
    : groupOptions;
  const filteredAgentOptions = searchAgent.trim()
    ? agentOptions.filter((o) => o.label.toLowerCase().includes(searchAgent.toLowerCase()))
    : agentOptions;

  const onGroupAgentSegmentClick = (segment: "group" | "agent") => {
    if (!groupAgentOpen) {
      setGroupAgentTab(segment);
      setGroupAgentOpen(true);
      return;
    }
    if (groupAgentTab === segment) {
      setGroupAgentOpen(false);
      return;
    }
    setGroupAgentTab(segment);
  };

  const groupAgentMenuPanel =
    groupAgentOpen && groupAgentMenuPlacement != null && typeof document !== "undefined" ? (
      createPortal(
        <div
          ref={groupAgentMenuPortalRef}
          role="dialog"
          aria-label="Group and agent"
          className="fixed z-[200] flex w-60 max-h-[min(70vh,calc(100vh-16px))] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          style={{ top: groupAgentMenuPlacement.top, left: groupAgentMenuPlacement.left }}
        >
          <div className="flex shrink-0 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setGroupAgentTab("group")}
              className={`flex-1 cursor-pointer px-2.5 py-1.5 text-[11px] font-semibold ${
                groupAgentTab === "group"
                  ? "border-b-2 border-blue-600 bg-blue-50/50 text-blue-600"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              GROUP
            </button>
            <button
              type="button"
              onClick={() => setGroupAgentTab("agent")}
              className={`flex-1 cursor-pointer px-2.5 py-1.5 text-[11px] font-semibold ${
                groupAgentTab === "agent"
                  ? "border-b-2 border-blue-600 bg-blue-50/50 text-blue-600"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              AGENT
            </button>
          </div>
          {groupAgentTab === "group" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {hasAssignedGroup ? (
                <div className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px]">
                  <span className="truncate font-medium text-gray-800">{groupLabel}</span>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateGroup(ticket.id, null, "Unassigned");
                      setSearchGroup("");
                    }}
                    className="shrink-0 rounded p-0.5 text-red-600 hover:bg-red-100"
                    aria-label="Remove group"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <span className="inline-flex items-center rounded-md border border-dashed border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-500">
                  Unassigned
                </span>
              )}
              <p className="mt-1 text-[10px] text-gray-500">Change group</p>
              <div className="relative mt-1">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchGroup}
                  onChange={(e) => setSearchGroup(e.target.value)}
                  placeholder="Search groups..."
                  className="w-full rounded border border-gray-300 py-1 pl-6.5 pr-2 text-[11px] focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <ul className="mt-1 max-h-36 overflow-y-auto rounded border border-gray-200 bg-white">
                {filteredGroupOptions.map((opt) => (
                  <li key={opt.value}>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateGroup(ticket.id, parseInt(opt.value, 10), opt.label);
                        setGroupAgentOpen(false);
                      }}
                      className="w-full cursor-pointer px-2 py-1.5 text-left text-[12px] text-gray-900 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                    >
                      {opt.label}
                    </button>
                  </li>
                ))}
                {filteredGroupOptions.length === 0 && (
                  <li className="px-2 py-2 text-xs text-gray-500">No groups found</li>
                )}
              </ul>
            </div>
          )}
          {groupAgentTab === "agent" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              <div className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px]">
                <span className="truncate font-medium text-gray-800">{agentLabel}</span>
                {ticket.assignee && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateAssignee(ticket.id, null, "Unassigned");
                      setSearchAgent("");
                    }}
                    className="shrink-0 rounded p-0.5 text-red-600 hover:bg-red-100"
                    aria-label="Unassign"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-[10px] text-gray-500">Reassign</p>
              <div className="relative mt-1">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchAgent}
                  onChange={(e) => setSearchAgent(e.target.value)}
                  placeholder="Search agents..."
                  className="w-full rounded border border-gray-300 py-1 pl-6.5 pr-2 text-[11px] focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <ul className="mt-1 max-h-36 overflow-y-auto rounded border border-gray-200 bg-white">
                {filteredAgentOptions.map((opt) => (
                  <li key={opt.value}>
                    <button
                      type="button"
                      onClick={() => {
                        const id =
                          opt.value === "me" && currentUserId != null
                            ? currentUserId
                            : opt.value
                              ? parseInt(opt.value, 10)
                              : null;
                        onUpdateAssignee(
                          ticket.id,
                          id != null && !Number.isNaN(id) ? id : null,
                          opt.label,
                        );
                        setGroupAgentOpen(false);
                      }}
                      className="w-full cursor-pointer px-2 py-1.5 text-left text-[12px] text-gray-900 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                    >
                      {opt.label}
                    </button>
                  </li>
                ))}
                {filteredAgentOptions.length === 0 && (
                  <li className="px-2 py-2 text-xs text-gray-500">No agents found</li>
                )}
              </ul>
            </div>
          )}
        </div>,
        document.body,
      )
    ) : null;

  return (
    <>
      <div className="flex flex-col gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
        {snoozeCountdown ? (
          <div className="w-full text-right">
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                snoozeCountdown.tone === "red"
                  ? "bg-red-50 text-red-700"
                  : snoozeCountdown.tone === "amber"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-violet-50 text-violet-700"
              }`}
            >
              Resumes in <span className="tickets-num">{snoozeCountdown.label}</span>
            </span>
          </div>
        ) : null}
        <div className="flex w-full min-h-[22px] flex-row items-center gap-1">
          <div className="min-w-0 flex-1">
            <InlineSearchableSelect
              value={ticket.priority}
              options={priorityOptions}
              onChange={(v) => onUpdatePriority(ticket.id, v)}
              compact
              resetMenusWhenChanged={ticket.id}
              leadingIcon={
                <span
                  className={`block w-1.5 h-1.5 rounded-full shrink-0 ${priorityDotColors[ticket.priority] ?? "bg-gray-400"}`}
                  aria-hidden
                />
              }
            />
          </div>
          <div className="min-w-0 flex-1">
            <InlineSearchableSelect
              value={ticket.status}
              options={statusOptions}
              onChange={(v) => onUpdateStatus(ticket.id, v)}
              compact
              resetMenusWhenChanged={ticket.id}
              leadingIcon={
                <span
                  className={`block w-1.5 h-1.5 rounded-full shrink-0 ${
                    ticket.status === "open" || ticket.status === "reopened"
                      ? "bg-blue-500"
                      : ticket.status === "snoozed"
                        ? "bg-violet-500"
                        : ticket.status === "resolved" || ticket.status === "closed"
                          ? "bg-green-500"
                          : "bg-amber-500"
                  }`}
                  aria-hidden
                />
              }
            />
          </div>
        </div>
        <div
          className="relative w-full rounded-lg border border-gray-200 bg-gray-50/40 px-1.5 py-0.5 focus-within:ring-1 focus-within:ring-blue-500 focus-within:ring-offset-0"
          ref={groupAgentRef}
          aria-expanded={groupAgentOpen}
        >
          <div className="flex w-full items-center gap-1.5">
            <FolderGit2 className="h-3.5 w-3.5 text-gray-400 shrink-0" aria-hidden />
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex min-w-0 items-center gap-1 text-[11px] leading-snug">
                <button
                  type="button"
                  onClick={() => onGroupAgentSegmentClick("group")}
                  className="min-w-0 flex-1 truncate rounded px-0.5 py-0.5 text-left text-gray-800 hover:bg-white/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                >
                  {hasAssignedGroup ? (
                    <span className="font-medium text-gray-900">{groupLabel}</span>
                  ) : (
                    <>
                      <span className="font-medium text-gray-500">Queue:</span>{" "}
                      <span className="text-gray-600">{groupLabel}</span>
                    </>
                  )}
                </button>
                <span className="shrink-0 select-none text-gray-300" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => onGroupAgentSegmentClick("agent")}
                  className="min-w-0 flex-1 truncate rounded px-0.5 py-0.5 text-left hover:bg-white/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                >
                  <span className="font-medium text-gray-500">A:</span>{" "}
                  <span className="text-gray-800">{agentLabel}</span>
                </button>
              </div>
              {showLandedRow && landedLabel ? (
                <span className="truncate text-[10px] leading-snug text-gray-500">
                  <span className="font-medium text-gray-600">Landed:</span> {landedLabel}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setGroupAgentOpen((o) => !o)}
              className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-white hover:text-gray-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              aria-expanded={groupAgentOpen}
              aria-label="Toggle group and agent menu"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${groupAgentOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>
      </div>
      {groupAgentMenuPanel}
    </>
  );
}
