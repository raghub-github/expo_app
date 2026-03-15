'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

const RENEW_ENDPOINT = '/api/media/renew-signed-url';
const MAX_RETRIES = 3;
const CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes (renew before 7-day expiry)

type CacheEntry = { signedUrl: string; expiresAt: number };
const urlCache = new Map<string, CacheEntry>();

function isKey(value: string): boolean {
  const s = value?.trim() || '';
  return s.length > 0 && !s.startsWith('http://') && !s.startsWith('https://') && !s.startsWith('data:') && !s.startsWith('blob:');
}

async function fetchSignedUrlByKey(fileKey: string): Promise<string> {
  const res = await fetch(`${RENEW_ENDPOINT}?fileKey=${encodeURIComponent(fileKey)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Failed to get signed URL (${res.status})`);
  }
  const data = await res.json();
  if (!data?.signedUrl) throw new Error('No signed URL in response');
  return data.signedUrl;
}

async function fetchSignedUrlByUrl(url: string): Promise<string> {
  const res = await fetch(`${RENEW_ENDPOINT}?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Failed to get signed URL (${res.status})`);
  }
  const data = await res.json();
  if (!data?.signedUrl) throw new Error('No signed URL in response');
  return data.signedUrl;
}

function getCachedOrFetch(key: string): Promise<string> {
  const now = Date.now();
  const entry = urlCache.get(key);
  if (entry && entry.expiresAt > now) return Promise.resolve(entry.signedUrl);
  return fetchSignedUrlByKey(key).then((signedUrl) => {
    urlCache.set(key, { signedUrl, expiresAt: now + CACHE_TTL_MS });
    return signedUrl;
  });
}

export type R2ImageProps = {
  /** R2 object key (e.g. menuitems/xyz.jpg) or legacy full URL. Keys are preferred. */
  src: string | null | undefined;
  /** Explicit key for renewal; if not set, derived from src when it looks like a key. */
  fileKey?: string | null;
  alt?: string;
  className?: string;
  /** Fallback image src when all retries fail (e.g. /placeholder.png). */
  fallbackSrc?: string;
  /** Object fit for the img. */
  fit?: 'cover' | 'contain' | 'fill' | 'none';
  [key: string]: unknown;
};

/**
 * R2Image: loads R2 media via signed URLs with auto-renewal.
 * - Treats signed URLs as temporary; uses fileKey to get fresh URLs.
 * - On load error (expired/broken): fetches new signed URL and retries (up to MAX_RETRIES).
 * - Caches renewed URLs briefly to avoid repeated API calls.
 * - Shows fallback image only after retries are exhausted.
 */
export function R2Image({
  src,
  fileKey: fileKeyProp,
  alt = '',
  className,
  fallbackSrc = '/placeholder.png',
  fit = 'cover',
  ...rest
}: R2ImageProps) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  const effectiveKey = fileKeyProp ?? (src && isKey(src) ? src : null);
  const isLegacyUrl = src && !isKey(src) && (src.startsWith('http://') || src.startsWith('https://'));

  const loadUrl = useCallback(async (key: string) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setError(false);
    try {
      const signedUrl = await getCachedOrFetch(key);
      if (mountedRef.current) setDisplayUrl(signedUrl);
    } catch {
      if (mountedRef.current) setError(true);
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!src?.trim()) {
      setDisplayUrl(null);
      setError(false);
      setRetryCount(0);
      return;
    }
    if (effectiveKey) {
      setDisplayUrl(null);
      setError(false);
      setRetryCount(0);
      loadUrl(effectiveKey);
    } else if (isLegacyUrl) {
      setDisplayUrl(src);
      setError(false);
      setRetryCount(0);
    } else {
      setDisplayUrl(null);
      setError(false);
    }
    return () => {
      mountedRef.current = false;
    };
  }, [src, effectiveKey, isLegacyUrl, loadUrl]);

  const handleError = useCallback(() => {
    if (retryCount >= MAX_RETRIES) {
      setDisplayUrl(fallbackSrc);
      setError(true);
      return;
    }
    const doRenew = effectiveKey
      ? fetchSignedUrlByKey(effectiveKey)
      : isLegacyUrl && src
        ? fetchSignedUrlByUrl(src)
        : null;
    if (!doRenew) {
      setDisplayUrl(fallbackSrc);
      setError(true);
      return;
    }
    setRetryCount((c) => c + 1);
    setDisplayUrl(null);
    doRenew
      .then((signedUrl) => {
        if (mountedRef.current) setDisplayUrl(signedUrl);
      })
      .catch(() => {
        if (mountedRef.current) setDisplayUrl(fallbackSrc);
        setError(true);
      });
  }, [effectiveKey, isLegacyUrl, src, retryCount, fallbackSrc]);

  if (!src?.trim()) {
    return (
      <img
        src={fallbackSrc}
        alt={alt}
        className={className}
        style={{ objectFit: fit }}
        {...rest}
      />
    );
  }

  const showFallback = error && displayUrl === fallbackSrc;
  const currentSrc = displayUrl ?? (showFallback ? fallbackSrc : '');

  if (!currentSrc && !showFallback && effectiveKey) {
    return (
      <div className={className} style={{ background: '#f3f4f6', minHeight: 48 }}>
        <span className="sr-only">Loading image</span>
      </div>
    );
  }

  return (
    <img
      src={currentSrc || fallbackSrc}
      alt={alt}
      className={className}
      style={{ objectFit: fit }}
      onError={handleError}
      {...rest}
    />
  );
}

export default R2Image;
