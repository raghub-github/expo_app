/**
 * All Services / View All Rides – bottom sheet popup (no new page).
 * Slide up, ~half screen, rounded top, draggable, dimmed backdrop.
 * Lists Bike, Auto, Cab, Parcel with icon, name, description, ETA; tap to select and go to pickup.
 */

import { useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Pressable,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

const { height: WINDOW_HEIGHT } = Dimensions.get("window");
const HALF_HEIGHT = WINDOW_HEIGHT * 0.52;
const SPRING_CONFIG = { damping: 24, stiffness: 280 };

export type ServiceId = "bike" | "auto" | "cab" | "parcel";

export const ALL_SERVICES: Array<{
  id: ServiceId;
  icon: keyof typeof Ionicons.glyphMap;
  name: string;
  description: string;
  eta: string;
}> = [
  { id: "bike", icon: "bicycle", name: "Bike Ride", description: "Beat the traffic", eta: "~5 min" },
  { id: "auto", icon: "bus", name: "Auto", description: "Quick city rides", eta: "~7 min" },
  { id: "cab", icon: "car-sport", name: "Cab", description: "Comfortable travel", eta: "~10 min" },
  { id: "parcel", icon: "cube-outline", name: "Parcel / Delivery", description: "Send packages", eta: "—" },
];

type AllServicesBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelectService: (id: ServiceId) => void;
};

export function AllServicesBottomSheet({
  visible,
  onClose,
  onSelectService,
}: AllServicesBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(WINDOW_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, SPRING_CONFIG);
      backdropOpacity.value = withSpring(1);
    } else {
      translateY.value = withSpring(WINDOW_HEIGHT, SPRING_CONFIG);
      backdropOpacity.value = withSpring(0);
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value * 0.5,
  }));

  const handleSelect = (id: ServiceId) => {
    onSelectService(id);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            sheetStyle,
            {
              height: HALF_HEIGHT + insets.bottom,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <Pressable style={styles.handleWrap} onPress={onClose}>
            <View style={styles.handle} />
          </Pressable>
          <Text style={styles.title}>All ride options</Text>
          <Text style={styles.subtitle}>Choose your ride</Text>
          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          >
            {ALL_SERVICES.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => handleSelect(s.id)}
              >
                <View style={styles.iconContainer}>
                  <Ionicons name={s.icon} size={26} color={GatiMitraColors.emerald} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{s.name}</Text>
                  <Text style={styles.rowDesc}>{s.description}</Text>
                </View>
                <Text style={styles.eta}>{s.eta}</Text>
                <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: GatiMitraColors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...GatiMitraColors.elevationShadow,
  },
  handleWrap: {
    alignItems: "center",
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: GatiMitraColors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    paddingHorizontal: 20,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    ...GatiMitraColors.searchShadow,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  rowText: { flex: 1 },
  rowName: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  rowDesc: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    marginTop: 2,
  },
  eta: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.emerald,
    marginRight: 8,
  },
});
