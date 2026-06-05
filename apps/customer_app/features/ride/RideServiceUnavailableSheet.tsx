/**
 * Shown when no on-duty riders are available near the pickup location.
 */

import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

type RideServiceUnavailableSheetProps = {
  visible: boolean;
  onOkay: () => void;
};

export function RideServiceUnavailableSheet({ visible, onOkay }: RideServiceUnavailableSheetProps) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onOkay}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onOkay} accessibilityRole="button" />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.iconWrap}>
            <Ionicons name="location-outline" size={32} color="#DC2626" />
          </View>
          <Text style={styles.message}>
            Oops! No riders available near your pickup location. Please select a different pickup
            or try again shortly.
          </Text>
          <TouchableOpacity style={styles.okayBtn} onPress={onOkay} activeOpacity={0.9}>
            <Text style={styles.okayBtnText}>Okay</Text>
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
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 20,
  },
  message: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 25,
    textAlign: "center",
    marginBottom: 28,
    letterSpacing: -0.2,
  },
  okayBtn: {
    backgroundColor: GatiMitraColors.primaryMint,
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: "center",
  },
  okayBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
});
