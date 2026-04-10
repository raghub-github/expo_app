"use client";

import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpCircle, Search } from "lucide-react";
import * as XLSX from "xlsx";
import type { WorkBook } from "xlsx";
import type { Ticket } from "@/hooks/tickets/useTickets";
import type { TicketFilterState } from "@/hooks/tickets/useTicketFilters";
import { fetchAllTicketsForExport, mergeExportScopedFilters } from "@/lib/tickets/fetch-tickets-export";
import { useToast } from "@/context/ToastContext";

type TicketFieldId =
  | "ticketId"
  | "status"
  | "source"
  | "agent"
  | "createdTime"
  | "closedTime"
  | "agentInteractions"
  | "tags"
  | "subject"
  | "priority"
  | "type"
  | "group"
  | "resolvedTime"
  | "lastUpdateTime"
  | "customerInteractions"
  | "associationType"
  | "description"
  | "internalNotes"
  | "resolutionNotes";

type ContactFieldId =
  | "fullName"
  | "email"
  | "workPhone"
  | "mobilePhone"
  | "facebookId"
  | "twitterId"
  | "contactId"
  | "timeZone"
  | "language"
  | "tags"
  | "title"
  | "uniqueExternalId"
  | "twitterVerified"
  | "twitterFollowerCount";

type CompanyFieldId = "companyName" | "companyDomains";

const TICKET_BASE_FIELDS: { id: TicketFieldId; label: string }[][] = [
  [
    { id: "ticketId", label: "Ticket ID" },
    { id: "status", label: "Status" },
    { id: "source", label: "Source" },
    { id: "agent", label: "Agent" },
    { id: "createdTime", label: "Created time" },
    { id: "closedTime", label: "Closed time" },
    { id: "agentInteractions", label: "Agent interactions" },
    { id: "tags", label: "Tags" },
  ],
  [
    { id: "subject", label: "Subject" },
    { id: "priority", label: "Priority" },
    { id: "type", label: "Type" },
    { id: "group", label: "Group" },
    { id: "resolvedTime", label: "Resolved time" },
    { id: "lastUpdateTime", label: "Last update time" },
    { id: "customerInteractions", label: "Customer interactions" },
    { id: "associationType", label: "Association type" },
  ],
];

const TICKET_MULTILINE_FIELDS: { id: TicketFieldId; label: string }[][] = [
  [
    { id: "description", label: "Description" },
    { id: "resolutionNotes", label: "Resolution notes" },
  ],
  [{ id: "internalNotes", label: "Internal notes" }],
];

const CONTACT_FIELDS: { id: ContactFieldId; label: string }[][] = [
  [
    { id: "fullName", label: "Full name" },
    { id: "workPhone", label: "Work phone" },
    { id: "facebookId", label: "Facebook ID" },
    { id: "contactId", label: "Contact ID" },
    { id: "language", label: "Language" },
    { id: "title", label: "Title" },
    { id: "twitterVerified", label: "Twitter verified profile" },
  ],
  [
    { id: "email", label: "Email" },
    { id: "mobilePhone", label: "Mobile phone" },
    { id: "twitterId", label: "Twitter ID" },
    { id: "timeZone", label: "Time zone" },
    { id: "tags", label: "Tags" },
    { id: "uniqueExternalId", label: "Unique External ID" },
    { id: "twitterFollowerCount", label: "Twitter follower count" },
  ],
];

const COMPANY_FIELDS: { id: CompanyFieldId; label: string }[][] = [
  [{ id: "companyName", label: "Company Name" }],
  [{ id: "companyDomains", label: "Company Domains" }],
];

const ticketSelectableIds: TicketFieldId[] = [
  ...TICKET_BASE_FIELDS.flat().map((f) => f.id),
  ...TICKET_MULTILINE_FIELDS.flat().map((f) => f.id),
];
const contactAllIds = CONTACT_FIELDS.flat().map((f) => f.id);
const companyAllIds = COMPANY_FIELDS.flat().map((f) => f.id);

