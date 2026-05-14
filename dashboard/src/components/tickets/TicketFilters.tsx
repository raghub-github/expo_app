"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Search, X, ChevronDown, Loader2 } from "lucide-react";
import { useTicketFilters } from "@/hooks/tickets/useTicketFilters";
import { useTicketsAgentsQuery } from "@/hooks/tickets/useTicketsAgentsQuery";
import { useTicketsReferenceDataQuery } from "@/hooks/tickets/useTicketsReferenceDataQuery";

const FILTER_ITEMS: Array<{ key: string; label: string }> = [
  { key: "agent", label: "Agents Include" },
  { key: "group", label: "Groups Include" },
  { key: "created", label: "Created" },
  { key: "closed", label: "Closed at" },
  { key: "resolved", label: "Resolved at" },
  { key: "due", label: "Due by" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "type", label: "Type" },
  { key: "source", label: "Source" },
  { key: "service", label: "Service" },
  { key: "skill", label: "Skill" },
  { key: "tags", label: "Tags" },
  { key: "companies", label: "Companies" },
  { key: "options", label: "High value / SLA" },
];

/** Pinned values first (in pin order), then rest A–Z by label. */
function sortMultiSelectPills<T extends { value: string; label: string }>(
  selected: T[],
  pinFirstValues: string[]
): T[] {
  if (pinFirstValues.length === 0) {
    return [...selected].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }
  const pinPos = new Map(pinFirstValues.map((v, i) => [v, i]));
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const o of selected) {
    if (pinPos.has(o.value)) pinned.push(o);
    else rest.push(o);
  }
  pinned.sort((a, b) => (pinPos.get(a.value) ?? 0) - (pinPos.get(b.value) ?? 0));
  rest.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return [...pinned, ...rest];
}

function orderSelectedValues(
  values: string[],
  options: Array<{ value: string; label: string }>,
  pinFirstValues: string[]
): string[] {
  // Preserve values that aren't in `options` yet — the options list may still
  // be loading (agents / groups async fetch) and silently dropping unknown
  // values would lose URL-derived filters between renders. Known values get
  // ordered; unknown values are appended at the end in their original order.
  const byValue = new Map(options.map((o) => [o.value, o]));
  const known: Array<{ value: string; label: string }> = [];
  const unknown: string[] = [];
  for (const v of values) {
    const hit = byValue.get(v);
    if (hit) known.push(hit);
    else unknown.push(v);
  }
  const orderedKnown = sortMultiSelectPills(known, pinFirstValues).map((o) => o.value);
  return [...orderedKnown, ...unknown];
}

type TicketFiltersProps = {
  variant?: "sidebar" | "drawer";
  onClose?: () => void;
  dark?: boolean;
};

