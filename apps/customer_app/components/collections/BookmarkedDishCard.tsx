import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { BookmarkedMenuItem } from "@/services/merchant.service";
import { setMenuItemBookmark } from "@/services/merchant.service";
import { useMenuItemBookmarkMutations } from "@/hooks/useMenuItemBookmarks";
import { DietIndicator } from "@/components/store/DietIndicator";
import { GatiMitraColors } from "@/constants/gatimitra";
import { AppAssetImage } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
const BOOKMARK_GREEN = GatiMitraColors.primaryMint;

type Props = {
  item: BookmarkedMenuItem;
  onRemoved?: (menuItemId: number) => void;
};

export function BookmarkedDishCard({ item, onRemoved }: Props) {
  const router = useRouter();
  const { removeMenuItemBookmark } = useMenuItemBookmarkMutations();
  const [removing, setRemoving] = useState(false);

  const handleOpen = useCallback(() => {
    router.push({ pathname: "/home/merchant/[id]", params: { id: item.storeId } });
  }, [item.storeId, router]);

  const handleUnbookmark = useCallback(async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await setMenuItemBookmark(item.storeId, item.menuItemId, false);
      removeMenuItemBookmark(item.menuItemId, item.storeId);
      onRemoved?.(item.menuItemId);
    } finally {
      setRemoving(false);
    }
  }, [item, onRemoved, removing, removeMenuItemBookmark]);

  return (
    <Pressable style={styles.card} onPress={handleOpen}>
      <View style={styles.imageWrap}>
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
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
            <Ionicons name="bookmark" size={20} color={BOOKMARK_GREEN} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <DietIndicator type={item.isVeg ? "veg" : "nonveg"} />
          <Text style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>
        </View>
        <Text style={styles.storeName} numberOfLines={1}>
          {item.storeName}
        </Text>
        <Text style={styles.price}>₹{Math.round(item.price)}</Text>
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
    height: 140,
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
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 22,
  },
  storeName: {
    marginTop: 6,
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  price: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
});
