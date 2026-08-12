import { useCallback, useEffect, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import {
  Alert,
  Animated,
  InteractionManager,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CARD_RADIUS, GatiMitraMerchant } from "@/constants/theme";
import { pickStoreLogoPhoto } from "@/lib/storeLogoPhotoFlow";

type Props = {
  visible: boolean;
  hasLogo: boolean;
  onClose: () => void;
  onPhotoSelected: (file: { uri: string; type: string; name: string }) => void;
  onRemovePhoto?: () => void;
};

export function StoreLogoPhotoOptionsSheet({
  visible,
  hasLogo,
  onClose,
  onPhotoSelected,
  onRemovePhoto,
}: Props) {
  const slideY = useRef(new Animated.Value(48)).current;
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setBusy(false);
      return;
    }
    slideY.setValue(48);
    Animated.timing(slideY, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, slideY]);

  const handlePick = useCallback(
    async (source: "camera" | "gallery") => {
      if (busy) return;
      setBusy(true);
      try {
        onClose();
        await new Promise<void>((resolve) => {
          InteractionManager.runAfterInteractions(() => resolve());
        });
        await new Promise((r) => setTimeout(r, 120));
        const file = await pickStoreLogoPhoto(source);
        if (!file) return;
        onPhotoSelected(file);
      } catch (e) {
        Alert.alert("Could not select photo", e instanceof Error ? e.message : "Try again.");
      } finally {
        setBusy(false);
      }
    },
    [busy, onClose, onPhotoSelected],
  );

  const handleRemove = () => {
    if (!onRemovePhoto || busy) return;
    onClose();
    onRemovePhoto();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: slideY }], paddingBottom: Math.max(insets.bottom, 20) },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <Text style={styles.title}>Change store photo</Text>
          <TouchableOpacity
            style={styles.option}
            onPress={() => void handlePick("camera")}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Ionicons name="camera-outline" size={22} color={GatiMitraMerchant.textPrimary} />
            <Text style={styles.optionText}>Take photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.option}
            onPress={() => void handlePick("gallery")}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Ionicons name="images-outline" size={22} color={GatiMitraMerchant.textPrimary} />
            <Text style={styles.optionText}>Choose from gallery</Text>
          </TouchableOpacity>
          {hasLogo && onRemovePhoto ? (
            <TouchableOpacity
              style={styles.option}
              onPress={handleRemove}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Ionicons name="trash-outline" size={22} color="#DC2626" />
              <Text style={[styles.optionText, { color: "#DC2626" }]}>Remove photo</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 12,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.border,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  cancelBtn: {
    paddingVertical: 16,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
  },
});
