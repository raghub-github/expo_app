import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Image, type ImageStyle } from "expo-image";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { getAppAssetUrl } from "@/store/appAssetsStore";
import { CX } from "@/lib/appAssetKeys";
import {
  isHeroMediaSessionReady,
  markHeroMediaSessionReady,
  prefetchFoodHomeImageUri,
} from "@/lib/prefetchGridFirstHeroMedia";
import {
  getCategoryImageLastGood,
  rememberCategoryImageLastGood,
} from "@/lib/categoryImageLastGood";
import {
  ensureLocalCategoryImage,
  getLocalCategoryImageUri,
} from "@/lib/categoryImageFileCache";

function defaultCategorySource() {
  const url = getAppAssetUrl(CX.common.defaultImage);
  return url ? { uri: url } : null;
}

type Props = {
  imageUrl: string | null;
  style: StyleProp<ImageStyle>;
  contentFit?: "contain" | "cover";
  /** Stable key helps expo-image reuse cached bitmaps across list remounts. */
  cacheKey?: string;
  /**
   * - `soft` (default for home chips): gray circle while loading / on error — never "No Data Found"
   * - `ndf`: legacy CMS default image (merchant/dish empty states)
   */
  fallback?: "soft" | "ndf";
  /** Soft fallback fill. Pass transparent on dark discovery so no grey circle shows. */
  fallbackColor?: string;
};

function UserAppCategoryImageInner({
  imageUrl,
  style,
  contentFit = "contain",
  cacheKey,
  fallback = "soft",
  fallbackColor,
}: Props) {
  const uri = useMemo(
    () => (imageUrl?.trim() ? (toAbsoluteImageUrl(imageUrl) ?? imageUrl.trim()) : null),
    [imageUrl]
  );
  const persisted = getCategoryImageLastGood(cacheKey);
  const localFile = getLocalCategoryImageUri(cacheKey, uri);
  const sessionHit =
    isHeroMediaSessionReady(localFile) ||
    isHeroMediaSessionReady(uri) ||
    isHeroMediaSessionReady(persisted);
  const lastGoodRef = useRef<string | null>(
    localFile ||
      persisted ||
      (sessionHit && uri ? uri : null) ||
      null
  );
  const [failed, setFailed] = useState(false);
  const [localUri, setLocalUri] = useState<string | null>(localFile);
  const [, bump] = useState(0);

  useEffect(() => {
    if (uri) {
      prefetchFoodHomeImageUri(uri);
      void ensureLocalCategoryImage(cacheKey, uri).then((local) => {
        if (local) {
          setLocalUri(local);
          lastGoodRef.current = local;
          markHeroMediaSessionReady(local);
          rememberCategoryImageLastGood(cacheKey, uri);
          setFailed(false);
          bump((n) => n + 1);
        }
      });
      if (isHeroMediaSessionReady(uri) || localFile) {
        lastGoodRef.current = localFile || uri;
        rememberCategoryImageLastGood(cacheKey, uri);
        setFailed(false);
        bump((n) => n + 1);
      }
      return;
    }
    // URL briefly missing (API gap) — keep last-good paint, never blank the chip.
    if (localFile || persisted) {
      lastGoodRef.current = localFile || persisted;
      setFailed(false);
      bump((n) => n + 1);
    }
  }, [uri, cacheKey, persisted, localFile]);

  const displayUri =
    localUri ||
    (!failed && uri) ||
    lastGoodRef.current ||
    persisted ||
    null;

  const placeholderUri =
    (localUri && localUri !== displayUri ? localUri : null) ||
    (lastGoodRef.current && lastGoodRef.current !== displayUri
      ? lastGoodRef.current
      : null) ||
    (persisted && persisted !== displayUri ? persisted : null);

  if (displayUri) {
    return (
      <Image
        source={{ uri: displayUri }}
        style={style}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        recyclingKey={cacheKey ?? displayUri}
        priority="high"
        transition={0}
        placeholder={placeholderUri ? { uri: placeholderUri } : undefined}
        placeholderContentFit={contentFit}
        onLoad={() => {
          lastGoodRef.current = displayUri;
          markHeroMediaSessionReady(displayUri);
          if (uri) rememberCategoryImageLastGood(cacheKey, uri);
          setFailed(false);
        }}
        onDisplay={() => {
          lastGoodRef.current = displayUri;
          markHeroMediaSessionReady(displayUri);
          if (uri) rememberCategoryImageLastGood(cacheKey, uri);
          setFailed(false);
        }}
        onError={() => {
          // Stale/evicted local file — fall back to remote / last-good.
          if (localUri && displayUri === localUri) {
            setLocalUri(null);
            setFailed(false);
            bump((n) => n + 1);
            return;
          }
          if (lastGoodRef.current && lastGoodRef.current !== uri && lastGoodRef.current !== displayUri) {
            setFailed(true);
            bump((n) => n + 1);
            return;
          }
          if (persisted && persisted !== uri && persisted !== displayUri) {
            lastGoodRef.current = persisted;
            setFailed(false);
            bump((n) => n + 1);
            return;
          }
          setFailed(true);
        }}
      />
    );
  }

  if (fallback === "ndf") {
    const ndf = defaultCategorySource();
    if (!ndf) return null;
    return (
      <Image
        source={ndf}
        style={style}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        transition={0}
      />
    );
  }

  // Soft placeholder — keeps chip layout stable without flashing "No Data Found".
  return (
    <View
      style={[
        style as StyleProp<ViewStyle>,
        { backgroundColor: fallbackColor ?? "#EEF2F6" },
      ]}
    />
  );
}

/**
 * Rendered once per list item. Memoised so a parent re-render (a filter
 * toggle, a store-status tick, a bill recalculation) does not walk every
 * mounted instance.
 */
export const UserAppCategoryImage = memo(UserAppCategoryImageInner);
