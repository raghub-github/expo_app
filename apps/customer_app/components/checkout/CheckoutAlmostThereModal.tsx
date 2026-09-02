/**
 * Checkout gate message — replaces native Alert.alert for place-order blockers.
 */

import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreFonts } from "@/constants/storeTypography";
import { useMerchantUiDark, MerchantDarkPalette } from "@/features/merchant-detail/merchantUiTheme";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  onDismiss: () => void;
};

export function CheckoutAlmostThereModal({ visible, title, message, onDismiss }: Props) {
  const dark = useMerchantUiDark();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onDismiss}
    >
      <View style={styles.root}>
        <Pressable
          style={[styles.backdrop, dark && styles.backdropDark]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />

        <View style={[styles.card, dark && styles.cardDark]} accessibilityRole="alert">
          <View style={styles.topRow}>
            <View style={[styles.iconWrap, dark && styles.iconWrapDark]}>
              <Ionicons name="time-outline" size={22} color={GatiMitraColors.deepMintStart} />
            </View>
            <Text style={[styles.title, dark && styles.titleDark]}>{title}</Text>
          </View>

          <Text style={[styles.message, dark && styles.messageDark]}>{message}</Text>

          <TouchableOpacity
            activeOpacity={0.88}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="OK"
            style={styles.okBtn}
          >
            <Text style={styles.okLabel}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  backdropDark: {
    backgroundColor: "rgba(0, 0, 0, 0.72)",
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    zIndex: 2,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 12,
  },
  cardDark: {
    backgroundColor: MerchantDarkPalette.card,
    borderColor: MerchantDarkPalette.border,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  iconWrapDark: {
    backgroundColor: "rgba(16, 185, 129, 0.18)",
    borderColor: "rgba(16, 185, 129, 0.35)",
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontFamily: StoreFonts.loraBold,
    color: "#0F172A",
    lineHeight: 22,
  },
  titleDark: {
    color: MerchantDarkPalette.text,
  },
  message: {
    marginTop: 12,
    marginBottom: 16,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: StoreFonts.loraRegular,
    color: "#64748B",
  },
  messageDark: {
    color: MerchantDarkPalette.textMuted,
  },
  okBtn: {
    alignSelf: "flex-end",
    minHeight: 40,
    minWidth: 88,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraColors.deepMintStart,
  },
  okLabel: {
    fontSize: 15,
    fontFamily: StoreFonts.poppinsSemiBold,
    color: "#FFFFFF",
  },
});
