import { useEffect, useMemo, useState } from "react";
import { Image, type ImageStyle } from "expo-image";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { getAppAssetUrl } from "@/store/appAssetsStore";
import { CX } from "@/lib/appAssetKeys";

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
};

export function UserAppCategoryImage({
  imageUrl,
  style,
  contentFit = "contain",
  cacheKey,
  fallback = "soft",
}: Props) {
  const [failed, setFailed] = useState(false);
  const uri = useMemo(
    () => (imageUrl?.trim() ? (toAbsoluteImageUrl(imageUrl) ?? imageUrl) : null),
    [imageUrl]
  );

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={style}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        recyclingKey={cacheKey ?? uri}
        priority="high"
        transition={0}
        onError={() => setFailed(true)}
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
  return <View style={[style as StyleProp<ViewStyle>, { backgroundColor: "#EEF2F6" }]} />;
}
