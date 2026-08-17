'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { extractMenuImageR2Key, resolvePartnerMenuImageSrc } from '@/lib/menu-image-url';

const RENEW_ENDPOINT = '/api/media/renew-signed-url';
const MAX_RETRIES = 3;
const CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes (renew before 7-day expiry)

type CacheEntry = { signedUrl: string; expiresAt: number };
const urlCache = new Map<string, CacheEntry>();

/** Raw S3/R2 object key (e.g. docs/merchants/.../file.jpg) — not a URL path. */
function isKey(value: string): boolean {
  const s = value?.trim() || '';
  if (!s) return false;
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:') || s.startsWith('blob:')) return false;
  // App routes like /api/attachments/proxy?key=... were wrongly treated as keys and broke renew-signed-url.
  if (s.startsWith('/')) return false;
  return true;
}

/** Same-origin attachment proxy — use as img src directly (cookies/session); no signed-URL round trip. */
function isAttachmentProxyUrl(value: string): boolean {
  const t = value.trim();
  if (t.startsWith('/api/attachments/proxy') || t.startsWith('/v1/attachments/proxy')) return true;
  // Stored without leading slash — invalid as img src unless normalized
  if (/^api\/attachments\/proxy/i.test(t)) return true;
  if (t.startsWith('http://') || t.startsWith('https://')) {
    try {
      const u = new URL(t);
      return u.pathname.includes('/attachments/proxy');
    } catch {
      return false;
    }
  }
  return false;
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

function proxyUrlForKey(key: string, bust?: number): string {
  const q = bust != null ? `&r=${bust}` : '';
  return `/api/attachments/proxy?key=${encodeURIComponent(key)}${q}`;
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
  /** When true (default), defer loading until near viewport. */
  lazy?: boolean;
  [key: string]: unknown;
};

/**
 * R2Image: loads R2 media via attachment proxy (preferred) or signed URLs.
 * - Keys and proxy URLs resolve to `/api/attachments/proxy?key=…` (CDN when configured).
 * - On load error: extract key → cache-bust proxy → renew-signed-url (up to MAX_RETRIES).
 * - Shows fallback image only after retries are exhausted.
 */
export function R2Image({
  src,
  fileKey: fileKeyProp,
  alt = '',
  className,
  // Inline 1x1 transparent PNG to avoid 404s when fallback is used
  fallbackSrc = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2SP0YAAAAASUVORK5CYII=',
  fit = 'cover',
  lazy = true,
  ...rest
}: R2ImageProps) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [inView, setInView] = useState(!lazy);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const keyFromSrc = src?.trim() ? extractMenuImageR2Key(src.trim()) : null;
  const effectiveKey =
    fileKeyProp && String(fileKeyProp).trim()
      ? String(fileKeyProp).trim()
      : src && isKey(src)
        ? src.trim()
        : keyFromSrc;
  const isLegacyUrl =
    !!src &&
    !isAttachmentProxyUrl(src) &&
    !isKey(src) &&
    (src.startsWith('http://') || src.startsWith('https://'));
  /** Local preview from FileReader / URL.createObjectURL — use as-is (no R2 fetch). */
  const isInlineSrc =
    !!src && (src.startsWith('data:') || src.startsWith('blob:'));

  const loadUrl = useCallback(async (key: string) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setError(false);
    try {
      // Prefer same-origin proxy (backend fallback inside the route) over signed URLs.
      if (mountedRef.current) setDisplayUrl(proxyUrlForKey(key));
    } catch {
      try {
        const signedUrl = await getCachedOrFetch(key);
        if (mountedRef.current) setDisplayUrl(signedUrl);
      } catch {
        if (mountedRef.current) setError(true);
      }
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!lazy || inView) return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [lazy, inView]);

  useEffect(() => {
    mountedRef.current = true;
    if (!inView) return;
    if (!src?.trim()) {
      setDisplayUrl(null);
      setError(false);
      setRetryCount(0);
      return;
    }
    const trimmedSrc = src.trim();
    const resolved = resolvePartnerMenuImageSrc(trimmedSrc);
    // Prefer CDN / same-origin attachment proxy — no signed-URL round-trip.
    // Bug: keys resolved to `/api/attachments/proxy?key=…` were skipped because
    // only the raw `src` was checked for proxy/http, so renew-signed-url ran and
    // often failed → placeholder icons on Menu.
    if (
      resolved &&
      (isAttachmentProxyUrl(resolved) ||
        resolved.startsWith('http://') ||
        resolved.startsWith('https://') ||
        resolved.startsWith('data:') ||
        resolved.startsWith('blob:'))
    ) {
      setDisplayUrl(resolved);
      setError(false);
      setRetryCount(0);
      return;
    }
    if (effectiveKey) {
      setDisplayUrl(null);
      setError(false);
      setRetryCount(0);
      loadUrl(effectiveKey);
    } else if (isLegacyUrl || isInlineSrc) {
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
  }, [src, effectiveKey, isLegacyUrl, isInlineSrc, loadUrl, inView]);

  const handleError = useCallback(() => {
    if (retryCount >= MAX_RETRIES) {
      setDisplayUrl(fallbackSrc);
      setError(true);
      return;
    }
    const key =
      effectiveKey ||
      (src?.trim() ? extractMenuImageR2Key(src.trim()) : null) ||
      (displayUrl ? extractMenuImageR2Key(displayUrl) : null);

    const nextRetry = retryCount + 1;
    setRetryCount(nextRetry);

    // 1) Cache-bust attachment proxy (triggers backend R2 fallback server-side).
    // 2) Else renew signed URL by key / legacy URL.
    const attempt =
      key != null
        ? Promise.resolve(proxyUrlForKey(key, nextRetry)).then((proxy) => {
            if (nextRetry <= 1) return proxy;
            return fetchSignedUrlByKey(key).catch(() => proxy);
          })
        : isLegacyUrl && src && !isAttachmentProxyUrl(src)
          ? fetchSignedUrlByUrl(src)
          : null;

    if (!attempt) {
      setDisplayUrl(fallbackSrc);
      setError(true);
      return;
    }

    setDisplayUrl(null);
    attempt
      .then((signedUrl) => {
        if (mountedRef.current) setDisplayUrl(signedUrl);
      })
      .catch(() => {
        if (mountedRef.current) {
          setDisplayUrl(fallbackSrc);
          setError(true);
        }
      });
  }, [effectiveKey, isLegacyUrl, src, retryCount, fallbackSrc, displayUrl]);

  if (!src?.trim()) {
    return (
      <img
        src={fallbackSrc}
        alt={alt}
        className={className}
        style={{ objectFit: fit }}
        loading={lazy ? 'lazy' : 'eager'}
        decoding="async"
        {...rest}
      />
    );
  }

  if (lazy && !inView) {
    return (
      <div
        ref={rootRef}
        className={className}
        style={{ background: '#f3f4f6', minHeight: 48 }}
        aria-hidden
      />
    );
  }

  const showFallback = error && displayUrl === fallbackSrc;
  const currentSrc = displayUrl ?? (showFallback ? fallbackSrc : '');

  if (!currentSrc && !showFallback && effectiveKey) {
    return (
      <div ref={rootRef} className={className} style={{ background: '#f3f4f6', minHeight: 48 }}>
        <span className="sr-only">Loading image</span>
      </div>
    );
  }

  const img = (
    <img
      src={currentSrc || fallbackSrc}
      alt={alt}
      className={className}
      style={{ objectFit: fit }}
      loading={lazy ? 'lazy' : 'eager'}
      decoding="async"
      onError={handleError}
      {...rest}
    />
  );

  return img;
}

export default R2Image;