/** Windows-safe unique name: date + time + ms (avoids same-day overwrites). */
function uniqueTicketsExportFileName(): string {
  const iso = new Date().toISOString();
  const safe = iso.replace(/[:.]/g, "-");
  return `tickets-export-${safe}.xlsx`;
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Normal browser download (Blob URL + anchor download). Shows in the downloads bar and recent history.
 * File System Access API (showSaveFilePicker) does not, so we avoid it here.
 */
function saveExportWorkbook(wb: WorkBook): void {
  const fileName = uniqueTicketsExportFileName();
  const raw = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBufferLike);
  const blob = new Blob([u8 as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerBlobDownload(blob, fileName);
}

/**
 * Runs after the download UI is likely finished. If the browser opens a "Save as" dialog, the window
 * blurs; we wait until focus returns before calling `cb` so success UI does not appear on top of the dialog.
 * If the file saves immediately (no dialog), `cb` runs after a short delay.
 */
function runAfterDownloadUiProbablyDone(triggerDownload: () => void, cb: () => void): void {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.clearTimeout(fallbackTimer);
    window.clearTimeout(maxTimer);
    window.removeEventListener("blur", onBlur, true);
    window.removeEventListener("focus", onFocus, true);
    cb();
  };

  let sawBlur = false;
  const onBlur = () => {
    sawBlur = true;
  };
  const onFocus = () => {
    if (sawBlur) finish();
  };

  const fallbackTimer = window.setTimeout(() => {
    if (!sawBlur) finish();
  }, 280);

  const maxTimer = window.setTimeout(finish, 20_000);

  window.addEventListener("blur", onBlur, true);
  window.addEventListener("focus", onFocus, true);

  triggerDownload();
}

function exportedTicketsToastMessage(count: number): string {
  return count === 1 ? `Exported ${count} Ticket` : `Exported ${count} Tickets`;
}

function ticketCell(t: Ticket, id: TicketFieldId): string {
  const m = t.exportMeta;
  switch (id) {
    case "ticketId":
      return t.ticketNumber;
    case "status":
      return t.status;
    case "source":
      return t.sourceRole ?? "";
    case "agent":
      // Agent column: assignee display name only (never ticket subject/title); API fills name from system_users on export.
      return (t.assignee?.name || t.assignee?.email || "").trim();
    case "createdTime":
      return t.createdAt ? new Date(t.createdAt).toISOString() : "";
    case "closedTime":
      return t.closedAt ? new Date(t.closedAt).toISOString() : "";
    case "agentInteractions":
      return m?.agentInteractionCount ?? "";
    case "tags":
      return m?.tags ?? "";
    case "subject":
      return t.subject ?? "";
    case "priority":
      return t.priority ?? "";
    case "type":
      return t.ticketType ?? "";
    case "group":
      return t.group?.name ?? "";
    case "resolvedTime":
      return t.resolvedAt ? new Date(t.resolvedAt).toISOString() : "";
    case "lastUpdateTime":
      return t.updatedAt ? new Date(t.updatedAt).toISOString() : "";
    case "customerInteractions":
      return m?.customerInteractionCount ?? "";
    case "associationType": {
      const explicit = m?.associationType?.trim();
      if (explicit) return explicit;
      return [t.ticketType, t.sourceRole].filter(Boolean).join(" · ");
    }
    case "description":
      return t.description ?? "";
    case "internalNotes":
      return m?.internalNotes ?? "";
    case "resolutionNotes":
      return m?.resolutionText ?? "";
    default:
      return "";
  }
}

function contactCell(t: Ticket, id: ContactFieldId): string {
  const m = t.exportMeta;
  /** Contact block: Full name / Email / Work & Mobile phone come from assigned agent (system_users), not ticket_title. */
  if (!m) {
    switch (id) {
      case "fullName":
        return (t.assignee?.name || "").trim();
      case "email":
        return t.assignee?.email || "";
      case "workPhone":
      case "mobilePhone":
        return "";
      default:
        return "";
    }
  }
  switch (id) {
    case "fullName":
      return (m.agentExportFullName || m.contactFullName).trim();
    case "email":
      return m.agentExportEmail || m.contactEmail;
    case "workPhone":
      return m.agentExportMobile || m.contactWorkPhone || m.contactAlternateMobile || "";
    case "mobilePhone":
      return (m.agentExportAlternateMobile || m.agentExportMobile || m.contactMobile || "").trim();
    case "facebookId":
      return m.contactFacebookId;
    case "twitterId":
      return m.contactTwitterId;
    case "timeZone":
      return m.contactTimeZone;
    case "tags":
      return m.contactTags;
    case "title":
      return m.contactJobTitle;
    case "uniqueExternalId":
      return m.contactUniqueExternalId;
    case "twitterVerified":
      return m.contactTwitterVerified;
    case "twitterFollowerCount":
      return m.contactTwitterFollowerCount;
    case "contactId":
      return m.contactExternalId;
    case "language":
      return m.contactLanguage;
    default:
      return "";
  }
}

function companyCell(t: Ticket, id: CompanyFieldId): string {
  const m = t.exportMeta;
  if (!m) return "";
  if (id === "companyName") return m.companyName || m.companyDisplayName || "";
  if (id === "companyDomains") return m.companyDomains || "";
  return "";
}

export interface ExportTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appliedFilters: TicketFilterState;
  exportAgentOptions: Array<{ value: string; label: string }>;
  groupOptions: Array<{ value: string; label: string }>;
}

