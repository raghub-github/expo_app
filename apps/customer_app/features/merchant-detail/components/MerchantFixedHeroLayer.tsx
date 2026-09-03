import React, { useLayoutEffect } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { Image } from "expo-image";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HEADER_IMAGE_HEIGHT, SCREEN_WIDTH_EXPORT } from "../constants/layout";
import { prefetchMerchantHeroImageUri } from "@/lib/merchantHeroWarmCache";
import { markHeroMediaSessionReady } from "@/lib/prefetchGridFirstHeroMedia";

const HERO_SHELL = GatiMitraColors.softBackground;

type Props = {
  uri: string | null;
  merchantId: string;
};

/**
 * Pinned store hero — sibling of FlashList (never in ListHeader) so scroll never remounts it.
 * Soft/white shell under an always-visible banner (cache hits must not wait on onLoad).
 */
export const MerchantFixedHeroLayer = React.memo(
  function MerchantFixedHeroLayer({ uri, merchantId }: Props) {
    useLayoutEffect(() => {
      if (!uri) return;
      prefetchMerchantHeroImageUri(uri);
    }, [uri]);

    return (
      <View style={styles.layer} pointerEvents="none" collapsable={false}>
        <View style={styles.shell} />
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            recyclingKey={`merchant-hero-${merchantId}`}
            priority="high"
            allowDownscaling
            onLoad={() => markHeroMediaSessionReady(uri)}
          />
        ) : null}
      </View>
    );
  },
  (prev, next) => prev.uri === next.uri && prev.merchantId === next.merchantId
);

const styles = StyleSheet.create({
  layer: {
    height: HEADER_IMAGE_HEIGHT,
    width: SCREEN_WIDTH_EXPORT,
    overflow: "hidden",
    backgroundColor: HERO_SHELL,
    ...(Platform.OS === "android" ? { elevation: 0 } : {}),
  },
  shell: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: HERO_SHELL,
  },
  image: {
    width: SCREEN_WIDTH_EXPORT,
    height: HEADER_IMAGE_HEIGHT,
  },
});
