/**
 * Bottom sheet when PAN name does not match Aadhaar authorized name.
 */
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
import { colors } from "@/src/theme";

type Props = {
  visible: boolean;
  panName: string;
  aadhaarName: string;
  onClose: () => void;
  onContactSupport: () => void;
};

export function PanNameMismatchSheet({
  visible,
  panName,
  aadhaarName,
  onClose,
  onContactSupport,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottomInset = useRiderBottomInset();
  const { height } = useWindowDimensions();
  const maxH = Math.round(height * 0.78);

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss" />
        <View
          style={[
            styles.sheet,
            {
              maxHeight: maxH,
              paddingBottom: Math.max(bottomInset, insets.bottom) + 16,
            },
          ]}
        >
          <View style={styles.handle} />
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="warning" size={28} color="#B45309" />
            </View>
            <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit>
              Name Verification Failed
            </Text>
            <Text style={styles.lead}>
              Authorized name should match the name on your Aadhaar.
            </Text>
            <Text style={styles.copy}>
              Your PAN name and Aadhaar name do not appear to match.
            </Text>

            <View style={styles.compareCard}>
              <Text style={styles.compareLabel}>PAN Name</Text>
              <Text style={styles.compareValue} selectable>
                {panName || "—"}
              </Text>
              <View style={styles.compareDivider} />
              <Text style={styles.compareLabel}>Aadhaar Name</Text>
              <Text style={styles.compareValue} selectable>
                {aadhaarName || "—"}
              </Text>
            </View>

            <Text style={styles.hint}>
              Please verify your documents and enter the correct PAN details. If your documents are
              correct, contact GatiMitra Support for assistance.
            </Text>
          </ScrollView>

          <Pressable
            onPress={onContactSupport}
            style={({ pressed }) => [styles.supportBtn, pressed && { opacity: 0.92 }]}
            accessibilityRole="button"
            accessibilityLabel="Contact Support"
          >
            <Ionicons name="headset-outline" size={18} color="#FFFFFF" />
            <Text style={styles.supportBtnText}>Contact Support</Text>
          </Pressable>

          <Pressable
            onPress={onClose}
            style={styles.closeLink}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={styles.closeLinkText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    alignSelf: "stretch",
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginBottom: 12,
  },
  body: {
    paddingBottom: 8,
    alignItems: "center",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFFBEB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  lead: {
    fontSize: 15,
    fontWeight: "600",
    color: "#92400E",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 8,
  },
  copy: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  compareCard: {
    alignSelf: "stretch",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    marginBottom: 14,
  },
  compareLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 4,
  },
  compareValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  compareDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 12,
  },
  hint: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 8,
  },
  supportBtn: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary[600],
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 4,
  },
  supportBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  closeLink: {
    alignSelf: "center",
    paddingVertical: 12,
  },
  closeLinkText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
});
