/**
 * Disk cache for merchant welcome slides, keyed by CMS asset key (not signed URL).
 * Survives force-close and signed-URL rotation.
 */
import * as FileSystem from "expo-file-system/legacy";

const IN_FLIGHT = new Map<string, Promise<string | null>>();
const MEM = new Map<string, string>();

function localPathForKey(assetKey: string): string | null {
  const base = FileSystem.documentDirectory;
  if (!base) return null;
  let hash = 0;
  for (let i = 0; i < assetKey.length; i += 1) {
    hash = (hash * 31 + assetKey.charCodeAt(i)) | 0;
  }
  return `${base}mx-welcome-${Math.abs(hash)}.img`;
}

export function peekWelcomeSlideLocalUri(assetKey: string): string | null {
  return MEM.get(assetKey) ?? null;
}

export async function ensureWelcomeSlideLocal(
  assetKey: string,
  remoteUrl: string | null | undefined
): Promise<string | null> {
  const mem = MEM.get(assetKey);
  if (mem) return mem;

  const target = localPathForKey(assetKey);
  if (!target) return null;

  try {
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists) {
      MEM.set(assetKey, target);
      return target;
    }
  } catch {
    /* miss */
  }

  const remote = remoteUrl?.trim();
  if (!remote) return null;

  const pending = IN_FLIGHT.get(assetKey);
  if (pending) return pending;

  const task = (async () => {
    try {
      const result = await FileSystem.downloadAsync(remote, target);
      if (result.status >= 200 && result.status < 300 && result.uri) {
        MEM.set(assetKey, result.uri);
        return result.uri;
      }
    } catch {
      /* fall through */
    }
    return null;
  })().finally(() => {
    IN_FLIGHT.delete(assetKey);
  });

  IN_FLIGHT.set(assetKey, task);
  return task;
}

export function warmWelcomeSlidesLocal(
  pairs: Array<{ assetKey: string; url: string | null }>
): void {
  for (const { assetKey, url } of pairs) {
    if (!url) continue;
    void ensureWelcomeSlideLocal(assetKey, url);
  }
}
