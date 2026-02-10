"use client";

import { useState, useEffect } from "react";
import { Activity, Clock, MapPin, AlertTriangle } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface AvailabilityData {
  online: number;
  busy: number;
  offline: number;
}

interface LocalityRow {
  localityCode: string | null;
  totalRiders: number;
  activeRiders: number;
  online: number;
  busy: number;
  offline: number;
  isZeroCoverage: boolean;
  isLowAvailability: boolean;
}

export function AreaManagerAvailabilityClient() {
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [localities, setLocalities] = useState<LocalityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [avRes, locRes] = await Promise.all([
          fetch("/api/area-manager/availability", { credentials: "include" }),
          fetch("/api/area-manager/availability/localities", { credentials: "include" }),
        ]);
        if (!avRes.ok || !locRes.ok) {
          throw new Error("Failed to load availability");
        }
        const avJson = await avRes.json();
        const locJson = await locRes.json();
        if (!cancelled) {
          setAvailability(avJson.data ?? null);
          setLocalities(locJson.data ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Something went wrong");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-800">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Rider availability</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Available (online)</p>
              <p className="mt-1 text-2xl font-semibold text-green-600">
                {availability?.online ?? 0}
              </p>
            </div>
            <Activity className="h-8 w-8 text-green-500" />
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Busy</p>
              <p className="mt-1 text-2xl font-semibold text-amber-600">
                {availability?.busy ?? 0}
              </p>
            </div>
            <Clock className="h-8 w-8 text-amber-500" />
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Offline</p>
              <p className="mt-1 text-2xl font-semibold text-gray-600">
                {availability?.offline ?? 0}
              </p>
            </div>
            <MapPin className="h-8 w-8 text-gray-400" />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900">By locality</h3>
        {localities.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No locality data.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Locality</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Total</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Active</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Online</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Busy</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Offline</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Alert</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {localities.map((l, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-900">
                      {l.localityCode ?? "(unspecified)"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{l.totalRiders}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{l.activeRiders}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{l.online}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{l.busy}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{l.offline}</td>
                    <td className="whitespace-nowrap px-4 py-2">
                      {l.isZeroCoverage ? (
                        <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                          <AlertTriangle className="h-3 w-3" />
                          Zero coverage
                        </span>
                      ) : l.isLowAvailability ? (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          <AlertTriangle className="h-3 w-3" />
                          Low
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
