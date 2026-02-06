"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { RiderSectionHeader } from "./RiderSectionHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useRiderAccessQuery } from "@/hooks/queries/useRiderAccessQuery";
import { ShieldCheck, ShieldOff, Clock } from "lucide-react";

interface RiderInfo {
  id: number;
  name: string | null;
  mobile: string;
}

interface BlacklistStatus {
  isBanned?: boolean;
  isPermanent?: boolean;
  expiresAt?: string;
  reason?: string;
  source?: string;
  actorEmail?: string;
  actorName?: string;
  remainingMs?: number;
  partiallyAllowedServices?: string[];
}

interface BlacklistHistoryEntry {
  id: number;
  serviceType: string;
  banned: boolean;
  reason: string;
  source: string;
  isPermanent: boolean;
  expiresAt: string | null;
  createdAt: string;
  actorEmail: string | null;
  actorName: string | null;
}

interface SummaryResponse {
  blacklistStatusByService: {
    food?: BlacklistStatus;
    parcel?: BlacklistStatus;
    person_ride?: BlacklistStatus;
    all?: BlacklistStatus;
  };
  blacklistHistory?: BlacklistHistoryEntry[];
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days} day${days !== 1 ? "s" : ""}`;
  return `${hours} hour${hours !== 1 ? "s" : ""}`;
}

export function RiderBlacklistClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const riderContext = useRiderDashboardOptional();
  const searchValue = (searchParams.get("search") || "").trim();
  const [searchInput, setSearchInput] = useState(searchValue);

  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [blacklistModal, setBlacklistModal] = useState<{ service: "food" | "parcel" | "person_ride" | "all"; action: "blacklist" | "whitelist" } | null>(null);
  const [blacklistReason, setBlacklistReason] = useState("");
  const [blacklistPermanent, setBlacklistPermanent] = useState(true);
  const [blacklistDurationHours, setBlacklistDurationHours] = useState(24);
  const [blacklistError, setBlacklistError] = useState<string | null>(null);
  const [blacklistSubmitting, setBlacklistSubmitting] = useState(false);
  const [blacklistLoadingService, setBlacklistLoadingService] = useState<string | null>(null);

  const { data: riderAccess } = useRiderAccessQuery();
  const canActForService = (s: "food" | "parcel" | "person_ride" | "all", action: "block" | "unblock") => {
    if (action === "block") {
      return s === "all"
        ? (riderAccess?.canBlock?.food || riderAccess?.canBlock?.parcel || riderAccess?.canBlock?.person_ride) ?? false
        : (riderAccess?.canBlock?.[s] ?? false);
    }
    return s === "all"
      ? (riderAccess?.canUnblock?.food || riderAccess?.canUnblock?.parcel || riderAccess?.canUnblock?.person_ride) ?? false
      : (riderAccess?.canUnblock?.[s] ?? false);
  };

  const resolveRider = useCallback(async (value: string) => {
    if (!value.trim()) {
      setRider(null);
      setSummary(null);
      return;
    }
    setResolveLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Database not available");
      let query = supabase.from("riders").select("id, name, mobile");
      const isPhone = /^\d{10,}$/.test(value.replace(/^\+?91/, ""));
      const isRiderId = /^GMR(\d+)$/i.test(value);
      const isNumeric = /^\d{1,9}$/.test(value);
      if (isRiderId) query = query.eq("id", parseInt(value.replace(/^GMR/i, ""), 10));
      else if (isNumeric) query = query.eq("id", parseInt(value, 10));
      else if (isPhone) query = query.eq("mobile", value.replace(/^\+?91/, ""));
      else query = query.ilike("mobile", `%${value}%`);
      const { data, error: e } = await query.limit(1).single();
      if (e || !data) {
        setRider(null);
        setSummary(null);
        setError("No rider found");
        return;
      }
      setRider({ id: data.id, name: data.name, mobile: data.mobile });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resolve rider");
      setRider(null);
      setSummary(null);
    } finally {
      setResolveLoading(false);
    }
  }, []);

  const fetchSummary = useCallback(async (riderId: number) => {
    setSummaryLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/riders/${riderId}/summary`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load blacklist status");
      setSummary(json.data || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load status");
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const riderFromContext = riderContext?.currentRiderInfo
    ? { id: riderContext.currentRiderInfo.id, name: riderContext.currentRiderInfo.name, mobile: riderContext.currentRiderInfo.mobile }
    : null;

  useEffect(() => setSearchInput(searchValue), [searchValue]);
  useEffect(() => {
    if (searchValue) resolveRider(searchValue);
    else if (riderFromContext) {
      setRider(riderFromContext);
      setError(null);
    } else {
      setRider(null);
      setSummary(null);
      setError(null);
    }
  }, [searchValue, riderFromContext?.id, resolveRider]);
  useEffect(() => {
    if (rider) fetchSummary(rider.id);
  }, [rider, fetchSummary]);

  const handleBlacklistSubmit = async () => {
    if (!rider || !blacklistModal) return;
    const reason = blacklistReason.trim();
    if (!reason) {
      setBlacklistError("Reason is required.");
      return;
    }
    if (blacklistModal.action === "blacklist" && blacklistModal.service !== "all" && !blacklistPermanent && (!blacklistDurationHours || blacklistDurationHours < 1)) {
      setBlacklistError("For temporary blacklist, enter duration (hours).");
      return;
    }
    setBlacklistError(null);
    setBlacklistSubmitting(true);
    setBlacklistLoadingService(blacklistModal.service);
    try {
      const body: Record<string, unknown> = {
        action: blacklistModal.action,
        serviceType: blacklistModal.service,
        reason,
      };
      if (blacklistModal.action === "blacklist") {
        body.isPermanent = blacklistModal.service === "all" ? true : blacklistPermanent;
        if (!body.isPermanent) body.durationHours = blacklistDurationHours;
      }
      const res = await fetch(`/api/riders/${rider.id}/blacklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setBlacklistError(data.error || "Request failed");
        return;
      }
      setBlacklistModal(null);
      setBlacklistReason("");
      setBlacklistPermanent(true);
      setBlacklistDurationHours(24);
      await fetchSummary(rider.id);
    } catch (e) {
      setBlacklistError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBlacklistSubmitting(false);
      setBlacklistLoadingService(null);
    }
  };

  const hasSearch = searchValue.length > 0;

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <RiderSectionHeader
        title="Blacklist / Whitelist Status"
        description="Use the search in the nav bar to select a rider. View and toggle blacklist/whitelist by service."
        rider={rider}
        resolveLoading={resolveLoading}
        error={error}
        hasSearch={hasSearch}
      />

      {rider && (
        <>
          <div className="rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-900/5 relative">
            {summaryLoading && !summary?.blacklistStatusByService ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="md" text="Loading blacklist status..." />
              </div>
            ) : summary?.blacklistStatusByService ? (
              <>
                {summaryLoading && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-100 z-10 rounded-t-2xl overflow-hidden">
                    <div className="h-full w-1/3 bg-blue-500 animate-pulse rounded-r" />
                  </div>
                )}
                <div className={`transition-opacity duration-200 ${summaryLoading ? "opacity-70 pointer-events-none" : ""}`}>
                  <div className="rounded-none border-0 p-0 shadow-none ring-0 bg-transparent">
                    <h2 className="text-lg font-bold text-gray-800 mb-1">Status by Service</h2>
                    <p className="text-sm text-gray-500 mb-4">Toggle to blacklist or whitelist. Permanent blacklist on any one service applies to all. Reason required.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(["food", "parcel", "person_ride", "all"] as const).map((service) => {
                  const bl = summary.blacklistStatusByService[service];
                  const isBanned = bl?.isBanned ?? false;
                  const serviceLabel = service === "all" ? "All Services" : service.replace("_", " ");
                  const isLoading = blacklistLoadingService === service;
                  const remaining = bl?.remainingMs != null ? formatRemaining(bl.remainingMs) : null;
                  const canToggle = isBanned
                    ? canActForService(service, "unblock")
                    : canActForService(service, "block");
                  const openModal = (action: "blacklist" | "whitelist") => {
                    setBlacklistModal({ service, action });
                    setBlacklistReason("");
                    setBlacklistError(null);
                  };
                  return (
                    <div
                      key={service}
                      className={`relative rounded-xl border-2 p-4 transition-all duration-200 ${
                        isBanned ? "bg-gradient-to-br from-red-50 to-rose-50/80 border-red-200/80" : "bg-gradient-to-br from-emerald-50/80 to-green-50/80 border-emerald-200/80"
                      } ${isLoading ? "pointer-events-none opacity-80" : ""}`}
                    >
                      {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 z-10">
                          <LoadingSpinner size="md" />
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {isBanned ? <ShieldOff className="h-5 w-5 text-red-600 shrink-0" /> : <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />}
                            <p className="text-sm font-semibold text-gray-900 capitalize">{serviceLabel}</p>
                          </div>
                          <p className={`text-xs font-medium ${isBanned ? "text-red-700" : "text-emerald-700"}`}>
                            {service === "all" && (bl as BlacklistStatus & { partiallyAllowedServices?: string[] })?.partiallyAllowedServices?.length
                              ? `Partially allowed (${((bl as BlacklistStatus & { partiallyAllowedServices: string[] }).partiallyAllowedServices).map((s) => s.replace("_", " ")).join(", ")})`
                              : `${isBanned ? "Banned" : "Allowed"}${isBanned && bl?.isPermanent ? " (Permanent)" : isBanned && bl?.expiresAt ? ` (Until ${new Date(bl.expiresAt).toLocaleDateString()})` : ""}`
                            }
                          </p>
                          {bl?.reason && (
                            <p className="text-xs text-gray-600 mt-1.5 line-clamp-2">
                              <span className="font-medium text-gray-700">Latest: </span>
                              {bl.source === "agent" && (bl.actorEmail || bl.actorName) ? `${bl.actorEmail ?? bl.actorName} – ${bl.reason}` : `${bl.source === "system" ? "System" : "Agent"} – ${bl.reason}`}
                            </p>
                          )}
                          {isBanned && !bl?.isPermanent && remaining && (
                            <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                              <Clock className="h-3 w-3" /> Remaining: {remaining}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 flex flex-col items-end">
                          {canToggle ? (
                            <>
                              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">{isBanned ? "Whitelist" : "Blacklist"}</span>
                              <button
                                type="button"
                                onClick={() => openModal(isBanned ? "whitelist" : "blacklist")}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500 ${
                                  isBanned ? "border-red-400 bg-red-500" : "border-emerald-400 bg-emerald-500"
                                }`}
                                aria-label={isBanned ? `Whitelist ${serviceLabel}` : `Blacklist ${serviceLabel}`}
                              >
                                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isBanned ? "translate-x-4" : "translate-x-0.5"}`} style={{ marginTop: 2 }} />
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400">View only</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-6 text-center text-sm text-gray-500">Unable to load blacklist status.</div>
            )}
          </div>

          {/* Blacklist history table: who did what and when */}
          {summary?.blacklistHistory && summary.blacklistHistory.length > 0 && (
            <div className="rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-900/5 mt-6">
              <h2 className="text-lg font-bold text-gray-800 mb-3">Blacklist / Whitelist History</h2>
              <p className="text-sm text-gray-500 mb-4">Recent actions with performer and reason.</p>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Date</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Service</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Action</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Reason</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Performed by</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {summary.blacklistHistory.map((h) => (
                      <tr key={h.id}>
                        <td className="px-4 py-2 text-sm text-gray-800">{new Date(h.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{h.serviceType.replace("_", " ")}</td>
                        <td className="px-4 py-2 text-sm">
                          <span className={h.banned ? "text-red-600 font-medium" : "text-emerald-600 font-medium"}>{h.banned ? "Blacklist" : "Whitelist"}</span>
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-900 max-w-[200px] truncate" title={h.reason}>{h.reason}</td>
                        <td className="px-4 py-2 text-sm text-gray-800">
                          {h.source === "agent" && (h.actorEmail || h.actorName) ? (h.actorName ? `${h.actorName} (${h.actorEmail ?? "—"})` : (h.actorEmail ?? "Agent")) : h.source === "system" ? "System" : "Automated"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Blacklist / Whitelist modal */}
      {blacklistModal && rider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !blacklistSubmitting && setBlacklistModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-gray-100" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 pb-2 border-b border-gray-100">
              {blacklistModal.action === "whitelist" ? (
                <ShieldCheck className="h-8 w-8 text-emerald-500 shrink-0" />
              ) : (
                <ShieldOff className="h-8 w-8 text-red-500 shrink-0" />
              )}
              <h4 className="font-semibold text-gray-900 text-lg">
                {blacklistModal.action === "whitelist" ? "Whitelist" : "Blacklist"} — {blacklistModal.service === "all" ? "All Services" : blacklistModal.service.replace("_", " ")}
              </h4>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1.5">Reason (required)</label>
              <textarea
                value={blacklistReason}
                onChange={(e) => setBlacklistReason(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter reason for this action"
              />
            </div>
            {blacklistModal.action === "blacklist" && blacklistModal.service !== "all" && (
              <div className="space-y-3 rounded-xl bg-gray-100 p-4">
                <label className="block text-sm font-medium text-gray-900">Type</label>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={blacklistPermanent} onChange={() => setBlacklistPermanent(true)} className="rounded text-red-600 focus:ring-red-500" />
                    <span className="text-sm font-medium text-gray-900">Permanent</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={!blacklistPermanent} onChange={() => setBlacklistPermanent(false)} className="rounded text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm font-medium text-gray-900">Temporary</span>
                  </label>
                </div>
                {!blacklistPermanent && (
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">Duration (hours)</label>
                    <input
                      type="number"
                      min={1}
                      value={blacklistDurationHours}
                      onChange={(e) => setBlacklistDurationHours(Number(e.target.value) || 24)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
            )}
            {blacklistError && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg font-medium">{blacklistError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => !blacklistSubmitting && setBlacklistModal(null)} className="px-4 py-2 text-sm font-medium text-gray-900 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBlacklistSubmit}
                disabled={blacklistSubmitting}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {blacklistSubmitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
