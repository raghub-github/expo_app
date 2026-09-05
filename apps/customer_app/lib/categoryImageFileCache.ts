/**
 * Download category rail images to the device cache directory and keep a
 * sync map (fastKv / MMKV) of cacheKey → file:// URI.
 *
 * expo-image memory-disk alone still needs a decode tick on cold start;
 * file:// from a previous session paints on the first frame.
 */
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { STORAGE_KEYS } from "@/constants";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { fastGetString, fastSetString, hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";
import { markHeroMediaSessionReady } from "@/lib/prefetchGridFirstHeroMedia";

type FileCacheEntry = {
  remote: string;
  local: string;
};

type FileCacheBlob = Record<string, FileCacheEntry>;

const memory = new Map<string, FileCacheEntry>();
const downloadInFlight = new Map<string, Promise<string | null>>();
let dirReady: Promise<void> | null = null;

function normalizeRemote(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return toAbsoluteImageUrl(raw) ?? raw.trim();
}

function stableFileStem(uri: string): string {
  try {
    const parsed = new URL(uri);
    const key = parsed.searchParams.get("key");
    if (key?.trim()) {
      return key
        .replace(/^\/+/, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .slice(0, 140);
    }
    const path = parsed.pathname.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 100);
    if (path) return path;
  } catch {
    /* fall through */
  }
  let h = 5381;
  for (let i = 0; i < uri.length; i++) h = ((h << 5) + h) ^ uri.charCodeAt(i);
  return `u_${(h >>> 0).toString(16)}`;
}

function parseBlob(raw: string | null | undefined): FileCacheBlob {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as FileCacheBlob;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function seedFromFastKv(): void {
  const blob = parseBlob(fastGetString(STORAGE_KEYS.CATEGORY_IMAGE_FILE_CACHE));
  for (const [k, v] of Object.entries(blob)) {
    if (v?.local && v?.remote) {
      memory.set(k, { remote: v.remote, local: v.local });
      markHeroMediaSessionReady(v.local);
      markHeroMediaSessionReady(v.remote);
    }
  }
}

seedFromFastKv();

function persistSoon(): void {
  const obj: FileCacheBlob = {};
  for (const [k, v] of memory) obj[k] = v;
  try {
    fastSetString(STORAGE_KEYS.CATEGORY_IMAGE_FILE_CACHE, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

async function ensureDir(): Promise<void> {
  if (Platform.OS === "web") return;
  if (!FileSystem.cacheDirectory) return;
  if (!dirReady) {
    dirReady = (async () => {
      const dir = `${FileSystem.cacheDirectory}gm_category_imgs/`;
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
    })().catch(() => {
      dirReady = null;
    });
  }
  await dirReady;
}

/** Sync: local file URI for a category chip when previously downloaded. */
export function getLocalCategoryImageUri(
  cacheKey: string | null | undefined,
  remoteUrl?: string | null
): string | null {
  if (!cacheKey) return null;
  const entry = memory.get(cacheKey);
  if (!entry?.local) return null;
  const remote = normalizeRemote(remoteUrl);
  if (remote && entry.remote && entry.remote !== remote) {
    // Artwork changed — keep old file until re-download finishes, but prefer remote.
    return null;
  }
  return entry.local;
}

export async function hydrateCategoryImageFileCache(): Promise<void> {
  await hydrateFastKvFromAsyncStorage([STORAGE_KEYS.CATEGORY_IMAGE_FILE_CACHE]);
  seedFromFastKv();
}

void hydrateCategoryImageFileCache();

/**
 * Ensure remote artwork is on disk under cacheKey.
 * Returns file:// when ready (or existing), otherwise null.
 */
export async function ensureLocalCategoryImage(
  cacheKey: string | null | undefined,
  remoteUrl: string | null | undefined
): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const key = cacheKey?.trim();
  const remote = normalizeRemote(remoteUrl);
  if (!key || !remote || !FileSystem.cacheDirectory) return null;

  const existing = memory.get(key);
  if (existing?.local && existing.remote === remote) {
    try {
      const info = await FileSystem.getInfoAsync(existing.local);
      if (info.exists) {
        markHeroMediaSessionReady(existing.local);
        return existing.local;
      }
    } catch {
      /* re-download */
    }
  }

  const inflightKey = `${key}::${remote}`;
  const pending = downloadInFlight.get(inflightKey);
  if (pending) return pending;

  const task = (async (): Promise<string | null> => {
    try {
      await ensureDir();
      const stem = stableFileStem(remote);
      const dest = `${FileSystem.cacheDirectory}gm_category_imgs/${stem}`;
      const already = await FileSystem.getInfoAsync(dest);
      if (!already.exists) {
        const result = await FileSystem.downloadAsync(remote, dest);
        if (result.status < 200 || result.status >= 300) return null;
      }
      memory.set(key, { remote, local: dest });
      markHeroMediaSessionReady(dest);
      markHeroMediaSessionReady(remote);
      persistSoon();
      return dest;
    } catch {
      return null;
    } finally {
      downloadInFlight.delete(inflightKey);
    }
  })();

  downloadInFlight.set(inflightKey, task);
  return task;
}

/** Warm local files for a category rail (All + items). */
export function warmLocalCategoryImages(
  entries: Array<{ cacheKey: string; imageUrl: string | null | undefined }>
): void {
  for (const e of entries) {
    if (!e.imageUrl?.trim()) continue;
    void ensureLocalCategoryImage(e.cacheKey, e.imageUrl);
  }
}
