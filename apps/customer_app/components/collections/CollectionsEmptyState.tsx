import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { GatiMitraColors } from "@/constants/gatimitra";

const GREEN = GatiMitraColors.primaryMint;
const CARD_BG = "#F3F4F6";
const CARD_EDGE = "#E5E7EB";

type Variant = "dishes" | "restaurants";

/** Restaurant card — hero image + bookmark top-right (matches BookmarkedStoreCard). */
function RestaurantEmptyCard() {
  return (
    <View style={styles.restaurantCard}>
      <View style={styles.restaurantHero}>
        <View style={styles.restaurantBookmarkRing}>
          <Ionicons name="bookmark" size={16} color={GREEN} />
        </View>
      </View>
      <View style={styles.restaurantBody}>
        <View style={[styles.line, styles.lineWide]} />
        <View style={[styles.line, styles.lineShort]} />
      </View>
    </View>
  );
}

/** Dish row — text left, thumb right, bookmark bottom-left (matches StoreMenuItemRow). */
function DishEmptyCard() {
  return (
    <View style={styles.dishCard}>
      <View style={styles.dishRow}>
        <View style={styles.dishTextCol}>
          <View style={[styles.line, styles.lineWide]} />
          <View style={[styles.line, styles.lineMid]} />
          <View style={styles.dishBookmarkRow}>
            <Ionicons name="bookmark" size={14} color={GREEN} />
          </View>
        </View>
        <View style={styles.dishThumb} />
      </View>
    </View>
  );
}

function EmptyCardStack({ variant }: { variant: Variant }) {
  const Card = variant === "restaurants" ? RestaurantEmptyCard : DishEmptyCard;

  return (
    <View style={styles.illustrationWrap}>
      <View style={[styles.cardGhost, styles.cardBack]} />
      <View style={[styles.cardGhost, styles.cardMid]} />
      <View style={styles.cardFront}>
        <Card />
      </View>
    </View>
  );
}

type Props = {
  variant: Variant;
  onExplore: () => void;
};

export function CollectionsEmptyState({ variant, onExplore }: Props) {
  const { t } = useTranslation();
  const hint =
    variant === "dishes"
      ? t("collections.dishesEmptyHint")
      : t("collections.restaurantsEmptyHint");

  return (
    <View style={styles.wrap}>
      <EmptyCardStack variant={variant} />
      <Text style={styles.hint}>{hint}</Text>
      <Pressable style={styles.cta} onPress={onExplore}>
        <Text style={styles.ctaText}>{t("collections.startExploring")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: "#FFFFFF",
  },
  illustrationWrap: {
    width: 220,
    height: 168,
    marginBottom: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  cardGhost: {
    position: "absolute",
    width: 176,
    height: 118,
    borderRadius: 14,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_EDGE,
  },
  cardBack: {
    transform: [{ translateY: -18 }, { scale: 0.92 }],
    opacity: 0.35,
  },
  cardMid: {
    transform: [{ translateY: -8 }, { scale: 0.96 }],
    opacity: 0.55,
  },
  cardFront: {
    width: 196,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: CARD_EDGE,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  restaurantCard: {
    overflow: "hidden",
  },
  restaurantHero: {
    height: 72,
    backgroundColor: CARD_BG,
    position: "relative",
  },
  restaurantBookmarkRing: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  restaurantBody: {
    padding: 10,
    gap: 6,
  },
  dishCard: {
    padding: 10,
  },
  dishRow: {
    flexDirection: "row",
    gap: 10,
  },
  dishTextCol: {
    flex: 1,
    gap: 6,
  },
  dishBookmarkRow: {
    marginTop: 2,
  },
  dishThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: CARD_BG,
  },
  line: {
    height: 8,
    borderRadius: 4,
    backgroundColor: CARD_BG,
  },
  lineWide: { width: "92%" },
  lineMid: { width: "72%" },
  lineShort: { width: "55%" },
  hint: {
    fontSize: 15,
    lineHeight: 22,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 24,
  },
  cta: {
    backgroundColor: GREEN,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 200,
    alignItems: "center",
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
