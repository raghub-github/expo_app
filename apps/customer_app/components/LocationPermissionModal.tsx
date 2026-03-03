/**
 * Modal asking user to enable location permission.
 */

import { View, Text, Modal, TouchableOpacity, StyleSheet, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const TEAL = "#14b8a6";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

export function LocationPermissionModal({ visible, onDismiss }: Props) {
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
            <Ionicons name="location" size={48} color={TEAL} />
          </View>
          <Text style={styles.title}>Turn on location</Text>
          <Text style={styles.message}>
            GatiMitra needs your location to show nearby restaurants and accurate delivery options.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={openSettings}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryBtnText}>Open Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={onDismiss}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryBtnText}>Not now</Text>
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
    backgroundColor: "#fff",
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
    backgroundColor: "#E0F2F1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: TITLE_DARK,
    marginBottom: 10,
    textAlign: "center",
  },
  message: {
    fontSize: 15,
    color: TEXT_GRAY,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  primaryBtn: {
    width: "100%",
    backgroundColor: TEAL,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: TEXT_GRAY,
  },
});
