/**
 * Placeholder for services not yet built (vouchers, near-me, etc.).
 * Parcel has its own screen at /home/service/parcels — never show Coming Soon for it.
 */

import { useState, useEffect } from "react";
import { View, TouchableOpacity, Modal, StyleSheet, Pressable } from "react-native";
import { AppText } from "@/components/AppText";
import { useLocalSearchParams, useRouter, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

const SERVICE_TITLES: Record<string, string> = {
  ride: "Request a Ride",
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

/** Only vouchers (and similar) — parcels must never land here. */
const SHOW_MODAL_SLUGS = ["vouchers"];

export default function ServicePlaceholderScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const slugNorm = String(slug ?? "")
    .trim()
    .toLowerCase();

  // Hard redirect so Coming Soon can never appear for parcel / explore nearby.
  if (slugNorm === "parcels" || slugNorm === "parcel") {
    return <Redirect href="/home/service/parcels" />;
  }
  if (slugNorm === "near-me" || slugNorm === "nearby") {
    return <Redirect href="/home/service/near-me" />;
  }

  const title = (slug && SERVICE_TITLES[slug]) || "Service";
  const showComingSoonModal = Boolean(slug && SHOW_MODAL_SLUGS.includes(slug));
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (showComingSoonModal) setModalVisible(true);
  }, [showComingSoonModal]);

  const goToGatiMitra = () => {
    setModalVisible(false);
    router.back();
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
        <AppText style={styles.pageTitle}>{title}</AppText>
        <AppText style={styles.pageMessage}>We're working on this. Check back soon.</AppText>
        {!showComingSoonModal && (
          <TouchableOpacity onPress={() => router.back()} style={styles.backHomeBtn} activeOpacity={0.85}>
            <AppText style={styles.backHomeText}>Back to Home</AppText>
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
            <AppText style={styles.modalTitle}>{COMING_SOON_MODAL.title}</AppText>
            <AppText style={styles.modalMessage}>{COMING_SOON_MODAL.message}</AppText>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={goToGatiMitra}
              activeOpacity={0.85}
            >
              <AppText style={styles.modalButtonText}>{COMING_SOON_MODAL.buttonLabel}</AppText>
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
