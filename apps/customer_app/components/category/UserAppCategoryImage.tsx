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
  const sessionHit = isHeroMediaSessionReady(uri) || isHeroMediaSessionReady(persisted);
  const lastGoodRef = useRef<string | null>(
    (sessionHit && (uri || persisted)) || persisted || (uri && isHeroMediaSessionReady(uri) ? uri : null)
  );
  const [failed, setFailed] = useState(false);
  const [, bump] = useState(0);

  useEffect(() => {
    if (uri) {
      prefetchFoodHomeImageUri(uri);
      if (isHeroMediaSessionReady(uri)) {
        lastGoodRef.current = uri;
        rememberCategoryImageLastGood(cacheKey, uri);
        setFailed(false);
        bump((n) => n + 1);
      }
      return;
    }
    // URL briefly missing (API gap) — keep last-good paint, never blank the chip.
    if (persisted) {
      lastGoodRef.current = persisted;
      setFailed(false);
      bump((n) => n + 1);
    }
  }, [uri, cacheKey, persisted]);

  const displayUri =
    (!failed && uri) || lastGoodRef.current || persisted || null;

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
        onLoad={() => {
          lastGoodRef.current = displayUri;
          markHeroMediaSessionReady(displayUri);
          rememberCategoryImageLastGood(cacheKey, displayUri);
          setFailed(false);
        }}
        onError={() => {
          // Keep last-good paint; only soft-fail when we have nothing cached.
          if (lastGoodRef.current && lastGoodRef.current !== uri) {
            setFailed(true);
            bump((n) => n + 1);
            return;
          }
          if (persisted && persisted !== uri) {
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
