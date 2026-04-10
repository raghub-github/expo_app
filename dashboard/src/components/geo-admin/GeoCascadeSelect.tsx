"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { useGeoStatesQuery, useGeoChildrenQuery, useLazyGeoSearchQuery } from "@/store/api/geoAdminApi";
import type { GeoChildRow } from "@/lib/geo/geo-shared";
import type { GeoHierarchyLevel } from "@/store/api/geoAdminApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

export type CascadeValue =
  | { mode: "existing"; id: string; name: string }
  | { mode: "new"; name: string };

const OTHER_SENTINEL = "__other__";

type Level = "state" | "region" | "district" | "division";

function rowToOption(r: GeoChildRow): { id: string; name: string } {
  return { id: r.id, name: r.name };
}

export const GeoCascadeSelect = React.memo(function GeoCascadeSelect(props: {
  label: string;
  level: Level;
  /** Parent geo id (state for region, region for district, etc.). Not used for state. */
  parentId: string | null;
  /** For search scoping */
  stateId: string | null;
  value: CascadeValue | null;
  onChange: (next: CascadeValue | null) => void;
  disabled?: boolean;
  required?: boolean;
  /**
   * When a parent row does not exist in DB yet (user typed “Other” upstream),
   * children cannot be listed — only manual name entry.
   */
  forceManualOnly?: boolean;
}) {
  const [tab, setTab] = useState<"pick" | "other">("pick");
  const [filter, setFilter] = useState("");
  const [remoteQ, setRemoteQ] = useState("");
  const debouncedRemote = useDebouncedValue(remoteQ, 350);
  const [manualName, setManualName] = useState("");

  const statesQ = useGeoStatesQuery(undefined, { skip: props.level !== "state" });

  const parentLevel: GeoHierarchyLevel | null =
    props.level === "state"
      ? "root"
      : props.level === "region"
        ? "state"
        : props.level === "district"
          ? "region"
          : "district";

  const childrenSkip =
    props.disabled ||
    props.forceManualOnly ||
    (props.level !== "state" && !props.parentId) ||
    props.level === "state";

  const childrenQ = useGeoChildrenQuery(
    {
      parentLevel: (parentLevel === "root" ? "root" : parentLevel) as GeoHierarchyLevel,
      parentId: props.level === "state" ? null : props.parentId,
      limit: 600,
      stateId: props.level === "state" ? null : props.stateId,
    },
    { skip: childrenSkip || props.level === "state" }
  );

  const [runSearch, searchState] = useLazyGeoSearchQuery();

  useEffect(() => {
    if (props.level === "state") return;
    if (!props.stateId) return;
    if (!debouncedRemote.trim() || debouncedRemote.trim().length < 2) return;
    const types: string[] =
      props.level === "region"
        ? ["region"]
        : props.level === "district"
          ? ["district"]
          : ["division"];
    void runSearch({
      q: debouncedRemote.trim(),
      types,
      limit: 80,
      stateId: props.stateId,
    });
  }, [debouncedRemote, props.level, props.stateId, runSearch]);

  const listOptions = useMemo(() => {
    if (props.level === "state") {
      const st = statesQ.data?.states ?? [];
      return st.map((s) => ({ id: s.id, name: s.name }));
    }
    const rows = childrenQ.data?.rows ?? [];
    return rows.map(rowToOption);
  }, [props.level, statesQ.data?.states, childrenQ.data?.rows]);

  const filteredLocal = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return listOptions;
    return listOptions.filter((o) => o.name.toLowerCase().includes(q));
  }, [listOptions, filter]);

  const searchRows = searchState.data?.rows ?? [];
  const remoteOptions = useMemo(() => {
    const want: Level =
      props.level === "region" ? "region" : props.level === "district" ? "district" : "division";
    const scoped = searchRows.filter((r) => r.kind === want);
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const r of scoped) {
      if (props.stateId && r.state_name) {
        /* search may return cross-state; prefer same state when we know stateId */
      }
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ id: r.id, name: r.name });
    }
    return out;
  }, [searchRows, props.level]);

  const showRemote = debouncedRemote.trim().length >= 2 && remoteOptions.length > 0;

  useEffect(() => {
    if (props.forceManualOnly) {
      setTab("other");
    } else if (props.value?.mode === "new") {
      setTab("other");
      setManualName(props.value.name);
    } else if (props.value?.mode === "existing") {
      setTab("pick");
    }
  }, [props.value, props.forceManualOnly]);

  useEffect(() => {
    setFilter("");
    setRemoteQ("");
    if (!props.parentId && props.level !== "state") {
      setTab("pick");
    }
  }, [props.parentId, props.level]);

  const loading =
    props.level === "state"
      ? statesQ.isLoading || statesQ.isFetching
      : childrenQ.isLoading || childrenQ.isFetching;

  function applyExisting(id: string, name: string) {
    props.onChange({ mode: "existing", id, name });
  }

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";

  return (
    <div className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
          {props.label}
          {props.required ? <span className="text-rose-600"> *</span> : null}
        </span>
        {!props.forceManualOnly ? (
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] font-semibold">
            <button
              type="button"
              disabled={props.disabled}
              onClick={() => {
                setTab("pick");
                setManualName("");
                props.onChange(null);
              }}
              className={cn(
                "rounded-md px-2.5 py-1 transition",
                tab === "pick" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              Choose from list
            </button>
            <button
              type="button"
              disabled={props.disabled}
              onClick={() => {
                setTab("other");
                props.onChange({ mode: "new", name: manualName.trim() });
              }}
              className={cn(
                "rounded-md px-2.5 py-1 transition",
                tab === "other" ? "bg-amber-600 text-white" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              Other (new)
            </button>
          </div>
        ) : (
          <span className="rounded-md bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900">
            New name (parent not saved yet)
          </span>
        )}
      </div>

      {tab === "other" || props.forceManualOnly ? (
        <div>
          <label className="sr-only">New {props.label} name</label>
          <input
            className={inputCls}
            disabled={props.disabled}
            placeholder={`Type new ${props.label} name exactly as it should be stored`}
            value={manualName}
            onChange={(e) => {
              const v = e.target.value;
              setManualName(v);
              props.onChange({ mode: "new", name: v.trim() });
            }}
          />
          <p className="mt-1.5 text-[11px] text-slate-500">
            Creates or matches by name on save. Double-check spelling.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              className={cn(inputCls, "pl-8")}
              disabled={props.disabled || (props.level !== "state" && !props.parentId)}
              placeholder={
                props.level === "state"
                  ? "Filter states…"
                  : props.parentId
                    ? "Filter this list…"
                    : "Select parent first…"
              }
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          {props.level !== "state" && props.parentId && props.stateId ? (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-teal-600" />
              <input
                className={cn(inputCls, "border-teal-200/80 pl-8")}
                disabled={props.disabled}
                placeholder="Search full directory (2+ letters)…"
                value={remoteQ}
                onChange={(e) => setRemoteQ(e.target.value)}
              />
              {searchState.isFetching ? (
                <p className="mt-1 text-[10px] text-teal-700">Searching…</p>
              ) : null}
            </div>
          ) : null}

          <div className="relative">
            <select
              className={cn(inputCls, "cursor-pointer appearance-none pr-9")}
              disabled={props.disabled || loading || (props.level !== "state" && !props.parentId)}
              value={
                props.value?.mode === "existing"
                  ? props.value.id
                  : props.value?.mode === "new"
                    ? OTHER_SENTINEL
                    : ""
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || v === OTHER_SENTINEL) {
                  props.onChange(null);
                  return;
                }
                const fromLocal = listOptions.find((o) => o.id === v);
                if (fromLocal) {
                  applyExisting(fromLocal.id, fromLocal.name);
                  return;
                }
                const fromRemote = remoteOptions.find((o) => o.id === v);
                if (fromRemote) applyExisting(fromRemote.id, fromRemote.name);
              }}
            >
              <option value="">{loading ? "Loading…" : `Select ${props.label}…`}</option>
              {filteredLocal.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
              {showRemote
                ? remoteOptions
                    .filter((r) => !filteredLocal.some((l) => l.id === r.id))
                    .map((o) => (
                      <option key={`s-${o.id}`} value={o.id}>
                        {o.name} (search)
                      </option>
                    ))
                : null}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          {props.value?.mode === "existing" ? (
            <p className="text-[11px] font-medium text-teal-800">
              Selected: <span className="font-semibold">{props.value.name}</span>
            </p>
          ) : (
            <p className="text-[11px] text-slate-500">Pick a row or switch to Other (new).</p>
          )}
        </div>
      )}
    </div>
  );
});
