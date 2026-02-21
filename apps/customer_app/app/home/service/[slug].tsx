/**
 * Placeholder for services: Parcels, Vouchers, Near Me (Ride/Ecom have own screens).
 * Shows "Coming Soon to You" modal for parcels and vouchers; same inline for others.
 */

import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

const SERVICE_TITLES: Record<string, string> = {
  ride: "Request a Ride",
  parcels: "Send Parcels",
  ecom: "Elect and Ecom",
  vouchers: "Online Vouchers",
  "near-me": "Near Me",
};

const COMING_SOON_MODAL = {
  title: "Coming Soon to You",
  message:
    "We apologize — this service is currently unavailable.\nOur team is working behind the scenes to make it ready for you soon.\n\nThanks for choosing GatiMitra.",
  buttonLabel: "push me to GatiMitra",
};

const SHOW_MODAL_SLUGS = ["parcels", "vouchers"];

export default function ServicePlaceholderScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const title = (slug && SERVICE_TITLES[slug]) || "Service";
  const showComingSoonModal = Boolean(slug && SHOW_MODAL_SLUGS.includes(slug));
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (showComingSoonModal) setModalVisible(true);
  }, [showComingSoonModal]);

  const goToGatiMitra = () => {
    setModalVisible(false);
    router.replace("/(tabs)/");
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backBtn}
        activeOpacity={0.8}
      >
        <Ionicons name="arrow-back" size={24} color={GatiMitraColors.textPrimary} />
      </TouchableOpacity>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="construct-outline" size={40} color={GatiMitraColors.emerald} />
        </View>
        <Text style={styles.pageTitle}>{title}</Text>
        <Text style={styles.pageMessage}>We're working on this. Check back soon.</Text>
        {!showComingSoonModal && (
          <TouchableOpacity onPress={() => router.back()} style={styles.backHomeBtn} activeOpacity={0.85}>
            <Text style={styles.backHomeText}>Back to Home</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={goToGatiMitra}
      >
        <Pressable style={styles.modalOverlay} onPress={goToGatiMitra}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{COMING_SOON_MODAL.title}</Text>
            <Text style={styles.modalMessage}>{COMING_SOON_MODAL.message}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={goToGatiMitra}
              activeOpacity={0.85}
            >
              <Text style={styles.modalButtonText}>{COMING_SOON_MODAL.buttonLabel}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
    paddingTop: 48,
  },
  backBtn: {
    position: "absolute",
    top: 48,
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
    textAlign: "center",
  },
  pageMessage: {
    fontSize: 15,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },
  backHomeBtn: {
    marginTop: 24,
    backgroundColor: GatiMitraColors.emerald,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  backHomeText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: GatiMitraColors.background,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    ...GatiMitraColors.elevationShadow,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    textAlign: "center",
    marginBottom: 16,
  },
  modalMessage: {
    fontSize: 15,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: GatiMitraColors.emerald,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
});
