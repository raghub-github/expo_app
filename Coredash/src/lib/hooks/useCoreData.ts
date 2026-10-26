"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { parsePeriod } from "@/lib/period";
import { useDashboardIdentity } from "@/components/auth/DashboardIdentity";
import { wipeCoredashBrowserAuth } from "@/lib/auth/browser-wipe";

const POLL_MS = 20_000;
const CACHE_PREFIX = "coredash:data:v1:";

const memory = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();
const inflight = new Map<string, Promise<unknown>>();

function cacheKey(path: string, period: string) {
  return `${CACHE_PREFIX}${path}:${period}`;
}

function emit(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

function subscribeKey(key: string, onChange: () => void) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(onChange);
  return () => {
    set?.delete(onChange);
  };
}

function readSession<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeSession<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

function peekCache<T>(key: string): T | null {
  if (memory.has(key)) return memory.get(key) as T;
  const stored = readSession<T>(key);
  if (stored != null) memory.set(key, stored);
  return stored;
}

function putCache<T>(key: string, value: T) {
  memory.set(key, value);
  writeSession(key, value);
  emit(key);
}

async function fetchCorePath<T>(path: string, period: string, userId: string): Promise<T> {
  const res = await fetch(`${path}?period=${period}`, {
    credentials: "include",
    cache: "no-store",
    headers: { "Cache-Control": "no-store" },
  });
  const json = (await res.json()) as { success: boolean; data?: T; error?: string };
  if (res.status === 401 || res.status === 403) {
    await wipeCoredashBrowserAuth(userId);
    window.location.replace(res.status === 403 ? "/api/auth/denied" : "/login");
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Failed to load");
  }
  return json.data;
}

export function useCoreData<T>(path: string) {
  const searchParams = useSearchParams();
  const period = parsePeriod(searchParams.get("period"));
  const { userId } = useDashboardIdentity();
  const key = cacheKey(path, period);
  const cached = useSyncExternalStore(
    (onChange) => subscribeKey(key, onChange),
    () => peekCache<T>(key),
    () => null
  );
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(() => cached == null);
  const [error, setError] = useState<string | null>(null);
  const resolved = data ?? cached;
  const dataRef = useRef<T | null>(resolved);
  dataRef.current = resolved;
  const genRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++genRef.current;
    if (dataRef.current == null) setLoading(true);
    setError(null);
    try {
      let req = inflight.get(key) as Promise<T> | undefined;
      if (!req) {
        req = fetchCorePath<T>(path, period, userId).finally(() => inflight.delete(key));
        inflight.set(key, req);
      }
      const next = await req;
      if (gen !== genRef.current) return;
      setData(next);
      putCache(key, next);
      setError(null);
    } catch (err) {
      if (gen !== genRef.current) return;
      if (dataRef.current == null) {
        setError(err instanceof Error ? err.message : "Failed to load");
      }
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [path, period, userId, key]);

  useEffect(() => {
    void load();

    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !inflight.has(key)) void load();
    }, POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(timer);
    };
  }, [load, key]);

  return { data: resolved, loading: loading && resolved == null, error, reload: load, period };
}
