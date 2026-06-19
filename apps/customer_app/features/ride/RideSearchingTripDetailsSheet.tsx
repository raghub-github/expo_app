/**
 * Trip details sheet while searching for a rider (Rapido-style, Gatimitra colors).
 */

import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ImageSourcePropType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

type StopItem = {
  address?: string;
  label?: string;
};

export type RideSearchingTripDetailsSheetProps = {
  visible: boolean;
  rideName: string;
  rideImage: ImageSourcePropType;
  pickupAddress: string;
  dropAddress: string;
  stops?: StopItem[];
  totalFare: number;
  tipAmount?: number;
  statusLabel?: string;
  onBack: () => void;
  onCancelRide: () => void;
};

function DashedDivider() {
  return <View style={styles.dashedDivider} />;
}

function LocationTimeline({
  pickupAddress,
  dropAddress,
  stops = [],
}: {
  pickupAddress: string;
  dropAddress: string;
  stops?: StopItem[];
}) {
  return (
    <View style={styles.timeline}>
      <View style={styles.timelineRow}>
        <View style={styles.timelineRail}>
          <View style={[styles.timelineDot, styles.timelineDotPickup]} />
          <View style={styles.timelineLine} />
        </View>
        <Text style={styles.timelineAddress}>{pickupAddress}</Text>
      </View>

      {stops.map((stop, index) => (
        <View key={`stop-${index}`} style={styles.timelineRow}>
          <View style={styles.timelineRail}>
            <View style={[styles.timelineDot, styles.timelineDotStop]} />
            <View style={styles.timelineLine} />
          </View>
          <Text style={styles.timelineAddress}>
            {stop.address?.trim() || stop.label?.trim() || `Stop ${index + 1}`}
          </Text>
        </View>
      ))}

      <View style={styles.timelineRow}>
        <View style={styles.timelineRail}>
          <View style={[styles.timelineDot, styles.timelineDotDrop]} />
        </View>
        <Text style={styles.timelineAddress}>{dropAddress}</Text>
      </View>
    </View>
  );
}

export function RideSearchingTripDetailsSheet({
  visible,
  rideName,
  rideImage,
  pickupAddress,
  dropAddress,
  stops,
  totalFare,
  tipAmount = 0,
  statusLabel = "Searching for below services...",
  onBack,
  onCancelRide,
}: RideSearchingTripDetailsSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onBack}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onBack} accessibilityRole="button" />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <Text style={styles.statusLabel}>{statusLabel}</Text>

            <View style={styles.serviceCard}>
              <Image source={rideImage} style={styles.serviceImage} resizeMode="contain" />
              <Text style={styles.serviceName}>{rideName}</Text>
              <Text style={styles.serviceFare}>
                ₹{Number.isFinite(totalFare) ? totalFare : "—"}
              </Text>
            </View>

            <DashedDivider />

            <Text style={styles.sectionTitle}>Location Details</Text>
            <LocationTimeline
              pickupAddress={pickupAddress}
              dropAddress={dropAddress}
              stops={stops}
            />

            <View style={styles.fareRow}>
              <Text style={styles.fareRowLabel}>Total Fare</Text>
              <Text style={styles.fareRowValue}>
                ₹{Number.isFinite(totalFare) ? totalFare : "—"}
              </Text>
            </View>

            {tipAmount > 0 ? (
              <View style={styles.tipRow}>
                <Text style={styles.tipRowLabel}>Includes tip</Text>
                <Text style={styles.tipRowValue}>+₹{tipAmount}</Text>
              </View>
            ) : null}
          </ScrollView>

          <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.9}>
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onCancelRide} activeOpacity={0.9}>
            <Text style={styles.cancelBtnText}>Cancel Ride</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: "78%",
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 14,
  },
  serviceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  serviceImage: {
    width: 56,
    height: 44,
  },
  serviceName: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  serviceFare: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  dashedDivider: {
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 14,
  },
  timeline: {
    marginBottom: 18,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  timelineRail: {
    width: 18,
    alignItems: "center",
    marginRight: 12,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  timelineDotPickup: {
    backgroundColor: GatiMitraColors.primaryMint,
  },
  timelineDotStop: {
    backgroundColor: "#6366F1",
  },
  timelineDotDrop: {
    backgroundColor: "#EF4444",
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 28,
    borderLeftWidth: 2,
    borderStyle: "dotted",
    borderColor: "#CBD5E1",
    marginVertical: 2,
  },
  timelineAddress: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
    paddingBottom: 12,
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  fareRowLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  fareRowValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  tipRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
  },
  tipRowLabel: {
    fontSize: 13,
    color: "#6B7280",
  },
  tipRowValue: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.deepMintStart,
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 8,
  },
  paymentText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  backBtn: {
    marginTop: 8,
    backgroundColor: GatiMitraColors.primaryMint,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: "center",
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  cancelBtn: {
    marginTop: 10,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#991B1B",
    backgroundColor: "#FFFFFF",
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#991B1B",
  },
});
