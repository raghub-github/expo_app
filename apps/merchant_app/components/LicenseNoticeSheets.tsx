import { AppText as Text } from "@/components/AppText";
import { PermissionBottomSheetShell } from "@/components/permissions/PermissionBottomSheetShell";
import { GatiMitraMerchant, CARD_RADIUS, FONT_LORA, FONT_LORA_BOLD, FONT_POPPINS_BOLD } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, View } from "react-native";

export function LicenseUploadedModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.iconWrap}>
            <Ionicons name="cloud-done-outline" size={36} color={GatiMitraMerchant.primary} />
          </View>
          <Text style={styles.title}>Uploaded</Text>
          <Text style={styles.body}>
            GatiMitra will verify your document before you can go online again. You do not need to
            refresh — we will notify you here when it is verified.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.okBtn, pressed && styles.pressed]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="OK"
          >
            <Text style={styles.okText}>OK</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function LicenseVerifiedSheet({
  visible,
  docLabel,
  onClose,
}: {
  visible: boolean;
  docLabel?: string | null;
  onClose: () => void;
}) {
  return (
    <PermissionBottomSheetShell visible={visible} dismissible onDismiss={onClose} maxHeightRatio={0.55}>
      <View style={styles.sheetContent}>
        <View style={styles.sheetIconWrap}>
          <Ionicons name="checkmark-circle" size={52} color={GatiMitraMerchant.primary} />
        </View>
        <Text style={styles.sheetTitle}>Licence verified</Text>
        <Text style={styles.sheetBody}>
          {docLabel ? `${docLabel} is verified. ` : ""}
          You can turn your store online now. The licence lock has been cleared.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.sheetCta, pressed && styles.pressed]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="OK"
        >
          <Text style={styles.sheetCtaText}>OK</Text>
        </Pressable>
      </View>
    </PermissionBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS + 4,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    alignItems: "center",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: "rgba(62, 180, 137, 0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontFamily: FONT_LORA_BOLD,
    fontSize: 22,
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    marginBottom: 8,
  },
  body: {
    fontFamily: FONT_LORA,
    fontSize: 15,
    lineHeight: 22,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    marginBottom: 18,
  },
  okBtn: {
    alignSelf: "stretch",
    backgroundColor: GatiMitraMerchant.navy,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  okText: {
    fontFamily: FONT_LORA_BOLD,
    fontSize: 16,
    color: "#fff",
  },
  pressed: { opacity: 0.88 },
  sheetContent: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: "center",
  },
  sheetIconWrap: { marginBottom: 12 },
  sheetTitle: {
    fontFamily: FONT_LORA_BOLD,
    fontSize: 22,
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    marginBottom: 10,
  },
  sheetBody: {
    fontFamily: FONT_LORA,
    fontSize: 15,
    lineHeight: 22,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    marginBottom: 22,
  },
  sheetCta: {
    alignSelf: "stretch",
    backgroundColor: GatiMitraMerchant.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  sheetCtaText: {
    fontFamily: FONT_POPPINS_BOLD,
    fontSize: 16,
    color: "#fff",
  },
});
