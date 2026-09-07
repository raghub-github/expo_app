/**
 * Persist CMS app-asset catalog + download the login hero so it still paints
 * when the rider has no network. Image bytes stay on disk; source of truth is
 * still GET /v1/app-assets/rider (no bundled hardcoded hero).
 */
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppAssetItem } from "@/src/services/appAssets.service";
import { fetchRiderAppAssets } from "@/src/services/appAssets.service";
import { useAppAssetsStore } from "@/src/stores/appAssetsStore";
import { RX } from "@/src/lib/appAssetKeys";
import { toAbsoluteImageUrl } from "@/src/utils/mediaUrl";

const CATALOG_KEY = "gm.rider.app_assets.v1";
const HERO_META_KEY = "gm.rider.auth_hero_file.v1";
const HERO_FILE_NAME = "gm-cms-auth-hero.img";

type CatalogBlob = {
  assets: Record<string, AppAssetItem>;
  cachedAt: number;
};

type HeroMeta = {
  key: string;
  remote: string;
  local: string;
};

let bootstrapPromise: Promise<void> | null = null;

async function loadFileSystem(): Promise<typeof import("expo-file-system/legacy") | null> {
  if (Platform.OS === "web") return null;
  try {
    return await import("expo-file-system/legacy");
  } catch {
    return null;
  }
}

function parseCatalog(raw: string | null): Record<string, AppAssetItem> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CatalogBlob;
    if (!parsed?.assets || typeof parsed.assets !== "object") return null;
    return Object.keys(parsed.assets).length > 0 ? parsed.assets : null;
  } catch {
    return null;
  }
}

function heroRemoteUrl(assets: Record<string, AppAssetItem>): string | null {
  const item = assets[RX.auth.hero];
  if (!item) return null;
  const raw = item.proxyUrl?.trim() || item.url?.trim() || "";
  if (!raw) return null;
  return toAbsoluteImageUrl(raw) ?? raw;
}

async function fileExists(uri: string): Promise<boolean> {
  const FS = await loadFileSystem();
  if (!FS) return false;
  try {
    const info = await FS.getInfoAsync(uri);
    return Boolean(info.exists);
  } catch {
    return false;
  }
}

async function persistCatalog(assets: Record<string, AppAssetItem>): Promise<void> {
  if (Object.keys(assets).length === 0) return;
  try {
    await AsyncStorage.setItem(
      CATALOG_KEY,
      JSON.stringify({ assets, cachedAt: Date.now() } satisfies CatalogBlob),
    );
  } catch {
    /* quota */
  }
}

async function hydrateCatalog(): Promise<Record<string, AppAssetItem> | null> {
  try {
    const cached = parseCatalog(await AsyncStorage.getItem(CATALOG_KEY));
    if (cached) {
      useAppAssetsStore.getState().setAssets(cached);
      return cached;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function hydrateHeroFile(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(HERO_META_KEY);
    if (!raw) return;
    const meta = JSON.parse(raw) as HeroMeta;
    if (!meta?.local || meta.key !== RX.auth.hero) return;
    if (await fileExists(meta.local)) {
      useAppAssetsStore.getState().setLocalFile(RX.auth.hero, meta.local);
    }
  } catch {
    /* ignore */
  }
}

async function downloadHero(remote: string): Promise<string | null> {
  const FS = await loadFileSystem();
  const dir = FS?.documentDirectory;
  if (!FS || !dir || !remote.startsWith("http")) return null;
  const dest = `${dir}${HERO_FILE_NAME}`;
  try {
    const result = await FS.downloadAsync(remote, dest);
    if (result.status >= 200 && result.status < 300 && result.uri) {
      return result.uri;
    }
  } catch {
    /* keep previous file */
  }
  return (await fileExists(dest)) ? dest : null;
}

async function cacheHeroFromAssets(assets: Record<string, AppAssetItem>): Promise<void> {
  const remote = heroRemoteUrl(assets);
  if (!remote) return;

  let previous: HeroMeta | null = null;
  try {
    const raw = await AsyncStorage.getItem(HERO_META_KEY);
    previous = raw ? (JSON.parse(raw) as HeroMeta) : null;
  } catch {
    previous = null;
  }

  if (
    previous?.local &&
    previous.remote === remote &&
    (await fileExists(previous.local))
  ) {
    useAppAssetsStore.getState().setLocalFile(RX.auth.hero, previous.local);
    return;
  }

  const local = await downloadHero(remote);
  if (!local) {
    if (previous?.local && (await fileExists(previous.local))) {
      useAppAssetsStore.getState().setLocalFile(RX.auth.hero, previous.local);
    }
    return;
  }

  useAppAssetsStore.getState().setLocalFile(RX.auth.hero, local);
  try {
    await AsyncStorage.setItem(
      HERO_META_KEY,
      JSON.stringify({ key: RX.auth.hero, remote, local } satisfies HeroMeta),
    );
  } catch {
    /* ignore */
  }
}

/** Hydrate disk cache, then refresh from CMS. Safe to call from layout + prefetch. */
export function bootstrapRiderAppAssets(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    await hydrateCatalog();
    await hydrateHeroFile();
    try {
      const res = await fetchRiderAppAssets();
      const assets = res.assets ?? {};
      if (Object.keys(assets).length === 0) return;
      useAppAssetsStore.getState().setAssets(assets);
      await persistCatalog(assets);
      await cacheHeroFromAssets(assets);
    } catch {
      const existing = useAppAssetsStore.getState().assets;
      if (Object.keys(existing).length > 0) {
        await cacheHeroFromAssets(existing);
      }
    }
  })();
  return bootstrapPromise;
}
