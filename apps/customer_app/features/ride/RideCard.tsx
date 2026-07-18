/**
 * Premium ride service card: gradient, icon container with soft shadow,
 * typography hierarchy, subtle elevation, scale animation on tap.
 * Images from public/img folder when available.
 */

import { View, Pressable, StyleSheet, Image } from "react-native";
import { AppText } from "@/components/AppText";

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useAppAssetSource } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";

const SPRING = { damping: 18, stiffness: 260 };

export type RideType = "bike" | "auto" | "cab" | "all";

const RIDE_CONFIG: Record<
  RideType,
  {
    icon: keyof typeof Ionicons.glyphMap;
    subtitle: string;
    title: string;
    etaTag?: string;
  }
> = {
  bike: {
    icon: "bicycle",
    subtitle: "Beat the traffic",
    title: "Bike Ride",
    etaTag: "Within 2-5 min",
  },
  auto: {
    icon: "bus",
    subtitle: "Quick city rides",
    title: "Auto",
    etaTag: "Within 2-5 min",
  },
  cab: {
    icon: "car-sport",
    subtitle: "Comfortable travel",
    title: "Cab",
    etaTag: "Within 2-5 min",
  },
  all: {
    icon: "grid",
    subtitle: "Compare options",
    title: "View All Rides",
    etaTag: "Within 2-5 min",
  },
};

type RideCardProps = {
  type: RideType;
  onPress: () => void;
  cardWidth: number;
};

const CARD_HEIGHT = 148;

export function RideCard({ type, onPress, cardWidth }: RideCardProps) {
  const config = RIDE_CONFIG[type];
  const rideCardImage = useAppAssetSource(CX.ride.rideCard);
  const imageSource = rideCardImage ?? undefined;
  const showEtaTag = !!config.etaTag;
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = () => {
    scale.value = withSpring(0.96, SPRING);
  };
  const onPressOut = () => {
    scale.value = withSpring(1, SPRING);
  };

  return (
    <Animated.View style={[{ width: cardWidth }, animatedStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[styles.wrapper, { width: cardWidth }]}
      >
        <View style={[styles.card, { width: cardWidth }]}>
          <LinearGradient
            colors={[GatiMitraColors.mintSoft, "#ffffff", "#fff7ed"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.gradient, { width: cardWidth, height: CARD_HEIGHT }]}
          >
            {showEtaTag && (
              <View style={styles.etaBadge}>
                <AppText style={styles.etaText}>{config.etaTag}</AppText>
              </View>
            )}
            <View style={styles.iconWrap}>
              {imageSource != null ? (
                <Image
                  source={imageSource}
                  style={styles.cardImage}
                  resizeMode="contain"
                />
              ) : (
                <Ionicons
                  name={config.icon}
                  size={34}
                  color={GatiMitraColors.emerald}
                />
              )}
            </View>
            <AppText style={styles.subtitle} numberOfLines={1}>
              {config.subtitle}
            </AppText>
            <AppText style={styles.title} numberOfLines={1}>
              {config.title}
            </AppText>
          </LinearGradient>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
  },
  card: {
    borderRadius: 20,
    overflow: "hidden",
    ...GatiMitraColors.elevationShadow,
    backgroundColor: GatiMitraColors.cardBg,
  },
  gradient: {
    padding: 16,
    borderRadius: 20,
    justifyContent: "space-between",
  },
  etaBadge: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(5, 150, 105, 0.14)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 8,
  },
  etaText: {
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraColors.emerald,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    ...GatiMitraColors.cardShadowSoft,
  },
  cardImage: {
    width: 32,
    height: 32,
  },
  subtitle: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
  },
});