export function TicketFilters({ variant = "sidebar", onClose, dark = false }: TicketFiltersProps) {
  const searchParams = useSearchParams();
  const [applyBusy, setApplyBusy] = useState(false);
  const {
    filters,
    updateFilter,
    applyFilters,
    clearFilters,
    activeFilterCount,
    appliedTicketFilterCount,
    updateStatuses,
    updateServiceTypes,
    updatePriorities,
    updateSourceRoles,
    updateAssignedToIds,
    updateGroupIds,
  } = useTicketFilters();
  const [filterOptionsSearch, setFilterOptionsSearch] = useState("");
  const [filterSearchExpanded, setFilterSearchExpanded] = useState(false);
  const isDrawer = variant === "drawer";

  const { data: agentsData } = useTicketsAgentsQuery();
  const { data: referenceDataRaw } = useTicketsReferenceDataQuery();

  const agents = agentsData?.agents ?? [];
  const currentUserName = agentsData?.currentUser?.name ?? "Me";
  const referenceData = referenceDataRaw
    ? {
        groups: referenceDataRaw.groups,
        statuses: referenceDataRaw.statuses,
        services: referenceDataRaw.services,
        priorities: referenceDataRaw.priorities,
        sources: referenceDataRaw.sources,
      }
    : {
        groups: [] as Array<{ id: number; groupCode: string; groupName: string }>,
        statuses: [] as Array<{ value: string; label: string }>,
        services: [] as Array<{ value: string; label: string }>,
        priorities: [] as Array<{ value: string; label: string }>,
        sources: [] as Array<{ value: string; label: string }>,
      };

  const visibleLabels = useMemo(() => {
    const q = filterOptionsSearch.trim().toLowerCase();
    if (!q) return new Set(FILTER_ITEMS.map((f) => f.label));
    return new Set(
      FILTER_ITEMS.filter((f) => f.label.toLowerCase().includes(q)).map((f) => f.label)
    );
  }, [filterOptionsSearch]);

  const normalizedStatusOptions = useMemo(() => {
    const raw = referenceData?.statuses || [];
    return raw
      .filter((s) => s.value !== "assigned")
      .map((s) =>
        s.value === "open_frt"
          ? { ...s, label: "Open FRT" }
          : s.label?.toLowerCase() === "mark frt"
            ? { ...s, label: "Open FRT" }
            : s
      );
  }, [referenceData?.statuses]);

  const isVisible = (label: string) => visibleLabels.has(label);

  const searchKey = searchParams.toString();
  useEffect(() => {
    setApplyBusy(false);
  }, [searchKey]);

  const handleApplyFilters = useCallback(() => {
    setApplyBusy(true);
    applyFilters();
    window.setTimeout(() => setApplyBusy(false), 1500);
  }, [applyFilters]);

  /** Reference-style fields: flat white, thin neutral border, muted placeholder, no heavy shadow */
  const inputBase = dark
    ? "w-full rounded border border-gray-600 bg-gray-700 text-gray-100 shadow-none placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500/40"
    : "w-full rounded border border-gray-300/95 bg-white text-gray-800 shadow-none placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300/45";
  /**
   * Single-line & chip-row search: same metrics as agent multi-select inner field (tight line-height, py-0).
   * Avoids extra vertical slack vs default browser input padding.
   */
  const inputSizes = "px-2.5 py-0 text-[12px] leading-tight";
  const singleLineControlH = "h-8 min-h-8";
  const dateInputCls = `${inputBase} h-8 min-h-8 w-full px-1.5 py-0 text-[11px] leading-tight`;
  const labelCls = dark
    ? "flex items-center gap-0.5 text-[11px] font-medium text-gray-300 mb-1"
    : "flex items-center gap-0.5 text-[11px] font-medium text-gray-700 mb-1";
  const subLabelCls = dark
    ? "block text-[10px] font-medium text-gray-400 mb-0.5"
    : "block text-[10px] font-medium text-gray-600 mb-0.5";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header: FILTERS + count | Clear, square search (reference layout) */}
      <div
        className={`flex items-center justify-between gap-1.5 shrink-0 px-2.5 py-2.5 border-b ${
          dark ? "border-gray-700 bg-gray-800/50" : "border-gray-200/90 bg-white/60"
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`text-[11px] font-bold uppercase tracking-wide truncate ${
              dark ? "text-gray-200" : "text-gray-800"
            }`}
          >
            FILTERS
          </span>
          {appliedTicketFilterCount > 0 && (
            <span
              className={`rounded-full px-1 py-0.5 text-[9px] font-semibold shrink-0 leading-none ${
                dark ? "bg-blue-500/30 text-blue-200" : "bg-blue-100 text-blue-700"
              }`}
            >
              {appliedTicketFilterCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {appliedTicketFilterCount > 0 && (
            <button
              type="button"
              onClick={() => clearFilters()}
              className={`text-[9px] font-medium px-1 py-0.5 rounded ${dark ? "text-gray-400 hover:text-white hover:bg-gray-700" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"}`}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setFilterSearchExpanded((e) => !e)}
            className={`inline-flex size-7 items-center justify-center rounded border shadow-none shrink-0 transition-colors ${
              dark
                ? "border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600"
                : "border-gray-300 bg-white text-gray-500 hover:border-gray-400 hover:bg-gray-50/80"
            }`}
            title={filterSearchExpanded ? "Hide filter search" : "Search filter options"}
            aria-label={filterSearchExpanded ? "Hide filter search" : "Search filter options"}
          >
            <Search className="h-3 w-3" />
          </button>
          {isDrawer && (
            <button
              type="button"
              onClick={onClose}
              className={`rounded p-1.5 ${dark ? "text-gray-400 hover:bg-gray-700" : "text-gray-500 hover:bg-gray-100"}`}
              aria-label="Close filters"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Search filter options - collapsed by default, top-right area when expanded */}
      {filterSearchExpanded && (
        <div className={`shrink-0 px-2 py-1 border-b ${dark ? "border-gray-700/50" : "border-gray-200"}`}>
          <div className="relative">
            <Search className={`absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 ${dark ? "text-gray-500" : "text-gray-400"}`} />
            <input
              type="text"
              placeholder="Search filter options..."
              value={filterOptionsSearch}
              onChange={(e) => setFilterOptionsSearch(e.target.value)}
              className={`${inputBase} ${inputSizes} ${singleLineControlH} pl-6 pr-2`}
              aria-label="Search filter options"
            />
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2.5 space-y-2.5">
        {isVisible("Agents Include") && (
          <FilterMultiSelect
            label="Agents Include"
            labelChevron
            pinFirstValues={["unassigned", "me"]}
            placeholder="All Agents"
            selectedValues={filters.assignedToIds}
            options={[
              { value: "unassigned", label: "Unassigned" },
              { value: "me", label: currentUserName },
              ...agents.map((a) => ({
                value: String(a.id),
                label: a.name || a.email || `Agent ${a.id}`,
              })),
            ]}
            onChange={(vals) => {
              if (process.env.NEXT_PUBLIC_DEBUG_TICKETS === "true") console.log("[TicketFilters] Agent filter changed:", vals);
              updateAssignedToIds(vals);
            }}
            dark={dark}
            inputBase={inputBase}
            inputSizes={inputSizes}
            labelCls={labelCls}
          />
        )}

        {isVisible("Groups Include") && (
          <FilterMultiSelect
            label="Groups Include"
            labelChevron
            pinFirstValues={["unassigned"]}
            placeholder="Any group"
            selectedValues={filters.groupIds}
            options={[
              { value: "unassigned", label: "Unassigned" },
              ...(referenceData?.groups || []).map((g) => ({
                value: String(g.id),
                label: g.groupName || g.groupCode || `Group ${g.id}`,
              })),
            ]}
            onChange={updateGroupIds}
            dark={dark}
            inputBase={inputBase}
            inputSizes={inputSizes}
            labelCls={labelCls}
          />
        )}

        {isVisible("Created") && (
          <>
            <FilterSelect
              label="Created"
              value={filters.createdPreset}
              onChange={(v) => updateFilter("createdPreset", v)}
              options={[
                { value: "any", label: "Any time" },
                { value: "last_24h", label: "Last 24 hours" },
                { value: "last_7d", label: "Last 7 days" },
                { value: "last_30d", label: "Last 30 days" },
                { value: "custom", label: "Custom range" },
              ]}
              dark={dark}
              inputCls={`${inputBase} ${inputSizes}`}
              labelCls={labelCls}
            />
            {filters.createdPreset === "custom" && (
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <span className={subLabelCls}>From</span>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => updateFilter("dateFrom", e.target.value)}
                    className={dateInputCls}
                  />
                </div>
                <div>
                  <span className={subLabelCls}>To</span>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => updateFilter("dateTo", e.target.value)}
                    className={dateInputCls}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {isVisible("Closed at") && (
          <>
            <FilterSelect
              label="Closed at"
              value={filters.closedPreset}
              onChange={(v) => updateFilter("closedPreset", v)}
              options={[
                { value: "any", label: "Any time" },
                { value: "last_24h", label: "Last 24 hours" },
                { value: "last_7d", label: "Last 7 days" },
                { value: "last_30d", label: "Last 30 days" },
                { value: "custom", label: "Custom range" },
              ]}
              dark={dark}
              inputCls={`${inputBase} ${inputSizes}`}
              labelCls={labelCls}
            />
            {filters.closedPreset === "custom" && (
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <span className={subLabelCls}>From</span>
                  <input
                    type="date"
                    value={filters.closedFrom}
                    onChange={(e) => updateFilter("closedFrom", e.target.value)}
                    className={dateInputCls}
                  />
                </div>
                <div>
                  <span className={subLabelCls}>To</span>
                  <input
                    type="date"
                    value={filters.closedTo}
                    onChange={(e) => updateFilter("closedTo", e.target.value)}
                    className={dateInputCls}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {isVisible("Resolved at") && (
          <>
            <FilterSelect
              label="Resolved at"
              value={filters.resolvedPreset}
              onChange={(v) => updateFilter("resolvedPreset", v)}
              options={[
                { value: "any", label: "Any time" },
                { value: "last_24h", label: "Last 24 hours" },
                { value: "last_7d", label: "Last 7 days" },
                { value: "last_30d", label: "Last 30 days" },
                { value: "custom", label: "Custom range" },
              ]}
              dark={dark}
              inputCls={`${inputBase} ${inputSizes}`}
              labelCls={labelCls}
            />
            {filters.resolvedPreset === "custom" && (
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <span className={subLabelCls}>From</span>
                  <input
                    type="date"
                    value={filters.resolvedFrom}
                    onChange={(e) => updateFilter("resolvedFrom", e.target.value)}
                    className={dateInputCls}
                  />
                </div>
                <div>
                  <span className={subLabelCls}>To</span>
                  <input
                    type="date"
                    value={filters.resolvedTo}
                    onChange={(e) => updateFilter("resolvedTo", e.target.value)}
                    className={dateInputCls}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {isVisible("Due by") && (
          <>
            <FilterSelect
              label="Due by"
              value={filters.duePreset}
              onChange={(v) => updateFilter("duePreset", v)}
              options={[
                { value: "any", label: "Any" },
                { value: "overdue", label: "Overdue" },
                { value: "next_24h", label: "Next 24 hours" },
                { value: "next_7d", label: "Next 7 days" },
                { value: "custom", label: "Custom range" },
              ]}
              dark={dark}
              inputCls={`${inputBase} ${inputSizes}`}
              labelCls={labelCls}
            />
            {filters.duePreset === "custom" && (
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="date"
                  value={filters.dueFrom}
                  onChange={(e) => updateFilter("dueFrom", e.target.value)}
                  className={dateInputCls}
                />
                <input
                  type="date"
                  value={filters.dueTo}
                  onChange={(e) => updateFilter("dueTo", e.target.value)}
                  className={dateInputCls}
                />
              </div>
            )}
          </>
        )}

        {isVisible("Status") && (
          <FilterMultiSelect
            label="Status"
            placeholder="Any status"
            selectedValues={filters.statuses}
            options={normalizedStatusOptions}
            onChange={updateStatuses}
            dark={dark}
            inputBase={inputBase}
            inputSizes={inputSizes}
            labelCls={labelCls}
          />
        )}

        {isVisible("Priority") && (
          <FilterMultiSelect
            label="Priority"
            placeholder="Any priority"
            selectedValues={filters.priorities}
            options={referenceData?.priorities || []}
            onChange={updatePriorities}
            dark={dark}
            inputBase={inputBase}
            inputSizes={inputSizes}
            labelCls={labelCls}
          />
        )}

        {isVisible("Type") && (
          <FilterSelect
            label="Type"
            value={filters.ticketCategory}
            onChange={(v) => updateFilter("ticketCategory", v)}
            options={[
              { value: "all", label: "Any" },
              { value: "order_related", label: "Order related" },
              { value: "non_order", label: "Non-order" },
              { value: "other", label: "Other" },
            ]}
            dark={dark}
            inputCls={`${inputBase} ${inputSizes}`}
            labelCls={labelCls}
          />
        )}

        {isVisible("Source") && (
          <FilterMultiSelect
            label="Source"
            placeholder="Any source"
            selectedValues={filters.sourceRoles}
            options={referenceData?.sources || []}
            onChange={updateSourceRoles}
            dark={dark}
            inputBase={inputBase}
            inputSizes={inputSizes}
            labelCls={labelCls}
          />
        )}

        {isVisible("Service") && (
          <FilterMultiSelect
            label="Service"
            placeholder="All services"
            selectedValues={filters.serviceTypes}
            options={referenceData?.services || []}
            onChange={updateServiceTypes}
            dark={dark}
            inputBase={inputBase}
            inputSizes={inputSizes}
            labelCls={labelCls}
          />
        )}

        {isVisible("Skill") && (
          <FilterInput
            label="Skill"
            value={filters.skill}
            placeholder="Any"
            onChange={(v) => updateFilter("skill", v)}
            inputCls={`${inputBase} ${inputSizes}`}
            labelCls={labelCls}
          />
        )}

        {isVisible("Tags") && (
          <FilterInput
            label="Tags"
            value={filters.tags}
            placeholder="tag1, tag2"
            onChange={(v) => updateFilter("tags", v)}
            inputCls={`${inputBase} ${inputSizes}`}
            labelCls={labelCls}
          />
        )}

        {isVisible("Companies") && (
          <FilterInput
            label="Companies"
            value={filters.company}
            placeholder="Any"
            onChange={(v) => updateFilter("company", v)}
            inputCls={`${inputBase} ${inputSizes}`}
            labelCls={labelCls}
          />
        )}

        {isVisible("High value / SLA") && (
          <div className={`space-y-1.5 pt-0.5 ${dark ? "text-gray-300" : "text-gray-700"}`}>
            <label className="flex items-center gap-1.5 text-[12px] font-medium">
              <input
                type="checkbox"
                checked={filters.isHighValue === "true"}
                onChange={(e) => updateFilter("isHighValue", e.target.checked ? "true" : "all")}
                className="h-3.5 w-3.5 shrink-0 rounded border-gray-500 text-blue-500 focus:ring-blue-500/30"
              />
              High value orders only
            </label>
            <label className="flex items-center gap-1.5 text-[12px] font-medium">
              <input
                type="checkbox"
                checked={filters.slaBreach === "true"}
                onChange={(e) => updateFilter("slaBreach", e.target.checked ? "true" : "all")}
                className="h-3.5 w-3.5 shrink-0 rounded border-gray-500 text-blue-500 focus:ring-blue-500/30"
              />
              SLA breach only
            </label>
          </div>
        )}
      </div>

      {/* Sticky Apply filters button - apply on submit only */}
      <div
        className={`shrink-0 sticky bottom-0 left-0 right-0 border-t px-2.5 py-2.5 ${
          dark ? "border-gray-700 bg-gray-800" : "border-gray-200/90 bg-white"
        }`}
      >
        <button
          type="button"
          onClick={handleApplyFilters}
          disabled={applyBusy}
          className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded border border-blue-600 bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white shadow-none transition-colors disabled:cursor-not-allowed disabled:opacity-80 enabled:hover:opacity-95 ${
            dark ? "enabled:hover:bg-blue-500" : "enabled:hover:bg-blue-700"
          }`}
        >
          {applyBusy ? (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              <span>Applying…</span>
            </>
          ) : (
            "Apply filters"
          )}
        </button>
      </div>
    </div>
  );
}

function FilterMultiSelect({
  label,
  labelChevron,
  pinFirstValues = [],
  placeholder,
  selectedValues,
  options,
  onChange,
  dark,
  inputBase,
  inputSizes,
  labelCls,
}: {
  label: string;
  labelChevron?: boolean;
  /** e.g. `["me"]` — logged-in agent chip shown first, others A–Z */
  pinFirstValues?: string[];
  placeholder: string;
  selectedValues: string[];
  options: Array<{ value: string; label: string }>;
  onChange: (values: string[]) => void;
  dark?: boolean;
  inputBase: string;
  inputSizes: string;
  labelCls: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pinFirst = pinFirstValues;

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    if (open) {
      document.addEventListener("mousedown", onOutside);
      return () => document.removeEventListener("mousedown", onOutside);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return options;
    }
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  /** Same idea as agent search: width tracks value/placeholder (size in ~ch), no stretched empty flex slot */
  const searchFieldSize = useMemo(() => {
    const cap = 40;
    if (search.length > 0) return Math.min(cap, Math.max(search.length + 1, 2));
    if (selectedValues.length > 0) return Math.min(cap, 4);
    return Math.min(cap, Math.max(placeholder.length, 4));
  }, [search, selectedValues.length, placeholder]);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const selectedOptions = useMemo(() => {
    const raw = options.filter((o) => selectedSet.has(o.value));
    return sortMultiSelectPills(raw, pinFirst);
  }, [options, selectedSet, pinFirst]);

  /** Chips selected + panel closed + no query → pull search field out of layout (no blank band). Still mounted for focus when opening. */
  const hideSearchInLayout =
    selectedValues.length > 0 && !open && search.length === 0;

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) queueMicrotask(() => inputRef.current?.focus());
      else {
        setSearch("");
        queueMicrotask(() => inputRef.current?.blur());
      }
      return next;
    });
  };

  const openIfClosed = () => {
    setOpen((prev) => {
      if (!prev) {
        queueMicrotask(() => inputRef.current?.focus());
        return true;
      }
      return prev;
    });
  };

  const emitOrdered = (vals: string[]) => {
    onChange(orderSelectedValues(vals, options, pinFirst));
  };

  const toggle = (value: string) => {
    if (selectedSet.has(value)) {
      emitOrdered(selectedValues.filter((v) => v !== value));
    } else {
      emitOrdered([...selectedValues, value]);
      setSearch("");
    }
  };

  const removeChip = (value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    emitOrdered(selectedValues.filter((v) => v !== value));
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
      inputRef.current?.blur();
    } else if (e.key === "Backspace" && search === "") {
      e.preventDefault();
    } else if (e.key === "Enter" && filtered.length > 0 && !selectedSet.has(filtered[0].value)) {
      toggle(filtered[0].value);
    }
  };

  return (
    <div ref={ref} className="relative">
      <label className={labelCls}>
        <span className="min-w-0">{label}</span>
        {labelChevron ? (
          <ChevronDown
            className={`h-2.5 w-2.5 shrink-0 ${dark ? "text-gray-400" : "text-gray-400"}`}
            aria-hidden
          />
        ) : null}
      </label>
      <div
        onClick={toggleOpen}
        className={`${inputBase} relative box-border px-2.5 py-1.5 text-[12px] leading-none flex h-fit min-h-0 cursor-pointer items-start gap-1 transition-colors ${
          dark ? "hover:bg-gray-600/40" : "hover:border-gray-400/90"
        }`}
      >
        {/* Chips + typed search on one wrapping row; search slot collapses when idle so no extra strip under chips. */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-wrap content-start items-center gap-1">
          {selectedOptions.map((opt) => (
            <span
              key={opt.value}
              className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-[2px] px-2 py-1 text-[11px] font-semibold leading-tight ${
                dark ? "bg-gray-600/95 text-gray-100" : "bg-[#E9ECEF] text-[#334155]"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="min-w-0 whitespace-normal break-words text-left">{opt.label}</span>
              <button
                type="button"
                onClick={(e) => removeChip(opt.value, e)}
                className={`flex shrink-0 items-center transition-opacity hover:opacity-70 ${
                  dark ? "text-gray-200" : "text-[#334155]"
                }`}
                aria-label={`Remove ${opt.label}`}
                tabIndex={-1}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            size={hideSearchInLayout ? 1 : searchFieldSize}
            placeholder={selectedValues.length > 0 ? "" : placeholder}
            aria-label={
              selectedValues.length > 0 ? "Search to filter options" : placeholder
            }
            tabIndex={hideSearchInLayout ? -1 : 0}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              openIfClosed();
            }}
            onKeyDown={handleInputKeyDown}
            onClick={(e) => {
              e.stopPropagation();
              if (open) {
                setOpen(false);
                setSearch("");
                queueMicrotask(() => inputRef.current?.blur());
              } else {
                openIfClosed();
              }
            }}
            className={
              hideSearchInLayout
                ? `pointer-events-none absolute left-0 top-0 m-0 h-px w-px shrink-0 overflow-hidden border-0 p-0 opacity-0 ${
                    dark ? "text-gray-100" : "text-gray-800"
                  }`
                : `box-border h-[1.25rem] max-h-[1.25rem] min-h-[1.25rem] min-w-[2ch] w-auto max-w-full flex-[1_1_5rem] shrink border-0 bg-transparent py-0 text-[12px] leading-none outline-0 ${
                    dark
                      ? "text-gray-100 placeholder:text-gray-400"
                      : "text-gray-800 placeholder:text-gray-400"
                  }`
            }
            style={
              hideSearchInLayout
                ? { border: "none", boxShadow: "none" }
                : { border: "none", boxShadow: "none", minHeight: 0 }
            }
          />
        </div>
        <ChevronDown
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 self-start text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </div>
      {/* Dropdown Menu - Shows filtered options based on search */}
      {open && (
        <div
          className={`absolute z-50 mt-0.5 max-h-64 w-full overflow-y-auto rounded border shadow-sm ${
            dark ? "border-gray-600 bg-gray-700" : "border-gray-300/90 bg-white"
          }`}
        >
          {options.length === 0 ? (
            <div className={`px-2.5 py-2.5 text-[12px] ${dark ? "text-gray-400" : "text-gray-500"}`}>
              No options available
            </div>
          ) : filtered.length === 0 ? (
            <div className={`px-2.5 py-2.5 text-[12px] ${dark ? "text-gray-400" : "text-gray-500"}`}>
              {search.trim() ? `No options found matching "${search}"` : "No options available"}
            </div>
          ) : (
            filtered.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-[12px] transition-colors ${
                  dark
                    ? selectedSet.has(opt.value)
                      ? "bg-blue-600/25 text-blue-100 hover:bg-blue-600/35"
                      : "text-gray-200 hover:bg-gray-600/70"
                    : selectedSet.has(opt.value)
                    ? "bg-slate-50 text-gray-900 hover:bg-slate-100"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
                onClick={(e) => {
                  // Prevent closing dropdown when clicking on option
                  e.stopPropagation();
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="h-3.5 w-3.5 shrink-0 rounded border-gray-400 text-blue-600 focus:ring-blue-500/25"
                />
                <span className="flex-1">{opt.label}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  dark,
  inputCls,
  labelCls,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  dark?: boolean;
  inputCls: string;
  labelCls: string;
}) {
  return (
    <div>
      <label className={labelCls}>
        <span className="min-w-0">{label}</span>
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} h-8 min-h-8 w-full cursor-pointer appearance-none py-0 pr-7 leading-tight`}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 shrink-0 text-gray-400"
          aria-hidden
        />
      </div>
    </div>
  );
}

function FilterInput({
  label,
  value,
  placeholder,
  onChange,
  inputCls,
  labelCls,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  inputCls: string;
  labelCls: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} h-8 min-h-8 py-0 leading-tight`}
      />
    </div>
  );
}
