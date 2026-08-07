import { View, Modal, Pressable, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";

type ProfilePhotoViewerSheetProps = {
  visible: boolean;
  imageUri: string | null;
  onClose: () => void;
};

const SIZE = Math.min(Dimensions.get("window").width - 48, 320);

export function ProfilePhotoViewerSheet({ visible, imageUri, onClose }: ProfilePhotoViewerSheetProps) {
  const insets = useSafeAreaInsets();
  if (!visible || !imageUri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.headerRow}>
            <AppText style={styles.title}>Profile photo</AppText>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#374151" />
            </Pressable>
          </View>
          <View style={styles.imageRing}>
            <Image source={{ uri: imageUri }} style={styles.image} contentFit="cover" transition={200} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    alignItems: "center",
  },
  headerRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: { fontSize: 18, fontFamily: "Lora_700Bold", color: "#111827" },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  imageRing: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#BBF7D0",
    backgroundColor: "#ECFDF5",
    marginBottom: 8,
  },
  image: { width: "100%", height: "100%" },
});
