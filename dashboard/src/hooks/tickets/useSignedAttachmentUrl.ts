"use client";

import { useState, useEffect, useCallback } from "react";

const RENEW_BEFORE_MS = 5 * 60 * 1000; // renew 5 min before expiry

export function useSignedAttachmentUrl(storageKey: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchUrl = useCallback(async () => {
    if (!storageKey) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/tickets/attachment-url?storageKey=${encodeURIComponent(storageKey)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!data.success || !data.data?.url) {
        setError(data.error || "Failed to load");
        setUrl(null);
        return;
      }
      setUrl(data.data.url);
      setExpiresAt(data.data.expiresAt ? new Date(data.data.expiresAt).getTime() : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setUrl(null);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) {
      setUrl(null);
      setExpiresAt(null);
      return;
    }
    fetchUrl();
  }, [storageKey, fetchUrl]);

  useEffect(() => {
    if (!expiresAt || !storageKey) return;
    const now = Date.now();
    const renewAt = expiresAt - RENEW_BEFORE_MS;
    if (now >= renewAt) {
      fetchUrl();
      return;
    }
    const t = setTimeout(fetchUrl, renewAt - now);
    return () => clearTimeout(t);
  }, [expiresAt, storageKey, fetchUrl]);

  return { url, error, refresh: fetchUrl };
}
