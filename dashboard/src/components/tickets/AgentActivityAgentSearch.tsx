"use client";

import { useAppSearchParams } from "@/lib/navigation/use-app-search-params";
import { useDeferredValue, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { AGENT_ACTIVITY_PATH } from "@/lib/tickets/ticket-path-utils";

type AgentOption = { id: number; name: string; email: string };

export function AgentActivityAgentSearch() {
  const router = useRouter();
  const searchParams = useAppSearchParams();

  const section = searchParams.get("section") === "automation" ? "automation" : "activity";

  const selectedAgentUserIdRaw = searchParams.get("agentUserId");
  const selectedAgentUserId = selectedAgentUserIdRaw ? Number(selectedAgentUserIdRaw) : NaN;

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAgents([]);

    fetch("/api/tickets/agents", { credentials: "include" })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        const list = (body?.data?.agents ?? []) as AgentOption[];
        setAgents(
          list
            .filter((a) => typeof a?.id === "number")
            .map((a) => ({
              id: a.id,
              name: a.name ?? "",
              email: a.email ?? "",
            }))
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedAgent = useMemo(() => {
    if (Number.isFinite(selectedAgentUserId) && selectedAgentUserId > 0) {
      return agents.find((a) => a.id === selectedAgentUserId) ?? null;
    }
    return null; // Default: All agents selected
  }, [agents, selectedAgentUserId]);

  /** Sync input to URL selection (deep link / back) without fighting in-progress typing. */
  const lastUrlAgentIdRef = useRef<number | "all" | null>(null);
  useEffect(() => {
    const urlId =
      Number.isFinite(selectedAgentUserId) && selectedAgentUserId > 0 ? selectedAgentUserId : null;
    if (urlId == null) {
      if (lastUrlAgentIdRef.current !== "all") {
        lastUrlAgentIdRef.current = "all";
        setQuery("");
      }
      return;
    }
    if (!selectedAgent) return;
    if (lastUrlAgentIdRef.current === urlId) return;
    lastUrlAgentIdRef.current = urlId;
    setQuery(selectedAgent.name || selectedAgent.email || "");
  }, [selectedAgentUserId, selectedAgent]);

  const deferredQuery = useDeferredValue(query);
  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const list = agents;
    if (!q) return list.slice(0, 8);
    return list
      .filter((a) => {
        const hay = `${a.name} ${a.email}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 10);
  }, [agents, deferredQuery]);

  const setAgent = (agentId: number, displayLabel: string) => {
    lastUrlAgentIdRef.current = agentId;
    setQuery(displayLabel);
    setOpen(false);
    const next = new URLSearchParams(searchParams.toString());
    next.set("section", section);
    next.set("agentUserId", String(agentId));
    startTransition(() => {
      router.replace(`${AGENT_ACTIVITY_PATH}?${next.toString()}`, { scroll: false });
    });
  };

  const setAllAgents = () => {
    lastUrlAgentIdRef.current = "all";
    setQuery("");
    setOpen(false);
    const next = new URLSearchParams(searchParams.toString());
    next.set("section", section);
    next.delete("agentUserId");
    startTransition(() => {
      router.replace(`${AGENT_ACTIVITY_PATH}?${next.toString()}`, { scroll: false });
    });
  };

  return (
    <div className="px-1 pb-2">
      <div className="mb-1 flex items-center justify-between gap-2 px-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Agent</div>
        <div className="text-[11px] font-medium text-gray-600">
          {selectedAgent ? selectedAgent.name || `User ${selectedAgent.id}` : "All agents"}
        </div>
      </div>

      <div className="relative px-1">
        <Search className="pointer-events-none absolute left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          type="text"
          enterKeyHint="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Let click handlers run before closing.
            window.setTimeout(() => setOpen(false), 120);
          }}
          placeholder="Filter agents by name…"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          name="agent-activity-filter"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          // Extensions (e.g. temp-mail) inject style/data-* into inputs and break hydration.
          suppressHydrationWarning
          className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-9 pr-12 text-xs text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {open ? (
          <div className="absolute left-1 right-1 top-full z-50 mt-2 max-h-[240px] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg ring-1 ring-black/5">
            {loading ? (
              <p className="px-2 py-2 text-xs text-gray-500">Loading agents…</p>
            ) : (
              <div className="space-y-1">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={setAllAgents}
                  className={`w-full rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                    !selectedAgent ? "bg-blue-50 text-blue-800" : "hover:bg-gray-50 text-gray-800"
                  }`}
                >
                  <div className="truncate font-semibold">All agents</div>
                  <div className="truncate text-[10px] text-gray-500">Totals across everyone</div>
                </button>
                {filtered.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-gray-500">No agents found</p>
                ) : (
                  filtered.map((a) => {
                    const isSelected = Number.isFinite(selectedAgentUserId) && selectedAgentUserId === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          setAgent(a.id, a.name || a.email || `User ${a.id}`)
                        }
                        className={`w-full rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                          isSelected ? "bg-blue-50 text-blue-800" : "hover:bg-gray-50 text-gray-800"
                        }`}
                      >
                        <div className="truncate font-semibold">{a.name || `User ${a.id}`}</div>
                        <div className="truncate text-[10px] text-gray-500">{a.email}</div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

