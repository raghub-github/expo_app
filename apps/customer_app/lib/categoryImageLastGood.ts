/**
 * Persistent last-good URIs for food/grocery category rail chips.
 * Survives remounts and brief API gaps so circles never flash empty/white.
 *
 * Uses fastKv (MMKV when available) so cold start can paint from cache
 * synchronously — AsyncStorage alone is too late for first frame.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "@/constants";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { markHeroMediaSessionReady } from "@/lib/prefetchGridFirstHeroMedia";
import { fastGetString, fastSetString, hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";

const memory = new Map<string, string>();
let hydrateStarted = false;

function normalizeUri(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return toAbsoluteImageUrl(raw) ?? raw.trim();
}

function ingestBlob(parsed: Record<string, string>): void {
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof k === "string" && typeof v === "string" && v.trim()) {
      const absolute = normalizeUri(v) ?? v.trim();
      memory.set(k, absolute);
      markHeroMediaSessionReady(absolute);
    }
  }
}

/** Sync seed from MMKV / in-memory fastKv (no await). */
function seedFromFastKv(): void {
  try {
    const raw = fastGetString(STORAGE_KEYS.CATEGORY_IMAGE_LAST_GOOD);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed !== "object") return;
    ingestBlob(parsed);
  } catch {
    // non-blocking
  }
}

seedFromFastKv();

export function getCategoryImageLastGood(cacheKey: string | null | undefined): string | null {
  if (!cacheKey) return null;
  return memory.get(cacheKey) ?? null;
}

export function rememberCategoryImageLastGood(
  cacheKey: string | null | undefined,
  uri: string | null | undefined
): void {
  const key = cacheKey?.trim();
  const absolute = normalizeUri(uri);
  if (!key || !absolute) return;
  if (memory.get(key) === absolute) {
    markHeroMediaSessionReady(absolute);
    return;
  }
  memory.set(key, absolute);
  markHeroMediaSessionReady(absolute);
  void persistSoon();
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistSoon(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const obj: Record<string, string> = {};
    for (const [k, v] of memory) obj[k] = v;
    const raw = JSON.stringify(obj);
    try {
      fastSetString(STORAGE_KEYS.CATEGORY_IMAGE_LAST_GOOD, raw);
    } catch {
      void AsyncStorage.setItem(STORAGE_KEYS.CATEGORY_IMAGE_LAST_GOOD, raw).catch(() => undefined);
    }
  }, 200);
}

export async function hydrateCategoryImageLastGood(): Promise<void> {
  if (hydrateStarted) return;
  hydrateStarted = true;
  // Expo Go: pull AsyncStorage into fastKv memory, then re-seed.
  await hydrateFastKvFromAsyncStorage([STORAGE_KEYS.CATEGORY_IMAGE_LAST_GOOD]);
  seedFromFastKv();
  if (memory.size > 0) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CATEGORY_IMAGE_LAST_GOOD);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed !== "object") return;
    ingestBlob(parsed);
    try {
      fastSetString(STORAGE_KEYS.CATEGORY_IMAGE_LAST_GOOD, raw);
    } catch {
      /* ignore */
    }
  } catch {
    // non-blocking
  }
}

void hydrateCategoryImageLastGood();
