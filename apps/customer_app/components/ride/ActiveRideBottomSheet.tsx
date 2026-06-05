/**
 * Bottom pill on ride booking screens when the customer has an active person-ride order.
 */

import { View, Text, TouchableOpacity, StyleSheet, Image, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  SlideInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useEffect } from "react";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { OrderSummary } from "@/services/order.service";
import { getActiveRideTrackLabel } from "@/lib/person-ride-orders";
import { MAPBIKE_IMAGE } from "@/lib/customer-map-assets";

type ActiveRideBottomSheetProps = {
  rides: OrderSummary[];
  bottomInset?: number;
  /** When true, flows inside a parent container instead of absolute bottom overlay. */
  embedded?: boolean;
};

export function ActiveRideBottomSheet({
  rides,
  bottomInset = 16,
  embedded = false,
}: ActiveRideBottomSheetProps) {
  const router = useRouter();
  const ride = rides[0];
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    return () => {
      pulse.value = 1;
    };
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  if (!ride) return null;

  const { title, subtitle } = getActiveRideTrackLabel(ride.status);
  const orderRef = ride.formattedOrderId ?? ride.orderId;
  const extraCount = rides.length - 1;

  const openRide = () => {
    router.push({
      pathname: "/home/service/ride-searching",
      params: { orderId: ride.orderId },
    });
  };

  return (
    <Animated.View
      entering={SlideInUp.duration(280).easing(Easing.out(Easing.ease))}
      style={[embedded ? styles.wrapEmbedded : styles.wrap, !embedded && { bottom: bottomInset }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity activeOpacity={0.92} onPress={openRide} style={styles.touchable}>
        <Animated.View style={[styles.card, pulseStyle]}>
          <LinearGradient
            colors={[GatiMitraColors.deepMintStart, GatiMitraColors.deepMintEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradient}
          >
            <View style={styles.iconWrap}>
              <Image source={MAPBIKE_IMAGE} style={styles.bikeIcon} resizeMode="contain" />
            </View>
            <View style={styles.textCol}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
                {extraCount > 0 ? ` · +${extraCount} more` : ""}
              </Text>
              <Text style={styles.orderId} numberOfLines={1}>
                {orderRef}
              </Text>
            </View>
            <View style={styles.ctaCol}>
              <Text style={styles.ctaText}>Track</Text>
              <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
            </View>
          </LinearGradient>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  android: { elevation: 8 },
  default: {},
});

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 50,
  },
  wrapEmbedded: {
    width: "100%",
  },
  touchable: {
    width: "100%",
  },
  card: {
    borderRadius: 18,
    overflow: "hidden",
    ...cardShadow,
  },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  bikeIcon: {
    width: 36,
    height: 36,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
  },
  orderId: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.75)",
  },
  ctaCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingLeft: 4,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
