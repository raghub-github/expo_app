/**
 * Bottom pill on Book a Ride home when the customer has active person-ride orders.
 * Multiple rides scroll horizontally.
 */

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useQuery } from "@tanstack/react-query";
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
import {
  getActiveRideTrackLabel,
  isBookARideHomeScreen,
  resolvePersonRideTrackingNavigation,
} from "@/lib/person-ride-orders";
import { normalizeCustomerOrderStatus } from "@/lib/customer-order-status-display";
import { orderService } from "@/services/order.service";
import {
  formatRideFare,
  resolveRidePaymentDueAmount,
  resolveRideVehicleImage,
} from "@/lib/ride-order-display";

const HORIZONTAL_PAD = 16;
const CARD_GAP = 10;

type ActiveRideBottomSheetProps = {
  rides: OrderSummary[];
  bottomInset?: number;
};

function ActiveRideTrackCard({ ride, width }: { ride: OrderSummary; width: number }) {
  const router = useRouter();
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

  const paymentDue =
    String(ride.paymentStatus ?? "").trim().toLowerCase() !== "paid" &&
    String(ride.paymentStatus ?? "").trim().toLowerCase() !== "completed" &&
    normalizeCustomerOrderStatus(ride.status) === "DELIVERED";

  const { data: dueOrderDetail } = useQuery({
    queryKey: ["order", ride.orderId, "due-fare-pill"],
    queryFn: () => orderService.getOrder(ride.orderId),
    enabled: paymentDue,
    staleTime: 5000,
  });

  const { title, subtitle } = getActiveRideTrackLabel(ride.status, ride.paymentStatus);
  const orderRef = ride.formattedOrderId ?? ride.orderId;
  const dueFareAmount = dueOrderDetail
    ? resolveRidePaymentDueAmount(dueOrderDetail)
    : resolveRidePaymentDueAmount(ride);

  const rideVehicleImage = resolveRideVehicleImage(ride.rideType);

  const openRide = () => {
    const target = resolvePersonRideTrackingNavigation(ride);
    router.replace({ pathname: target.pathname, params: target.params });
  };

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={openRide}
      style={[styles.cardTouchable, { width }]}
    >
      <Animated.View style={[styles.card, pulseStyle]}>
        <LinearGradient
          colors={[GatiMitraColors.deepMintStart, GatiMitraColors.deepMintEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradient}
        >
          <View style={styles.iconWrap}>
            {rideVehicleImage ? (
              <Image source={rideVehicleImage} style={styles.bikeIcon} resizeMode="contain" />
            ) : null}
          </View>
          <View style={styles.textCol}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
            <Text style={styles.orderId} numberOfLines={1}>
              {orderRef}
            </Text>
          </View>
          <View style={styles.ctaCol}>
            <Text style={styles.ctaText}>
              {paymentDue
                ? dueFareAmount > 0
                  ? `Pay ${formatRideFare(dueFareAmount)}`
                  : "Pay"
                : "Track"}
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
          </View>
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
}

export function ActiveRideBottomSheet({
  rides,
  bottomInset = 16,
}: ActiveRideBottomSheetProps) {
  const pathname = usePathname();
  const { width: windowWidth } = useWindowDimensions();

  const onRideSearchingScreen =
    typeof pathname === "string" && pathname.includes("ride-searching");
  const visible =
    rides.length > 0 && !onRideSearchingScreen && isBookARideHomeScreen(pathname);

  if (!visible) return null;

  const multi = rides.length > 1;
  const cardWidth = multi
    ? Math.round(windowWidth * 0.86)
    : windowWidth - HORIZONTAL_PAD * 2;
  const snapInterval = cardWidth + CARD_GAP;

  return (
    <Animated.View
      entering={SlideInUp.duration(280).easing(Easing.out(Easing.ease))}
      style={[styles.wrap, { bottom: bottomInset }]}
      pointerEvents="box-none"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={multi}
        decelerationRate="fast"
        snapToInterval={multi ? snapInterval : undefined}
        snapToAlignment="start"
        disableIntervalMomentum={multi}
        contentContainerStyle={[
          styles.scrollContent,
          multi ? styles.scrollContentMulti : styles.scrollContentSingle,
        ]}
      >
        {rides.map((ride) => (
          <ActiveRideTrackCard key={ride.orderId} ride={ride} width={cardWidth} />
        ))}
      </ScrollView>

      {multi ? (
        <View style={styles.hintRow} pointerEvents="none">
          <Ionicons name="swap-horizontal" size={14} color="#6B7280" />
          <Text style={styles.hintText}>
            Swipe for {rides.length} active rides
          </Text>
        </View>
      ) : null}
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
    left: 0,
    right: 0,
    zIndex: 50,
  },
  scrollContent: {
    alignItems: "stretch",
  },
  scrollContentSingle: {
    paddingHorizontal: HORIZONTAL_PAD,
  },
  scrollContentMulti: {
    paddingHorizontal: HORIZONTAL_PAD,
    gap: CARD_GAP,
  },
  cardTouchable: {
    flexGrow: 0,
    flexShrink: 0,
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
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: HORIZONTAL_PAD,
  },
  hintText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
  },
});
