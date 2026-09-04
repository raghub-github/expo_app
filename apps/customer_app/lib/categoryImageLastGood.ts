/**
 * Persistent last-good URIs for food/grocery category rail chips.
 * Survives remounts and brief API gaps so circles never flash empty/white.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "@/constants";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { markHeroMediaSessionReady } from "@/lib/prefetchGridFirstHeroMedia";

const memory = new Map<string, string>();
let hydrateStarted = false;

function normalizeUri(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return toAbsoluteImageUrl(raw) ?? raw.trim();
}

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
    void AsyncStorage.setItem(STORAGE_KEYS.CATEGORY_IMAGE_LAST_GOOD, JSON.stringify(obj)).catch(
      () => undefined
    );
  }, 400);
}

export async function hydrateCategoryImageLastGood(): Promise<void> {
  if (hydrateStarted) return;
  hydrateStarted = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CATEGORY_IMAGE_LAST_GOOD);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed !== "object") return;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === "string" && typeof v === "string" && v.trim()) {
        memory.set(k, v.trim());
        markHeroMediaSessionReady(v.trim());
      }
    }
  } catch {
    // non-blocking
  }
}

void hydrateCategoryImageLastGood();
