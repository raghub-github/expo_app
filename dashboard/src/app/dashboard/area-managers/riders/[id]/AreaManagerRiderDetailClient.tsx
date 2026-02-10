"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, AlertCircle, Loader2 } from "lucide-react";

export function AreaManagerRiderDetailClient({ riderId }: { riderId: string }) {
  const [rider, setRider] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");

  useEffect(() => {
    const id = parseInt(riderId, 10);
    if (isNaN(id)) {
      setError("Invalid rider id");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/area-manager/riders/${id}`, {
          credentials: "include",
        });
        if (!res.ok) {
          if (res.status === 404) setError("Rider not found");
          else setError("Failed to load rider");
          return;
        }
        const json = await res.json();
        const data = json.data;
        setRider(data);
        setNewStatus((data?.status as string) ?? "");
      } catch {
        setError("Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
  }, [riderId]);

  const handleUpdateStatus = async () => {
    if (!rider || newStatus === rider.status) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/area-manager/riders/${rider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Update failed");
      setRider((r) => (r ? { ...r, status: newStatus } : null));
    } catch {
      setError("Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !rider) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center gap-2 text-red-800">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        {error ?? "Rider not found"}
        <Link
          href="/dashboard/area-managers/riders"
          className="ml-auto text-sm font-medium text-red-700 underline"
        >
          Back to riders
        </Link>
      </div>
    );
  }

  const status = (rider.status as string) ?? "";

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/area-managers/riders"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to riders
      </Link>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">{String(rider.name ?? rider.id)}</h2>
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-gray-500">Rider ID</dt>
            <dd className="text-sm font-medium text-gray-900">{String(rider.id)}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Mobile</dt>
            <dd className="text-sm font-medium text-gray-900">{String(rider.mobile ?? "-")}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Status</dt>
            <dd>
              <span
                className={`inline rounded px-2 py-0.5 text-xs font-medium ${
                  status === "ACTIVE"
                    ? "bg-green-100 text-green-800"
                    : status === "BLOCKED"
                      ? "bg-red-100 text-red-800"
                      : "bg-gray-100 text-gray-800"
                }`}
              >
                {status}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Availability</dt>
            <dd className="text-sm text-gray-900">{String(rider.availabilityStatus ?? "-")}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Locality</dt>
            <dd className="text-sm text-gray-900">{String(rider.localityCode ?? "-")}</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Change status</label>
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="INACTIVE">Inactive</option>
            <option value="ACTIVE">Active</option>
            <option value="BLOCKED">Blocked</option>
          </select>
          <button
            type="button"
            onClick={handleUpdateStatus}
            disabled={updating || newStatus === status}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {updating ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
