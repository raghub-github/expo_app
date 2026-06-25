import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { RIDE_TOLL_NOTICE_DETAIL, RIDE_TOLL_NOTICE_DISPLAY } from "@/lib/ride-toll-notice";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function RideTollNoticeSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.handle} />
        <View style={styles.iconWrap}>
          <Text style={styles.iconEmoji}>🛣️</Text>
        </View>
        <Text style={styles.title}>Toll charges</Text>
        <Text style={styles.body}>{RIDE_TOLL_NOTICE_DETAIL}</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.9}>
          <Text style={styles.closeBtnText}>Got it</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

type RideTollNoticeBannerProps = {
  onPress: () => void;
};

export function RideTollNoticeBanner({ onPress }: RideTollNoticeBannerProps) {
  return (
    <TouchableOpacity style={styles.banner} onPress={onPress} activeOpacity={0.88}>
      <Text style={styles.bannerText} numberOfLines={2}>
        {RIDE_TOLL_NOTICE_DISPLAY}
      </Text>
      <Ionicons name="chevron-forward" size={18} color="#1C1917" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    alignItems: "center",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 16,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFFBEB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  iconEmoji: { fontSize: 26 },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 20,
  },
  closeBtn: {
    alignSelf: "stretch",
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  closeBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FDE68A",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    color: "#1C1917",
    lineHeight: 18,
  },
});
