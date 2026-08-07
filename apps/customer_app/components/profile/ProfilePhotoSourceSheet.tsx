import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";

type ProfilePhotoSourceSheetProps = {
  visible: boolean;
  hasPhoto?: boolean;
  onClose: () => void;
  onPickCamera: () => void;
  onPickGallery: () => void;
  onViewPhoto?: () => void;
};

export function ProfilePhotoSourceSheet({
  visible,
  hasPhoto = false,
  onClose,
  onPickCamera,
  onPickGallery,
  onViewPhoto,
}: ProfilePhotoSourceSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={hasPhoto ? 0.52 : 0.42} flushBottom>
      <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.handle} />
        <AppText style={styles.title}>Profile photo</AppText>
        <AppText style={styles.subtitle}>Choose how you want to update your photo</AppText>

        {hasPhoto && onViewPhoto ? (
          <TouchableOpacity
            style={styles.option}
            activeOpacity={0.85}
            onPress={() => {
              onClose();
              onViewPhoto();
            }}
          >
            <View style={[styles.optionIcon, { backgroundColor: "#F0FDF4" }]}>
              <Ionicons name="person-circle-outline" size={22} color={GatiMitraColors.primaryMint} />
            </View>
            <View style={styles.optionCopy}>
              <AppText style={styles.optionTitle}>View profile photo</AppText>
              <AppText style={styles.optionSub}>See your current picture</AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.option}
          activeOpacity={0.85}
          onPress={() => {
            onClose();
            onPickCamera();
          }}
        >
          <View style={[styles.optionIcon, { backgroundColor: "#ECFDF5" }]}>
            <Ionicons name="camera-outline" size={20} color={GatiMitraColors.primaryMint} />
          </View>
          <View style={styles.optionCopy}>
            <AppText style={styles.optionTitle}>Camera</AppText>
            <AppText style={styles.optionSub}>Take a new photo</AppText>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.option}
          activeOpacity={0.85}
          onPress={() => {
            onClose();
            onPickGallery();
          }}
        >
          <View style={[styles.optionIcon, { backgroundColor: "#EFF6FF" }]}>
            <Ionicons name="images-outline" size={20} color="#2563EB" />
          </View>
          <View style={styles.optionCopy}>
            <AppText style={styles.optionTitle}>Gallery</AppText>
            <AppText style={styles.optionSub}>Pick from your photos</AppText>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} activeOpacity={0.85} onPress={onClose}>
          <AppText style={styles.cancelText}>Cancel</AppText>
        </TouchableOpacity>
      </View>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontFamily: "Lora_700Bold",
    color: "#111827",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    marginBottom: 10,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  optionCopy: { flex: 1 },
  optionTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  optionSub: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  cancelBtn: {
    marginTop: 4,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
  },
  cancelText: { fontSize: 15, fontWeight: "700", color: "#374151" },
});
