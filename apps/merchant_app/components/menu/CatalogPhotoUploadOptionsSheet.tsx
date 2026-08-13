import { useCallback, useEffect, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, Modal, StyleSheet, TouchableOpacity, Pressable, Animated, ActivityIndicator, Alert, InteractionManager } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";
import type { MenuItemRow } from "@/services/menuApi";
import {
  pickCatalogPhoto,
  uploadCatalogPhotoWithProgress,
  type CatalogPhotoUploadCallbacks,
} from "@/lib/catalogPhotoUploadFlow";
import {
  MenuImageSquareAdjustModal,
  type AdjustedImageFile,
} from "@/components/menu/MenuImageSquareAdjustModal";

type Props = {
  visible: boolean;
  item: MenuItemRow | null;
  storeId: string | null;
  token: string | null;
  imageLimitReached?: boolean;
  onClose: () => void;
  onUploaded: () => void;
  uploadCallbacks: CatalogPhotoUploadCallbacks;
};

export function CatalogPhotoUploadOptionsSheet({
  visible,
  item,
  storeId,
  token,
  imageLimitReached = false,
  onClose,
  onUploaded,
  uploadCallbacks,
}: Props) {
  const slideY = useRef(new Animated.Value(48)).current;
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [adjustUri, setAdjustUri] = useState<string | null>(null);
  const pendingItemRef = useRef<MenuItemRow | null>(null);

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

  const uploadAdjusted = useCallback(
    async (file: AdjustedImageFile) => {
      const target = pendingItemRef.current ?? item;
      if (!target || !storeId || !token) return;
      setAdjustUri(null);
      setBusy(true);
      try {
        await uploadCatalogPhotoWithProgress(target, storeId, token, file, uploadCallbacks);
        onUploaded();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        Alert.alert("Could not upload photo", msg);
      } finally {
        setBusy(false);
        pendingItemRef.current = null;
      }
    },
    [item, storeId, token, uploadCallbacks, onUploaded],
  );

  const handlePick = useCallback(
    async (source: "camera" | "gallery") => {
      if (!item || !storeId || !token || busy) return;
      if (imageLimitReached) {
        Alert.alert("Limit exceeded", "Image upload limit reached for your plan. Upgrade to add more.");
        return;
      }
      setBusy(true);
      try {
        pendingItemRef.current = item;
        // Close sheet first so native picker isn't stacked under Modal (Android crash).
        onClose();
        await new Promise<void>((resolve) => {
          InteractionManager.runAfterInteractions(() => resolve());
        });
        await new Promise((r) => setTimeout(r, 160));
        const file = await pickCatalogPhoto(source);
        if (!file) {
          pendingItemRef.current = null;
          return;
        }
        // Android drops a Modal that opens in the same tick as the picker dismiss.
        await new Promise((r) => setTimeout(r, 320));
        setAdjustUri(file.uri);
      } catch (e) {
        pendingItemRef.current = null;
        const msg = e instanceof Error ? e.message : "Could not open photo";
        Alert.alert("Could not upload photo", msg);
      } finally {
        setBusy(false);
      }
    },
    [busy, imageLimitReached, item, onClose, storeId, token],
  );

  return (
    <>
      {visible ? (
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <Animated.View
            style={[
              styles.sheet,
              { transform: [{ translateY: slideY }], paddingBottom: Math.max(insets.bottom, 20) },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.title}>Choose an option</Text>
            <TouchableOpacity
              style={styles.option}
              onPress={() => void handlePick("camera")}
              disabled={busy || !item}
              activeOpacity={0.85}
            >
              <Ionicons name="camera-outline" size={22} color={GatiMitraMerchant.textPrimary} />
              <Text style={styles.optionText}>Take photo</Text>
              {busy ? <ActivityIndicator size="small" color={GatiMitraMerchant.primary} /> : null}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.option}
              onPress={() => void handlePick("gallery")}
              disabled={busy || !item}
              activeOpacity={0.85}
            >
              <Ionicons name="images-outline" size={22} color={GatiMitraMerchant.textPrimary} />
              <Text style={styles.optionText}>Upload from gallery</Text>
              {busy ? <ActivityIndicator size="small" color={GatiMitraMerchant.primary} /> : null}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
      ) : null}

      <MenuImageSquareAdjustModal
        visible={Boolean(adjustUri)}
        uri={adjustUri}
        onCancel={() => {
          setAdjustUri(null);
          pendingItemRef.current = null;
        }}
        onConfirm={(file) => void uploadAdjusted(file)}
      />
    </>
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
