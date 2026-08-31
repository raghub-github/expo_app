/**
 * Curved bottom sheet — no nearby riders, or search timed out with no captain.
 */

import { View, TouchableOpacity, StyleSheet, Modal, Pressable } from "react-native";
import { AppText } from "@/components/AppText";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreFonts } from "@/constants/storeTypography";

type RideServiceUnavailableSheetProps = {
  visible: boolean;
  title?: string;
  message?: string;
  okayLabel?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  onOkay: () => void;
};

const DEFAULT_UNAVAILABLE_MESSAGE =
  "Oops! No riders available near your pickup location. Please select a different pickup or try again shortly.";

export function RideServiceUnavailableSheet({
  visible,
  title,
  message = DEFAULT_UNAVAILABLE_MESSAGE,
  okayLabel = "Okay",
  iconName = "location-outline",
  onOkay,
}: RideServiceUnavailableSheetProps) {
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
          <View style={styles.handle} />
          <View style={styles.iconWrap}>
            <Ionicons name={iconName} size={32} color="#DC2626" />
          </View>
          {title ? (
            <AppText style={styles.title} bold>
              {title}
            </AppText>
          ) : null}
          <AppText style={[styles.message, title ? styles.messageWithTitle : null]}>{message}</AppText>
          <TouchableOpacity style={styles.okayBtn} onPress={onOkay} activeOpacity={0.9}>
            <AppText style={styles.okayBtnText} bold>
              {okayLabel}
            </AppText>
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 18,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: StoreFonts.loraBold,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 16,
    fontFamily: StoreFonts.loraRegular,
    fontWeight: "400",
    color: "#374151",
    lineHeight: 24,
    textAlign: "center",
    marginBottom: 24,
    letterSpacing: -0.2,
  },
  messageWithTitle: {
    fontSize: 15,
    fontWeight: "400",
  },
  okayBtn: {
    backgroundColor: GatiMitraColors.primaryMint,
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: "center",
  },
  okayBtnText: {
    fontSize: 16,
    fontFamily: StoreFonts.loraBold,
    fontWeight: "700",
    color: "#111827",
  },
});
