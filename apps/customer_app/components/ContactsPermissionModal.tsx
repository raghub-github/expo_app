/**
 * Modal asking user to enable contacts permission (e.g. for Add a guest).
 */

import { View, Modal, TouchableOpacity, StyleSheet, Linking, Platform } from "react-native";
import { AppText } from "@/components/AppText";

import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

export function ContactsPermissionModal({ visible, onDismiss }: Props) {
  const openSettings = () => {
    if (Platform.OS === "ios") {
      Linking.openURL("app-settings:");
    } else {
      Linking.openSettings();
    }
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="people" size={48} color={GatiMitraColors.emerald} />
          </View>
          <AppText style={styles.title}>Allow contacts access</AppText>
          <AppText style={styles.message}>
            GatiMitra needs access to your contacts so you can quickly add a guest for the ride.
          </AppText>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={openSettings}
            activeOpacity={0.9}
          >
            <AppText style={styles.primaryBtnText}>Open Settings</AppText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={onDismiss}
            activeOpacity={0.8}
          >
            <AppText style={styles.secondaryBtnText}>Not now</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: GatiMitraColors.background,
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    fontSize: 15,
    color: GatiMitraColors.textSecondary,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 24,
  },
  primaryBtn: {
    backgroundColor: GatiMitraColors.emerald,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: "100%",
    alignItems: "center",
    marginBottom: 12,
  },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  secondaryBtn: {
    paddingVertical: 14,
    width: "100%",
    alignItems: "center",
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
});
