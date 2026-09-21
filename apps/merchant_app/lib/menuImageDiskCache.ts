/**
 * Durable menu-item image cache.
 *
 * Keyed by attachment object key (or pathname), NEVER the full URL.
 * Signed query strings and LAN IP heals (`10.84` → `10.237`) must not
 * re-download or flash a spinner.
 *
 * Files live in documentDirectory so they survive force-close.
 */
import * as FileSystem from "expo-file-system/legacy";
import { resolveUrlForDevice } from "@/config/env";
import { resolveImageUrl } from "@/services/outletApi";

const INDEX_FILE = "menu_image_index_v1.json";
const FILE_PREFIX = "mx-menu-img-";
const MAX_INDEX = 400;

type IndexRow = { file: string; savedAt: number };

const MEM = new Map<string, string>();
const IN_FLIGHT = new Map<string, Promise<string | null>>();
let indexHydrated = false;
let hydratePromise: Promise<void> | null = null;

function isLocalUri(uri: string): boolean {
  const u = uri.toLowerCase();
  return u.startsWith("file://") || u.startsWith("content://") || u.startsWith("data:");
}

function hashKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return String(Math.abs(hash));
}

function cacheDir(): string | null {
  const base = FileSystem.documentDirectory;
  return base ? `${base}menu-images/` : null;
}

function indexUri(): string | null {
  const base = FileSystem.documentDirectory;
  return base ? `${base}${INDEX_FILE}` : null;
}

function fileUriForKey(stableKey: string): string | null {
  const dir = cacheDir();
  if (!dir) return null;
  return `${dir}${FILE_PREFIX}${hashKey(stableKey)}.img`;
}

/** Identity that survives host/IP/signature rotation. */
export function stableMenuImageCacheKey(uri: string | null | undefined): string | null {
  if (!uri?.trim()) return null;
  const trimmed = uri.trim();
  if (isLocalUri(trimmed)) return trimmed;
  try {
    const absolute = trimmed.includes("://")
      ? trimmed
      : `http://local${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
    const u = new URL(absolute);
    const att = u.searchParams.get("key");
    if (att) return `att:${decodeURIComponent(att)}`;
    const path = u.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
    if (path) return `path:${path}`;
  } catch {
    /* fall through */
  }
  return trimmed.split("?")[0] || null;
}

export function resolveRenderableUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  return resolveImageUrl(uri) ?? resolveUrlForDevice(uri);
}

function remember(stableKey: string, local: string): void {
  if (MEM.size >= MAX_INDEX) {
    const first = MEM.keys().next().value;
    if (first != null) MEM.delete(first);
  }
  MEM.set(stableKey, local);
}

function persistIndexSoon(): void {
  const uri = indexUri();
  if (!uri) return;
  const blob: Record<string, IndexRow> = {};
  const now = Date.now();
  for (const [key, file] of MEM) {
    blob[key] = { file, savedAt: now };
  }
  void FileSystem.writeAsStringAsync(uri, JSON.stringify(blob)).catch(() => undefined);
}

export function peekMenuImageLocal(uri: string | null | undefined): string | null {
  const resolved = resolveRenderableUri(uri);
  if (!resolved) return null;
  if (isLocalUri(resolved)) return resolved;
  const key = stableMenuImageCacheKey(resolved);
  if (!key) return null;
  return MEM.get(key) ?? null;
}

export async function hydrateMenuImageDiskCache(): Promise<void> {
  if (indexHydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const uri = indexUri();
    const dir = cacheDir();
    if (dir) {
      try {
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) {
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        }
      } catch {
        /* ignore */
      }
    }
    if (!uri) {
      indexHydrated = true;
      return;
    }
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        indexHydrated = true;
        return;
      }
      const raw = await FileSystem.readAsStringAsync(uri);
      const parsed = JSON.parse(raw) as Record<string, IndexRow>;
      if (parsed && typeof parsed === "object") {
        for (const [key, row] of Object.entries(parsed)) {
          if (!row?.file) continue;
          try {
            const fileInfo = await FileSystem.getInfoAsync(row.file);
            if (fileInfo.exists) remember(key, row.file);
          } catch {
            /* stale path */
          }
        }
      }
    } catch {
      /* corrupt index */
    } finally {
      indexHydrated = true;
      hydratePromise = null;
    }
  })();
  return hydratePromise;
}

function needsAuthDownload(uri: string): boolean {
  const u = uri.toLowerCase();
  return (
    u.includes("/attachments/proxy?") ||
    u.includes("/v1/attachments/") ||
    u.includes("/api/attachments/")
  );
}

/**
 * Return a local file:// for this image. Reuses disk when the attachment
 * key is unchanged. Downloads only when the key is new or the file is gone.
 */
export async function ensureMenuImageLocal(
  uri: string | null | undefined,
  token?: string | null
): Promise<string | null> {
  const resolved = resolveRenderableUri(uri);
  if (!resolved) return null;
  if (isLocalUri(resolved)) {
    remember(resolved, resolved);
    return resolved;
  }

  const key = stableMenuImageCacheKey(resolved);
  if (!key) return null;

  const mem = MEM.get(key);
  if (mem) return mem;

  await hydrateMenuImageDiskCache();
  const afterHydrate = MEM.get(key);
  if (afterHydrate) return afterHydrate;

  const pending = IN_FLIGHT.get(key);
  if (pending) return pending;

  const target = fileUriForKey(key);
  if (!target) return null;

  const task = (async () => {
    try {
      const existing = await FileSystem.getInfoAsync(target);
      if (existing.exists) {
        remember(key, target);
        persistIndexSoon();
        return target;
      }
    } catch {
      /* download */
    }

    const dir = cacheDir();
    if (dir) {
      try {
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) {
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        }
      } catch {
        /* continue */
      }
    }

    try {
      const result = await FileSystem.downloadAsync(resolved, target, {
        headers:
          token && needsAuthDownload(resolved)
            ? { Authorization: `Bearer ${token}` }
            : undefined,
      });
      if (result.status >= 200 && result.status < 300 && result.uri) {
        remember(key, result.uri);
        persistIndexSoon();
        return result.uri;
      }
    } catch {
      /* fall through */
    }
    return null;
  })().finally(() => {
    IN_FLIGHT.delete(key);
  });

  IN_FLIGHT.set(key, task);
  return task;
}

export function prefetchMenuImages(
  uris: Array<string | null | undefined>,
  token?: string | null
): void {
  for (const uri of uris) {
    if (!uri) continue;
    void ensureMenuImageLocal(uri, token);
  }
}

export { needsAuthDownload, isLocalUri };
