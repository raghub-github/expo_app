import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraMerchant } from "@/constants/theme";

type Props = {
  visible: boolean;
  imageUrl: string | null;
  riderName?: string | null;
  onClose: () => void;
};

export function RiderSelfieViewerModal({
  visible,
  imageUrl,
  riderName,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const url = imageUrl?.trim();

  if (!url) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.content} pointerEvents="box-none">
          <Pressable
            onPress={onClose}
            style={[styles.closeBtn, { top: insets.top + 8 }]}
            hitSlop={12}
            accessibilityLabel="Close photo"
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
          {riderName ? (
            <Text style={styles.name} numberOfLines={2}>
              {riderName}
            </Text>
          ) : null}
          <Image
            source={{ uri: url }}
            style={{
              width: width - 32,
              height: Math.min(height * 0.72, width - 32),
              maxHeight: height - insets.top - insets.bottom - 96,
            }}
            resizeMode="contain"
            accessibilityLabel={riderName ? `Photo of ${riderName}` : "Rider photo"}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  content: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    position: "absolute",
    right: 8,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    marginBottom: 12,
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    ...Platform.select({
      web: { textShadow: "0 1px 4px rgba(0,0,0,0.45)" },
      default: {
        textShadowColor: "rgba(0,0,0,0.45)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
      },
    }),
  },
});
