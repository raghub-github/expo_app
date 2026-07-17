/**
 * Bottom sheet when pickup is far from user's current location —
 * "Booking for someone else?"
 */

import { View, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { AppText } from "@/components/AppText";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";

type BookingForSomeoneElseSheetProps = {
  visible: boolean;
  onClose: () => void;
  onYesSomeoneElse: () => void;
  onNoBookingForMe: () => void;
};

export function BookingForSomeoneElseSheet({
  visible,
  onClose,
  onYesSomeoneElse,
  onNoBookingForMe,
}: BookingForSomeoneElseSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <StoreBottomSheetShell
      visible={visible}
      onClose={onClose}
      maxHeightRatio={0.48}
      sheetStyle={styles.sheet}
    >
      <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.handle} />

        <View style={styles.iconWrap}>
          <View style={styles.iconCircleOuter}>
            <View style={styles.iconCircleInner}>
              <Ionicons name="people" size={28} color={GatiMitraColors.primaryMint} />
            </View>
          </View>
        </View>

        <AppText style={styles.title}>Booking for someone else?</AppText>
        <AppText style={styles.subtitle}>
          Enter their details and we&apos;ll send ride updates directly to them.
        </AppText>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={onYesSomeoneElse}
          activeOpacity={0.9}
        >
          <AppText style={styles.primaryBtnText}>Yes, for someone else</AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={onNoBookingForMe}
          activeOpacity={0.85}
        >
          <AppText style={styles.secondaryBtnText}>No, booking for me</AppText>
        </TouchableOpacity>
      </View>
    </StoreBottomSheetShell>
  );
}

/** Pickup farther than this from device GPS triggers the someone-else prompt. */
export const FAR_PICKUP_THRESHOLD_KM = 10;

const sheetShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
  },
  android: { elevation: 14 },
  default: {},
});

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...sheetShadow,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    marginBottom: 20,
  },
  iconWrap: {
    alignItems: "center",
    marginBottom: 18,
  },
  iconCircleOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "400",
    color: "#6B7280",
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 28,
    paddingHorizontal: 4,
  },
  primaryBtn: {
    backgroundColor: GatiMitraColors.primaryMint,
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  secondaryBtn: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
});
