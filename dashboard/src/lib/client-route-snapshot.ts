"use client";

type SnapshotEnvelope<T> = {
  storedAt: number;
  data: T;
};

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadClientSnapshot<T>(key: string, maxAgeMs: number): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = safeParseJson<SnapshotEnvelope<T> | null>(raw);
    if (!parsed || typeof parsed.storedAt !== "number") return null;

    if (Date.now() - parsed.storedAt > maxAgeMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function saveClientSnapshot<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;

  try {
    const envelope: SnapshotEnvelope<T> = { storedAt: Date.now(), data };
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Ignore quota/privacy errors
  }
}

