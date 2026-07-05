import React, { useLayoutEffect } from "react";
import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HEADER_IMAGE_HEIGHT, SCREEN_WIDTH_EXPORT } from "../constants/layout";
import { prefetchMerchantHeroImageUri } from "@/lib/merchantHeroWarmCache";

type Props = {
  uri: string | null;
  merchantId: string;
  /** Draw banner behind translucent status bar (immersive hero). */
  statusBarInset?: number;
};

/** Non-virtualized hero — mounts once in ListHeader, shows cached banner immediately. */
export const MerchantHeroBannerRow = React.memo(
  function MerchantHeroBannerRow({ uri, merchantId, statusBarInset = 0 }: Props) {
    useLayoutEffect(() => {
      if (!uri) return;
      prefetchMerchantHeroImageUri(uri);
    }, [uri]);

    const bleed = Math.max(0, statusBarInset);
    const totalHeight = HEADER_IMAGE_HEIGHT + bleed;

    return (
      <View
        style={[styles.wrap, { height: totalHeight, marginTop: bleed > 0 ? -bleed : 0 }]}
        collapsable={false}
        pointerEvents="none"
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={[styles.image, { height: totalHeight }]}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            recyclingKey={uri}
            priority="high"
            allowDownscaling
          />
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>
    );
  },
  (prev, next) =>
    prev.uri === next.uri &&
    prev.merchantId === next.merchantId &&
    prev.statusBarInset === next.statusBarInset
);

const styles = StyleSheet.create({
  wrap: {
    height: HEADER_IMAGE_HEIGHT,
    width: SCREEN_WIDTH_EXPORT,
    overflow: "hidden",
    backgroundColor: GatiMitraColors.mintSoft,
  },
  image: {
    width: SCREEN_WIDTH_EXPORT,
    height: HEADER_IMAGE_HEIGHT,
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: GatiMitraColors.mintSoft,
  },
});
