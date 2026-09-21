/**
 * Optional disk cache of the Super Admin slot sound + copy into native filesDir.
 *
 * Killed/background FCM does NOT depend on this. If the URL was never downloaded,
 * the cached file was deleted, or the URL is unavailable, native plays bundled
 * res/raw (then the system ringtone). Opening Manage Communication is never required.
 */
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { persistNativeAlertSound } from "@gatimitra/expo-push-kit";
import { resolvePlayableAlertSoundUrl, resolveAlertSoundUrl } from "@/lib/resolveAlertSoundUrl";

const META_KEY = "merchant_alert_sound_cache_v1";
const FILE_PREFIX = "merchant_order_alert_slot_";

type CacheMeta = {
  url: string;
  localUri: string;
  slot: number;
  updatedAt: number;
};

function cacheDir(): string | null {
  const base = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  return base?.replace(/\/+$/, "") ?? null;
}

function extFromUrl(url: string): string {
  const path = url.split("?")[0] ?? url;
  const m = /\.(mp3|wav|m4a|aac|ogg|caf)$/i.exec(path);
  return m ? m[1]!.toLowerCase() : "mp3";
}

async function readMeta(): Promise<CacheMeta | null> {
  try {
    const raw = await SecureStore.getItemAsync(META_KEY);
    if (!raw?.trim()) return null;
    const j = JSON.parse(raw) as Partial<CacheMeta>;
    if (typeof j.url !== "string" || typeof j.localUri !== "string") return null;
    return {
      url: j.url,
      localUri: j.localUri,
      slot: typeof j.slot === "number" ? j.slot : 0,
      updatedAt: typeof j.updatedAt === "number" ? j.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

async function writeMeta(meta: CacheMeta): Promise<void> {
  await SecureStore.setItemAsync(META_KEY, JSON.stringify(meta));
}

/** Local file URI for the currently selected alert sound, if cached. */
export async function getCachedMerchantAlertSoundUri(): Promise<string | null> {
  const meta = await readMeta();
  if (!meta?.localUri) return null;
  try {
    const info = await FileSystem.getInfoAsync(meta.localUri);
    if (info.exists) return meta.localUri;
  } catch {
    /* missing */
  }
  return null;
}

/**
 * Download (or reuse) the selected slot sound. Returns a local file:// URI.
 */
export async function cacheMerchantAlertSound(args: {
  url: string | null | undefined;
  slot: number;
  enabled?: boolean;
  ringInSilent?: boolean;
  volume01?: number;
}): Promise<string | null> {
  const remote =
    (await resolvePlayableAlertSoundUrl(args.url)) ?? resolveAlertSoundUrl(args.url);
  if (!remote) return null;

  const dir = cacheDir();
  if (!dir) return remote;

  const slot = Math.max(0, Math.min(2, Math.floor(args.slot)));
  const existing = await readMeta();
  if (existing?.url === remote && existing.localUri) {
    try {
      const info = await FileSystem.getInfoAsync(existing.localUri);
      if (info.exists) {
        await persistNativeSelected(existing.localUri, slot, args);
        return existing.localUri;
      }
    } catch {
      /* re-download */
    }
  }

  const dest = `${dir}/${FILE_PREFIX}${slot}.${extFromUrl(remote)}`;
  try {
    const result = await FileSystem.downloadAsync(remote, dest);
    if (result?.uri) {
      await writeMeta({
        url: remote,
        localUri: result.uri,
        slot,
        updatedAt: Date.now(),
      });
      try {
        await persistNativeSelected(result.uri, slot, args);
      } catch {
        /* native optional */
      }
      return result.uri;
    }
  } catch {
    /* fall through */
  }
  return remote;
}

/** True when a local custom alert file is ready (used to mute OS channel sound). */
export async function hasCachedMerchantAlertSound(): Promise<boolean> {
  return (await getCachedMerchantAlertSoundUri()) != null;
}

async function persistNativeSelected(
  fileUri: string,
  slot: number,
  args: { enabled?: boolean; ringInSilent?: boolean; volume01?: number }
): Promise<void> {
  try {
    await persistNativeAlertSound({
      enabled: args.enabled !== false,
      fileUri,
      slot,
      ringInSilent: args.ringInSilent !== false,
      volume01: args.volume01 ?? 1,
    });
  } catch {
    /* native optional */
  }
}
