"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { parsePeriod } from "@/lib/period";
import { useDashboardIdentity } from "@/components/auth/DashboardIdentity";
import { wipeCoredashBrowserAuth } from "@/lib/auth/browser-wipe";

export function useCoreData<T>(path: string) {
  const searchParams = useSearchParams();
  const period = parsePeriod(searchParams.get("period"));
  const { userId } = useDashboardIdentity();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${path}?period=${period}`, {
        credentials: "include",
        cache: "no-store",
        headers: { "Cache-Control": "no-store" },
      });
      const json = (await res.json()) as { success: boolean; data?: T; error?: string };
      if (res.status === 401 || res.status === 403) {
        setData(null);
        await wipeCoredashBrowserAuth(userId);
        window.location.replace(res.status === 403 ? "/api/auth/denied" : "/login");
        return;
      }
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || "Failed to load");
      }
      setData(json.data);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [path, period, userId]);

  useEffect(() => {
    setData(null);
  }, [userId, path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading: loading && data == null, error, reload: load, period };
}
