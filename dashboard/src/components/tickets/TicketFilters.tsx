"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Filter, Search, X, ChevronDown } from "lucide-react";
import { useTicketFilters } from "@/hooks/tickets/useTicketFilters";
import { useTicketsAgentsQuery } from "@/hooks/tickets/useTicketsAgentsQuery";
import { useTicketsReferenceDataQuery } from "@/hooks/tickets/useTicketsReferenceDataQuery";

const FILTER_ITEMS: Array<{ key: string; label: string }> = [
  { key: "agent", label: "Agent" },
  { key: "group", label: "Group" },
  { key: "created", label: "Created" },
  { key: "resolved", label: "Resolved at" },
  { key: "closed", label: "Closed at" },
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

type TicketFiltersProps = {
  variant?: "sidebar" | "drawer";
  onClose?: () => void;
  dark?: boolean;
};

export function TicketFilters({ variant = "sidebar", onClose, dark = false }: TicketFiltersProps) {
  const {
    filters,
    updateFilter,
    resetFilters,
    applyFilters,
    activeFilterCount,
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

  const isVisible = (label: string) => visibleLabels.has(label);

  // Borderless input base - no borders at all
  const inputBase = dark
    ? "w-full rounded bg-gray-700 text-white placeholder-gray-400 focus:outline-none border-0 !border-0"
    : "w-full rounded-md bg-white text-gray-900 placeholder-gray-500 focus:outline-none border-0 !border-0";
  const inputSizes = "px-2.5 py-2 text-xs";
  const labelCls = dark
    ? "block text-xs font-semibold text-gray-300 mb-1"
    : "block text-xs font-semibold text-gray-600 mb-1";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header: Filters + count | Clear, Search */}
      <div
        className={`flex items-center justify-between gap-2 shrink-0 px-3 py-2.5 border-b ${
          dark ? "border-gray-700 bg-gray-800/50" : "border-gray-200 bg-slate-50/80"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Filter className={`h-4 w-4 shrink-0 ${dark ? "text-gray-400" : "text-slate-600"}`} />
          <span className={`text-sm font-semibold truncate ${dark ? "text-gray-200" : "text-slate-800"}`}>
            Filters
          </span>
          {activeFilterCount > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${
                dark ? "bg-blue-500/30 text-blue-200" : "bg-blue-100 text-blue-700"
              }`}
            >
              {activeFilterCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className={`text-[10px] font-medium px-1.5 py-1 rounded ${dark ? "text-gray-400 hover:text-white hover:bg-gray-700" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"}`}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setFilterSearchExpanded((e) => !e)}
            className={`p-1.5 rounded ${dark ? "text-gray-400 hover:bg-gray-700 hover:text-white" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"}`}
            title={filterSearchExpanded ? "Hide filter search" : "Search filter options"}
            aria-label={filterSearchExpanded ? "Hide filter search" : "Search filter options"}
          >
            <Search className="h-4 w-4" />
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
        <div className={`shrink-0 px-2.5 py-1.5 border-b ${dark ? "border-gray-700/50" : "border-gray-200"}`}>
          <div className="relative">
            <Search className={`absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${dark ? "text-gray-500" : "text-gray-400"}`} />
            <input
              type="text"
              placeholder="Search filter options..."
              value={filterOptionsSearch}
              onChange={(e) => setFilterOptionsSearch(e.target.value)}
              className={`${inputBase} ${inputSizes} pl-7 pr-2 py-1.5 text-xs border-0`}
              style={{ border: "none", boxShadow: "none" }}
              aria-label="Search filter options"
            />
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2 space-y-2.5">
        {isVisible("Agent") && (
          <FilterMultiSelect
            label="Agent"
            placeholder="All Agents"
            selectedValues={filters.assignedToIds}
            options={[
              { value: "me", label: currentUserName },
              { value: "unassigned", label: "Unassigned" },
              ...agents.map((a) => ({ 
                value: String(a.id), 
                label: a.name || a.email || `Agent ${a.id}` 
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

        {isVisible("Group") && (
          <FilterMultiSelect
            label="Group"
            placeholder="All Groups"
            selectedValues={filters.groupIds.map(String)}
            options={(referenceData?.groups || []).map((g) => ({
              value: String(g.id),
              label: g.groupName || g.groupCode || `Group ${g.id}`,
            }))}
            onChange={(vals) => updateGroupIds(vals.map((v) => parseInt(v, 10)).filter((n) => !Number.isNaN(n)))}
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className={`${labelCls} block mb-1`}>From</span>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => updateFilter("dateFrom", e.target.value)}
                    className={`${inputBase} ${inputSizes} w-full`}
                    style={{ border: "none", boxShadow: "none" }}
                  />
                </div>
                <div>
                  <span className={`${labelCls} block mb-1`}>To</span>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => updateFilter("dateTo", e.target.value)}
                    className={`${inputBase} ${inputSizes} w-full`}
                    style={{ border: "none", boxShadow: "none" }}
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className={`${labelCls} block mb-1`}>From</span>
                  <input
                    type="date"
                    value={filters.resolvedFrom}
                    onChange={(e) => updateFilter("resolvedFrom", e.target.value)}
                    className={`${inputBase} ${inputSizes} w-full`}
                    style={{ border: "none", boxShadow: "none" }}
                  />
                </div>
                <div>
                  <span className={`${labelCls} block mb-1`}>To</span>
                  <input
                    type="date"
                    value={filters.resolvedTo}
                    onChange={(e) => updateFilter("resolvedTo", e.target.value)}
                    className={`${inputBase} ${inputSizes} w-full`}
                    style={{ border: "none", boxShadow: "none" }}
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className={`${labelCls} block mb-1`}>From</span>
                  <input
                    type="date"
                    value={filters.closedFrom}
                    onChange={(e) => updateFilter("closedFrom", e.target.value)}
                    className={`${inputBase} ${inputSizes} w-full`}
                    style={{ border: "none", boxShadow: "none" }}
                  />
                </div>
                <div>
                  <span className={`${labelCls} block mb-1`}>To</span>
                  <input
                    type="date"
                    value={filters.closedTo}
                    onChange={(e) => updateFilter("closedTo", e.target.value)}
                    className={`${inputBase} ${inputSizes} w-full`}
                    style={{ border: "none", boxShadow: "none" }}
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
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={filters.dueFrom}
                  onChange={(e) => updateFilter("dueFrom", e.target.value)}
                  className={`${inputBase} ${inputSizes}`}
                  style={{ border: "none", boxShadow: "none" }}
                />
                <input
                  type="date"
                  value={filters.dueTo}
                  onChange={(e) => updateFilter("dueTo", e.target.value)}
                  className={`${inputBase} ${inputSizes}`}
                  style={{ border: "none", boxShadow: "none" }}
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
            options={referenceData?.statuses || []}
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
          <div className={`space-y-2 pt-1 ${dark ? "text-gray-300" : "text-gray-700"}`}>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={filters.isHighValue === "true"}
                onChange={(e) => updateFilter("isHighValue", e.target.checked ? "true" : "all")}
                className="h-4 w-4 rounded border-gray-500 text-blue-500 focus:ring-blue-500/30"
              />
              High value orders only
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={filters.slaBreach === "true"}
                onChange={(e) => updateFilter("slaBreach", e.target.checked ? "true" : "all")}
                className="h-4 w-4 rounded border-gray-500 text-blue-500 focus:ring-blue-500/30"
              />
              SLA breach only
            </label>
          </div>
        )}
      </div>

      {/* Sticky Apply filters button - apply on submit only */}
      <div
        className={`shrink-0 sticky bottom-0 left-0 right-0 border-t px-2.5 py-2.5 ${
          dark ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
        }`}
      >
        <button
          type="button"
          onClick={applyFilters}
          className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors shadow-sm ${
            dark
              ? "bg-blue-600 text-white hover:bg-blue-500"
              : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md"
          }`}
        >
          Apply filters
        </button>
      </div>
    </div>
  );
}

function FilterMultiSelect({
  label,
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

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch(""); // Clear search when closing
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
      // When no search, show all options
      return options;
    }
    // Filter options based on search query
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const selectedOptions = useMemo(
    () => options.filter((o) => selectedSet.has(o.value)),
    [options, selectedSet]
  );

  const toggle = (value: string) => {
    if (selectedSet.has(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
      setSearch(""); // Clear search after selection
    }
  };

  const removeChip = (value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedValues.filter((v) => v !== value));
  };

  const handleInputClick = () => {
    setOpen(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && search === "" && selectedValues.length > 0) {
      // Remove last chip on backspace
      onChange(selectedValues.slice(0, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    } else if (e.key === "Enter" && filtered.length > 0 && !selectedSet.has(filtered[0].value)) {
      // Select first option on Enter
      toggle(filtered[0].value);
    }
  };

  return (
    <div ref={ref} className="relative">
      <label className={labelCls}>{label}</label>
      {/* Main Input Box - Borderless, contains chips and search input */}
      <div
        onClick={handleInputClick}
        className={`${inputBase} ${inputSizes} flex items-center gap-1.5 min-h-[34px] cursor-text overflow-hidden ${
          dark ? "hover:bg-gray-600/50" : "hover:bg-gray-50"
        }`}
        style={{ border: "none !important", outline: "none", boxShadow: "none", WebkitAppearance: "none" }}
      >
        {/* Chips Container - Scrollable */}
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0 overflow-y-auto max-h-[120px] py-1">
          {selectedOptions.map((opt) => (
            <span
              key={opt.value}
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs shrink-0 ${
                dark
                  ? "bg-gray-600/80 text-gray-200"
                  : "bg-gray-100 text-gray-700"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="truncate max-w-[120px] sm:max-w-[150px] md:max-w-[180px]">{opt.label}</span>
              <button
                type="button"
                onClick={(e) => removeChip(opt.value, e)}
                className={`shrink-0 hover:opacity-70 transition-opacity flex items-center ${
                  dark ? "text-gray-300" : "text-gray-500"
                }`}
                aria-label={`Remove ${opt.label}`}
                tabIndex={-1}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {/* Search Input - Always visible, integrated in the input box */}
          <input
            ref={inputRef}
            type="text"
            placeholder={selectedValues.length === 0 ? placeholder : "Search..."}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!open) {
                setOpen(true); // Open dropdown when typing
              }
            }}
            onKeyDown={handleInputKeyDown}
            onClick={(e) => {
              e.stopPropagation();
              if (!open) {
                setOpen(true);
              }
            }}
            onFocus={() => {
              if (!open) {
                setOpen(true);
              }
            }}
            className={`flex-1 min-w-[80px] bg-transparent border-0 outline-0 text-xs ${
              dark ? "text-gray-200 placeholder-gray-500" : "text-gray-900 placeholder-gray-500"
            }`}
            style={{ minWidth: "80px", width: "auto", border: "none", boxShadow: "none" }}
          />
        </div>
        {/* Chevron Icon */}
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${
            dark ? "text-gray-400" : "text-gray-500"
          } ${open ? "rotate-180" : ""}`}
        />
      </div>
      {/* Dropdown Menu - Shows filtered options based on search */}
      {open && (
        <div
          className={`absolute z-50 mt-1 w-full rounded-md shadow-lg max-h-64 overflow-y-auto ${
            dark ? "bg-gray-700 border border-gray-600" : "bg-white border border-gray-200"
          }`}
        >
          {options.length === 0 ? (
            <div className={`px-2 py-3 text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>
              No options available
            </div>
          ) : filtered.length === 0 ? (
            <div className={`px-2 py-3 text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>
              {search.trim() ? `No options found matching "${search}"` : "No options available"}
            </div>
          ) : (
            filtered.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                  dark
                    ? selectedSet.has(opt.value)
                      ? "bg-blue-600/30 text-blue-200 hover:bg-blue-600/40"
                      : "hover:bg-gray-600 text-gray-200"
                    : selectedSet.has(opt.value)
                    ? "bg-blue-50 text-blue-800 hover:bg-blue-100"
                    : "hover:bg-gray-100 text-gray-800"
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
                  className="h-4 w-4 rounded border-gray-500 text-blue-500 focus:ring-blue-500/30"
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
      <label className={labelCls}>{label}</label>
      <select 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        className={inputCls}
        style={{ border: "none", boxShadow: "none" }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
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
        className={inputCls}
        style={{ border: "none", boxShadow: "none" }}
      />
    </div>
  );
}
