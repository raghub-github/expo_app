"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { parsePeriod } from "@/lib/period";
import { useDashboardIdentityOptional } from "@/components/auth/DashboardIdentity";
import { wipeCoredashBrowserAuth } from "@/lib/auth/browser-wipe";

const POLL_MS = 120_000;
const FRESH_MS = 45_000;
const FETCH_TIMEOUT_MS = 28_000;
const CACHE_PREFIX = "coredash:data:v2:";

const memory = new Map<string, { at: number; value: unknown }>();
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

function readSession<T>(key: string): { at: number; value: T } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; value?: T };
    if (parsed?.value == null || typeof parsed.at !== "number") return null;
    return { at: parsed.at, value: parsed.value };
  } catch {
    return null;
  }
}

function writeSession<T>(key: string, at: number, value: T) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ at, value }));
  } catch {
    /* quota / private mode */
  }
}

function peekCache<T>(key: string): T | null {
  const mem = memory.get(key);
  if (mem) return mem.value as T;
  const stored = readSession<T>(key);
  if (stored != null) {
    memory.set(key, { at: stored.at, value: stored.value });
    return stored.value;
  }
  return null;
}

function peekCacheMeta(key: string): { at: number; value: unknown } | null {
  const mem = memory.get(key);
  if (mem) return mem;
  const stored = readSession(key);
  if (stored) {
    memory.set(key, stored);
    return stored;
  }
  return null;
}

function putCache<T>(key: string, value: T) {
  const at = Date.now();
  memory.set(key, { at, value });
  writeSession(key, at, value);
  emit(key);
}

function isFresh(key: string) {
  const meta = peekCacheMeta(key);
  return Boolean(meta && Date.now() - meta.at < FRESH_MS);
}

async function fetchCorePath<T>(
  path: string,
  period: string,
  userId: string,
  signal: AbortSignal
): Promise<T> {
  const res = await fetch(`${path}?period=${period}`, {
    credentials: "include",
    cache: "no-store",
    headers: { "Cache-Control": "no-store" },
    signal,
  });
  const text = await res.text();
  let json: { success?: boolean; data?: T; error?: string } = {};
  try {
    json = text ? (JSON.parse(text) as typeof json) : {};
  } catch {
    throw new Error(
      res.status === 504 || res.status === 502
        ? "Server timed out. Retry in a moment."
        : `Invalid server response (${res.status || "error"})`
    );
  }
  if (res.status === 401 || res.status === 403) {
    if (userId) await wipeCoredashBrowserAuth(userId);
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
  const identity = useDashboardIdentityOptional();
  const userId = identity?.userId ?? "";
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

  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!opts?.force && isFresh(key) && dataRef.current != null) return;

      const gen = ++genRef.current;
      if (dataRef.current == null) setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        let req = inflight.get(key) as Promise<T> | undefined;
        if (!req) {
          req = fetchCorePath<T>(path, period, userId, controller.signal).finally(() => {
            inflight.delete(key);
          });
          inflight.set(key, req);
        }
        const next = await req;
        if (gen !== genRef.current) return;
        setData(next);
        putCache(key, next);
        setError(null);
      } catch (err) {
        if (gen !== genRef.current) return;
        if (controller.signal.aborted) {
          if (dataRef.current == null) {
            setError("Request timed out — tap Retry");
          }
          return;
        }
        if (dataRef.current == null) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        window.clearTimeout(timer);
        if (gen === genRef.current) setLoading(false);
      }
    },
    [path, period, userId, key]
  );

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
      genRef.current += 1;
    };
  }, [load, key]);

  return {
    data: resolved,
    loading: loading && resolved == null,
    error,
    reload: () => load({ force: true }),
    period,
  };
}