export function ExportTicketsModal({
  isOpen,
  onClose,
  appliedFilters,
  exportAgentOptions,
  groupOptions,
}: ExportTicketsModalProps) {
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);

  const [step, setStep] = useState<1 | 2>(1);
  const [ticketSelected, setTicketSelected] = useState<Set<TicketFieldId>>(() => new Set());
  const [contactSelected, setContactSelected] = useState<Set<ContactFieldId>>(() => new Set());
  const [companySelected, setCompanySelected] = useState<Set<CompanyFieldId>>(new Set());

  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [agentMode, setAgentMode] = useState<"all" | "specific">("all");
  const [exportAgentIds, setExportAgentIds] = useState<string[]>([]);
  const [groupMode, setGroupMode] = useState<"all" | "specific">("all");
  const [exportGroupIds, setExportGroupIds] = useState<string[]>([]);
  const [exportAgentSearch, setExportAgentSearch] = useState("");
  const [exportGroupSearch, setExportGroupSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  useLayoutEffect(() => {
    if (isOpen) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
    const t = window.setTimeout(() => setMounted(false), 320);
    return () => clearTimeout(t);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setTicketSelected(new Set());
    setContactSelected(new Set());
    setCompanySelected(new Set());
    setExportDateFrom(appliedFilters.dateFrom || "");
    setExportDateTo(appliedFilters.dateTo || "");
    setAgentMode("all");
    setExportAgentIds([]);
    setGroupMode("all");
    setExportGroupIds([]);
    setExportAgentSearch("");
    setExportGroupSearch("");
    setExporting(false);
  }, [isOpen, appliedFilters.dateFrom, appliedFilters.dateTo]);

  const filteredExportAgentOptions = useMemo(() => {
    const q = exportAgentSearch.trim().toLowerCase();
    if (!q) return exportAgentOptions;
    return exportAgentOptions.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [exportAgentOptions, exportAgentSearch]);

  const filteredGroupOptions = useMemo(() => {
    const q = exportGroupSearch.trim().toLowerCase();
    if (!q) return groupOptions;
    return groupOptions.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [groupOptions, exportGroupSearch]);

  const ticketSelectAllChecked =
    ticketSelectableIds.length > 0 && ticketSelectableIds.every((id) => ticketSelected.has(id));
  const ticketSelectAllIndeterminate = (() => {
    const n = ticketSelectableIds.filter((id) => ticketSelected.has(id)).length;
    return n > 0 && n < ticketSelectableIds.length;
  })();

  const setTicketSelectAll = (checked: boolean) => {
    setTicketSelected(checked ? new Set(ticketSelectableIds) : new Set());
  };

  const toggleTicketField = (id: TicketFieldId) => {
    setTicketSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const contactSelectAllChecked = contactAllIds.length > 0 && contactAllIds.every((id) => contactSelected.has(id));
  const contactSelectAllIndeterminate = (() => {
    const n = contactAllIds.filter((id) => contactSelected.has(id)).length;
    return n > 0 && n < contactAllIds.length;
  })();

  const setContactSelectAll = (checked: boolean) => {
    setContactSelected(checked ? new Set(contactAllIds) : new Set());
  };

  const toggleContactField = (id: ContactFieldId) => {
    setContactSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const companySelectAllChecked = companyAllIds.length > 0 && companyAllIds.every((id) => companySelected.has(id));
  const companySelectAllIndeterminate = (() => {
    const n = companyAllIds.filter((id) => companySelected.has(id)).length;
    return n > 0 && n < companyAllIds.length;
  })();

  const setCompanySelectAll = (checked: boolean) => {
    setCompanySelected(checked ? new Set(companyAllIds) : new Set());
  };

  const toggleCompanyField = (id: CompanyFieldId) => {
    setCompanySelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportColumns = useMemo(() => {
    const cols: {
      header: string;
      ticketField?: TicketFieldId;
      contactField?: ContactFieldId;
      companyField?: CompanyFieldId;
    }[] = [];
    const ticketOrder = [
      ...TICKET_BASE_FIELDS[0],
      ...TICKET_BASE_FIELDS[1],
      ...TICKET_MULTILINE_FIELDS[0],
      ...TICKET_MULTILINE_FIELDS[1],
    ];
    for (const f of ticketOrder) {
      if (ticketSelected.has(f.id)) cols.push({ header: f.label, ticketField: f.id });
    }
    for (const col of CONTACT_FIELDS[0]) {
      if (contactSelected.has(col.id)) cols.push({ header: `Contact: ${col.label}`, contactField: col.id });
    }
    for (const col of CONTACT_FIELDS[1]) {
      if (contactSelected.has(col.id)) cols.push({ header: `Contact: ${col.label}`, contactField: col.id });
    }
    for (const col of COMPANY_FIELDS[0]) {
      if (companySelected.has(col.id)) cols.push({ header: `Company: ${col.label}`, companyField: col.id });
    }
    for (const col of COMPANY_FIELDS[1]) {
      if (companySelected.has(col.id)) cols.push({ header: `Company: ${col.label}`, companyField: col.id });
    }
    return cols;
  }, [ticketSelected, contactSelected, companySelected]);

  const goNext = () => {
    if (exportColumns.length === 0) {
      toast("Select at least one field to export", "error");
      return;
    }
    setStep(2);
  };

  const runExport = useCallback(async () => {
    if (exportColumns.length === 0) {
      toast("Select at least one field to export", "error");
      return;
    }
    if (agentMode === "specific" && exportAgentIds.length === 0) {
      toast("Select at least one agent, or choose All agents", "error");
      return;
    }
    if (groupMode === "specific" && exportGroupIds.length === 0) {
      toast("Select at least one group, or choose All groups", "error");
      return;
    }

    const merged = mergeExportScopedFilters(appliedFilters, {
      dateFrom: exportDateFrom,
      dateTo: exportDateTo,
      agentMode,
      agentUserIds: exportAgentIds,
      groupMode,
      groupIdsSelected: exportGroupIds,
    });

    setExporting(true);
    let successDeferred = false;
    try {
      const tickets = await fetchAllTicketsForExport(merged);
      if (tickets.length === 0) {
        toast("No tickets match the selected filters", "error");
        return;
      }
      const headers = exportColumns.map((c) => c.header);
      const rows = tickets.map((t) =>
        exportColumns.map((c) => {
          if (c.ticketField) return ticketCell(t, c.ticketField);
          if (c.contactField) return contactCell(t, c.contactField);
          if (c.companyField) return companyCell(t, c.companyField);
          return "";
        })
      );
      const aoa = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Tickets");
      const n = tickets.length;
      successDeferred = true;
      runAfterDownloadUiProbablyDone(
        () => saveExportWorkbook(wb),
        () => {
          setExporting(false);
          toast(exportedTicketsToastMessage(n), "success");
          onClose();
        }
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Export failed", "error");
    } finally {
      if (!successDeferred) setExporting(false);
    }
  }, [
    exportColumns,
    agentMode,
    exportAgentIds,
    groupMode,
    exportGroupIds,
    exportDateFrom,
    exportDateTo,
    appliedFilters,
    toast,
    onClose,
  ]);

  if (!mounted) return null;

  const sectionShell = "rounded-lg border border-gray-200 bg-white overflow-hidden";
  const sectionTitleRow =
    "flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-4 py-2.5";
  const checkboxClass =
    "h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0";

  const radioClass = "h-4 w-4 shrink-0 cursor-pointer border-gray-300 text-blue-600 focus:ring-blue-500";

  return (
    <div className="fixed inset-0 z-[200] flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="Close export panel"
        className={`absolute inset-0 cursor-pointer border-0 bg-black/50 transition-opacity duration-300 ease-out ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`relative z-10 flex h-full w-full max-w-lg flex-col border-l border-gray-200 bg-white shadow-2xl transition-transform duration-300 ease-out ${
          entered ? "translate-x-0" : "translate-x-full"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-tickets-title"
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-gray-200 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-blue-600">
            <ArrowUpCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <h2 id="export-tickets-title" className="text-lg font-semibold text-blue-900">
            Export tickets
          </h2>
        </div>

        {step === 1 ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
              <div className="flex flex-col gap-3">
                <div className={sectionShell}>
                  <div className={sectionTitleRow}>
                    <span className="text-sm font-medium text-gray-900">Ticket fields</span>
                    <span className="text-sm tabular-nums text-gray-500">{ticketSelected.size} fields selected</span>
                  </div>
                  <div className="px-4 pb-4 pt-3">
                    <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={ticketSelectAllChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = ticketSelectAllIndeterminate;
                        }}
                        onChange={(e) => setTicketSelectAll(e.target.checked)}
                        className={checkboxClass}
                      />
                      Select all fields
                    </label>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      {TICKET_BASE_FIELDS.map((col, ci) => (
                        <div key={ci} className="flex flex-col gap-2">
                          {col.map((f) => (
                            <label
                              key={f.id}
                              className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                            >
                              <input
                                type="checkbox"
                                checked={ticketSelected.has(f.id)}
                                onChange={() => toggleTicketField(f.id)}
                                className={checkboxClass}
                              />
                              {f.label}
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-gray-100 pt-3">
                      {TICKET_MULTILINE_FIELDS.map((col, ci) => (
                        <div key={ci} className="flex flex-col gap-2">
                          {col.map((f) => (
                            <label
                              key={f.id}
                              className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                            >
                              <input
                                type="checkbox"
                                checked={ticketSelected.has(f.id)}
                                onChange={() => toggleTicketField(f.id)}
                                className={checkboxClass}
                              />
                              {f.label}
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={sectionShell}>
                  <div className={sectionTitleRow}>
                    <span className="text-sm font-medium text-gray-900">Contact fields</span>
                    <span className="text-sm tabular-nums text-gray-500">{contactSelected.size} fields selected</span>
                  </div>
                  <div className="px-4 pb-4 pt-3">
                    <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={contactSelectAllChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = contactSelectAllIndeterminate;
                        }}
                        onChange={(e) => setContactSelectAll(e.target.checked)}
                        className={checkboxClass}
                      />
                      Select all fields
                    </label>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      {CONTACT_FIELDS.map((col, ci) => (
                        <div key={ci} className="flex flex-col gap-2">
                          {col.map((f) => (
                            <label
                              key={f.id}
                              className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                            >
                              <input
                                type="checkbox"
                                checked={contactSelected.has(f.id)}
                                onChange={() => toggleContactField(f.id)}
                                className={checkboxClass}
                              />
                              {f.label}
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={sectionShell}>
                  <div className={sectionTitleRow}>
                    <span className="text-sm font-medium text-gray-900">Company fields</span>
                    <span className="text-sm tabular-nums text-gray-500">{companySelected.size} fields selected</span>
                  </div>
                  <div className="px-4 pb-4 pt-3">
                    <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={companySelectAllChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = companySelectAllIndeterminate;
                        }}
                        onChange={(e) => setCompanySelectAll(e.target.checked)}
                        className={checkboxClass}
                      />
                      Select all fields
                    </label>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      {COMPANY_FIELDS.map((col, ci) => (
                        <div key={ci} className="flex flex-col gap-2">
                          {col.map((f) => (
                            <label
                              key={f.id}
                              className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                            >
                              <input
                                type="checkbox"
                                checked={companySelected.has(f.id)}
                                onChange={() => toggleCompanyField(f.id)}
                                className={checkboxClass}
                              />
                              {f.label}
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-gray-200 px-5 py-4">
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-blue-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={exportColumns.length === 0}
                  className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-3 text-sm font-semibold text-gray-900">Created date range</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-xs font-medium text-gray-600">
                      From
                      <input
                        type="date"
                        value={exportDateFrom}
                        onChange={(e) => setExportDateFrom(e.target.value)}
                        className="mt-1.5 w-full cursor-pointer rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </label>
                    <label className="block text-xs font-medium text-gray-600">
                      To
                      <input
                        type="date"
                        value={exportDateTo}
                        onChange={(e) => setExportDateTo(e.target.value)}
                        className="mt-1.5 w-full cursor-pointer rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-3 text-sm font-semibold text-gray-900">Agents</h3>
                  <div className="flex flex-col gap-2.5">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="export-agent-scope"
                        checked={agentMode === "all"}
                        onChange={() => setAgentMode("all")}
                        className={radioClass}
                      />
                      All agents
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="export-agent-scope"
                        checked={agentMode === "specific"}
                        onChange={() => setAgentMode("specific")}
                        className={radioClass}
                      />
                      Select agents
                    </label>
                    {agentMode === "specific" && (
                      <div className="ml-6 space-y-2">
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => setExportAgentIds(filteredExportAgentOptions.map((o) => o.value))}
                            className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-800"
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            onClick={() => setExportAgentIds([])}
                            className="cursor-pointer text-xs font-medium text-gray-600 hover:text-gray-900"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="relative">
                          <Search
                            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                            aria-hidden
                          />
                          <input
                            type="search"
                            value={exportAgentSearch}
                            onChange={(e) => setExportAgentSearch(e.target.value)}
                            placeholder="Search agents…"
                            className="w-full cursor-text rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>
                        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/50 p-2">
                          {exportAgentOptions.length === 0 ? (
                            <p className="px-1 py-2 text-xs text-gray-500">No agents available.</p>
                          ) : filteredExportAgentOptions.length === 0 ? (
                            <p className="px-1 py-2 text-xs text-gray-500">No matching agents.</p>
                          ) : (
                            filteredExportAgentOptions.map((o) => (
                              <label
                                key={o.value}
                                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-800 hover:bg-white"
                              >
                                <input
                                  type="checkbox"
                                  checked={exportAgentIds.includes(o.value)}
                                  onChange={() => {
                                    setExportAgentIds((prev) =>
                                      prev.includes(o.value)
                                        ? prev.filter((id) => id !== o.value)
                                        : [...prev, o.value]
                                    );
                                  }}
                                  className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span>{o.label}</span>
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-3 text-sm font-semibold text-gray-900">Groups</h3>
                  <div className="flex flex-col gap-2.5">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="export-group-scope"
                        checked={groupMode === "all"}
                        onChange={() => setGroupMode("all")}
                        className={radioClass}
                      />
                      All groups
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="export-group-scope"
                        checked={groupMode === "specific"}
                        onChange={() => setGroupMode("specific")}
                        className={radioClass}
                      />
                      Select groups
                    </label>
                    {groupMode === "specific" && (
                      <div className="ml-6 space-y-2">
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => setExportGroupIds(filteredGroupOptions.map((o) => o.value))}
                            className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-800"
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            onClick={() => setExportGroupIds([])}
                            className="cursor-pointer text-xs font-medium text-gray-600 hover:text-gray-900"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="relative">
                          <Search
                            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                            aria-hidden
                          />
                          <input
                            type="search"
                            value={exportGroupSearch}
                            onChange={(e) => setExportGroupSearch(e.target.value)}
                            placeholder="Search groups…"
                            className="w-full cursor-text rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>
                        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/50 p-2">
                          {groupOptions.length === 0 ? (
                            <p className="px-1 py-2 text-xs text-gray-500">No groups available.</p>
                          ) : filteredGroupOptions.length === 0 ? (
                            <p className="px-1 py-2 text-xs text-gray-500">No matching groups.</p>
                          ) : (
                            filteredGroupOptions.map((o) => (
                              <label
                                key={o.value}
                                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-800 hover:bg-white"
                              >
                                <input
                                  type="checkbox"
                                  checked={exportGroupIds.includes(o.value)}
                                  onChange={() => {
                                    setExportGroupIds((prev) =>
                                      prev.includes(o.value)
                                        ? prev.filter((id) => id !== o.value)
                                        : [...prev, o.value]
                                    );
                                  }}
                                  className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span>{o.label}</span>
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-gray-200 bg-gray-50/50 px-5 py-4">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={exporting}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void runExport()}
                  disabled={exporting || exportColumns.length === 0}
                  className="min-w-[7rem] cursor-pointer rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exporting ? "Exporting…" : "Export"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
