"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Loader2, User, FileEdit, Banknote, Tag, UtensilsCrossed, Layers, Settings, Clock } from "lucide-react";

export type ActivityLogEntry = {
  id: number;
  store_id: number;
  agent_id: number | null;
  agent_email: string | null;
  changed_section: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  change_reason: string | null;
  action_type: string;
  created_at: string;
};

async function fetchActivityLogs(storeId: string): Promise<ActivityLogEntry[]> {
  const res = await fetch(`/api/merchant/stores/${storeId}/activity-logs`, {
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok || !data.success) return [];
  return Array.isArray(data.logs) ? data.logs : [];
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function formatFieldName(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StoreActivityLogClient({ storeId }: { storeId: string }) {
  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ["storeActivityLogs", storeId],
    queryFn: () => fetchActivityLogs(storeId),
    enabled: !!storeId,
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-6">
      <div className="flex items-center gap-2 mb-6">
        <History className="h-5 w-5 text-blue-600" />
        <h1 className="text-lg font-semibold text-gray-900">Activity Log</h1>
      </div>
      <p className="text-sm text-gray-600 mb-6">
        All agent changes for this store. Latest first.
      </p>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 py-4">
          Failed to load activity logs. Please try again.
        </p>
      )}

      {!isLoading && !error && logs.length === 0 && (
        <p className="text-sm text-gray-500 py-8 text-center">
          No activity recorded yet.
        </p>
      )}

      {!isLoading && !error && logs.length > 0 && (
        <div className="space-y-3">
          {logs.map((log) => (
            <div
              key={log.id}
              className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                  <FileEdit className="h-3 w-3" />
                  {log.changed_section}
                </span>
                <span className="font-medium text-gray-900">
                  {formatFieldName(log.field_name)}
                </span>
                {(log.agent_email || log.agent_id != null) && (
                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700" title={log.agent_email ?? `Agent #${log.agent_id}`}>
                    <User className="h-3 w-3 shrink-0" />
                    {log.agent_email ?? `Agent #${log.agent_id}`}
                  </span>
                )}
                <span className="text-gray-400 text-xs ml-auto">
                  {formatDate(log.created_at)}
                </span>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                {log.old_value != null && log.old_value !== "" && (
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-gray-500 shrink-0">Previous:</span>
                    <span className="text-gray-700 break-words">
                      {log.old_value.length > 200
                        ? log.old_value.slice(0, 200) + "…"
                        : log.old_value}
                    </span>
                  </span>
                )}
                {log.old_value != null && log.old_value !== "" && log.new_value != null && log.new_value !== "" && (
                  <span className="text-gray-300 shrink-0">|</span>
                )}
                {log.new_value != null && log.new_value !== "" && (
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-gray-500 shrink-0">Updated:</span>
                    <span className="text-gray-900 font-medium break-words">
                      {log.new_value.length > 200
                        ? log.new_value.slice(0, 200) + "…"
                        : log.new_value}
                    </span>
                  </span>
                )}
                {log.change_reason && (
                  <span className="text-gray-500 italic basis-full">
                    Reason: {log.change_reason}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <UnifiedActivityFeed storeId={storeId} />
    </div>
  );
}

type FeedItem = {
  id: number;
  section: string;
  action: string;
  entity_name: string | null;
  summary: string;
  actor_type: string;
  actor_name: string | null;
  source: string;
  created_at: string;
};

const SECTION_ICONS: Record<string, typeof History> = {
  bank_account: Banknote,
  offer: Tag,
  menu_item: UtensilsCrossed,
  combo: Layers,
  store_settings: Settings,
};

const SECTION_COLORS: Record<string, string> = {
  bank_account: "bg-blue-100 text-blue-700",
  offer: "bg-orange-100 text-orange-700",
  menu_item: "bg-green-100 text-green-700",
  combo: "bg-purple-100 text-purple-700",
  addon: "bg-cyan-100 text-cyan-700",
  store_settings: "bg-slate-100 text-slate-700",
};

const SOURCE_LABELS: Record<string, string> = {
  merchant_app: "App",
  partnersite: "Partner Site",
  dashboard: "Dashboard",
};

const SECTION_FILTERS = ["all", "bank_account", "offer", "menu_item", "combo", "addon", "variant", "customization", "category", "combo_component"] as const;
const SECTION_FILTER_LABELS: Record<string, string> = {
  all: "All Sections",
  bank_account: "Bank",
  offer: "Offers",
  menu_item: "Menu Items",
  combo: "Combos",
  addon: "Addons",
  variant: "Variants",
  customization: "Customizations",
  category: "Categories",
  combo_component: "Combo Items",
};

const SOURCE_FILTERS = ["all", "merchant_app", "partnersite", "dashboard"] as const;
const SOURCE_FILTER_LABELS: Record<string, string> = {
  all: "All Sources",
  merchant_app: "App",
  partnersite: "Partner Site",
  dashboard: "Dashboard",
};

const ACTOR_FILTERS = ["all", "merchant", "agent"] as const;
const ACTOR_FILTER_LABELS: Record<string, string> = {
  all: "Everyone",
  merchant: "Merchant",
  agent: "Agent",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function UnifiedActivityFeed({ storeId }: { storeId: string }) {
  const [sectionFilter, setSectionFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["storeActivityFeed", storeId, sectionFilter, sourceFilter, actorFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (sectionFilter !== "all") params.set("section", sectionFilter);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (actorFilter !== "all") params.set("actor_type", actorFilter);
      const res = await fetch(`/api/merchant/stores/${storeId}/activity-feed?${params.toString()}`, { credentials: "include" });
      const j = await res.json();
      return (j?.activities ?? []) as FeedItem[];
    },
    enabled: !!storeId,
  });

  return (
    <div className="mt-8 rounded-xl border border-gray-200 bg-white p-4 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-5 w-5 text-orange-600" />
        <h2 className="text-lg font-semibold text-gray-900">Unified Activity Feed</h2>
        <span className="text-xs text-gray-500 ml-auto">All changes across app, partner site & dashboard</span>
      </div>

      <div className="space-y-2 mb-4">
        <div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Section</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {SECTION_FILTERS.map((f) => (
              <button key={f} type="button" onClick={() => setSectionFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${sectionFilter === f ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {SECTION_FILTER_LABELS[f] ?? f}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-6">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Source</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {SOURCE_FILTERS.map((f) => (
                <button key={f} type="button" onClick={() => setSourceFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${sourceFilter === f ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {SOURCE_FILTER_LABELS[f] ?? f}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Done by</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {ACTOR_FILTERS.map((f) => (
                <button key={f} type="button" onClick={() => setActorFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${actorFilter === f ? "bg-purple-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {ACTOR_FILTER_LABELS[f] ?? f}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">No activity recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const IconComp = SECTION_ICONS[item.section] ?? FileEdit;
            const colorClass = SECTION_COLORS[item.section] ?? "bg-gray-100 text-gray-600";
            return (
              <div key={item.id} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                <div className={`p-1.5 rounded-lg shrink-0 ${colorClass}`}>
                  <IconComp className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 leading-tight">{item.summary}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      item.actor_type === "agent" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"
                    }`}>
                      {item.actor_type === "agent" ? "Agent" : "Merchant"}
                    </span>
                    <span className="text-[10px] text-gray-500 font-medium">
                      {SOURCE_LABELS[item.source] ?? item.source}
                    </span>
                    {item.actor_name && (
                      <span className="text-[10px] text-gray-500">
                        · {item.actor_name}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[11px] text-gray-400 shrink-0 font-medium">{timeAgo(item.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
