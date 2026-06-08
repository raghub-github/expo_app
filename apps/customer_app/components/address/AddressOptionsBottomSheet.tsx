import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraColors } from "@/constants/gatimitra";

const BRAND = GatiMitraColors.splashMint;
const TITLE_DARK = "#111827";
const TEXT_GRAY = "#6B7280";
const BORDER = "#F3F4F6";

type Props = {
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function AddressOptionsBottomSheet({ visible, onClose, onEdit, onDelete }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheetWrap}>
          <TouchableOpacity style={styles.floatingClose} onPress={onClose} hitSlop={10} activeOpacity={0.9}>
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            <Text style={styles.title}>Address options</Text>
            <TouchableOpacity style={styles.optionRow} onPress={onEdit} activeOpacity={0.85}>
              <Ionicons name="create-outline" size={22} color={BRAND} />
              <Text style={styles.optionText}>Edit Address</Text>
              <Ionicons name="chevron-forward" size={18} color={TEXT_GRAY} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.optionRow} onPress={onDelete} activeOpacity={0.85}>
              <Ionicons name="trash-outline" size={22} color={BRAND} />
              <Text style={styles.optionText}>Delete Address</Text>
              <Ionicons name="chevron-forward" size={18} color={TEXT_GRAY} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetWrap: {
    width: "100%",
    alignItems: "center",
  },
  floatingClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
    }),
  },
  sheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: TITLE_DARK,
    marginBottom: 16,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    gap: 14,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: TITLE_DARK,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
  },
});
