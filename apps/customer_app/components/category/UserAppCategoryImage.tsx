import { useEffect, useMemo, useState } from "react";
import { Image, type ImageStyle } from "expo-image";
import type { StyleProp } from "react-native";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

const DEFAULT_CATEGORY_IMAGE = require("../../public/img/ndf.png");

type Props = {
  imageUrl: string | null;
  style: StyleProp<ImageStyle>;
  contentFit?: "contain" | "cover";
  /** Stable key helps expo-image reuse cached bitmaps across list remounts. */
  cacheKey?: string;
};

export function UserAppCategoryImage({
  imageUrl,
  style,
  contentFit = "contain",
  cacheKey,
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
        transition={0}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <Image
      source={DEFAULT_CATEGORY_IMAGE}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      transition={0}
    />
  );
}
