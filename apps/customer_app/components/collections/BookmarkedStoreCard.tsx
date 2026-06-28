import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { BookmarkedMerchantRow } from "@/lib/bookmarkedMerchants";
import { resolveMerchantBannerUri } from "@/lib/merchantBanner";
import { formatMerchantDeliveryTime } from "@/lib/merchantDeliveryTime";
import { setStoreBookmark } from "@/services/merchant.service";
import { useStoreBookmarkMutations } from "@/hooks/useStoreBookmarks";
import { MerchantRatingBadge } from "@/components/home/MerchantRatingBadge";
import { GatiMitraColors } from "@/constants/gatimitra";
import { AppAssetImage } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
const BOOKMARK_GREEN = GatiMitraColors.primaryMint;

type Props = {
  merchant: BookmarkedMerchantRow;
  onRemoved?: (storeId: string) => void;
};

export function BookmarkedStoreCard({ merchant, onRemoved }: Props) {
  const router = useRouter();
  const { syncBookmark } = useStoreBookmarkMutations();
  const [removing, setRemoving] = useState(false);

  const imageUri = resolveMerchantBannerUri(merchant);
  const offerText = merchant.offerText?.trim();

  const handleOpen = useCallback(() => {
    router.push({ pathname: "/home/merchant/[id]", params: { id: merchant.id } });
  }, [merchant.id, router]);

  const handleUnbookmark = useCallback(async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await setStoreBookmark(merchant.id, false);
      syncBookmark(merchant.id, false);
      onRemoved?.(merchant.id);
    } finally {
      setRemoving(false);
    }
  }, [merchant.id, onRemoved, removing, syncBookmark]);

  return (
    <Pressable style={styles.card} onPress={handleOpen}>
      <View style={styles.imageWrap}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
          />
        ) : (
          <AppAssetImage assetKey={CX.common.defaultImage} style={styles.image} contentFit="cover" />
        )}

        <TouchableOpacity
          style={styles.bookmarkBtn}
          onPress={() => void handleUnbookmark()}
          activeOpacity={0.85}
          hitSlop={8}
        >
          {removing ? (
            <ActivityIndicator size="small" color={BOOKMARK_GREEN} />
          ) : (
            <Ionicons name="bookmark" size={22} color={BOOKMARK_GREEN} />
          )}
        </TouchableOpacity>

        {offerText ? (
          <View style={styles.offerStrip}>
            <Text style={styles.offerStripText} numberOfLines={1}>
              {offerText}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={2}>
            {merchant.name}
          </Text>
          <MerchantRatingBadge
            rating={merchant.avgRating}
            totalReviews={merchant.totalReviews}
            size="sm"
            showReviewHint
            variant="inline"
          />
        </View>

        {merchant.serviceable === false ? (
          <Text style={styles.metaWarn} numberOfLines={2}>
            Does not deliver to your location
          </Text>
        ) : merchant.serviceable === true ? (
          <Text style={styles.metaOk} numberOfLines={1}>
            {formatMerchantDeliveryTime(merchant)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  imageWrap: {
    height: 168,
    backgroundColor: "#F3F4F6",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  bookmarkBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  offerStrip: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(37, 99, 235, 0.88)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  offerStripText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 22,
  },
  metaOk: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  metaWarn: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
    color: "#E23744",
  },
});
