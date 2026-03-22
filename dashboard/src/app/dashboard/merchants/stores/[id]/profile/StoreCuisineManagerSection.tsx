"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Check } from "lucide-react";
import { STORE_PROFILE_FULL_KEY } from "@/hooks/useStoreProfileFull";
import { STORE_KEY } from "@/hooks/useStore";
import { useToast } from "@/context/ToastContext";

type CuisineRow = { id: number; name: string; is_system_defined: boolean };

function parseCuisineRows(rows: unknown): CuisineRow[] {
  if (!Array.isArray(rows)) return [];
  const out: CuisineRow[] = [];
  for (const raw of rows) {
    if (raw == null || typeof raw !== "object") continue;
    const x = raw as Record<string, unknown>;
    const idRaw = x.id;
    const idNum =
      typeof idRaw === "bigint" ? Number(idRaw) : typeof idRaw === "number" ? idRaw : Number(idRaw);
    if (!Number.isFinite(idNum) || idNum <= 0) continue;
    if (typeof x.name !== "string") continue;
    out.push({
      id: idNum,
      name: x.name,
      is_system_defined: Boolean(x.is_system_defined),
    });
  }
  return out;
}

/**
 * Manage store ↔ cuisine_master links (add from master list, remove when allowed).
 * Lives on the store profile; category modal only picks one linked cuisine per category.
 */
export function StoreCuisineManagerSection({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [linked, setLinked] = useState<CuisineRow[]>([]);
  const [catalog, setCatalog] = useState<CuisineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null);
  const [maxCuisines, setMaxCuisines] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, cfgRes] = await Promise.all([
        fetch(`/api/merchant/stores/${storeId}/menu/cuisines`, { credentials: "include" }),
        fetch(`/api/merchant/stores/${storeId}/menu/category-config`, { credentials: "include" }),
      ]);
      const cj = (await cRes.json().catch(() => ({}))) as {
        success?: boolean;
        cuisines?: unknown;
        catalog?: unknown;
      };
      const cfg = (await cfgRes.json().catch(() => ({}))) as {
        limits?: { max_cuisines?: number | null; current_custom_cuisine_count?: number };
      };
      if (cRes.ok && cj.success !== false) {
        setLinked(parseCuisineRows(cj.cuisines));
        setCatalog(parseCuisineRows(cj.catalog));
      } else {
        setLinked([]);
        setCatalog([]);
      }
      if (cfgRes.ok && cfg?.limits) {
        const m = cfg.limits.max_cuisines;
        setMaxCuisines(m != null && Number.isFinite(Number(m)) ? Number(m) : null);
      }
    } catch {
      setLinked([]);
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const linkedCount = linked.length;
  const atLimit = maxCuisines != null && linkedCount >= maxCuisines;

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((c) => c.name.toLowerCase().includes(q));
  }, [catalog, searchQuery]);

  const invalidateProfile = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: STORE_PROFILE_FULL_KEY(storeId) });
    void queryClient.invalidateQueries({ queryKey: STORE_KEY(storeId) });
  }, [queryClient, storeId]);

  const handleLinkById = async (cuisineId: number) => {
    if (!Number.isFinite(cuisineId) || cuisineId <= 0) return;
    if (atLimit) {
      toast?.(
        maxCuisines != null
          ? `Your plan allows at most ${maxCuisines} store cuisine(s). Remove one to add another.`
          : "Cuisine limit reached for your plan."
      );
      return;
    }
    setLinking(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/menu/cuisines/link`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuisine_id: cuisineId }),
      });
      const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) {
        throw new Error(
          typeof j.message === "string" && j.message.trim()
            ? j.message
            : typeof j.error === "string"
              ? j.error
              : "Could not add cuisine"
        );
      }
      await load();
      invalidateProfile();
      toast?.("Cuisine added to this store.");
    } catch (e) {
      toast?.(e instanceof Error ? e.message : "Could not add cuisine");
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (cuisineId: number) => {
    setUnlinkingId(cuisineId);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/menu/cuisines/${cuisineId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) {
        throw new Error(
          typeof j.message === "string" && j.message.trim()
            ? j.message
            : typeof j.error === "string"
              ? j.error
              : "Could not remove cuisine"
        );
      }
      await load();
      invalidateProfile();
      toast?.("Cuisine removed from this store.");
    } catch (e) {
      toast?.(e instanceof Error ? e.message : "Could not remove cuisine");
    } finally {
      setUnlinkingId(null);
    }
  };

  const viewText =
    linked.length > 0
      ? linked
          .map((c) => c.name)
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
          .join(", ")
      : null;

  return (
    <div className="rounded-lg border border-blue-100 bg-white p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-gray-900">Store cuisines</div>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Linked for menus and categories. Use edit to add from the master list or remove (plan limits apply).
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {maxCuisines != null && (
            <span className="text-[10px] text-gray-600">
              Plan: <span className="font-semibold">{linkedCount}</span> / {maxCuisines}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setEditing((v) => !v);
              setSearchQuery("");
            }}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-800 hover:bg-gray-50"
          >
            {editing ? (
              <>
                <Check size={12} className="text-green-600" />
                Done
              </>
            ) : (
              <>
                <Pencil size={12} className="text-blue-600" />
                Edit
              </>
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-gray-500">Loading cuisines…</p>
      ) : !editing ? (
        <p className="text-sm text-gray-900 leading-relaxed">
          {viewText ?? (
            <span className="text-gray-400 italic">No cuisines linked yet — click Edit to add from the master list.</span>
          )}
        </p>
      ) : (
        <>
          {linked.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] text-gray-500 w-full">Linked to this store:</span>
              {linked.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1 rounded-full bg-gray-100 border border-gray-200 px-2 py-0.5 text-xs text-gray-800"
                >
                  {c.name}
                  <button
                    type="button"
                    className="text-red-600 hover:text-red-800 font-bold disabled:opacity-40"
                    disabled={unlinkingId === c.id}
                    title="Remove from store (categories must not use it)"
                    onClick={() => void handleUnlink(c.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
              No cuisines linked yet. Search below to add from <code className="text-[10px] bg-white/80 px-1 rounded">cuisine_master</code>.
            </p>
          )}

          <div className="pt-2 border-t border-gray-100 space-y-2">
            <label className="block text-[10px] font-medium text-gray-600">Search cuisine master</label>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type to filter…"
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            />
            {filteredCatalog.length > 0 ? (
              <ul className="max-h-36 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/80 divide-y divide-gray-100">
                {filteredCatalog.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={linking || atLimit}
                      onClick={() => void handleLinkById(c.id)}
                      className="w-full text-left px-2 py-1.5 text-xs text-gray-900 hover:bg-blue-50 disabled:opacity-50"
                    >
                      + {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              catalog.length > 0 && (
                <p className="text-[10px] text-gray-500">No matches — try another search.</p>
              )
            )}
            {!atLimit && catalog.length === 0 && linked.length > 0 && (
              <p className="text-[10px] text-gray-500">All master cuisines are already linked.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
